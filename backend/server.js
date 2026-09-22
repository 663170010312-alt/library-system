import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pool } from './db.js';

import authRouter from './routes/auth.js';
import booksRouter from './routes/books.js';
import categoriesRouter from './routes/categories.js';
import reservationsRouter from './routes/reservations.js';
import loansRouter from './routes/loans.js';
import usersRouter from './routes/users.js';
import uploadsRouter from './routes/uploads.js';

import lineRoutes from './routes/line.js';
import lineLinkRoutes from './routes/lineLink.js';


/* =========================
   ENV CHECK
========================= */

if (
  !process.env.JWT_SECRET ||
  process.env.JWT_SECRET.length < 24
) {
  throw new Error(
    'Please set JWT_SECRET to at least 24 characters in backend/.env'
  );
}

if (
  !process.env.LINE_CHANNEL_SECRET ||
  !process.env.LINE_CHANNEL_ACCESS_TOKEN
) {
  throw new Error(
    'Please set LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN in backend/.env'
  );
}


const app = express();

app.disable('x-powered-by');

app.set('trust proxy', 1);

/* =========================
   CORS
========================= */

/* =========================
   CORS
========================= */

const allowedOrigins = [
  'http://localhost:3000',
  'https://library-system-lemon-rho.vercel.app',
];

app.use(
  cors({
    origin: (
      origin,
      callback
    ) => {
      /*
        request ที่ไม่มี Origin
        เช่น LINE webhook / Postman
      */
      if (!origin) {
        return callback(
          null,
          true
        );
      }

      if (
        allowedOrigins.includes(
          origin
        )
      ) {
        return callback(
          null,
          true
        );
      }

      console.log(
        'CORS blocked:',
        origin
      );

      return callback(
        new Error(
          `CORS blocked: ${origin}`
        )
      );
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'ngrok-skip-browser-warning',
    ],
  })
);

/* =========================
   STATIC UPLOADS
========================= */

// เปิดให้ frontend เข้าถึงไฟล์ที่อัปโหลด
app.use(
  '/uploads',
  express.static('uploads')
);


/* =========================
   LINE WEBHOOK

   ต้องใช้ RAW BODY
   และต้องอยู่ก่อน express.json()
========================= */

app.use(
  '/api/line',
  express.raw({
    type: 'application/json',
    limit: '100kb',
  }),
  lineRoutes
);


/* =========================
   JSON สำหรับ API อื่น
========================= */

app.use(
  express.json({
    limit: '100kb',
  })
);


app.use(
  (req, res, next) => {
    req.body ??= {};

    next();
  }
);


/* =========================
   HEALTH
========================= */

app.get(
  '/api/health',
  async (req, res) => {
    await pool.query(
      'SELECT 1'
    );

    res.json({
      status: 'ok',
      database: 'connected',
    });
  }
);


/* =========================
   API ROUTES
========================= */

app.use(
  '/api/auth',
  authRouter
);


app.use(
  '/api/books',
  booksRouter
);


app.use(
  '/api/categories',
  categoriesRouter
);


app.use(
  '/api/reservations',
  reservationsRouter
);


app.use(
  '/api/loans',
  loansRouter
);


app.use(
  '/api/users',
  usersRouter
);


app.use(
  '/api/uploads',
  uploadsRouter
);


/*
  เชื่อมบัญชีสมาชิกกับ LINE

  ตัวอย่าง:
  GET  /api/line-link/status
  POST /api/line-link/confirm
*/

app.use(
  '/api/line-link',
  lineLinkRoutes
);


/* =========================
   NOT FOUND
========================= */

app.use(
  (req, res) =>
    res
      .status(404)
      .json({
        message:
          'ไม่พบ API ที่เรียก',
      })
);


/* =========================
   ERROR HANDLER
========================= */

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    if (
      error.code ===
      '23505'
    ) {
      return res
        .status(409)
        .json({
          message:
            'ข้อมูลนี้มีอยู่แล้ว',
        });
    }


    if (
      error.code ===
      '23503'
    ) {
      return res
        .status(409)
        .json({
          message:
            'ข้อมูลนี้มีรายการอ้างอิงอยู่ ไม่สามารถลบได้',
        });
    }


    if (
      error.code ===
      '23514'
    ) {
      return res
        .status(400)
        .json({
          message:
            'ข้อมูลไม่ผ่านเงื่อนไขของระบบ',
        });
    }


    const status =
      error.status || 500;


    if (
      status >= 500
    ) {
      console.error(
        error
      );
    }


    res
      .status(status)
      .json({
        message:
          status >= 500
            ? 'เชื่อมต่อฐานข้อมูลหรือประมวลผลไม่สำเร็จ กรุณาตรวจ backend'
            : error.message,
      });
  }
);


/* =========================
   START SERVER
========================= */

const server =
  app.listen(
    Number(
      process.env.PORT
    ) || 4000,

    () => {
      console.log(
        `Library API ready at http://localhost:${
          process.env.PORT ||
          4000
        }`
      );

      console.log(
        '✅ LINE Messaging API configured'
      );
    }
  );


/* =========================
   SHUTDOWN
========================= */

async function shutdown() {
  server.close(
    async () => {
      await pool.end();

      process.exit(0);
    }
  );
}


process.on(
  'SIGTERM',
  shutdown
);


process.on(
  'SIGINT',
  shutdown
);