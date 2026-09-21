# Library System

ระบบห้องสมุดสำหรับการเรียนรู้ โครงสร้างตรงไปตรงมา: Next.js เรียก Express และ Express เขียน SQL ผ่าน `pg` ไปยัง PostgreSQL โดยตรง ไม่มี Prisma, ORM, controller, service หรือ repository

## โครงสร้าง

```text
library-system/
├── database.sql              # สร้างตาราง + ข้อมูลตัวอย่าง เปิดใน pgAdmin ได้
├── README.md
├── frontend/
│   ├── app/                  # แต่ละหน้าแยกโฟลเดอร์และมี page.tsx ของตัวเอง
│   │   ├── books/            # ค้นหาหนังสือ และ [id]/page.tsx สำหรับรายละเอียด
│   │   ├── login/
│   │   ├── register/
│   │   ├── dashboard/
│   │   ├── manage-books/
│   │   ├── my-reservations/
│   │   ├── reservations/
│   │   ├── loans/
│   │   ├── history/
│   │   ├── overdue/
│   │   ├── members/
│   │   ├── categories/
│   │   ├── staff/
│   │   ├── reports/
│   │   └── profile/
│   ├── components/           # เมนู/สถานะผู้ใช้ ฟอร์ม และตารางที่ใช้ร่วมกัน
│   ├── lib/api.ts            # เรียก API และชนิดข้อมูล TypeScript
│   ├── public/
│   ├── package.json
│   ├── package-lock.json
│   ├── .env.example
│   └── .env.local
└── backend/
    ├── routes/
    │   ├── auth.js           # สมัคร/เข้าสู่ระบบ + middleware ตรวจสิทธิ์
    │   ├── books.js          # ค้นหา/รายละเอียด/เพิ่ม/แก้ไข/ลบหนังสือ
    │   ├── categories.js     # หมวดหมู่
    │   ├── reservations.js   # จอง/ยกเลิก/ดูรายการจอง
    │   ├── loans.js          # ยืม/คืน/เกินกำหนด/Dashboard/รายงาน
    │   └── users.js          # โปรไฟล์/สมาชิก/บัญชีเจ้าหน้าที่
    ├── server.js             # สร้าง Express, app.use(), app.listen()
    ├── db.js                 # Pool ของ pg และตัวช่วยสั้น ๆ
    ├── package.json
    ├── package-lock.json
    ├── .env.example
    └── .env
```

## 1. เตรียม PostgreSQL

ใช้ Node.js 22.20 ขึ้นไป และ PostgreSQL 17 หรือ 18

1. เปิด pgAdmin และเชื่อมต่อ PostgreSQL ของคุณ
2. คลิกขวา **Databases → Create → Database** ตั้งชื่อ `library_system` แล้ว Save
3. เลือกฐานข้อมูล `library_system` และเปิด **Query Tool**
4. เปิดไฟล์ `database.sql` แล้ว Run ทั้งไฟล์

SQL ไม่ต้องติดตั้ง extension และไม่มีคำสั่งเฉพาะของ psql สามารถรันซ้ำได้โดยไม่ลบข้อมูลเดิม มีหนังสือตัวอย่าง 6 รายการ บัญชี 3 บทบาท ประวัติคืนแล้ว 1 รายการ และรายการเกินกำหนด 1 รายการ

> ไม่รวม `CREATE DATABASE` ในไฟล์ เพราะ pgAdmin ต้องเชื่อมต่อฐานข้อมูลเป้าหมายก่อนสร้างตาราง ขั้นตอนสร้างฐานข้อมูลทำเพียงครั้งเดียว

## 2. ตั้งค่า

แก้ `backend/.env`:

```dotenv
PORT=4000
FRONTEND_URL=http://localhost:3000
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/library_system
JWT_SECRET=replace-with-a-long-random-secret-at-least-24-characters
```

`YOUR_PASSWORD` คือรหัสผ่านของผู้ใช้ PostgreSQL ไม่ใช่รหัสผ่านเข้า pgAdmin หาก PostgreSQL ใช้ port อื่นให้เปลี่ยน `5432` ด้วย ถ้ารหัสผ่านมีอักขระพิเศษ เช่น `@`, `#`, `%` ให้ URL-encode เฉพาะส่วนรหัสผ่าน

แก้ `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

ไฟล์ env ถูกละเว้นจาก Git มี `.env.example` ทั้งสองฝั่งสำหรับคัดลอกเมื่อนำโปรเจกต์ไปเครื่องอื่น ค่ารหัสผ่านฐานข้อมูลและ JWT ที่มีให้เป็นตัวอย่างสำหรับเครื่องพัฒนาเท่านั้น

## 3. รัน Backend — terminal แรก

```powershell
cd D:\library-system\backend
npm install
npm run dev
```

Backend: http://localhost:4000 — ตรวจฐานข้อมูลผ่าน http://localhost:4000/api/health ต้องได้ `{"status":"ok","database":"connected"}`

หากไม่ต้องการให้รีโหลดเมื่อแก้ไฟล์ ใช้ `npm start` แทน `npm run dev`

## 4. รัน Frontend — terminal ที่สอง

```powershell
cd D:\library-system\frontend
npm install
npm run dev
```

เปิด http://localhost:3000

ตรวจ production build และรันแบบ production:

```powershell
cd D:\library-system\frontend
npm run build
npm start
```

อย่าเปิด `npm run dev` และ `npm start` ฝั่งเดียวกันพร้อมกัน เพราะใช้ port เดียวกัน

## บัญชีตัวอย่าง

ทุกบัญชีใช้รหัสผ่าน **Library123!**

| บทบาท | อีเมล |
| --- | --- |
| MEMBER | member@library.local |
| ADMIN | admin@library.local |

สมัครสมาชิกใหม่จะได้สิทธิ์ MEMBER เสมอ ADMIN เพิ่มบัญชีเจ้าหน้าที่ได้จากเมนูบัญชีเจ้าหน้าที่ และแก้โปรไฟล์/รหัสผ่านของตนเองได้ที่เมนูโปรไฟล์

## วิธีใช้งานและ flow

- **MEMBER:** ค้นหา/กรองหมวดหมู่/ดูรายละเอียด → จอง → ดูการจองของฉันหรือยกเลิก → รับที่เคาน์เตอร์ → ดูหนังสือที่กำลังยืมและประวัติ → แก้โปรไฟล์
- **ADMIN:** Dashboard → รายการจอง → ยืนยันการยืมเมื่อสมาชิกมารับ หรือเลือกสมาชิกและหนังสือจาก Dashboard เพื่อยืมโดยไม่จอง → หน้าหนังสือที่กำลังยืมเพื่อรับคืน มีหน้าจัดการหนังสือ สมาชิก และรายการเกินกำหนด
- **ADMIN:** ทำได้เหมือน ADMIN และเพิ่ม/แก้ไข/ลบหมวดหมู่ สร้าง/เปลี่ยนสิทธิ์/ปิดบัญชีเจ้าหน้าที่ และดูรายงานรายเดือนกับหนังสือยอดนิยม

```text
MEMBER จองออนไลน์ → PENDING (เก็บไว้ 3 วัน)
                   ↓ สมาชิกมารับหนังสือที่เคาน์เตอร์
ADMIN ยืนยัน → การจอง FULFILLED + รายการยืม BORROWED
                   ↓ กำหนดคืน 14 วันนับจากเวลายืนยันยืม
สมาชิกนำมาคืน → ADMIN ยืนยันรับคืน → RETURNED
```

การจองไม่ได้สร้างรายการยืม สมาชิกเรียก API ยืมหรือคืนเองไม่ได้ ยืมโดยไม่จองก็ต้องยืนยันโดยเจ้าหน้าที่เท่านั้น

วันเวลาจัดเก็บด้วย `TIMESTAMPTZ` และแสดงตามเวลาของเบราว์เซอร์ `EXPIRED` คำนวณจากวันหมดอายุเมื่ออ่านข้อมูล ไม่ต้องมี cron job ส่วน `BORROWED` / `RETURNED` คำนวณจาก `returned_at` ของรายการยืม

จำนวนว่าง = จำนวนเล่มทั้งหมด − รายการยืมที่ยังไม่คืน − การจองที่ยังไม่หมดอายุ ใช้ transaction และล็อกแถวหนังสือก่อนทำรายการเพื่อไม่ให้จองหรือยืมเกินจำนวนเล่ม ข้อมูลที่มีประวัติอ้างอิงจะลบไม่ได้เพื่อรักษาประวัติ

## อ่านโค้ดตามลำดับ

1. `frontend/app/page.tsx` พาไป `/login` แต่ละ URL มี `app/ชื่อหน้า/page.tsx` ของตัวเอง เช่น `/login` คือ `app/login/page.tsx`
2. `frontend/app/layout.tsx` ใช้ `components/AppShell.tsx` แสดงเมนูและข้อมูลผู้เข้าสู่ระบบร่วมกัน หน้าแต่ละหน้าเรียก `api()` ใน `frontend/lib/api.ts` โดยใช้ฟอร์มหรือตารางจาก components ร่วมกันเมื่อเหมาะสม
3. `backend/server.js` ส่งคำขอไปไฟล์ใน `routes/`
4. route ตรวจสิทธิ์และข้อมูล แล้วเขียน SQL ผ่าน `pool.query()` หรือ transaction
5. backend ส่ง JSON กลับมาให้ component แสดงผล

ตัวอย่าง: กดจองใน `app/books/[id]/page.tsx` → `POST /api/reservations` → `routes/reservations.js` → `INSERT INTO reservations`

เมนูใช้ Link ของ Next.js เปลี่ยน URL จริง สามารถเปิดหน้าตรง รีเฟรช หรือกดย้อนกลับได้ หน้าเจ้าหน้าที่และผู้ดูแลมีการตรวจบทบาทก่อนแสดงผล ส่วนการอนุญาตเข้าถึงข้อมูลตรวจซ้ำที่ Express เสมอ

## ผลการตรวจ

- `npm install` ผ่านทั้ง frontend และ backend; รุ่นที่ติดตั้งล็อกไว้ใน package-lock.json
- `npm run build` ผ่านด้วย Next.js 16.3.5 และ TypeScript
- `npm start` ของ backend เปิด port 4000 และ `/api/health` เชื่อม PostgreSQL ได้
- `npm start` ของ frontend เปิด port 3000 และทดสอบหน้าเว็บ/เข้าสู่ระบบผ่านเบราว์เซอร์
- ทดสอบ API และกฎข้อมูล 63 จุด รวมสิทธิ์ 3 บทบาท สมัคร เข้าสู่ระบบ จอง ยกเลิก จองหมดอายุ ยืมจากการจอง ยืมโดยไม่จอง คืน รายงาน โปรไฟล์ และการแข่งขันจอง/ยืมเล่มสุดท้ายพร้อมกัน
- รัน `database.sql` บน PostgreSQL 17 สำเร็จ รวมการรันซ้ำ

การตรวจทั้งหมดใช้ PostgreSQL ชั่วคราวที่แยกจากฐานข้อมูลเดิมในเครื่อง **การใช้งานกับฐานข้อมูลของคุณยังต้องตั้ง DATABASE_URL และนำเข้า SQL ตามขั้นตอนด้านบน**

## เข้าสู่ระบบก่อนใช้งาน

เมื่อเปิดเว็บจะพบหน้า Login ก่อน เฉพาะ `/login` และ `/register` ที่เข้าได้โดยไม่เข้าสู่ระบบ หน้าอื่นรวมถึงหนังสือและรายละเอียดต้องเข้าสู่ระบบก่อน API หนังสือและหมวดหมู่ตรวจ token ด้วย สมาชิกเข้าสู่หน้าหนังสือ ส่วนเจ้าหน้าที่เข้าสู่ Dashboard เมื่อออกจากระบบจะกลับหน้า Login
