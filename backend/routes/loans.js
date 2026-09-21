import { Router } from 'express';
import {
  pool,
  positiveId,
  httpError,
  availableSql,
} from '../db.js';

import {
  authenticate,
  allow,
} from './auth.js';

const router = Router();

router.use(authenticate);


/* =========================================================
   DASHBOARD
========================================================= */

router.get(
  '/dashboard',
  allow('ADMIN'),
  async (req, res) => {
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
          WHERE role = 'MEMBER'
            AND active
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
  }
);


/* =========================================================
   REPORTS
========================================================= */

router.get(
  '/reports',
  allow('ADMIN'),
  async (req, res) => {
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

      JOIN loans l
        ON l.book_id = b.id

      GROUP BY
        b.id,
        b.title

      ORDER BY
        loans DESC,
        b.title

      LIMIT 10
    `);

    res.json({
      monthly: monthly.rows,
      popular: popular.rows,
    });
  }
);


/* =========================================================
   GET LOANS

   MEMBER:
   เห็นเฉพาะของตัวเอง

   ADMIN:
   เห็นทั้งหมด

   เพิ่ม:
   copy_id / copy_code / copy_status
========================================================= */

router.get('/', async (req, res) => {
  const { rows } = await pool.query(`
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

      COALESCE(
        l.renewed_until,
        l.due_at
      ) AS effective_due_at,

      CASE
        WHEN l.returned_at IS NULL
          THEN 'BORROWED'
        ELSE 'RETURNED'
      END AS status,

      (
        l.returned_at IS NULL
        AND COALESCE(
          l.renewed_until,
          l.due_at
        ) < NOW()
      ) AS overdue,

      CASE
        WHEN
          l.returned_at IS NULL
          AND COALESCE(
            l.renewed_until,
            l.due_at
          ) < NOW()

        THEN CEIL(
          EXTRACT(
            EPOCH FROM (
              NOW()
              - COALESCE(
                  l.renewed_until,
                  l.due_at
                )
            )
          ) / 86400
        )::int

        ELSE 0
      END AS overdue_days

    FROM loans l

    JOIN books b
      ON b.id = l.book_id

    LEFT JOIN book_copies bc
      ON bc.id = l.copy_id

    JOIN users u
      ON u.id = l.user_id

    WHERE
      (
        $1::int IS NULL
        OR l.user_id = $1
      )

      AND (
        $2::boolean = false

        OR (
          l.returned_at IS NULL
          AND COALESCE(
            l.renewed_until,
            l.due_at
          ) < NOW()
        )
      )

    ORDER BY
      l.borrowed_at DESC
  `, [
    req.user.role === 'MEMBER'
      ? req.user.id
      : null,

    req.query.overdue === 'true',
  ]);

  res.json(rows);
});


/* =========================================================
   CREATE LOAN

   ADMIN เท่านั้น

   รองรับ:
   - ยืมจาก reservation
   - walk-in
   - เลือก copy จริงที่ AVAILABLE
   - 1 copy ยืมได้ครั้งละ 1 คน
   - กำหนดคืน 14 วัน
========================================================= */

router.post(
  '/',
  allow('ADMIN'),
  async (req, res) => {
    const reservationId =
      req.body.reservation_id
        ? positiveId(
            req.body.reservation_id
          )
        : null;

    let bookId;
    let userId;

    const client =
      await pool.connect();

    try {
      await client.query('BEGIN');


      /* =====================================================
         RESERVATION
      ===================================================== */

      if (reservationId) {
        const { rows } =
          await client.query(`
            SELECT
              id,
              book_id,
              user_id,
              status,
              expires_at

            FROM reservations

            WHERE id = $1

            FOR UPDATE
          `, [
            reservationId,
          ]);

        const reservation =
          rows[0];

        if (!reservation) {
          throw httpError(
            404,
            'ไม่พบการจอง'
          );
        }

        if (
          reservation.status !==
          'PENDING'
        ) {
          throw httpError(
            409,
            'การจองนี้ถูกยกเลิก หมดอายุ หรือยืมแล้ว'
          );
        }

        if (
          new Date(
            reservation.expires_at
          ).getTime() <= Date.now()
        ) {
          throw httpError(
            409,
            'การจองหมดอายุแล้ว'
          );
        }

        bookId =
          reservation.book_id;

        userId =
          reservation.user_id;

      } else {
        bookId =
          positiveId(
            req.body.book_id
          );

        userId =
          positiveId(
            req.body.user_id
          );
      }


      /* =====================================================
         CHECK BOOK TITLE
      ===================================================== */

      const book =
        await client.query(`
          SELECT
            id,
            title

          FROM books

          WHERE id = $1

          FOR UPDATE
        `, [
          bookId,
        ]);

      if (!book.rows[0]) {
        throw httpError(
          404,
          'ไม่พบหนังสือ'
        );
      }


      /* =====================================================
         CHECK MEMBER
      ===================================================== */

      const member =
        await client.query(`
          SELECT id

          FROM users

          WHERE
            id = $1
            AND role = 'MEMBER'
            AND active

          FOR SHARE
        `, [
          userId,
        ]);

      if (!member.rows[0]) {
        throw httpError(
          400,
          'ไม่พบผู้ใช้ห้องสมุดที่ใช้งานอยู่'
        );
      }


      /* =====================================================
         SAME TITLE ACTIVE LOAN

         คนเดิมยังถือหนังสือเรื่องนี้อยู่
         ห้ามยืมชื่อเรื่องเดียวกันเพิ่ม
      ===================================================== */

      const duplicateLoan =
        await client.query(`
          SELECT id

          FROM loans

          WHERE
            user_id = $1
            AND book_id = $2
            AND returned_at IS NULL

          LIMIT 1
        `, [
          userId,
          bookId,
        ]);

      if (duplicateLoan.rowCount) {
        throw httpError(
          409,
          'ผู้ยืมกำลังยืมหนังสือเรื่องนี้อยู่แล้ว'
        );
      }


      /* =====================================================
         WALK-IN

         ถ้าผู้ใช้คนนี้มี reservation
         ต้องไปยืนยันจาก reservation
      ===================================================== */

      if (!reservationId) {
        const pending =
          await client.query(`
            SELECT id

            FROM reservations

            WHERE
              user_id = $1
              AND book_id = $2
              AND status = 'PENDING'
              AND expires_at > NOW()

            LIMIT 1
          `, [
            userId,
            bookId,
          ]);

        if (pending.rowCount) {
          throw httpError(
            409,
            'ผู้ยืมมีการจองอยู่ กรุณายืนยันจากหน้ารายการจอง'
          );
        }
      }


      /* =====================================================
         FULFILL RESERVATION

         ทำก่อนคำนวณ availableSql
         เพื่อไม่ให้ reservation ตัวเอง
         ถูกหัก stock ซ้ำ
      ===================================================== */

      if (reservationId) {
        const reserved =
          await client.query(`
            UPDATE reservations

            SET status = 'FULFILLED'

            WHERE
              id = $1
              AND status = 'PENDING'
              AND expires_at > NOW()

            RETURNING id
          `, [
            reservationId,
          ]);

        if (!reserved.rowCount) {
          throw httpError(
            409,
            'การจองหมดอายุ ถูกยกเลิก หรือยืมแล้ว'
          );
        }
      }


      /* =====================================================
         CHECK LOGICAL STOCK

         ป้องกัน walk-in ใช้ stock
         ที่ถูก reservation คนอื่น hold ไว้
      ===================================================== */

      const stock =
        await client.query(`
          SELECT
            (${availableSql})
            AS available

          FROM books b

          WHERE b.id = $1
        `, [
          bookId,
        ]);

      if (
        Number(
          stock.rows[0]?.available
            ?? 0
        ) < 1
      ) {
        throw httpError(
          409,
          'ไม่มีหนังสือว่างสำหรับยืม'
        );
      }


      /* =====================================================
         SELECT PHYSICAL COPY

         ตรงนี้คือส่วนสำคัญ:
         หนังสือจริง 1 เล่ม = 1 copy_id

         SKIP LOCKED ช่วยป้องกัน
         request พร้อมกันเลือกเล่มเดียวกัน
      ===================================================== */

      const copyResult =
        await client.query(`
          SELECT
            id,
            copy_code

          FROM book_copies

          WHERE
            book_id = $1
            AND status = 'AVAILABLE'

          ORDER BY id

          FOR UPDATE SKIP LOCKED

          LIMIT 1
        `, [
          bookId,
        ]);

      const copy =
        copyResult.rows[0];

      if (!copy) {
        throw httpError(
          409,
          'ไม่มีหนังสือจริงที่ว่างสำหรับยืม'
        );
      }


      /* =====================================================
         CREATE LOAN
      ===================================================== */

      const { rows } =
        await client.query(`
          INSERT INTO loans(
            user_id,
            book_id,
            copy_id,
            reservation_id,
            borrowed_by,
            due_at
          )

          VALUES(
            $1,
            $2,
            $3,
            $4,
            $5,
            NOW() + INTERVAL '14 days'
          )

          RETURNING *
        `, [
          userId,
          bookId,
          copy.id,
          reservationId,
          req.user.id,
        ]);


      /* =====================================================
         COPY -> BORROWED
      ===================================================== */

      await client.query(`
        UPDATE book_copies

        SET status = 'BORROWED'

        WHERE
          id = $1
          AND status = 'AVAILABLE'
      `, [
        copy.id,
      ]);


      await client.query(
        'COMMIT'
      );

      res
        .status(201)
        .json({
          ...rows[0],

          copy_code:
            copy.copy_code,
        });

    } catch (error) {
      await client.query(
        'ROLLBACK'
      );

      throw error;

    } finally {
      client.release();
    }
  }
);


/* =========================================================
   RENEW LOAN

   - 1 ครั้ง
   - ต้องถึงกำหนดเดิมก่อน
   - +7 วัน
========================================================= */

router.patch(
  '/:id/renew',
  async (req, res) => {
    const id =
      positiveId(
        req.params.id
      );

    const client =
      await pool.connect();

    try {
      await client.query('BEGIN');

      const { rows } =
        await client.query(`
          SELECT *

          FROM loans

          WHERE id = $1

          FOR UPDATE
        `, [
          id,
        ]);

      const loan =
        rows[0];

      if (!loan) {
        throw httpError(
          404,
          'ไม่พบรายการยืม'
        );
      }

      if (
        req.user.role === 'MEMBER'
        && loan.user_id !==
          req.user.id
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

      if (
        loan.renewal_count >= 1
      ) {
        throw httpError(
          409,
          'รายการนี้ใช้สิทธิ์ต่ออายุแล้ว'
        );
      }

      const dueAt =
        new Date(
          loan.due_at
        );

      if (
        Date.now() <
        dueAt.getTime()
      ) {
        throw httpError(
          409,
          'ยังไม่ถึงวันครบกำหนดคืน'
        );
      }

      const updated =
        await client.query(`
          UPDATE loans

          SET
            renewal_count = 1,
            renewed_at = NOW(),

            renewed_until =
              due_at
              + INTERVAL '7 days'

          WHERE id = $1

          RETURNING *
        `, [
          id,
        ]);

      await client.query(
        'COMMIT'
      );

      res.json(
        updated.rows[0]
      );

    } catch (error) {
      await client.query(
        'ROLLBACK'
      );

      throw error;

    } finally {
      client.release();
    }
  }
);


/* =========================================================
   RETURN BOOK

   NORMAL
   DAMAGED
   LOST

   NORMAL / DAMAGED:
   copy -> AVAILABLE

   LOST:
   copy -> LOST

   late fee:
   1 บาท / วัน
========================================================= */

router.patch(
  '/:id/return',
  allow('ADMIN'),
  async (req, res) => {
    const id =
      positiveId(
        req.params.id
      );

    const returnCondition =
      String(
        req.body.return_condition
          || 'NORMAL'
      ).toUpperCase();

    if (
      ![
        'NORMAL',
        'DAMAGED',
        'LOST',
      ].includes(
        returnCondition
      )
    ) {
      throw httpError(
        400,
        'สภาพหนังสือไม่ถูกต้อง'
      );
    }


    let requestedDamageFee = 0;

    if (
      returnCondition ===
      'DAMAGED'
    ) {
      requestedDamageFee =
        Number(
          req.body.damage_fee
            ?? 0
        );

      if (
        !Number.isFinite(
          requestedDamageFee
        )
        || requestedDamageFee < 0
      ) {
        throw httpError(
          400,
          'ค่าปรับหนังสือชำรุดไม่ถูกต้อง'
        );
      }
    }


    const client =
      await pool.connect();

    try {
      await client.query('BEGIN');


      /* =====================================================
         LOCK LOAN + BOOK
      ===================================================== */

      const { rows } =
        await client.query(`
          SELECT
            l.*,

            b.price,
            b.total_copies,
            b.title,

            bc.copy_code,
            bc.status AS copy_status

          FROM loans l

          JOIN books b
            ON b.id = l.book_id

          LEFT JOIN book_copies bc
            ON bc.id = l.copy_id

          WHERE l.id = $1

          FOR UPDATE OF l, b
        `, [
          id,
        ]);

      const loan =
        rows[0];

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


      /*
        lock copy จริงแยกอีกครั้ง
      */

      if (loan.copy_id) {
        const lockedCopy =
          await client.query(`
            SELECT id

            FROM book_copies

            WHERE id = $1

            FOR UPDATE
          `, [
            loan.copy_id,
          ]);

        if (!lockedCopy.rows[0]) {
          throw httpError(
            409,
            'ไม่พบข้อมูลหนังสือจริงของรายการยืมนี้'
          );
        }
      }


      const bookPrice =
        Number(
          loan.price || 0
        );


      /* =====================================================
         DAMAGE FEE
      ===================================================== */

      if (
        returnCondition ===
          'DAMAGED'
        &&
        requestedDamageFee >
          bookPrice
      ) {
        throw httpError(
          400,
          `ค่าปรับชำรุดต้องไม่เกินราคาหนังสือ ${bookPrice.toFixed(2)} บาท`
        );
      }


      /* =====================================================
         EFFECTIVE DUE DATE
      ===================================================== */

      const effectiveDueAt =
        loan.renewed_until
          ? new Date(
              loan.renewed_until
            )
          : new Date(
              loan.due_at
            );


      /*
        คิดเป็นวันปฏิทิน
      */

      const today =
        new Date();

      const dueDate =
        new Date(
          effectiveDueAt.getFullYear(),
          effectiveDueAt.getMonth(),
          effectiveDueAt.getDate()
        );

      const returnDate =
        new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );

      const lateDays =
        Math.max(
          0,

          Math.round(
            (
              returnDate.getTime()
              - dueDate.getTime()
            )
            /
            (
              1000
              * 60
              * 60
              * 24
            )
          )
        );


      /* 1 บาท / วัน */

      const lateFee =
        lateDays;


      /* =====================================================
         DAMAGE / LOST
      ===================================================== */

      const damageFee =
        returnCondition ===
        'DAMAGED'
          ? requestedDamageFee
          : 0;

      const lostFee =
        returnCondition ===
        'LOST'
          ? bookPrice
          : 0;

      const totalFine =
        lateFee
        + damageFee
        + lostFee;


      const paymentStatus =
        totalFine > 0
          ? 'UNPAID'
          : 'PAID';


      /* =====================================================
         UPDATE LOAN
      ===================================================== */

      const returned =
        await client.query(`
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
        `, [
          req.user.id,
          returnCondition,

          lateFee,
          damageFee,
          lostFee,

          totalFine,
          paymentStatus,

          id,
        ]);


      /* =====================================================
         UPDATE PHYSICAL COPY
      ===================================================== */

      if (loan.copy_id) {
        if (
          returnCondition ===
          'LOST'
        ) {
          await client.query(`
            UPDATE book_copies

            SET status = 'LOST'

            WHERE id = $1
          `, [
            loan.copy_id,
          ]);

        } else {
          /*
            NORMAL / DAMAGED

            ตอนนี้ DAMAGED ถือว่ารับคืนแล้ว
            และยังอยู่ในระบบ

            ถ้าภายหลังต้องการสถานะ
            REPAIR สามารถเพิ่มได้
          */

          await client.query(`
            UPDATE book_copies

            SET status = 'AVAILABLE'

            WHERE id = $1
          `, [
            loan.copy_id,
          ]);
        }
      }


      /* =====================================================
         SYNC total_copies

         AVAILABLE + BORROWED เท่านั้น

         LOST / RETIRED
         ไม่นับเป็นหนังสือที่ใช้งานได้
      ===================================================== */

      await client.query(`
        UPDATE books b

        SET total_copies = (
          SELECT COUNT(*)::int

          FROM book_copies bc

          WHERE
            bc.book_id = b.id

            AND bc.status IN (
              'AVAILABLE',
              'BORROWED'
            )
        )

        WHERE b.id = $1
      `, [
        loan.book_id,
      ]);


      await client.query(
        'COMMIT'
      );


      res.json({
        ...returned.rows[0],

        copy_code:
          loan.copy_code,

        late_days:
          lateDays,

        message:
          totalFine > 0
            ? `คืนหนังสือแล้ว มีค่าปรับรวม ${totalFine.toFixed(2)} บาท`
            : 'คืนหนังสือเรียบร้อย ไม่มีค่าปรับ',
      });

    } catch (error) {
      await client.query(
        'ROLLBACK'
      );

      throw error;

    } finally {
      client.release();
    }
  }
);


/* =========================================================
   PAY FINE - CASH
========================================================= */

router.patch(
  '/:id/payment/cash',
  allow('ADMIN'),
  async (req, res) => {
    const id =
      positiveId(
        req.params.id
      );

    const { rows } =
      await pool.query(`
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
      `, [
        req.user.id,
        id,
      ]);

    if (!rows[0]) {
      throw httpError(
        409,
        'ไม่พบค่าปรับที่สามารถชำระได้ หรือชำระแล้ว'
      );
    }

    res.json(rows[0]);
  }
);


/* =========================================================
   QR - MEMBER SUBMIT SLIP
========================================================= */

router.patch(
  '/:id/payment/qr-submit',
  async (req, res) => {
    const id =
      positiveId(
        req.params.id
      );

    const slipUrl =
      typeof req.body
        .payment_slip_url ===
        'string'

        ? req.body
            .payment_slip_url
            .trim()

        : '';

    if (!slipUrl) {
      throw httpError(
        400,
        'กรุณาแนบสลิปการชำระเงิน'
      );
    }

    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN'
      );

      const { rows } =
        await client.query(`
          SELECT *

          FROM loans

          WHERE id = $1

          FOR UPDATE
        `, [
          id,
        ]);

      const loan =
        rows[0];

      if (!loan) {
        throw httpError(
          404,
          'ไม่พบรายการ'
        );
      }

      if (
        req.user.role ===
          'MEMBER'
        &&
        loan.user_id !==
          req.user.id
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

      if (
        Number(
          loan.total_fine
        ) <= 0
      ) {
        throw httpError(
          409,
          'รายการนี้ไม่มีค่าปรับ'
        );
      }

      if (
        loan.payment_status ===
        'PAID'
      ) {
        throw httpError(
          409,
          'ค่าปรับรายการนี้ชำระแล้ว'
        );
      }

      const updated =
        await client.query(`
          UPDATE loans

          SET
            payment_method = 'QR',
            payment_status = 'PENDING',

            payment_slip_url = $1,
            payment_submitted_at = NOW(),

            payment_note = NULL

          WHERE id = $2

          RETURNING *
        `, [
          slipUrl,
          id,
        ]);

      await client.query(
        'COMMIT'
      );

      res.json(
        updated.rows[0]
      );

    } catch (error) {
      await client.query(
        'ROLLBACK'
      );

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
    const id =
      positiveId(
        req.params.id
      );

    const { rows } =
      await pool.query(`
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
      `, [
        req.user.id,
        id,
      ]);

    if (!rows[0]) {
      throw httpError(
        409,
        'ไม่พบสลิปที่รอตรวจสอบ'
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
    const id =
      positiveId(
        req.params.id
      );

    const note =
      typeof req.body.note ===
        'string'

        ? req.body.note.trim()

        : 'สลิปไม่ถูกต้อง';

    const { rows } =
      await pool.query(`
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
      `, [
        note ||
          'สลิปไม่ถูกต้อง',

        id,
      ]);

    if (!rows[0]) {
      throw httpError(
        409,
        'ไม่พบสลิปที่รอตรวจสอบ'
      );
    }

    res.json(rows[0]);
  }
);


export default router;