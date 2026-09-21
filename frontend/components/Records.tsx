'use client';

import { useEffect, useState } from 'react';
import {
  api,
  date,
  Loan,
  Reservation,
  statusText,
  paymentStatusText,
  paymentMethodText,
  returnConditionText,
  User,
} from '@/lib/api';

type ReturnCondition = 'NORMAL' | 'DAMAGED' | 'LOST';

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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

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

const visibleReservations = reservations.filter(
  (r) => r.status !== 'CANCELLED'
);

const filtered = loans.filter((l) =>
  mode === 'history'
    ? l.status === 'RETURNED'
    : mode === 'overdue'
      ? l.overdue
      : l.status === 'BORROWED'
);


  return (
    <>
      <div className="panel overflow-x-auto">
        <p className="muted mb-5">
          {mode === 'reservations'
            ? 'การจองเก็บไว้ 3 วัน กรุณาติดต่อเจ้าหน้าที่เพื่อรับหนังสือ'
            : 'ระยะเวลายืม 14 วัน • การยืมและรับคืนยืนยันโดยเจ้าหน้าที่เท่านั้น'}
        </p>

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
