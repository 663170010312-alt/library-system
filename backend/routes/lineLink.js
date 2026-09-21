import { Router } from 'express';

import { pool, httpError } from '../db.js';

import {
  authenticate,
} from './auth.js';

const router = Router();


/* =========================================================
   ตรวจสอบสถานะการเชื่อมบัญชี
========================================================= */

router.get(
  '/status',
  authenticate,
  async (req, res) => {
    const { rows } =
      await pool.query(
        `
          SELECT
            lal.line_user_id,
            lal.linked_at
          FROM line_account_links lal
          WHERE lal.user_id = $1
          LIMIT 1
        `,
        [req.user.id]
      );

    res.json({
      linked: Boolean(rows[0]),
      link:
        rows[0] || null,
    });
  }
);


/* =========================================================
   เชื่อมบัญชีด้วย token
========================================================= */

router.post(
  '/confirm',
  authenticate,
  async (req, res) => {
    const {
      token,
    } = req.body;

    if (
      typeof token !== 'string'
      ||
      !token.trim()
    ) {
      throw httpError(
        400,
        'ไม่พบ token สำหรับเชื่อมบัญชี'
      );
    }

    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN'
      );


      /*
        ล็อก token
        ป้องกันการใช้ token เดียวกันพร้อมกันหลายครั้ง
      */

      const tokenResult =
        await client.query(
          `
            SELECT
              token,
              line_user_id,
              expires_at,
              used_at
            FROM line_link_tokens
            WHERE token = $1
            FOR UPDATE
          `,
          [
            token.trim(),
          ]
        );

      const linkToken =
        tokenResult.rows[0];


      if (!linkToken) {
        throw httpError(
          400,
          'ลิงก์เชื่อมบัญชีไม่ถูกต้อง'
        );
      }


      if (linkToken.used_at) {
        throw httpError(
          400,
          'ลิงก์นี้ถูกใช้งานแล้ว'
        );
      }


      if (
        new Date(
          linkToken.expires_at
        ).getTime()
        <= Date.now()
      ) {
        throw httpError(
          400,
          'ลิงก์เชื่อมบัญชีหมดอายุแล้ว กรุณาสร้างลิงก์ใหม่จาก LINE'
        );
      }


      /*
        ตรวจว่า LINE นี้
        เชื่อมกับ user คนอื่นแล้วหรือยัง
      */

      const lineOwnerResult =
        await client.query(
          `
            SELECT
              lal.user_id,
              u.name
            FROM line_account_links lal

            JOIN users u
              ON u.id = lal.user_id

            WHERE
              lal.line_user_id = $1

            LIMIT 1
          `,
          [
            linkToken.line_user_id,
          ]
        );


      const currentLineOwner =
        lineOwnerResult.rows[0];


      if (
        currentLineOwner
        &&
        Number(
          currentLineOwner.user_id
        )
        !== Number(
          req.user.id
        )
      ) {
        throw httpError(
          409,
          'LINE นี้เชื่อมกับบัญชีสมาชิกอื่นอยู่แล้ว'
        );
      }


      /*
        ตรวจว่า user นี้
        เคยเชื่อม LINE อื่นอยู่หรือไม่

        ถ้ามี ให้เปลี่ยนเป็น LINE ปัจจุบัน
      */

      await client.query(
        `
          DELETE FROM line_account_links
          WHERE user_id = $1
        `,
        [
          req.user.id,
        ]
      );


      /*
        บันทึกการเชื่อมบัญชี
      */

      await client.query(
        `
          INSERT INTO line_account_links (
            user_id,
            line_user_id,
            linked_at
          )
          VALUES (
            $1,
            $2,
            NOW()
          )
        `,
        [
          req.user.id,
          linkToken.line_user_id,
        ]
      );


      /*
        ทำเครื่องหมาย token ว่าใช้แล้ว
      */

      await client.query(
        `
          UPDATE line_link_tokens
          SET
            used_at = NOW()
          WHERE token = $1
        `,
        [
          token.trim(),
        ]
      );


      await client.query(
        'COMMIT'
      );


      res.json({
        message:
          'เชื่อมบัญชี LINE สำเร็จ',

        user: {
          id:
            req.user.id,

          name:
            req.user.name,

          email:
            req.user.email,
        },
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


export default router;