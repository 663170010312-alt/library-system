import { Router } from 'express';
import {
  pool,
  positiveId,
  httpError,
} from '../db.js';

import {
  authenticate,
  allow,
} from './auth.js';

const router = Router();

router.use(authenticate);


/* =========================================================
   GET RESERVATIONS
========================================================= */

router.get('/', async (req, res) => {
  const memberId =
    req.user.role === 'MEMBER'
      ? req.user.id
      : null;

  /*
    ก่อนแสดงรายการ
    ยกเลิก reservation ที่ชนกับ active loan
    ของผู้ใช้คนเดียวกัน + หนังสือเรื่องเดียวกัน
  */
  await pool.query(`
    UPDATE reservations r

    SET status = 'CANCELLED'

    WHERE
      r.status = 'PENDING'

      AND EXISTS (
        SELECT 1

        FROM loans l

        WHERE
          l.user_id = r.user_id
          AND l.book_id = r.book_id
          AND l.returned_at IS NULL
      )
  `);


  const { rows } =
    await pool.query(
      `
        SELECT
          r.*,

          b.title,
          b.author,

          u.name AS member_name,
          u.email,
          u.school_code,
          u.class_room,
          u.user_type,

          CASE
            WHEN
              r.status = 'PENDING'
              AND r.expires_at <= NOW()
            THEN 'EXPIRED'

            ELSE r.status
          END AS display_status,

          GREATEST(
            (
              SELECT COUNT(*)::int

              FROM book_copies bc

              WHERE
                bc.book_id = r.book_id
                AND bc.status = 'AVAILABLE'
            )
            -
            (
              SELECT COUNT(*)::int

              FROM reservations r2

              WHERE
                r2.book_id = r.book_id
                AND r2.status = 'PENDING'
                AND r2.expires_at > NOW()
            ),
            0
          ) AS available_copies

        FROM reservations r

        JOIN books b
          ON b.id = r.book_id

        JOIN users u
          ON u.id = r.user_id

        WHERE
          (
            $1::int IS NULL
            OR r.user_id = $1
          )

        ORDER BY
          r.created_at DESC
      `,
      [memberId]
    );

  res.json(rows);
});


/* =========================================================
   CREATE RESERVATION
========================================================= */

router.post(
  '/',
  allow('MEMBER'),
  async (req, res) => {
    const bookId =
      positiveId(
        req.body.book_id
      );

    const client =
      await pool.connect();

    try {
      await client.query('BEGIN');


      /* =====================================================
         LOCK ชื่อเรื่อง

         ทำให้การจองหนังสือเรื่องเดียวกัน
         ไม่ชนกัน แม้กดเกือบพร้อมกัน
      ===================================================== */

      const bookResult =
        await client.query(
          `
            SELECT
              id,
              title

            FROM books

            WHERE id = $1

            FOR UPDATE
          `,
          [bookId]
        );

      const book =
        bookResult.rows[0];

      if (!book) {
        throw httpError(
          404,
          'ไม่พบหนังสือ'
        );
      }


      /* =====================================================
         1. ห้ามจอง
         ถ้ายังยืมหนังสือเรื่องเดียวกันอยู่
      ===================================================== */

      const activeLoan =
        await client.query(
          `
            SELECT
              l.id,
              l.copy_id

            FROM loans l

            WHERE
              l.user_id = $1
              AND l.book_id = $2
              AND l.returned_at IS NULL

            LIMIT 1
          `,
          [
            req.user.id,
            bookId,
          ]
        );

      if (activeLoan.rowCount) {
        throw httpError(
          409,
          'คุณกำลังยืมหนังสือเรื่องนี้อยู่ กรุณาคืนหนังสือก่อนจองอีกครั้ง'
        );
      }


      /* =====================================================
         2. ห้ามคนเดิมจองเรื่องเดิมซ้ำ
      ===================================================== */

      const duplicateReservation =
        await client.query(
          `
            SELECT id

            FROM reservations

            WHERE
              user_id = $1
              AND book_id = $2
              AND status = 'PENDING'
              AND expires_at > NOW()

            LIMIT 1
          `,
          [
            req.user.id,
            bookId,
          ]
        );

      if (
        duplicateReservation.rowCount
      ) {
        throw httpError(
          409,
          'คุณจองหนังสือเรื่องนี้อยู่แล้ว'
        );
      }


      /* =====================================================
         3. ตรวจจำนวนที่สามารถจองได้จริง

         ตัวอย่าง:
         AVAILABLE จริง  = 3
         PENDING          = 2

         เหลือจองได้      = 1

         ถ้าเหลือ 0
         ห้ามสร้าง reservation เพิ่ม
      ===================================================== */

      const stock =
        await client.query(
          `
            SELECT

              (
                SELECT COUNT(*)::int

                FROM book_copies bc

                WHERE
                  bc.book_id = $1
                  AND bc.status = 'AVAILABLE'
              ) AS physical_available,

              (
                SELECT COUNT(*)::int

                FROM reservations r

                WHERE
                  r.book_id = $1
                  AND r.status = 'PENDING'
                  AND r.expires_at > NOW()
              ) AS active_reservations
          `,
          [bookId]
        );


      const physicalAvailable =
        Number(
          stock.rows[0]
            ?.physical_available || 0
        );

      const activeReservations =
        Number(
          stock.rows[0]
            ?.active_reservations || 0
        );

      const reservable =
        physicalAvailable
        - activeReservations;


      if (reservable < 1) {
        throw httpError(
          409,
          'ไม่มีหนังสือว่างสำหรับจอง'
        );
      }


      /* =====================================================
         4. สร้าง reservation

         เก็บสิทธิ์ไว้ 3 วัน
      ===================================================== */

      const { rows } =
        await client.query(
          `
            INSERT INTO reservations(
              user_id,
              book_id,
              expires_at
            )

            VALUES(
              $1,
              $2,
              NOW() + INTERVAL '3 days'
            )

            RETURNING *
          `,
          [
            req.user.id,
            bookId,
          ]
        );


      await client.query(
        'COMMIT'
      );


      res
        .status(201)
        .json(rows[0]);

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
   CANCEL RESERVATION
========================================================= */

router.patch(
  '/:id/cancel',
  async (req, res) => {
    const id =
      positiveId(
        req.params.id
      );

    const memberId =
      req.user.role === 'MEMBER'
        ? req.user.id
        : null;


    const { rows } =
      await pool.query(
        `
          UPDATE reservations

          SET status = 'CANCELLED'

          WHERE
            id = $1
            AND status = 'PENDING'
            AND expires_at > NOW()

            AND (
              $2::int IS NULL
              OR user_id = $2
            )

          RETURNING *
        `,
        [
          id,
          memberId,
        ]
      );


    if (!rows[0]) {
      throw httpError(
        409,
        'ไม่พบการจองที่สามารถยกเลิกได้'
      );
    }


    res.json(rows[0]);
  }
);


export default router;