import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

// สร้าง PostgreSQL connection pool
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});

// เช็กการเชื่อมต่อฐานข้อมูลตอนเริ่มระบบ
pool
  .query('SELECT NOW()')
  .then(() => {
    console.log('✅ PostgreSQL connected');
  })
  .catch((error) => {
    console.error('❌ PostgreSQL connection failed:', error.message);
  });

// ดัก error ที่เกิดกับ connection ภายใน pool
pool.on('error', (error) => {
  console.error('PostgreSQL pool error:', error.message);
});

export function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

export function positiveId(value) {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id < 1) {
    throw httpError(400, 'รหัสข้อมูลไม่ถูกต้อง');
  }

  return id;
}

// จำนวนหนังสือที่พร้อมให้ยืม
// = จำนวนทั้งหมด - ที่กำลังถูกยืม - ที่ถูกจองและยังไม่หมดอายุ
export const availableSql = `
  b.total_copies
  - (
      SELECT COUNT(*)::int
      FROM loans l
      WHERE l.book_id = b.id
        AND l.returned_at IS NULL
    )
  - (
      SELECT COUNT(*)::int
      FROM reservations r
      WHERE r.book_id = b.id
        AND r.status = 'PENDING'
        AND r.expires_at > NOW()
    )
`;