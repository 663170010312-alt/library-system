'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  api,
  Book,
  copyStatusText,
} from '@/lib/api';
import { useApp } from '@/components/AppShell';

export default function BookDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, notify } = useApp();

  const [book, setBook] = useState<Book | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    api<Book>(`/books/${encodeURIComponent(id)}`)
      .then((value) => {
        if (active) {
          setBook(value);
          setError('');
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
        }
      });

    return () => {
      active = false;
    };
  }, [id]);

  async function reserve() {
    // logic การจองเดิม
    if (!user) {
      alert('กรุณาล็อกอินเข้าสู่ระบบ');
      router.push('/login');
      return;
    }

    if (!book) return;

    setBusy(true);

    try {
      await api('/reservations', 'POST', {
        book_id: book.id,
      });

      setBook(
        await api<Book>(`/books/${book.id}`)
      );

      notify(
        'จองสำเร็จ กรุณารับหนังสือที่เคาน์เตอร์ภายใน 3 วัน'
      );
    } catch (err) {
      notify(
        (err as Error).message,
        true
      );
    } finally {
      setBusy(false);
    }
  }

  const available = book
    ? Number(book.available_copies || 0)
    : 0;

  const total = book
    ? Number(book.total_copies || 0)
    : 0;

  const price = book
    ? Number(book.price || 0)
    : 0;

  const bookStatus =
    available > 0
      ? 'พร้อมให้ยืม'
      : 'ไม่มีหนังสือว่าง';

  return (
    <div className="space-y-5">
      <Link
        href="/books"
        className="btn secondary"
      >
        ← กลับหน้าหนังสือ
      </Link>

      {error ? (
        <p
          role="alert"
          className="panel text-red-700"
        >
          {error}
        </p>
      ) : !book ? (
        <p className="panel">
          กำลังโหลดรายละเอียด…
        </p>
      ) : (
        <article className="panel max-w-5xl">
          <div className="grid gap-8 md:grid-cols-[260px_1fr]">
            {/* รูปปก */}
            <div>
              <div className="overflow-hidden rounded-2xl bg-[#e7eddf] border border-gray-200 min-h-[360px] flex items-center justify-center">
                {book.cover_url ? (
                  <img
                    src={book.cover_url}
                    alt={`ปกหนังสือ ${book.title}`}
                    className="w-full h-[360px] object-cover"
                  />
                ) : (
                  <div className="p-8 text-center">
                    <div className="mx-auto flex h-56 w-40 items-center justify-center rounded-lg border-l-4 border-library/40 bg-white shadow-md px-5">
                      <span className="font-semibold text-library">
                        {book.title}
                      </span>
                    </div>

                    <p className="muted mt-5 text-sm">
                      ยังไม่มีรูปปก
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ข้อมูลหนังสือ */}
            <div>
              <p className="muted text-sm mb-2">
                {book.category_name || 'ทั่วไป'}
              </p>

              <h1 className="text-3xl">
                {book.title}
              </h1>

              <div className="mt-6 space-y-4">
                <div>
                  <p className="muted text-sm">
                    ผู้แต่ง
                  </p>
                  <p className="font-medium">
                    {book.author}
                  </p>
                </div>

                <div>
                  <p className="muted text-sm">
                    หมวดหมู่
                  </p>
                  <p className="font-medium">
                    {book.category_name || 'ทั่วไป'}
                  </p>
                </div>

                <div>
                  <p className="muted text-sm">
                    เลขเรียกหนังสือ (Call Number)
                  </p>
                  <p className="font-medium">
                    {book.call_number || '—'}
                  </p>
                </div>

                <div>
                  <p className="muted text-sm">
                    ISBN
                  </p>
                  <p className="font-medium">
                    {book.isbn || '—'}
                  </p>
                </div>

                <div>
                  <p className="muted text-sm">
                    ราคาหนังสือ
                  </p>
                  <p className="font-medium">
                    {price.toLocaleString('th-TH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    บาท
                  </p>
                </div>

                <div>
                  <p className="muted text-sm">
                    สถานะหนังสือ
                  </p>

                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    <span
                      className={
                        available > 0
                          ? 'badge text-library'
                          : 'badge text-red-700'
                      }
                    >
                      {bookStatus}
                    </span>

                    <span className="muted text-sm">
                      ว่าง {available} จาก {total} เล่ม
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* รายละเอียด */}
          <div className="mt-8 border-t border-gray-200 pt-7">
            <h2 className="mb-3">
              รายละเอียด
            </h2>

            <p className="whitespace-pre-wrap leading-7">
              {book.description ||
                'ยังไม่มีรายละเอียดหนังสือ'}
            </p>
          </div>

          {/* หนังสือจริงแต่ละเล่ม */}
          <div className="mt-8 border-t border-gray-200 pt-7">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2>รายการหนังสือแต่ละเล่ม</h2>
                <p className="muted text-sm mt-1">
                  หนังสือชื่อเดียวกันจะมีรหัสประจำเล่มแยกกัน
                </p>
              </div>

              <span className="badge">
                {book.copies?.length || 0} เล่ม
              </span>
            </div>

            {!book.copies?.length ? (
              <p className="muted">
                ยังไม่มีข้อมูลหนังสือรายเล่ม
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      <th>รหัสเล่ม</th>
                      <th>Copy ID</th>
                      <th>สถานะ</th>
                    </tr>
                  </thead>

                  <tbody>
                    {book.copies.map((copy) => (
                      <tr key={copy.id}>
                        <td className="font-medium">
                          {copy.copy_code || '—'}
                        </td>

                        <td>
                          #{copy.id}
                        </td>

                        <td>
                          <span
                            className={
                              copy.status === 'AVAILABLE'
                                ? 'badge text-library'
                                : copy.status === 'BORROWED'
                                  ? 'badge'
                                  : copy.status === 'LOST'
                                    ? 'badge text-red-700'
                                    : 'badge'
                            }
                          >
                            {copyStatusText[copy.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ข้อมูลการจองเดิม */}
          <div className="mt-8 rounded-xl bg-gray-50 p-5">
            <p>
              รับหนังสือภายใน 3 วันหลังจอง
              เจ้าหน้าที่จะยืนยันการยืมที่เคาน์เตอร์
              และเริ่มนับเวลายืม 14 วัน
            </p>
          </div>

          {/* ปุ่มจองเดิม */}
          {(!user || user.role === 'MEMBER') && (
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                className="btn"
                disabled={
                  busy ||
                  available < 1
                }
                onClick={reserve}
              >
                {busy
                  ? 'กำลังจอง…'
                  : available < 1
                    ? 'ไม่มีหนังสือว่าง'
                    : 'จองหนังสือเล่มนี้'}
              </button>

              {user && (
                <Link
                  className="btn secondary"
                  href="/my-reservations"
                >
                  การจองของฉัน
                </Link>
              )}
            </div>
          )}
        </article>
      )}
    </div>
  );
}