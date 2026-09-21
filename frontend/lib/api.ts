const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000/api';

export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const token =
    typeof window !== 'undefined'
      ? sessionStorage.getItem('library-token')
      : null;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : {}),
    },
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || 'ทำรายการไม่สำเร็จ'
    );
  }

  return data as T;
}

/* =========================
   USER
========================= */

export type User = {
  id: number;
  name: string;
  email: string;

  role: 'MEMBER' | 'ADMIN';
  active: boolean;

  school_code?: string | null;
  student_code?: string | null;

  user_type?:
    | 'STUDENT'
    | 'TEACHER'
    | null;

  class_level?: string | null;
  room?: string | null;

  staff_position?: string | null;
  department?: string | null;

  class_room?: string | null;
};

/* =========================
   CATEGORY
========================= */

export type Category = {
  id: number;
  name: string;
};

/* =========================
   BOOK COPY
   หนังสือจริงแต่ละเล่ม
========================= */

export type BookCopy = {
  id: number;
  book_id: number;

  copy_code: string | null;

  status:
    | 'AVAILABLE'
    | 'BORROWED'
    | 'LOST'
    | 'RETIRED';

  created_at?: string;
};

/* =========================
   BOOK
   books = ข้อมูลชื่อเรื่อง
========================= */

export type Book = {
  id: number;

  title: string;
  author: string;

  isbn: string | null;
  call_number: string | null;

  description: string | null;

  category_id: number | null;
  category_name: string | null;

  /*
    จำนวนหนังสือที่ยังใช้งานได้
    AVAILABLE + BORROWED
  */
  total_copies: number;

  /*
    จำนวนจาก book_copies
  */
  copy_count?: number;

  available_copies: number;

  borrowed_copies?: number;

  lost_copies?: number;

  price: number | string;

  cover_url: string | null;

  /*
    GET /books/:id
    จะมีรายการเล่มจริงกลับมาด้วย
  */
  copies?: BookCopy[];
};

/* =========================
   RESERVATION
========================= */

export type Reservation = {
  id: number;

  user_id?: number;
  book_id?: number;

  title: string;
  author?: string;

  member_name: string;
  email: string;

  school_code?: string | null;
  class_room?: string | null;

  user_type?:
    | 'STUDENT'
    | 'TEACHER'
    | null;

  status:
    | 'PENDING'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'FULFILLED';

  /*
    backend reservations ใหม่
    อาจส่ง display_status แยก
  */
  display_status?:
    | 'PENDING'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'FULFILLED';

  created_at: string;
  expires_at: string;

  /*
    จำนวนเล่มจริงที่ AVAILABLE
  */
  available_copies?: number;
};

/* =========================
   LOAN
========================= */

export type Loan = {
  id: number;

  user_id: number;

  /*
    book_id = ชื่อเรื่อง
  */
  book_id: number;

  /*
    copy_id = หนังสือจริงแต่ละเล่ม
  */
  copy_id?: number | null;

  copy_code?: string | null;

  copy_status?:
    | 'AVAILABLE'
    | 'BORROWED'
    | 'LOST'
    | 'RETIRED'
    | null;

  reservation_id:
    | number
    | null;

  borrowed_by?: number | null;
  returned_by?: number | null;

  title: string;

  author?: string;

  call_number?: string | null;

  price?: number | string;

  member_name: string;
  email: string;

  school_code?: string | null;
  class_room?: string | null;

  user_type?:
    | 'STUDENT'
    | 'TEACHER'
    | null;

  status:
    | 'BORROWED'
    | 'RETURNED';

  borrowed_at: string;
  due_at: string;

  effective_due_at?: string;

  returned_at:
    | string
    | null;

  overdue: boolean;

  overdue_days?: number;

  /* =========================
     ต่ออายุ
  ========================= */

  renewal_count: number;

  renewed_at:
    | string
    | null;

  renewed_until:
    | string
    | null;

  /* =========================
     สภาพหนังสือตอนคืน
  ========================= */

  return_condition:
    | 'NORMAL'
    | 'DAMAGED'
    | 'LOST'
    | null;

  /* =========================
     ค่าปรับ
  ========================= */

  late_fee:
    | number
    | string;

  damage_fee:
    | number
    | string;

  lost_fee:
    | number
    | string;

  total_fine:
    | number
    | string;

  /* =========================
     การชำระ
  ========================= */

  payment_method:
    | 'CASH'
    | 'QR'
    | null;

  payment_status:
    | 'UNPAID'
    | 'PENDING'
    | 'PAID';

  payment_slip_url:
    | string
    | null;

  payment_submitted_at:
    | string
    | null;

  fine_paid_at:
    | string
    | null;

  fine_received_by:
    | number
    | null;

  payment_note:
    | string
    | null;
};

/* =========================
   DATE FORMAT
========================= */

export function date(
  value: string | null | undefined
) {
  return value
    ? new Date(value).toLocaleString(
        'th-TH',
        {
          dateStyle: 'medium',
          timeStyle: 'short',
        }
      )
    : '—';
}

/* =========================
   RESERVATION STATUS
========================= */

export const reservationStatusText: Record<
  Reservation['status'],
  string
> = {
  PENDING:
    'รอรับที่เคาน์เตอร์',

  CANCELLED:
    'ยกเลิกแล้ว',

  EXPIRED:
    'หมดอายุ',

  FULFILLED:
    'ยืนยันยืมแล้ว',
};

/* =========================
   LOAN STATUS
========================= */

export const loanStatusText: Record<
  Loan['status'],
  string
> = {
  BORROWED:
    'กำลังยืม',

  RETURNED:
    'คืนแล้ว',
};

/* =========================
   PAYMENT STATUS
========================= */

export const paymentStatusText: Record<
  Loan['payment_status'],
  string
> = {
  UNPAID:
    'ยังไม่ชำระ',

  PENDING:
    'รอตรวจสอบสลิป',

  PAID:
    'ชำระแล้ว',
};

/* =========================
   PAYMENT METHOD
========================= */

export const paymentMethodText: Record<
  'CASH' | 'QR',
  string
> = {
  CASH:
    'เงินสด',

  QR:
    'QR Code',
};

/* =========================
   RETURN CONDITION
========================= */

export const returnConditionText: Record<
  'NORMAL' | 'DAMAGED' | 'LOST',
  string
> = {
  NORMAL:
    'ปกติ',

  DAMAGED:
    'ชำรุด',

  LOST:
    'สูญหาย',
};

/* =========================
   BOOK COPY STATUS
========================= */

export const copyStatusText: Record<
  BookCopy['status'],
  string
> = {
  AVAILABLE:
    'ว่าง',

  BORROWED:
    'กำลังถูกยืม',

  LOST:
    'สูญหาย',

  RETIRED:
    'นำออกจากระบบ',
};

/* =========================
   COMPATIBILITY STATUS TEXT
   สำหรับไฟล์เดิมที่ยังใช้ statusText
========================= */

export const statusText: Record<
  string,
  string
> = {
  PENDING:
    'รอรับที่เคาน์เตอร์',

  CANCELLED:
    'ยกเลิกแล้ว',

  EXPIRED:
    'หมดอายุ',

  FULFILLED:
    'ยืนยันยืมแล้ว',

  BORROWED:
    'กำลังยืม',

  RETURNED:
    'คืนแล้ว',

  UNPAID:
    'ยังไม่ชำระ',

  PAID:
    'ชำระแล้ว',

  AVAILABLE:
    'ว่าง',

  LOST:
    'สูญหาย',

  RETIRED:
    'นำออกจากระบบ',
};
/* =========================
   LINE ACCOUNT LINK
========================= */

export type LineLinkStatus = {
  linked: boolean;

  link: {
    line_user_id: string;
    linked_at: string;
  } | null;
};

export type LineLinkConfirmResult = {
  message: string;

  user: {
    id: number;
    name: string;
    email: string;
  };
};