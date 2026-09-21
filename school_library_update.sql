-- รันไฟล์นี้ใน pgAdmin Query Tool โดยเลือกฐานข้อมูล library_system
-- ใช้สำหรับอัปเดตฐานข้อมูลเดิมให้รองรับนักเรียน/ครู

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS school_code VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS class_room VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(20);

CREATE UNIQUE INDEX IF NOT EXISTS users_school_code_unique
  ON users(school_code)
  WHERE school_code IS NOT NULL;

UPDATE users
SET school_code = COALESCE(school_code, 'STU-DEMO-001'),
    class_room = COALESCE(class_room, 'ม.6/1'),
    user_type = COALESCE(user_type, 'STUDENT')
WHERE email = 'member@library.local';

COMMIT;
