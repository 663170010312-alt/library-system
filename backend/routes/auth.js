import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { rateLimit } from 'express-rate-limit';
import { pool, httpError } from '../db.js';

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  message: {
    message: 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่',
  },
});

export function validateAccount({
  name,
  email,
  password,
}) {
  if (
    typeof name !== 'string' ||
    !name.trim() ||
    name.length > 100
  ) {
    throw httpError(
      400,
      'กรุณาระบุชื่อไม่เกิน 100 ตัวอักษร'
    );
  }

  if (
    typeof email !== 'string' ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw httpError(
      400,
      'อีเมลไม่ถูกต้อง'
    );
  }

  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    Buffer.byteLength(password) > 72
  ) {
    throw httpError(
      400,
      'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร และไม่เกิน 72 ไบต์'
    );
  }
}

/*
  อ่านข้อมูลผู้ใช้ล่าสุดจาก PostgreSQL
  ทุกครั้งที่มี request ที่ต้อง authenticate
*/
export async function authenticate(
  req,
  res,
  next
) {
  let payload;

  try {
    payload = jwt.verify(
      (
        req.headers.authorization || ''
      ).replace(/^Bearer /, ''),
      process.env.JWT_SECRET,
      {
        algorithms: ['HS256'],
      }
    );
  } catch {
    throw httpError(
      401,
      'กรุณาเข้าสู่ระบบอีกครั้ง'
    );
  }

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

          class_room

        FROM users

        WHERE id = $1
      `,
      [payload.sub]
    );

  if (!rows[0]?.active) {
    throw httpError(
      401,
      'บัญชีถูกปิดใช้งานหรือไม่พบผู้ใช้'
    );
  }

  req.user = rows[0];

  next();
}

export function allow(...roles) {
  return (
    req,
    res,
    next
  ) => {
    if (
      !roles.includes(
        req.user.role
      )
    ) {
      throw httpError(
        403,
        'ไม่มีสิทธิ์ทำรายการนี้'
      );
    }

    next();
  };
}

function session(user) {
  return {
    user,

    token: jwt.sign(
      {},
      process.env.JWT_SECRET,
      {
        subject: String(user.id),
        expiresIn: '12h',
        algorithm: 'HS256',
      }
    ),
  };
}

/*
  ไม่มีการสมัครสมาชิกด้วยตัวเอง
  ADMIN เป็นผู้สร้างบัญชีทั้งหมด
*/
router.post(
  '/login',
  limiter,
  async (req, res) => {
    const {
      email,
      password,
    } = req.body;

    if (
      typeof email !== 'string' ||
      typeof password !== 'string'
    ) {
      throw httpError(
        400,
        'กรุณาระบุอีเมลและรหัสผ่าน'
      );
    }

    const { rows } =
      await pool.query(
        `
          SELECT *
          FROM users
          WHERE
            email = $1
            AND active = true
        `,
        [
          email
            .toLowerCase()
            .trim(),
        ]
      );

    const user = rows[0];

    if (
      !user ||
      !(
        await bcrypt.compare(
          password,
          user.password_hash
        )
      )
    ) {
      throw httpError(
        401,
        'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
      );
    }

    res.json(
      session({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,

        school_code:
          user.school_code,

        // alias สำหรับ frontend
        student_code:
          user.school_code,

        user_type:
          user.user_type,

        // นักเรียน
        class_level:
          user.class_level,

        room:
          user.room,

        // ครู / บุคลากร
        staff_position:
          user.staff_position,

        department:
          user.department,

        // field เก่า
        class_room:
          user.class_room,
      })
    );
  }
);

/*
  ข้อมูลผู้ใช้ปัจจุบัน
*/
router.get(
  '/me',
  authenticate,
  (req, res) => {
    res.json(req.user);
  }
);

export default router;