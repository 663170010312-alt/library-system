-- Run this entire file in pgAdmin Query Tool connected to library_system.
-- UTF-8 / PostgreSQL.
-- Safe to run again: existing data is preserved.

BEGIN;

-- =========================================================
-- USERS
-- Roles: MEMBER, ADMIN only
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL CHECK (length(trim(name)) > 0),
  email VARCHAR(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'MEMBER'
    CHECK (role IN ('MEMBER', 'ADMIN')),
  active BOOLEAN NOT NULL DEFAULT true,

  -- รหัสนักเรียน / รหัสบุคลากร
  school_code VARCHAR(50),

  -- ชั้น / ห้อง (ครูสามารถเว้นว่างได้)
  class_room VARCHAR(50),

  -- ประเภทผู้ใช้ห้องสมุด
  user_type VARCHAR(20)
    CHECK (user_type IS NULL OR user_type IN ('STUDENT', 'TEACHER')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- รองรับ database เดิมที่มีตาราง users อยู่แล้ว
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_code VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS class_room VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS users_school_code_unique
  ON users(school_code)
  WHERE school_code IS NOT NULL;


-- =========================================================
-- CATEGORIES
-- =========================================================

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
    CHECK (length(trim(name)) > 0)
);


-- =========================================================
-- BOOKS
-- =========================================================

CREATE TABLE IF NOT EXISTS books (
  id SERIAL PRIMARY KEY,

  title VARCHAR(200) NOT NULL,
  author VARCHAR(150) NOT NULL,

  isbn VARCHAR(32) UNIQUE,

  -- เลขเรียกหนังสือ
  call_number VARCHAR(100),

  -- รายละเอียด
  description TEXT NOT NULL DEFAULT '',

  category_id INTEGER REFERENCES categories(id),

  -- จำนวนหนังสือทั้งหมด
  total_copies INTEGER NOT NULL DEFAULT 1
    CHECK (total_copies >= 0),

  -- ราคาหนังสือ ใช้ประกอบการคิดค่าปรับชำรุด/สูญหาย
  price NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (price >= 0),

  -- URL หรือ path รูปปก
  cover_url TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- รองรับ database เดิมที่มีตาราง books อยู่แล้ว
ALTER TABLE books
  ADD COLUMN IF NOT EXISTS call_number VARCHAR(100);

ALTER TABLE books
  ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE books
  ADD COLUMN IF NOT EXISTS cover_url TEXT;


-- =========================================================
-- RESERVATIONS
-- ระบบจองเดิม คงไว้เหมือนเดิม
-- =========================================================

CREATE TABLE IF NOT EXISTS reservations (
  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL REFERENCES users(id),
  book_id INTEGER NOT NULL REFERENCES books(id),

  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (
      status IN (
        'PENDING',
        'CANCELLED',
        'FULFILLED'
      )
    ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- การจองหมดอายุภายใน 3 วัน
  expires_at TIMESTAMPTZ NOT NULL
    DEFAULT (NOW() + INTERVAL '3 days'),

  CHECK (expires_at > created_at)
);


-- =========================================================
-- LOANS
-- ยืม / คืน / ต่ออายุ / ค่าปรับ / ชำระเงิน
-- =========================================================

CREATE TABLE IF NOT EXISTS loans (
  id SERIAL PRIMARY KEY,

  user_id INTEGER NOT NULL REFERENCES users(id),
  book_id INTEGER NOT NULL REFERENCES books(id),

  reservation_id INTEGER UNIQUE REFERENCES reservations(id),

  -- ADMIN ที่ทำรายการยืม
  borrowed_by INTEGER NOT NULL REFERENCES users(id),

  -- ADMIN ที่รับคืน
  returned_by INTEGER REFERENCES users(id),

  borrowed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- กำหนดคืนปกติ 14 วัน
  due_at TIMESTAMPTZ NOT NULL
    DEFAULT (NOW() + INTERVAL '14 days'),

  returned_at TIMESTAMPTZ,

  -- =====================================================
  -- การต่ออายุ
  -- =====================================================

  -- ต่ออายุได้สูงสุด 1 ครั้ง
  renewal_count INTEGER NOT NULL DEFAULT 0
    CHECK (renewal_count BETWEEN 0 AND 1),

  -- วันที่กดต่ออายุ
  renewed_at TIMESTAMPTZ,

  -- กำหนดคืนใหม่หลังต่ออายุ
  renewed_until TIMESTAMPTZ,

  -- =====================================================
  -- สภาพหนังสือตอนคืน
  -- NORMAL   = ปกติ
  -- DAMAGED  = ชำรุด
  -- LOST     = สูญหาย
  -- =====================================================

  return_condition VARCHAR(20)
    CHECK (
      return_condition IS NULL
      OR return_condition IN (
        'NORMAL',
        'DAMAGED',
        'LOST'
      )
    ),

  -- =====================================================
  -- ค่าปรับ
  -- =====================================================

  -- ค่าปรับคืนช้า 1 บาท/วัน
  late_fee NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (late_fee >= 0),

  -- ค่าปรับหนังสือชำรุด
  damage_fee NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (damage_fee >= 0),

  -- ค่าปรับหนังสือสูญหาย
  lost_fee NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (lost_fee >= 0),

  -- ยอดค่าปรับรวม
  total_fine NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (total_fine >= 0),

  -- =====================================================
  -- การชำระค่าปรับ
  -- CASH = เงินสด
  -- QR   = QR Code
  -- =====================================================

  payment_method VARCHAR(20)
    CHECK (
      payment_method IS NULL
      OR payment_method IN (
        'CASH',
        'QR'
      )
    ),

  -- UNPAID  = ยังไม่ชำระ
  -- PENDING = แนบสลิปแล้ว รอ ADMIN ตรวจ
  -- PAID    = ชำระเรียบร้อย
  payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID'
    CHECK (
      payment_status IN (
        'UNPAID',
        'PENDING',
        'PAID'
      )
    ),

  -- รูปสลิปกรณีชำระด้วย QR
  payment_slip_url TEXT,

  -- วันที่สมาชิกส่งสลิป
  payment_submitted_at TIMESTAMPTZ,

  -- วันที่ยืนยันว่าชำระแล้ว
  fine_paid_at TIMESTAMPTZ,

  -- ADMIN ที่ยืนยันการรับชำระ
  fine_received_by INTEGER REFERENCES users(id),

  -- หมายเหตุ เช่น เหตุผลที่ไม่อนุมัติสลิป
  payment_note TEXT,

  CHECK (due_at > borrowed_at),

  CHECK (
    returned_at IS NULL
    OR returned_at >= borrowed_at
  ),

  CHECK (
    (returned_at IS NULL) =
    (returned_by IS NULL)
  )
);


-- =========================================================
-- รองรับ database เดิม
-- ถ้ามี loans อยู่แล้ว จะเพิ่ม column ใหม่โดยไม่ลบข้อมูล
-- =========================================================

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS renewal_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS renewed_at TIMESTAMPTZ;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS renewed_until TIMESTAMPTZ;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS return_condition VARCHAR(20);

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS late_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS damage_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS lost_fee NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS total_fine NUMERIC(10,2) NOT NULL DEFAULT 0;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20)
    NOT NULL DEFAULT 'UNPAID';

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS payment_slip_url TEXT;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMPTZ;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS fine_paid_at TIMESTAMPTZ;

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS fine_received_by INTEGER
    REFERENCES users(id);

ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS payment_note TEXT;


-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS reservations_stock_idx
  ON reservations(book_id, expires_at)
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS reservations_user_idx
  ON reservations(user_id);

CREATE INDEX IF NOT EXISTS loans_stock_idx
  ON loans(book_id)
  WHERE returned_at IS NULL;

CREATE INDEX IF NOT EXISTS loans_due_idx
  ON loans(due_at)
  WHERE returned_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_loan_per_member_book
  ON loans(user_id, book_id)
  WHERE returned_at IS NULL;

CREATE INDEX IF NOT EXISTS books_category_idx
  ON books(category_id);

CREATE INDEX IF NOT EXISTS loans_payment_status_idx
  ON loans(payment_status)
  WHERE total_fine > 0;


-- =========================================================
-- DEMO USERS
-- Password: Library123!
-- =========================================================

INSERT INTO users(
  name,
  email,
  password_hash,
  role,
  school_code,
  class_room,
  user_type
)
VALUES
(
  'ผู้ดูแลระบบ',
  'admin@library.local',
  '$2b$12$2xKqQGRDQ/9bK2fSDKAbbObjHcouUx/fS0OxQ5cO9/DTrGvt1bvWy',
  'ADMIN',
  NULL,
  NULL,
  NULL
),
(
  'นักเรียนตัวอย่าง',
  'member@library.local',
  '$2b$12$2xKqQGRDQ/9bK2fSDKAbbObjHcouUx/fS0OxQ5cO9/DTrGvt1bvWy',
  'MEMBER',
  'STU-DEMO-001',
  'ม.6/1',
  'STUDENT'
)
ON CONFLICT (email) DO NOTHING;

-- เติมข้อมูลให้บัญชีตัวอย่างเดิม หากมีอยู่ก่อนแล้ว
UPDATE users
SET school_code = COALESCE(school_code, 'STU-DEMO-001'),
    class_room = COALESCE(class_room, 'ม.6/1'),
    user_type = COALESCE(user_type, 'STUDENT')
WHERE email = 'member@library.local';


-- =========================================================
-- DEMO CATEGORIES
-- =========================================================

INSERT INTO categories(name)
VALUES
  ('เทคโนโลยี'),
  ('วรรณกรรม'),
  ('พัฒนาตนเอง'),
  ('วิทยาศาสตร์')
ON CONFLICT (name) DO NOTHING;


-- =========================================================
-- DEMO BOOKS
-- เพิ่ม Call Number และราคาแล้ว
-- cover_url ปล่อย NULL ก่อนได้
-- =========================================================

INSERT INTO books(
  title,
  author,
  isbn,
  call_number,
  description,
  category_id,
  total_copies,
  price
)
VALUES

(
  'เริ่มต้นเขียนโปรแกรม JavaScript',
  'ทีมการเรียนรู้',
  'DEMO-JS-001',
  '005.133 JAV',
  'เรียนรู้ตัวแปร เงื่อนไข ฟังก์ชัน และการพัฒนาเว็บผ่านตัวอย่างที่อ่านง่าย',
  (SELECT id FROM categories WHERE name='เทคโนโลยี'),
  5,
  320.00
),

(
  'ฐานข้อมูล PostgreSQL เบื้องต้น',
  'ทีมการเรียนรู้',
  'DEMO-PG-002',
  '005.7565 POS',
  'ฝึกออกแบบตารางและเขียน SQL ตั้งแต่ SELECT ไปจนถึง JOIN และ transaction',
  (SELECT id FROM categories WHERE name='เทคโนโลยี'),
  3,
  350.00
),

(
  'เรื่องเล่าจากห้องสมุด',
  'นักเขียนตัวอย่าง',
  'DEMO-LIT-003',
  '895.913 LIT',
  'เรื่องสั้นเกี่ยวกับผู้คน ความทรงจำ และการค้นพบสิ่งใหม่บนชั้นหนังสือ',
  (SELECT id FROM categories WHERE name='วรรณกรรม'),
  4,
  250.00
),

(
  'สร้างนิสัยการอ่าน',
  'ทีมการเรียนรู้',
  'DEMO-SELF-004',
  '158.1 SEL',
  'แนวทางจัดเวลา ตั้งเป้าหมาย และบันทึกสิ่งที่เรียนรู้จากการอ่านในแต่ละวัน',
  (SELECT id FROM categories WHERE name='พัฒนาตนเอง'),
  2,
  280.00
),

(
  'วิทยาศาสตร์รอบตัว',
  'ทีมการเรียนรู้',
  'DEMO-SCI-005',
  '500 SCI',
  'สำรวจคำถามในชีวิตประจำวันด้วยการสังเกตและการทดลองอย่างง่าย',
  (SELECT id FROM categories WHERE name='วิทยาศาสตร์'),
  3,
  300.00
),

(
  'พัฒนาเว็บด้วย Next.js',
  'ทีมการเรียนรู้',
  'DEMO-NEXT-006',
  '006.76 NEX',
  'หนังสือประกอบการเรียนเรื่องหน้าเว็บ คอมโพเนนต์ และการเชื่อมต่อ API',
  (SELECT id FROM categories WHERE name='เทคโนโลยี'),
  2,
  390.00
)

ON CONFLICT (isbn) DO NOTHING;


-- =========================================================
-- DEMO LOANS
-- 1 รายการคืนแล้ว
-- 1 รายการเกินกำหนด
-- =========================================================

INSERT INTO loans(
  user_id,
  book_id,
  borrowed_by,
  returned_by,
  borrowed_at,
  due_at,
  returned_at,
  return_condition
)
SELECT
  u.id,
  b.id,
  s.id,
  s.id,
  NOW() - INTERVAL '25 days',
  NOW() - INTERVAL '11 days',
  NOW() - INTERVAL '15 days',
  'NORMAL'
FROM users u, books b, users s
WHERE
  u.email = 'member@library.local'
  AND b.isbn = 'DEMO-LIT-003'
  AND s.email = 'admin@library.local'
  AND NOT EXISTS (
    SELECT 1
    FROM loans
    WHERE user_id = u.id
      AND book_id = b.id
  );


INSERT INTO loans(
  user_id,
  book_id,
  borrowed_by,
  borrowed_at,
  due_at
)
SELECT
  u.id,
  b.id,
  s.id,
  NOW() - INTERVAL '16 days',
  NOW() - INTERVAL '2 days'
FROM users u, books b, users s
WHERE
  u.email = 'member@library.local'
  AND b.isbn = 'DEMO-SCI-005'
  AND s.email = 'admin@library.local'
  AND NOT EXISTS (
    SELECT 1
    FROM loans
    WHERE user_id = u.id
      AND book_id = b.id
  );


COMMIT;