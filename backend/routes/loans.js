import { Router } from 'express';
import {
  pool,
  positiveId,
  httpError,
  availableSql,
} from '../db.js';
import { authenticate, allow } from './auth.js';
import {
  notifyLoanCreated,
  notifyReturnCompleted,
  notifyFinePaid,
  notifyFinePaymentRejected,
  notifyQrPaymentSubmitted,
} from '../jobs/lineNotifications.js';

const router = Router();
router.use(authenticate);

/* =========================================================
   DASHBOARD
========================================================= */

router.get('/dashboard', allow('ADMIN'), async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM book_copies
        WHERE status IN ('AVAILABLE', 'BORROWED')
      ) AS books,
      (
        SELECT COUNT(*)::int
        FROM users
        WHERE role = 'MEMBER' AND active
      ) AS members,
      (
        SELECT COUNT(*)::int
        FROM reservations
        WHERE status = 'PENDING'
          AND expires_at > NOW()
      ) AS pending,
      (
        SELECT COUNT(*)::int
        FROM loans
        WHERE returned_at IS NULL
      ) AS borrowed,
      (
        SELECT COUNT(*)::int
        FROM loans
        WHERE returned_at IS NULL
          AND COALESCE(renewed_until, due_at) < NOW()
      ) AS overdue,
      (
        SELECT COUNT(*)::int
        FROM loans
        WHERE returned_at IS NOT NULL
      ) AS returned,
      (
        SELECT COUNT(*)::int
        FROM loans
        WHERE total_fine > 0
          AND payment_status = 'UNPAID'
      ) AS unpaid_fines,
      (
        SELECT COUNT(*)::int
        FROM loans
        WHERE total_fine > 0
          AND payment_status = 'PENDING'
      ) AS pending_payments
  `);

  res.json(rows[0]);
});

/* =========================================================
   REPORTS
========================================================= */

router.get('/reports', allow('ADMIN'), async (_req, res) => {
  const monthly = await pool.query(`
    SELECT
      TO_CHAR(borrowed_at, 'YYYY-MM') AS month,
      COUNT(*)::int AS loans,
      COUNT(returned_at)::int AS returned
    FROM loans
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 12
  `);

  const popular = await pool.query(`
    SELECT
      b.title,
      COUNT(l.id)::int AS loans
    FROM books b
    JOIN loans l ON l.book_id = b.id
    GROUP BY b.id, b.title
    ORDER BY loans DESC, b.title
    LIMIT 10
  `);

  res.json({
    monthly: monthly.rows,
    popular: popular.rows,
  });
});

/* =========================================================
   GET LOANS
========================================================= */

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    `
    SELECT
      l.*,
      b.title,
      b.author,
      b.call_number,
      b.price,
      bc.copy_code,
      bc.status AS copy_status,
      u.name AS member_name,
      u.email,
      u.school_code,
      u.class_room,
      u.user_type,
      COALESCE(l.renewed_until, l.due_at)
        AS effective_due_at,
      CASE
        WHEN l.returned_at IS NULL THEN 'BORROWED'
        ELSE 'RETURNED'
      END AS status,
      (
        l.returned_at IS NULL
        AND COALESCE(l.renewed_until, l.due_at) < NOW()
      ) AS overdue,
      CASE
        WHEN l.returned_at IS NULL
          AND COALESCE(l.renewed_until, l.due_at) < NOW()
        THEN CEIL(
          EXTRACT(
            EPOCH FROM (
              NOW() - COALESCE(l.renewed_until, l.due_at)
            )
          ) / 86400
        )::int
        ELSE 0
      END AS overdue_days
    FROM loans l
    JOIN books b ON b.id = l.book_id
    LEFT JOIN book_copies bc ON bc.id = l.copy_id
    JOIN users u ON u.id = l.user_id
    WHERE
      ($1::int IS NULL OR l.user_id = $1)
      AND (
        $2::boolean = false
        OR (
          l.returned_at IS NULL
          AND COALESCE(l.renewed_until, l.due_at) < NOW()
        )
      )
    ORDER BY l.borrowed_at DESC
    `,
    [
      req.user.role === 'MEMBER' ? req.user.id : null,
      req.query.overdue === 'true',
    ]
  );

  res.json(rows);
});

/* =========================================================
   CREATE NORMAL LOAN
========================================================= */

router.post('/', allow('ADMIN'), async (req, res) => {
  const reservationId = req.body.reservation_id
    ? positiveId(req.body.reservation_id)
    : null;

  let bookId;
  let userId;

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    if (reservationId) {
      const result = await client.query(
        `
        SELECT id, book_id, user_id, status, expires_at
        FROM reservations
        WHERE id = $1
        FOR UPDATE
        `,
        [reservationId]
      );

      const reservation = result.rows[0];

      if (!reservation) {
        throw httpError(404, 'ไม่พบการจอง');
      }

      if (reservation.status !== 'PENDING') {
        throw httpError(
          409,
          'การจองนี้ถูกยกเลิก หมดอายุ หรือยืมแล้ว'
        );
      }

      if (
        new Date(reservation.expires_at).getTime() <= Date.now()
      ) {
        throw httpError(409, 'การจองหมดอายุแล้ว');
      }

      bookId = reservation.book_id;
      userId = reservation.user_id;
    } else {
      bookId = positiveId(req.body.book_id);
      userId = positiveId(req.body.user_id);
    }

    const book = await client.query(
      'SELECT id, title FROM books WHERE id = $1 FOR UPDATE',
      [bookId]
    );

    if (!book.rowCount) {
      throw httpError(404, 'ไม่พบหนังสือ');
    }

    const member = await client.query(
      `
      SELECT id FROM users
      WHERE id = $1 AND role = 'MEMBER' AND active
      FOR SHARE
      `,
      [userId]
    );

    if (!member.rowCount) {
      throw httpError(
        400,
        'ไม่พบผู้ใช้ห้องสมุดที่ใช้งานอยู่'
      );
    }

    const duplicate = await client.query(
      `
      SELECT id FROM loans
      WHERE user_id = $1
        AND book_id = $2
        AND returned_at IS NULL
      LIMIT 1
      `,
      [userId, bookId]
    );

    if (duplicate.rowCount) {
      throw httpError(
        409,
        'ผู้ยืมกำลังยืมหนังสือเรื่องนี้อยู่แล้ว'
      );
    }

    if (!reservationId) {
      const pending = await client.query(
        `
        SELECT id FROM reservations
        WHERE user_id = $1
          AND book_id = $2
          AND status = 'PENDING'
          AND expires_at > NOW()
        LIMIT 1
        `,
        [userId, bookId]
      );

      if (pending.rowCount) {
        throw httpError(
          409,
          'ผู้ยืมมีการจองอยู่ กรุณายืนยันจากหน้ารายการจอง'
        );
      }
    }

    if (reservationId) {
      const reserved = await client.query(
        `
        UPDATE reservations
        SET status = 'FULFILLED'
        WHERE id = $1
          AND status = 'PENDING'
          AND expires_at > NOW()
        RETURNING id
        `,
        [reservationId]
      );

      if (!reserved.rowCount) {
        throw httpError(
          409,
          'การจองหมดอายุ ถูกยกเลิก หรือยืมแล้ว'
        );
      }
    }

    const stock = await client.query(
      `
      SELECT (${availableSql}) AS available
      FROM books b
      WHERE b.id = $1
      `,
      [bookId]
    );

    if (Number(stock.rows[0]?.available ?? 0) < 1) {
      throw httpError(
        409,
        'ไม่มีหนังสือว่างสำหรับยืม'
      );
    }

    const copyResult = await client.query(
      `
      SELECT id, copy_code
      FROM book_copies
      WHERE book_id = $1
        AND status = 'AVAILABLE'
      ORDER BY id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
      `,
      [bookId]
    );

    const copy = copyResult.rows[0];

    if (!copy) {
      throw httpError(
        409,
        'ไม่มีหนังสือจริงที่ว่างสำหรับยืม'
      );
    }

    const created = await client.query(
      `
      INSERT INTO loans (
        user_id,
        book_id,
        copy_id,
        reservation_id,
        borrowed_by,
        due_at
      )
      VALUES (
        $1, $2, $3, $4, $5,
        NOW() + INTERVAL '14 days'
      )
      RETURNING *
      `,
      [
        userId,
        bookId,
        copy.id,
        reservationId,
        req.user.id,
      ]
    );

    const updatedCopy = await client.query(
      `
      UPDATE book_copies
      SET status = 'BORROWED'
      WHERE id = $1 AND status = 'AVAILABLE'
      RETURNING id
      `,
      [copy.id]
    );

    if (!updatedCopy.rowCount) {
      throw httpError(
        409,
        'สถานะหนังสือเปลี่ยนไปแล้ว'
      );
    }

    await client.query('COMMIT');

    try {
      await notifyLoanCreated(created.rows[0].id);
    } catch (error) {
      console.error('LINE loan notification failed:', error);
    }

    res.status(201).json({
      ...created.rows[0],
      copy_code: copy.copy_code,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

/* =========================================================
   NEW: MANUAL OVERDUE
   เพิ่มรายการเกินกำหนดย้อนหลัง
========================================================= */

router.post(
  '/manual-overdue',
  allow('ADMIN'),
  async (req, res) => {
    const userId = positiveId(req.body.user_id);
    const bookId = positiveId(req.body.book_id);

    const borrowedAt = req.body.borrowed_at;
    const dueAt = req.body.due_at;

    function validDate(value){
      if (
        typeof value !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
      ) {
        return false;
      }

      const parsed = new Date(`${value}T00:00:00.000Z`);

      return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    }

    if (!validDate(borrowedAt) || !validDate(dueAt)) {
      throw httpError(400, 'รูปแบบวันที่ไม่ถูกต้อง');
    }

    const todayBangkok = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    if (borrowedAt > dueAt || dueAt >= todayBangkok) {
      throw httpError(
        400,
        'วันที่ยืมต้องไม่หลังวันครบกำหนด และวันครบกำหนดต้องผ่านไปแล้ว'
      );
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const book = await client.query(
        `
        SELECT id
        FROM books
        WHERE id = $1
        FOR UPDATE
        `,
        [bookId]
      );

      if (!book.rowCount) {
        throw httpError(404, 'ไม่พบหนังสือ');
      }

      const member = await client.query(
        `
        SELECT id
        FROM users
        WHERE id = $1
          AND role = 'MEMBER'
          AND active
        FOR SHARE
        `,
        [userId]
      );

      if (!member.rowCount) {
        throw httpError(
          400,
          'ไม่พบสมาชิกที่เปิดใช้งาน'
        );
      }

      const duplicate = await client.query(
        `
        SELECT id
        FROM loans
        WHERE user_id = $1
          AND book_id = $2
          AND returned_at IS NULL
        LIMIT 1
        `,
        [userId, bookId]
      );

      if (duplicate.rowCount) {
        throw httpError(
          409,
          'สมาชิกมีรายการยืมหนังสือเรื่องนี้ที่ยังไม่คืนแล้ว'
        );
      }

      const stock = await client.query(
        `
        SELECT (${availableSql}) AS available
        FROM books b
        WHERE b.id = $1
        `,
        [bookId]
      );

      if (Number(stock.rows[0]?.available ?? 0) < 1) {
        throw httpError(
          409,
          'ไม่มีหนังสือว่าง หรือหนังสือถูกจองไว้'
        );
      }

      const copyResult = await client.query(
        `
        SELECT id, copy_code
        FROM book_copies
        WHERE book_id = $1
          AND status = 'AVAILABLE'
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
        `,
        [bookId]
      );

      const copy = copyResult.rows[0];

      if (!copy) {
        throw httpError(
          409,
          'ไม่มีหนังสือจริงที่ว่างสำหรับบันทึก'
        );
      }

      const created = await client.query(
        `
        INSERT INTO loans (
          user_id,
          book_id,
          copy_id,
          reservation_id,
          borrowed_by,
          borrowed_at,
          due_at
        )
        VALUES (
          $1,
          $2,
          $3,
          NULL,
          $4,
          ($5::date + TIME '12:00:00')
            AT TIME ZONE 'Asia/Bangkok',
          ($6::date + TIME '23:59:59')
            AT TIME ZONE 'Asia/Bangkok'
        )
        RETURNING *
        `,
        [
          userId,
          bookId,
          copy.id,
          req.user.id,
          borrowedAt,
          dueAt,
        ]
      );

      const updatedCopy = await client.query(
        `
        UPDATE book_copies
        SET status = 'BORROWED'
        WHERE id = $1
          AND status = 'AVAILABLE'
        RETURNING id
        `,
        [copy.id]
      );

      if (!updatedCopy.rowCount) {
        throw httpError(
          409,
          'สถานะหนังสือเปลี่ยนไปแล้ว กรุณาลองใหม่'
        );
      }

      await client.query('COMMIT');

      res.status(201).json({
        ...created.rows[0],
        copy_code: copy.copy_code,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
);

/* =========================================================
   RENEW LOAN
========================================================= */

router.patch('/:id/renew', async (req, res) => {
  const id = positiveId(req.params.id);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `
      SELECT *
      FROM loans
      WHERE id = $1
      FOR UPDATE
      `,
      [id]
    );

    const loan = rows[0];

    if (!loan) {
      throw httpError(404, 'ไม่พบรายการยืม');
    }

    if (
      req.user.role === 'MEMBER' &&
      loan.user_id !== req.user.id
    ) {
      throw httpError(
        403,
        'ไม่มีสิทธิ์ต่ออายุรายการนี้'
      );
    }

    if (loan.returned_at) {
      throw httpError(
        409,
        'หนังสือถูกคืนแล้ว'
      );
    }

    if (loan.renewal_count >= 1) {
      throw httpError(
        409,
        'รายการนี้ใช้สิทธิ์ต่ออายุแล้ว'
      );
    }

    if (
      Date.now() <
      new Date(loan.due_at).getTime()
    ) {
      throw httpError(
        409,
        'ยังไม่ถึงวันครบกำหนดคืน'
      );
    }

    const updated = await client.query(
      `
      UPDATE loans
      SET
        renewal_count = 1,
        renewed_at = NOW(),
        renewed_until = due_at + INTERVAL '7 days'
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    await client.query('COMMIT');

    res.json(updated.rows[0]);

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;

  } finally {
    client.release();
  }
});

/* =========================================================
   RETURN BOOK
========================================================= */

router.patch(
  '/:id/return',
  allow('ADMIN'),
  async (req, res) => {
    const id = positiveId(req.params.id);

    const returnCondition = String(
      req.body.return_condition || 'NORMAL'
    ).toUpperCase();

    if (
      !['NORMAL', 'DAMAGED', 'LOST'].includes(returnCondition)
    ) {
      throw httpError(
        400,
        'สภาพหนังสือไม่ถูกต้อง'
      );
    }

    let requestedDamageFee = 0;

    if (returnCondition === 'DAMAGED') {
      requestedDamageFee = Number(
        req.body.damage_fee ?? 0
      );

      if (
        !Number.isFinite(requestedDamageFee) ||
        requestedDamageFee < 0
      ) {
        throw httpError(
          400,
          'ค่าปรับหนังสือชำรุดไม่ถูกต้อง'
        );
      }
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `
        SELECT
          l.*,
          b.price,
          b.total_copies,
          b.title,
          bc.copy_code,
          bc.status AS copy_status
        FROM loans l
        JOIN books b ON b.id = l.book_id
        LEFT JOIN book_copies bc ON bc.id = l.copy_id
        WHERE l.id = $1
        FOR UPDATE OF l, b
        `,
        [id]
      );

      const loan = rows[0];

      if (!loan) {
        throw httpError(
          404,
          'ไม่พบรายการยืม'
        );
      }

      if (loan.returned_at) {
        throw httpError(
          409,
          'หนังสือรายการนี้ถูกคืนแล้ว'
        );
      }

      if (loan.copy_id) {
        const lockedCopy = await client.query(
          `
          SELECT id
          FROM book_copies
          WHERE id = $1
          FOR UPDATE
          `,
          [loan.copy_id]
        );

        if (!lockedCopy.rowCount) {
          throw httpError(
            409,
            'ไม่พบข้อมูลหนังสือจริงของรายการยืมนี้'
          );
        }
      }

      const bookPrice = Number(loan.price || 0);

      if (
        returnCondition === 'DAMAGED' &&
        requestedDamageFee > bookPrice
      ) {
        throw httpError(
          400,
          `ค่าปรับชำรุดต้องไม่เกินราคาหนังสือ ${bookPrice.toFixed(2)} บาท`
        );
      }

      const effectiveDueAt = new Date(
        loan.renewed_until || loan.due_at
      );

      const today = new Date();

      const dueDate = new Date(
        effectiveDueAt.getFullYear(),
        effectiveDueAt.getMonth(),
        effectiveDueAt.getDate()
      );

      const returnDate = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate()
      );

      const lateDays = Math.max(
        0,
        Math.round(
          (returnDate.getTime() - dueDate.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );

      const lateFee = lateDays;

      const damageFee =
        returnCondition === 'DAMAGED'
          ? requestedDamageFee
          : 0;

      const lostFee =
        returnCondition === 'LOST'
          ? bookPrice
          : 0;

      const totalFine =
        lateFee + damageFee + lostFee;

      const paymentStatus =
        totalFine > 0 ? 'UNPAID' : 'PAID';

      const returned = await client.query(
        `
        UPDATE loans
        SET
          returned_at = NOW(),
          returned_by = $1,
          return_condition = $2,
          late_fee = $3,
          damage_fee = $4,
          lost_fee = $5,
          total_fine = $6,
          payment_status = $7,
          payment_method = NULL,
          payment_slip_url = NULL,
          payment_submitted_at = NULL,
          fine_paid_at = NULL,
          fine_received_by = NULL,
          payment_note = NULL
        WHERE id = $8
        RETURNING *
        `,
        [
          req.user.id,
          returnCondition,
          lateFee,
          damageFee,
          lostFee,
          totalFine,
          paymentStatus,
          id,
        ]
      );

      if (loan.copy_id) {
        if (returnCondition === 'LOST') {
          await client.query(
            `
            UPDATE book_copies
            SET status = 'LOST'
            WHERE id = $1
            `,
            [loan.copy_id]
          );
        } else {
          await client.query(
            `
            UPDATE book_copies
            SET status = 'AVAILABLE'
            WHERE id = $1
            `,
            [loan.copy_id]
          );
        }
      }

      await client.query(
        `
        UPDATE books b
        SET total_copies = (
          SELECT COUNT(*)::int
          FROM book_copies bc
          WHERE bc.book_id = b.id
            AND bc.status IN ('AVAILABLE', 'BORROWED')
        )
        WHERE b.id = $1
        `,
        [loan.book_id]
      );

      await client.query('COMMIT');

      try {
        await notifyReturnCompleted(id);
      } catch (error) {
        console.error(
          'LINE return notification failed:',
          error
        );
      }

      res.json({
        ...returned.rows[0],
        copy_code: loan.copy_code,
        late_days: lateDays,
        message:
          totalFine > 0
            ? `คืนหนังสือแล้ว มีค่าปรับรวม ${totalFine.toFixed(2)} บาท`
            : 'คืนหนังสือเรียบร้อย ไม่มีค่าปรับ',
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
);

/* =========================================================
   CASH PAYMENT
========================================================= */

router.patch(
  '/:id/payment/cash',
  allow('ADMIN'),
  async (req, res) => {
    const id = positiveId(req.params.id);

    const { rows } = await pool.query(
      `
      UPDATE loans
      SET
        payment_method = 'CASH',
        payment_status = 'PAID',
        fine_paid_at = NOW(),
        fine_received_by = $1,
        payment_note = NULL
      WHERE id = $2
        AND returned_at IS NOT NULL
        AND total_fine > 0
        AND payment_status <> 'PAID'
      RETURNING *
      `,
      [req.user.id, id]
    );

    if (!rows[0]) {
      throw httpError(
        409,
        'ไม่พบค่าปรับที่สามารถชำระได้ หรือชำระแล้ว'
      );
    }

    try {
      await notifyFinePaid(id);
    } catch (error) {
      console.error(
        'LINE cash payment notification failed:',
        error
      );
    }

    res.json(rows[0]);
  }
);

/* =========================================================
   QR: MEMBER SUBMIT SLIP
========================================================= */

router.patch(
  '/:id/payment/qr-submit',
  async (req, res) => {
    const id = positiveId(req.params.id);

    const slipUrl =
      typeof req.body.payment_slip_url === 'string'
        ? req.body.payment_slip_url.trim()
        : '';

    if (!slipUrl) {
      throw httpError(
        400,
        'กรุณาแนบสลิปการชำระเงิน'
      );
    }

    const client = await pool.connect();

    let committed = false;

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `
        SELECT *
        FROM loans
        WHERE id = $1
        FOR UPDATE
        `,
        [id]
      );

      const loan = rows[0];

      if (!loan) {
        throw httpError(404, 'ไม่พบรายการ');
      }

      if (
        req.user.role === 'MEMBER' &&
        loan.user_id !== req.user.id
      ) {
        throw httpError(
          403,
          'ไม่มีสิทธิ์ส่งสลิปของรายการนี้'
        );
      }

      if (!loan.returned_at) {
        throw httpError(
          409,
          'ยังไม่ได้คืนหนังสือ'
        );
      }

      if (Number(loan.total_fine) <= 0) {
        throw httpError(
          409,
          'รายการนี้ไม่มีค่าปรับ'
        );
      }

      if (loan.payment_status === 'PAID') {
        throw httpError(
          409,
          'ค่าปรับรายการนี้ชำระแล้ว'
        );
      }

      if (loan.payment_status === 'PENDING') {
        throw httpError(
          409,
          'มีสลิปรอตรวจสอบอยู่แล้ว กรุณารอเจ้าหน้าที่ตรวจสอบ'
        );
      }

      const updated = await client.query(
        `
        UPDATE loans
        SET
          payment_method = 'QR',
          payment_status = 'PENDING',
          payment_slip_url = $1,
          payment_submitted_at = NOW(),
          payment_note = NULL
        WHERE id = $2
        RETURNING *
        `,
        [slipUrl, id]
      );

      await client.query('COMMIT');
      committed = true;

      res.json(updated.rows[0]);

      notifyQrPaymentSubmitted(id)
        .then((result) => {
          console.log(
            '[LINE QR PAYMENT SUBMITTED]',
            {
              loanId: id,
              ...result,
            }
          );
        })
        .catch((error) => {
          console.error(
            '[LINE QR PAYMENT SUBMITTED] Failed:',
            error
          );
        });

    } catch (error) {
      if (!committed) {
        await client.query('ROLLBACK');
      }

      throw error;

    } finally {
      client.release();
    }
  }
);

/* =========================================================
   ADMIN APPROVE QR PAYMENT
========================================================= */

router.patch(
  '/:id/payment/approve',
  allow('ADMIN'),
  async (req, res) => {
    const id = positiveId(req.params.id);

    const { rows } = await pool.query(
      `
      UPDATE loans
      SET
        payment_status = 'PAID',
        fine_paid_at = NOW(),
        fine_received_by = $1,
        payment_note = NULL
      WHERE id = $2
        AND payment_method = 'QR'
        AND payment_status = 'PENDING'
        AND payment_slip_url IS NOT NULL
        AND total_fine > 0
      RETURNING *
      `,
      [req.user.id, id]
    );

    if (!rows[0]) {
      throw httpError(
        409,
        'ไม่พบสลิปที่รอตรวจสอบ'
      );
    }

    try {
      await notifyFinePaid(id);
    } catch (error) {
      console.error(
        'LINE QR payment notification failed:',
        error
      );
    }

    res.json(rows[0]);
  }
);

/* =========================================================
   ADMIN REJECT QR SLIP
========================================================= */

router.patch(
  '/:id/payment/reject',
  allow('ADMIN'),
  async (req, res) => {
    const id = positiveId(req.params.id);

    const note =
      typeof req.body.note === 'string'
        ? req.body.note.trim()
        : 'สลิปไม่ถูกต้อง';

    const { rows } = await pool.query(
      `
      UPDATE loans
      SET
        payment_status = 'UNPAID',
        fine_paid_at = NULL,
        fine_received_by = NULL,
        payment_note = $1
      WHERE id = $2
        AND payment_method = 'QR'
        AND payment_status = 'PENDING'
      RETURNING *
      `,
      [note || 'สลิปไม่ถูกต้อง', id]
    );

    if (!rows[0]) {
      throw httpError(
        409,
        'ไม่พบสลิปที่รอตรวจสอบ'
      );
    }

    res.json(rows[0]);

    notifyFinePaymentRejected(id)
      .then((sent) => {
        console.log(
          '[LINE PAYMENT REJECTED]',
          { loanId: id, sent }
        );
      })
      .catch((error) => {
        console.error(
          '[LINE PAYMENT REJECTED] Failed:',
          error
        );
      });
  }
);

export default router;