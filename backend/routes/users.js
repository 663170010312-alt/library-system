import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  pool,
  positiveId,
  httpError,
} from '../db.js';

import {
  authenticate,
  allow,
  validateAccount,
} from './auth.js';

const router = Router();

router.use(authenticate);


/* =========================================================
   NORMALIZE USER DATA
========================================================= */

function normalizeLibraryUser(
  body,
  {
    allowAdmin = false,
    allowBlankPassword = false,
  } = {}
) {
  const {
    name,
    email,
    password,
    role,
    user_type,
    class_level,
    room,
    staff_position,
    department,
  } = body;

  /*
    รองรับทั้งชื่อเดิม school_code
    และชื่อที่ frontend อาจใช้ student_code
  */
  const rawSchoolCode =
    body.school_code ??
    body.student_code ??
    '';

  validateAccount({
    name,
    email,
    password:
      allowBlankPassword && !password
        ? 'unchanged-password'
        : password,
  });

  const normalizedRole =
    allowAdmin && role === 'ADMIN'
      ? 'ADMIN'
      : 'MEMBER';


  /* =======================================================
     ADMIN
  ======================================================= */

  if (normalizedRole === 'ADMIN') {
    return {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: 'ADMIN',

      school_code: null,
      user_type: null,

      class_level: null,
      room: null,

      staff_position: null,
      department: null,

      // เก็บไว้รองรับข้อมูลเก่า
      class_room: null,
    };
  }


  /* =======================================================
     MEMBER
  ======================================================= */

  if (
    !['STUDENT', 'TEACHER'].includes(
      user_type
    )
  ) {
    throw httpError(
      400,
      'กรุณาเลือกประเภทผู้ใช้เป็นนักเรียนหรือครู'
    );
  }


  /* -------------------------
     รหัสนักเรียน / บุคลากร
  ------------------------- */

  if (
    typeof rawSchoolCode !== 'string' ||
    !rawSchoolCode.trim() ||
    rawSchoolCode.trim().length > 50
  ) {
    throw httpError(
      400,
      user_type === 'STUDENT'
        ? 'กรุณาระบุรหัสนักเรียนไม่เกิน 50 ตัวอักษร'
        : 'กรุณาระบุรหัสบุคลากรไม่เกิน 50 ตัวอักษร'
    );
  }


  /* =======================================================
     STUDENT
  ======================================================= */

  if (user_type === 'STUDENT') {
    if (
      typeof class_level !== 'string' ||
      !class_level.trim() ||
      class_level.trim().length > 50
    ) {
      throw httpError(
        400,
        'กรุณาระบุชั้นเรียน'
      );
    }

    if (
      typeof room !== 'string' ||
      !room.trim() ||
      room.trim().length > 20
    ) {
      throw httpError(
        400,
        'กรุณาระบุห้องเรียน'
      );
    }

    return {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: normalizedRole,

      school_code:
        rawSchoolCode.trim(),

      user_type: 'STUDENT',

      class_level:
        class_level.trim(),

      room:
        room.trim(),

      staff_position: null,
      department: null,

      /*
        class_room เดิมเก็บไว้เพื่อ compatibility
        เช่น ม.6/1
      */
      class_room:
        `${class_level.trim()}/${room.trim()}`,
    };
  }


  /* =======================================================
     TEACHER
  ======================================================= */

  if (
    typeof staff_position !== 'string' ||
    !staff_position.trim() ||
    staff_position.trim().length > 100
  ) {
    throw httpError(
      400,
      'กรุณาระบุตำแหน่งของครูหรือบุคลากร'
    );
  }

  if (
    typeof department !== 'string' ||
    !department.trim() ||
    department.trim().length > 100
  ) {
    throw httpError(
      400,
      'กรุณาระบุกลุ่มสาระหรือฝ่ายงาน'
    );
  }

  return {
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role: normalizedRole,

    school_code:
      rawSchoolCode.trim(),

    user_type: 'TEACHER',

    class_level: null,
    room: null,

    staff_position:
      staff_position.trim(),

    department:
      department.trim(),

    class_room: null,
  };
}


/* =========================================================
   UPDATE MY PROFILE
========================================================= */

router.put(
  '/me',
  async (req, res) => {
    const currentUser =
      (
        await pool.query(
          `
            SELECT *
            FROM users
            WHERE id = $1
          `,
          [req.user.id]
        )
      ).rows[0];

    if (!currentUser) {
      throw httpError(
        404,
        'ไม่พบผู้ใช้'
      );
    }

    /*
      ไม่อนุญาตให้เปลี่ยน role
      ผ่านหน้าโปรไฟล์ของตัวเอง
    */
    const values =
      normalizeLibraryUser(
        {
          ...req.body,
          role: currentUser.role,
        },
        {
          allowAdmin:
            currentUser.role === 'ADMIN',

          allowBlankPassword: true,
        }
      );

    let hash = null;

    if (values.password) {
      const {
        current_password,
      } = req.body;

      if (
        typeof current_password !==
          'string' ||
        !(
          await bcrypt.compare(
            current_password,
            currentUser.password_hash
          )
        )
      ) {
        throw httpError(
          400,
          'รหัสผ่านปัจจุบันไม่ถูกต้อง'
        );
      }

      hash = await bcrypt.hash(
        values.password,
        12
      );
    }

    const { rows } =
      await pool.query(
        `
          UPDATE users

          SET
            name = $1,
            email = $2,

            password_hash =
              COALESCE(
                $3,
                password_hash
              ),

            school_code = $4,
            user_type = $5,

            class_level = $6,
            room = $7,

            staff_position = $8,
            department = $9,

            class_room = $10

          WHERE id = $11

          RETURNING
            id,
            name,
            email,
            role,
            active,

            school_code,
            school_code AS student_code,

            user_type,

            class_level,
            room,

            staff_position,
            department,

            class_room
        `,
        [
          values.name,
          values.email,
          hash,

          values.school_code,
          values.user_type,

          values.class_level,
          values.room,

          values.staff_position,
          values.department,

          values.class_room,

          req.user.id,
        ]
      );

    res.json(rows[0]);
  }
);


/* =========================================================
   GET ALL USERS - ADMIN
========================================================= */

router.get(
  '/',
  allow('ADMIN'),
  async (req, res) => {
    const { rows } =
      await pool.query(
        `
          SELECT
            id,
            name,
            email,
            role,
            active,

            school_code,
            school_code AS student_code,

            user_type,

            class_level,
            room,

            staff_position,
            department,

            class_room,

            created_at

          FROM users

          ORDER BY id
        `
      );

    res.json(rows);
  }
);


/* =========================================================
   CREATE USER - ADMIN
========================================================= */

router.post(
  '/',
  allow('ADMIN'),
  async (req, res) => {
    const values =
      normalizeLibraryUser(
        req.body,
        {
          allowAdmin: true,
        }
      );

    const hash =
      await bcrypt.hash(
        values.password,
        12
      );

    const { rows } =
      await pool.query(
        `
          INSERT INTO users(
            name,
            email,
            password_hash,
            role,

            school_code,
            user_type,

            class_level,
            room,

            staff_position,
            department,

            class_room
          )

          VALUES(
            $1,
            $2,
            $3,
            $4,

            $5,
            $6,

            $7,
            $8,

            $9,
            $10,

            $11
          )

          RETURNING
            id,
            name,
            email,
            role,
            active,

            school_code,
            school_code AS student_code,

            user_type,

            class_level,
            room,

            staff_position,
            department,

            class_room
        `,
        [
          values.name,
          values.email,
          hash,
          values.role,

          values.school_code,
          values.user_type,

          values.class_level,
          values.room,

          values.staff_position,
          values.department,

          values.class_room,
        ]
      );

    res
      .status(201)
      .json(rows[0]);
  }
);


/* =========================================================
   EDIT USER INFORMATION - ADMIN
========================================================= */

router.put(
  '/:id',
  allow('ADMIN'),
  async (req, res) => {
    const id =
      positiveId(req.params.id);

    const target =
      (
        await pool.query(
          `
            SELECT *
            FROM users
            WHERE id = $1
          `,
          [id]
        )
      ).rows[0];

    if (!target) {
      throw httpError(
        404,
        'ไม่พบผู้ใช้'
      );
    }

    /*
      role ไม่เปลี่ยนใน route นี้

      การเปลี่ยน MEMBER / ADMIN
      ใช้ PATCH /:id เพื่อให้ยังมี
      validation เรื่องรายการยืม/จอง
    */
    const values =
      normalizeLibraryUser(
        {
          ...req.body,
          role: target.role,
        },
        {
          allowAdmin:
            target.role === 'ADMIN',

          allowBlankPassword: true,
        }
      );

    let hash = null;

    if (values.password) {
      hash =
        await bcrypt.hash(
          values.password,
          12
        );
    }

    const { rows } =
      await pool.query(
        `
          UPDATE users

          SET
            name = $1,
            email = $2,

            password_hash =
              COALESCE(
                $3,
                password_hash
              ),

            school_code = $4,
            user_type = $5,

            class_level = $6,
            room = $7,

            staff_position = $8,
            department = $9,

            class_room = $10

          WHERE id = $11

          RETURNING
            id,
            name,
            email,
            role,
            active,

            school_code,
            school_code AS student_code,

            user_type,

            class_level,
            room,

            staff_position,
            department,

            class_room
        `,
        [
          values.name,
          values.email,
          hash,

          values.school_code,
          values.user_type,

          values.class_level,
          values.room,

          values.staff_position,
          values.department,

          values.class_room,

          id,
        ]
      );

    res.json(rows[0]);
  }
);


/* =========================================================
   CHANGE ROLE / ACTIVE STATUS
========================================================= */

router.patch(
  '/:id',
  allow('ADMIN'),
  async (req, res) => {
    const id =
      positiveId(req.params.id);

    if (id === req.user.id) {
      throw httpError(
        400,
        'ไม่สามารถเปลี่ยนสิทธิ์หรือปิดบัญชีตัวเองได้'
      );
    }

    const {
      role,
      active,
    } = req.body;

    if (
      ![
        'MEMBER',
        'ADMIN',
      ].includes(role) ||
      typeof active !== 'boolean'
    ) {
      throw httpError(
        400,
        'ข้อมูลสิทธิ์ไม่ถูกต้อง'
      );
    }

    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN'
      );

      await client.query(
        `
          LOCK TABLE users
          IN SHARE ROW EXCLUSIVE MODE
        `
      );

      const target =
        (
          await client.query(
            `
              SELECT *
              FROM users
              WHERE id = $1
            `,
            [id]
          )
        ).rows[0];

      if (!target) {
        throw httpError(
          404,
          'ไม่พบผู้ใช้'
        );
      }


      /* -------------------------
         ต้องเหลือ ADMIN อย่างน้อย 1
      ------------------------- */

      if (
        target.role === 'ADMIN' &&
        target.active &&
        (
          role !== 'ADMIN' ||
          !active
        )
      ) {
        const admins =
          await client.query(
            `
              SELECT id

              FROM users

              WHERE
                role = 'ADMIN'
                AND active
            `
          );

        if (
          admins.rowCount <= 1
        ) {
          throw httpError(
            409,
            'ต้องมีผู้ดูแลระบบที่ใช้งานอย่างน้อย 1 คน'
          );
        }
      }


      /* -------------------------
         ห้ามเปลี่ยน role
         ถ้ายังมีรายการค้าง
      ------------------------- */

      if (
        target.role !== role
      ) {
        const pending =
          await client.query(
            `
              SELECT id

              FROM loans

              WHERE
                user_id = $1
                AND returned_at IS NULL

              UNION ALL

              SELECT id

              FROM reservations

              WHERE
                user_id = $1
                AND status = 'PENDING'
                AND expires_at > NOW()
            `,
            [id]
          );

        if (
          pending.rowCount
        ) {
          throw httpError(
            409,
            'ต้องคืนหนังสือและยกเลิกการจองก่อนเปลี่ยนสิทธิ์'
          );
        }
      }


      /* -------------------------
         UPDATE
      ------------------------- */

      const { rows } =
        await client.query(
          `
            UPDATE users

            SET
              role = $1,
              active = $2,

              school_code =
                CASE
                  WHEN $1 = 'MEMBER'
                    THEN school_code
                  ELSE NULL
                END,

              user_type =
                CASE
                  WHEN $1 = 'MEMBER'
                    THEN user_type
                  ELSE NULL
                END,

              class_level =
                CASE
                  WHEN $1 = 'MEMBER'
                    THEN class_level
                  ELSE NULL
                END,

              room =
                CASE
                  WHEN $1 = 'MEMBER'
                    THEN room
                  ELSE NULL
                END,

              staff_position =
                CASE
                  WHEN $1 = 'MEMBER'
                    THEN staff_position
                  ELSE NULL
                END,

              department =
                CASE
                  WHEN $1 = 'MEMBER'
                    THEN department
                  ELSE NULL
                END,

              class_room =
                CASE
                  WHEN $1 = 'MEMBER'
                    THEN class_room
                  ELSE NULL
                END

            WHERE id = $3

            RETURNING
              id,
              name,
              email,
              role,
              active,

              school_code,
              school_code AS student_code,

              user_type,

              class_level,
              room,

              staff_position,
              department,

              class_room
          `,
          [
            role,
            active,
            id,
          ]
        );

      await client.query(
        'COMMIT'
      );

      res.json(rows[0]);

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