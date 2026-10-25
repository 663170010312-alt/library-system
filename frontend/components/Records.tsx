'use client';

import { useEffect, useState } from 'react';
import {
  api,
  date,
  Loan,
  Reservation,
  Book,
  statusText,
  paymentStatusText,
  paymentMethodText,
  returnConditionText,
  User,
} from '@/lib/api';

type ReturnCondition = 'NORMAL' | 'DAMAGED' | 'LOST';


type RecordDateField =
  | 'created_at'
  | 'expires_at'
  | 'borrowed_at'
  | 'due_at'
  | 'returned_at';

function thaiCalendarDate(
  value: string | null | undefined
): string {
  if (!value) return '';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

export default function Records({
  user,
  mode,
  notify,
}: {
  user: User;
  mode: string;
  notify: (s: string, error?: boolean) => void;
}) {

  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);

  const [books, setBooks] = useState<Book[]>([]);
  const [members, setMembers] = useState<User[]>([]);
  const [showManualOverdue, setShowManualOverdue] = useState(false);
  const [manualMemberId, setManualMemberId] = useState('');
  const [manualBookId, setManualBookId] = useState('');
  const [manualBorrowedAt, setManualBorrowedAt] = useState('');
  const [manualDueAt, setManualDueAt] = useState('');

  const [search, setSearch] = useState('');
  const [dateField, setDateField] =
  useState<RecordDateField>('borrowed_at');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (mode !== 'overdue' || user.role !== 'ADMIN') return;
    let active = true;
    api<User[]>('/users')
      .then((result) => { if (active) setMembers(Array.isArray(result) ? result : []); })
      .catch((e) => { if (active) notify((e as Error).message, true); });
    return () => { active = false; };
  }, [mode, user.role, revision]);

  async function addManualOverdue(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!manualMemberId || !manualBookId || !manualBorrowedAt || !manualDueAt) {
      notify('กรุณากรอกข้อมูลให้ครบ', true);
      return;
    }
    if (manualBorrowedAt > manualDueAt) {
      notify('วันครบกำหนดต้องไม่ก่อนวันยืม', true);
      return;
    }
    const today = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    if (manualDueAt >= today) {
      notify('วันครบกำหนดต้องเป็นวันก่อนวันนี้', true);
      return;
    }
    if (!window.confirm('ยืนยันบันทึกรายการยืมเกินกำหนดย้อนหลัง?')) return;
    setBusy(true);
    try {
      await api('/loans/manual-overdue', 'POST', {
        user_id: Number(manualMemberId),
        book_id: Number(manualBookId),
        borrowed_at: manualBorrowedAt,
        due_at: manualDueAt,
      });
      setShowManualOverdue(false);
      setManualMemberId('');
      setManualBookId('');
      setManualBorrowedAt('');
      setManualDueAt('');
      setSearch('');
      setSelectedDate('');
      setSelectedCategory('');
      setRevision((v) => v + 1);
      notify('เพิ่มรายการเกินกำหนดย้อนหลังแล้ว');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  // modal คืนหนังสือ
  const [returningLoan, setReturningLoan] = useState<Loan | null>(null);
  const [returnCondition, setReturnCondition] =
    useState<ReturnCondition>('NORMAL');
  const [damageFee, setDamageFee] = useState('0');

  // modal ปฏิเสธสลิป
  const [rejectingLoan, setRejectingLoan] = useState<Loan | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  // modal ส่งสลิป QR
  const [qrLoan, setQrLoan] = useState<Loan | null>(null);
  const [slipFile, setSlipFile] = useState<File | null>(null);

  const staff = user.role !== 'MEMBER';

  
  const dateOptions: {
  value: RecordDateField;
  label: string;
}[] =
  mode === 'reservations'
    ? [
        { value: 'created_at', label: 'วันที่จอง' },
        { value: 'expires_at', label: 'รับภายใน' },
      ]
    : mode === 'history'
      ? [
          { value: 'borrowed_at', label: 'วันที่ยืม' },
          { value: 'returned_at', label: 'วันที่คืน' },
          { value: 'due_at', label: 'กำหนดคืน' },
        ]
      : [
          { value: 'borrowed_at', label: 'วันที่ยืม' },
          { value: 'due_at', label: 'กำหนดคืน' },
        ];

  useEffect(() => {
  setSearch('');
  setSelectedDate('');
  setSelectedCategory('');
  setDateField(
    mode === 'reservations'
      ? 'created_at'
      : 'borrowed_at'
  );
}, [mode]);

useEffect(() => {
  let active = true;

  api<Book[]>('/books')
    .then((result) => {
      if (active && Array.isArray(result)) {
        setBooks(result);
      }
    })
    .catch(() => {
      if (active) setBooks([]);
    });

  return () => {
    active = false;
  };
}, [revision]);


  useEffect(() => {
    let active = true;

    setLoading(true);

    Promise.all([
      api<Reservation[]>('/reservations'),
      api<Loan[]>('/loans'),
    ])
      .then(([r, l]) => {
        if (active) {
          setReservations(r);
          setLoans(l);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, revision]);

  async function action(
    path: string,
    method: string,
    body?: unknown
  ) {
    setBusy(true);

    try {
      await api(path, method, body);

      setRevision((v) => v + 1);

      notify('ทำรายการสำเร็จ');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmReturn() {
    if (!returningLoan) return;

    const fee =
      returnCondition === 'DAMAGED'
        ? Number(damageFee)
        : 0;

    if (
      returnCondition === 'DAMAGED' &&
      (!Number.isFinite(fee) || fee < 0)
    ) {
      notify('กรุณาระบุค่าความเสียหายให้ถูกต้อง', true);
      return;
    }

    setBusy(true);

    try {
     await api(
     `/loans/${returningLoan.id}/return`,
     'PATCH',
  {
      return_condition: returnCondition,
      damage_fee: fee,
  }
);

      setReturningLoan(null);
      setReturnCondition('NORMAL');
      setDamageFee('0');

      setRevision((v) => v + 1);

      notify('รับคืนหนังสือเรียบร้อยแล้ว');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function confirmCashPayment(loan: Loan) {
    if (
      !confirm(
        `ยืนยันรับชำระเงินสด ${Number(
          loan.total_fine || 0
        ).toFixed(2)} บาท?`
      )
    ) {
      return;
    }

    await action(
      `/loans/${loan.id}/payment/cash`,
      'PATCH'
    );
  }

  async function approveQr(loan: Loan) {
    if (!confirm('ยืนยันอนุมัติสลิปนี้?')) {
      return;
    }

    await action(
      `/loans/${loan.id}/payment/approve`,
      'PATCH'
    );
  }

  async function rejectQr() {
    if (!rejectingLoan) return;

    if (!rejectNote.trim()) {
      notify('กรุณาระบุเหตุผลที่ปฏิเสธสลิป', true);
      return;
    }

    setBusy(true);

    try {
      await api(
        `/loans/${rejectingLoan.id}/payment/reject`,
        'PATCH',
        {
          note: rejectNote.trim(),
        }
      );

      setRejectingLoan(null);
      setRejectNote('');

      setRevision((v) => v + 1);

      notify('ปฏิเสธสลิปแล้ว');
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
async function submitQrSlip() {
  if (!qrLoan) return;

  if (!slipFile) {
    notify('กรุณาเลือกรูปสลิป', true);
    return;
  }

  if (slipFile.size > 5 * 1024 * 1024) {
    notify('ขนาดรูปต้องไม่เกิน 5 MB', true);
    return;
  }

  setBusy(true);

  try {
    const token =
      sessionStorage.getItem('library-token');

    const apiBase =
      process.env.NEXT_PUBLIC_API_URL ||
      'http://localhost:4000/api';

    const formData = new FormData();

    formData.append(
      'slip',
      slipFile
    );

    const uploadResponse =
      await fetch(
        `${apiBase}/uploads/slip`,
        {
          method: 'POST',

          headers: token
            ? {
                Authorization:
                  `Bearer ${token}`,
              }
            : {},

          body: formData,
        }
      );

    const uploadData =
      await uploadResponse.json();

    if (!uploadResponse.ok) {
      throw new Error(
        uploadData.message ||
          'อัปโหลดสลิปไม่สำเร็จ'
      );
    }

    await api(
      `/loans/${qrLoan.id}/payment/qr-submit`,
      'PATCH',
      {
        payment_slip_url:
          uploadData.url,
      }
    );

    setQrLoan(null);
    setSlipFile(null);

    setRevision(
      (v) => v + 1
    );

    notify(
      'ส่งสลิปแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบ'
    );
  } catch (e) {
    notify(
      (e as Error).message,
      true
    );
  } finally {
    setBusy(false);
  }
}

if (loading) {
  return (
    <p className="panel">
      กำลังโหลดรายการ…
    </p>
  );
}

if (error) {
  return (
    <p
      className="panel text-red-700"
      role="alert"
    >
      {error}
    </p>
  );
}


const bookById = new Map(
  books.map((book) => [book.id, book])
);

const getCategory = (
  record: Reservation | Loan
): string => {
  const item = record as typeof record & {
    category_name?: string | null;
  };

  return (
    item.category_name ||
    (record.book_id
      ? bookById.get(record.book_id)?.category_name
      : null) ||
    ''
  );
};

const categories = Array.from(
  new Set(
    [
      ...books.map((b) => b.category_name || ''),
      ...reservations.map(getCategory),
      ...loans.map(getCategory),
    ].filter(Boolean)
  )
).sort((a, b) => a.localeCompare(b, 'th'));

const query = search.trim().toLocaleLowerCase('th');

const matchesSearch = (
  record: Reservation | Loan
) => {
  if (!query) return true;

  const loan = record as Loan;

  return [
    record.title,
    record.member_name,
    record.email,
    record.school_code,
    record.class_room,
    record.id,
    loan.copy_code,
    loan.copy_id,
    record.book_id,
    
  ].some((value) =>
    String(value ?? '')
      .toLocaleLowerCase('th')
      .includes(query)
  );
};

const matchesCategory = (
  record: Reservation | Loan
) =>
  !selectedCategory ||
  getCategory(record) === selectedCategory;

const matchesDate = (
  record: Reservation | Loan
) => {
  if (!selectedDate) return true;

 const loan = record as Loan;

const value =
  dateField === 'due_at' && mode !== 'reservations'
    ? loan.effective_due_at ||
      loan.renewed_until ||
      loan.due_at
    : (
        record as unknown as Record<string, unknown>
      )[dateField];

  return (
    thaiCalendarDate(
      typeof value === 'string' ? value : null
    ) === selectedDate
  );
};

const visibleReservations = reservations.filter(
  (r) =>
    r.status !== 'CANCELLED' &&
    matchesSearch(r) &&
    matchesCategory(r) &&
    matchesDate(r)
);

const filtered = loans.filter(
  (l) =>
    (mode === 'history'
      ? l.status === 'RETURNED'
      : mode === 'overdue'
        ? l.overdue
        : l.status === 'BORROWED') &&
    matchesSearch(l) &&
    matchesCategory(l) &&
    matchesDate(l)
);



  return (
    <>
      <div className="panel overflow-x-auto">
        {mode === 'overdue' && user.role === 'ADMIN' && (
          <div className="mb-5 flex justify-end">
            <button type="button" className="btn" onClick={() => setShowManualOverdue(true)}>
              + เพิ่มรายการเกินกำหนด
            </button>
          </div>
        )}
        <p className="muted mb-5">
          {mode === 'reservations'
            ? 'การจองเก็บไว้ 3 วัน กรุณาติดต่อเจ้าหน้าที่เพื่อรับหนังสือ'
            : 'ระยะเวลายืม 14 วัน • การยืมและรับคืนยืนยันโดยเจ้าหน้าที่เท่านั้น'}
        </p>


{/* แถวค้นหาและตัวกรอง */}
<div className="mb-5 overflow-x-auto pb-2">
  <div className="flex min-w-[860px] items-end gap-3">
    <label className="block min-w-0 flex-[2] text-sm">
      ค้นหารายการ
      <input
        type="search"
        className="mt-1 w-full"
        placeholder="ชื่อหนังสือ / สมาชิก / รหัสเล่ม"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
    </label>

    <label className="block min-w-0 flex-1 text-sm">
      ประเภทวันที่
      <select
        className="mt-1 w-full"
        value={dateField}
        onChange={(e) =>
          setDateField(e.target.value as RecordDateField)
        }
      >
        {dateOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>

    <label className="block min-w-0 flex-1 text-sm">
      เลือกวันที่
      <input
        type="date"
        className="mt-1 w-full"
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
      />
    </label>

    <label className="block min-w-0 flex-1 text-sm">
      หมวดหมู่
      <select
        className="mt-1 w-full"
        value={selectedCategory}
        onChange={(e) =>
          setSelectedCategory(e.target.value)
        }
      >
        <option value="">ทุกหมวดหมู่</option>
        {categories.map((category) => (
          <option key={category} value={category}>
            {category}
          </option>
        ))}
      </select>
    </label>

    <button
      type="button"
      className="btn secondary shrink-0"
      onClick={() => {
        setSearch('');
        setSelectedDate('');
        setSelectedCategory('');
        setDateField(
          mode === 'reservations'
            ? 'created_at'
            : 'borrowed_at'
        );
      }}
    >
      ล้างตัวกรอง
    </button>
  </div>
</div>

        {mode === 'reservations' ? (
          visibleReservations.length ? (
            <table>
              <thead>
                <tr>
                  <th>หนังสือ / ผู้ยืม</th>
                  <th>จองเมื่อ</th>
                  <th>รับภายใน</th>
                  <th>สถานะ</th>
                  <th>ดำเนินการ</th>
                </tr>
              </thead>

              <tbody>
                {visibleReservations.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title}</strong>

                      {staff && (
                        <p className="muted text-xs">
                          {r.member_name} · {r.user_type === 'TEACHER' ? 'ครู' : r.user_type === 'STUDENT' ? 'นักเรียน' : 'ผู้ใช้ห้องสมุด'}{r.school_code ? ` · ${r.school_code}` : ''}{r.class_room ? ` · ${r.class_room}` : ''}
                        </p>
                      )}

                      <p className="muted text-xs">
                        #{r.id}
                      </p>
                    </td>

                    <td>{date(r.created_at)}</td>

                    <td>{date(r.expires_at)}</td>

                    <td>
                      <span className="badge">
                        {statusText[r.display_status || r.status]}
                      </span>
                    </td>

                    <td>
                      {(r.display_status || r.status) === 'PENDING' && (
                        <div className="flex gap-2">
                          {staff && (
                            <button
                              className="btn"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  confirm(
                                    'ยืนยันว่าผู้ยืมมารับหนังสือที่เคาน์เตอร์แล้ว?'
                                  )
                                ) {
                                  action(
                                    '/loans',
                                    'POST',
                                    {
                                      reservation_id: r.id,
                                    }
                                  );
                                }
                              }}
                            >
                              ยืนยันการยืม
                            </button>
                          )}

                          <button
                            className="btn danger"
                            disabled={busy}
                            onClick={() => {
                              if (
                                confirm(
                                  'ยกเลิกการจองนี้?'
                                )
                              ) {
                                action(
                                  `/reservations/${r.id}/cancel`,
                                  'PATCH'
                                );
                              }
                            }}
                          >
                            ยกเลิก
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>ยังไม่มีรายการจอง</p>
          )
        ) : filtered.length ? (
          <table>
            <thead>
              <tr>
                <th>หนังสือ / ผู้ยืม</th>
                <th>วันที่ยืม</th>
                <th>กำหนดคืน</th>
                <th>สถานะ</th>

                {mode === 'history' && (
                  <>
                    <th>สภาพหนังสือ</th>
                    <th>ค่าปรับ</th>
                    <th>การชำระ</th>
                  </>
                )}

                <th>
                  {mode === 'history'
                    ? 'คืนเมื่อ / ดำเนินการ'
                    : 'ดำเนินการ'}
                </th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((l) => {
                const effectiveDue =
                  l.effective_due_at ||
                  l.renewed_until ||
                  l.due_at;

                const totalFine =
                  Number(l.total_fine || 0);

                return (
                  <tr key={l.id}>
                    <td>
                      <strong>
                        {l.title}
                      </strong>

                      <p className="muted text-xs mt-1">
                        รหัสเล่ม: {l.copy_code || '—'}
                        {l.copy_id ? ` · Copy ID #${l.copy_id}` : ''}
                      </p>

                      {staff && (
                        <p className="muted text-xs">
                          {l.member_name} · {l.user_type === 'TEACHER' ? 'ครู' : l.user_type === 'STUDENT' ? 'นักเรียน' : 'ผู้ใช้ห้องสมุด'}{l.school_code ? ` · ${l.school_code}` : ''}{l.class_room ? ` · ${l.class_room}` : ''}
                        </p>
                      )}
                    </td>

                    <td>
                      {date(l.borrowed_at)}
                    </td>

                    <td
                      className={
                        l.overdue
                          ? 'text-red-700'
                          : ''
                      }
                    >
                      {date(effectiveDue)}

                      {l.renewal_count > 0 && (
                        <p className="muted text-xs">
                          ต่ออายุแล้ว 1 ครั้ง
                        </p>
                      )}
                    </td>

                    <td>
                      <span
                        className={`badge ${
                          l.overdue
                            ? 'text-red-700'
                            : ''
                        }`}
                      >
                        {l.overdue
                          ? 'เกินกำหนด'
                          : statusText[l.status]}
                      </span>
                    </td>

                    {mode === 'history' && (
                      <>
                        <td>
                          {l.return_condition
                            ? returnConditionText[
                                l.return_condition
                              ]
                            : '—'}
                        </td>

                        <td>
                          {totalFine > 0 ? (
                            <div>
                              <strong>
                                {totalFine.toFixed(2)} บาท
                              </strong>

                              <p className="muted text-xs">
                                ล่าช้า{' '}
                                {Number(
                                  l.late_fee || 0
                                ).toFixed(2)}
                                {' '}บาท
                              </p>

                              {Number(
                                l.damage_fee || 0
                              ) > 0 && (
                                <p className="muted text-xs">
                                  ชำรุด{' '}
                                  {Number(
                                    l.damage_fee
                                  ).toFixed(2)}
                                  {' '}บาท
                                </p>
                              )}

                              {Number(
                                l.lost_fee || 0
                              ) > 0 && (
                                <p className="muted text-xs">
                                  สูญหาย{' '}
                                  {Number(
                                    l.lost_fee
                                  ).toFixed(2)}
                                  {' '}บาท
                                </p>
                              )}
                            </div>
                          ) : (
                            'ไม่มีค่าปรับ'
                          )}
                        </td>

                        <td>
                          {totalFine <= 0 ? (
                            <span className="badge">
                              ไม่มียอดชำระ
                            </span>
                          ) : (
                            <div className="space-y-2">
                              <span className="badge">
                                {
                                  paymentStatusText[
                                    l.payment_status
                                  ]
                                }
                              </span>

                              {l.payment_method && (
                                <p className="muted text-xs">
                                  {
                                    paymentMethodText[
                                      l.payment_method
                                    ]
                                  }
                                </p>
                              )}

                              {l.payment_note && (
                                <p className="text-xs text-red-700">
                                  หมายเหตุ:{' '}
                                  {l.payment_note}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                      </>
                    )}

                    <td>
                      {!l.returned_at ? (
                        staff ? (
                          <button
                            className="btn"
                            disabled={busy}
                            onClick={() => {
                              setReturningLoan(l);
                              setReturnCondition(
                                'NORMAL'
                              );
                              setDamageFee('0');
                            }}
                          >
                            ยืนยันรับคืน
                          </button>
                        ) : (
                          'คืนที่เคาน์เตอร์'
                        )
                      ) : (
                        <div className="space-y-2">
                          <p>
                            {date(l.returned_at)}
                          </p>

                          {staff &&
                            totalFine > 0 &&
                            l.payment_status ===
                              'UNPAID' && (
                              <button
                                className="btn"
                                disabled={busy}
                                onClick={() =>
                                  confirmCashPayment(l)
                                }
                              >
                                รับชำระเงินสด
                              </button>
                            )}

                          {!staff &&
                            totalFine > 0 &&
                            l.payment_status ===
                              'UNPAID' && (
                              <button
                                className="btn"
                                disabled={busy}
                                onClick={() => {
                                  setQrLoan(l);
                                  setSlipFile(null);
                                }}
                              >
                                ชำระด้วย QR / ส่งสลิป
                              </button>
                            )}

                          {!staff &&
                            l.payment_status ===
                              'PENDING' && (
                              <p className="text-sm text-amber-700">
                                ส่งสลิปแล้ว รอเจ้าหน้าที่ตรวจสอบ
                              </p>
                            )}

                          {staff &&
                            l.payment_status ===
                              'PENDING' && (
                              <div className="flex flex-wrap gap-2">
                                {l.payment_slip_url && (
                                  <a
                                    href={
                                      l.payment_slip_url
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn secondary"
                                  >
                                    ดูสลิป
                                  </a>
                                )}

                                <button
                                  className="btn"
                                  disabled={busy}
                                  onClick={() =>
                                    approveQr(l)
                                  }
                                >
                                  อนุมัติสลิป
                                </button>

                                <button
                                  className="btn danger"
                                  disabled={busy}
                                  onClick={() => {
                                    setRejectingLoan(l);
                                    setRejectNote('');
                                  }}
                                >
                                  ปฏิเสธ
                                </button>
                              </div>
                            )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p>
            ยังไม่มีรายการในหมวดนี้
          </p>
        )}
      </div>

      {mode === 'overdue' && user.role === 'ADMIN' && showManualOverdue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={addManualOverdue} className="panel w-full max-w-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2>เพิ่มรายการเกินกำหนดย้อนหลัง</h2>
            <p className="muted text-sm">ใช้สำหรับกู้คืนข้อมูลการยืมที่ตกหล่น ระบบจะผูกกับหนังสือจริงที่ยังว่างอยู่ และบันทึกเป็นรายการยืมที่ยังไม่คืน</p>
            <label className="block">สมาชิก
              <select required value={manualMemberId} onChange={(e) => setManualMemberId(e.target.value)}>
                <option value="">เลือกสมาชิก</option>
                {members.filter((m) => m.role === 'MEMBER' && m.active).map((m) => (
                  <option key={m.id} value={m.id}>{m.name} · {m.school_code || m.email}</option>
                ))}
              </select>
            </label>
            <label className="block">หนังสือ
              <select required value={manualBookId} onChange={(e) => setManualBookId(e.target.value)}>
                <option value="">เลือกหนังสือ</option>
                {books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
              </select>
            </label>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">วันที่ยืม
                <input required type="date" value={manualBorrowedAt} onChange={(e) => setManualBorrowedAt(e.target.value)} />
              </label>
              <label className="block">วันที่ครบกำหนดคืน
                <input required type="date" value={manualDueAt} onChange={(e) => setManualDueAt(e.target.value)} />
              </label>
            </div>
            <p className="muted text-xs">หมายเหตุ: การเพิ่มย้อนหลังจะไม่แก้ไขหรือทับรายการยืมที่มีอยู่แล้ว และต้องมีหนังสือจริงสถานะว่าง</p>
            <div className="flex gap-2">
              <button className="btn" type="submit" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกรายการ'}</button>
              <button className="btn secondary" type="button" disabled={busy} onClick={() => setShowManualOverdue(false)}>ยกเลิก</button>
            </div>
          </form>
        </div>
      )}

      {/* =========================
          MODAL คืนหนังสือ
      ========================= */}

      {returningLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="panel w-full max-w-lg">
            <h2>
              รับคืนหนังสือ
            </h2>

            <p className="mt-2">
              <strong>
                {returningLoan.title}
              </strong>
            </p>

            <p className="muted text-sm">
              ผู้ยืม: {returningLoan.member_name}
            </p>

            <p className="muted text-sm">
              รหัสเล่ม: {returningLoan.copy_code || '—'}
              {returningLoan.copy_id
                ? ` · Copy ID #${returningLoan.copy_id}`
                : ''}
            </p>

            <div className="mt-5 space-y-4">
              <label>
                สภาพหนังสือ
                <select
                  value={returnCondition}
                  onChange={(e) => {
                    setReturnCondition(
                      e.target
                        .value as ReturnCondition
                    );

                    if (
                      e.target.value !==
                      'DAMAGED'
                    ) {
                      setDamageFee('0');
                    }
                  }}
                >
                  <option value="NORMAL">
                    ปกติ
                  </option>

                  <option value="DAMAGED">
                    ชำรุด
                  </option>

                  <option value="LOST">
                    สูญหาย
                  </option>
                </select>
              </label>

              {returnCondition ===
                'DAMAGED' && (
                <label>
                  ค่าความเสียหาย (บาท)
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={damageFee}
                    onChange={(e) =>
                      setDamageFee(
                        e.target.value
                      )
                    }
                  />

                  <p className="muted text-xs mt-1">
                    ต้องไม่เกินราคาหนังสือ{' '}
                    {Number(
                      returningLoan.price || 0
                    ).toFixed(2)}
                    {' '}บาท
                  </p>
                </label>
              )}

              {returnCondition === 'LOST' && (
                <div className="rounded-xl bg-red-50 p-4 text-red-700">
                  หนังสือสูญหายจะคิดค่าปรับตามราคาหนังสือ{' '}
                  <strong>
                    {Number(
                      returningLoan.price || 0
                    ).toFixed(2)}
                    {' '}บาท
                  </strong>
                  {' '}
                  และหนังสือเล่มนี้จะถูกเปลี่ยนสถานะเป็นสูญหาย โดยไม่กลับเข้าเป็นหนังสือว่าง
                </div>
              )}

              {returningLoan.overdue && (
                <div className="rounded-xl bg-amber-50 p-4">
                  รายการนี้เกินกำหนดคืน ระบบจะคำนวณค่าปรับล่าช้า 1 บาทต่อวัน ตามอัตราที่ห้องสมุดกำหนด
                </div>
              )}
            </div>

            <div className="mt-6 flex gap-2">
              <button
                className="btn"
                disabled={busy}
                onClick={confirmReturn}
              >
                {busy
                  ? 'กำลังบันทึก…'
                  : 'ยืนยันรับคืน'}
              </button>

              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  setReturningLoan(null);
                  setReturnCondition(
                    'NORMAL'
                  );
                  setDamageFee('0');
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================
          MODAL ปฏิเสธสลิป
      ========================= */}

      {rejectingLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="panel w-full max-w-lg">
            <h2>
              ปฏิเสธสลิปการชำระ
            </h2>

            <p className="mt-2">
              {rejectingLoan.title}
            </p>

            <label className="mt-5 block">
              เหตุผล
              <textarea
                rows={4}
                value={rejectNote}
                onChange={(e) =>
                  setRejectNote(
                    e.target.value
                  )
                }
                placeholder="เช่น ยอดเงินไม่ตรง หรือสลิปไม่ชัดเจน"
              />
            </label>

            <div className="mt-5 flex gap-2">
              <button
                className="btn danger"
                disabled={busy}
                onClick={rejectQr}
              >
                ยืนยันปฏิเสธ
              </button>

              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  setRejectingLoan(null);
                  setRejectNote('');
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
      {/* =========================
          MODAL ส่งสลิป QR
      ========================= */}

      {qrLoan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="panel w-full max-w-lg">
            <h2>
              ชำระค่าปรับด้วย QR
            </h2>

            <p className="mt-3">
              <strong>
                {qrLoan.title}
              </strong>
            </p>

            <div className="mt-4 rounded-xl bg-gray-50 p-4">
              <p className="muted text-sm">
                ยอดที่ต้องชำระ
              </p>

              <p className="mt-1 text-2xl font-semibold">
                {Number(
                  qrLoan.total_fine || 0
                ).toFixed(2)}
                {' '}บาท
              </p>
            </div>

            <div className="mt-5">
              <label>
                แนบรูปสลิป
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    setSlipFile(
                      e.target.files?.[0] ||
                        null
                    );
                  }}
                />
              </label>

              <p className="muted mt-2 text-xs">
                รองรับ JPG, PNG และ WEBP ขนาดไม่เกิน 5 MB
              </p>

              {slipFile && (
                <p className="mt-2 text-sm">
                  ไฟล์ที่เลือก:{' '}
                  <strong>
                    {slipFile.name}
                  </strong>
                </p>
              )}
            </div>

            <div className="mt-6 flex gap-2">
              <button
                className="btn"
                disabled={busy || !slipFile}
                onClick={submitQrSlip}
              >
                {busy
                  ? 'กำลังส่ง…'
                  : 'ส่งสลิป'}
              </button>

              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => {
                  setQrLoan(null);
                  setSlipFile(null);
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
