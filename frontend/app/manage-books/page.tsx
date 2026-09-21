'use client';

import { useEffect, useState } from 'react';
import {
  api,
  Book,
  Category,
} from '@/lib/api';
import { useApp } from '@/components/AppShell';

export default function ManageBooksPage() {
  const { notify } = useApp();

  const [books, setBooks] =
    useState<Book[]>([]);

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [editing, setEditing] =
    useState<Book | null>(null);

  const [showForm, setShowForm] =
    useState(false);

  const [busy, setBusy] =
    useState(false);

  const [error, setError] =
    useState('');

  const [revision, setRevision] =
    useState(0);

  useEffect(() => {
    Promise.all([
      api<Book[]>('/books'),
      api<Category[]>('/categories'),
    ])
      .then(([bookData, categoryData]) => {
        setBooks(bookData);
        setCategories(categoryData);
        setError('');
      })
      .catch((e) => {
        setError(e.message);
      });
  }, [revision]);

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  return (
    <div className="space-y-5">
      <button
        className="btn"
        onClick={() => {
          setEditing(null);
          setShowForm(true);
        }}
      >
        + เพิ่มหนังสือ
      </button>

      {error && (
        <p
          role="alert"
          className="panel text-red-700"
        >
          {error}
        </p>
      )}

      {/* =========================
          CREATE / EDIT BOOK
      ========================== */}

      {showForm && (
        <form
          key={editing?.id || 'new'}
          className="panel grid sm:grid-cols-2 gap-4"
          onSubmit={async (e) => {
            e.preventDefault();

            setBusy(true);

            const form =
              e.currentTarget;

            const raw =
              Object.fromEntries(
                new FormData(form)
              );

            const data = {
              ...raw,

              category_id:
                raw.category_id === ''
                  ? null
                  : Number(
                      raw.category_id
                    ),

              total_copies:
                Number(
                  raw.total_copies
                ),

              price:
                Number(
                  raw.price
                ),

              isbn:
                typeof raw.isbn ===
                'string'
                  ? raw.isbn.trim() ||
                    null
                  : null,

              call_number:
                typeof raw.call_number ===
                'string'
                  ? raw.call_number.trim() ||
                    null
                  : null,

              cover_url:
                typeof raw.cover_url ===
                'string'
                  ? raw.cover_url.trim() ||
                    null
                  : null,

              description:
                typeof raw.description ===
                'string'
                  ? raw.description.trim()
                  : '',
            };

            try {
              await api(
                editing
                  ? `/books/${editing.id}`
                  : '/books',

                editing
                  ? 'PUT'
                  : 'POST',

                data
              );

              closeForm();

              setRevision(
                (v) => v + 1
              );

              notify(
                editing
                  ? 'แก้ไขข้อมูลหนังสือแล้ว'
                  : 'เพิ่มหนังสือแล้ว'
              );
            } catch (err) {
              notify(
                (err as Error)
                  .message,
                true
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="sm:col-span-2">
            <h2>
              {editing
                ? 'แก้ไขหนังสือ'
                : 'เพิ่มหนังสือ'}
            </h2>

            <p className="muted text-sm mt-1">
              หนังสือแต่ละเล่มจะได้รับ
              Copy ID และรหัสประจำเล่มแยกกันอัตโนมัติ
            </p>
          </div>

          {/* ชื่อหนังสือ */}
          <label>
            ชื่อหนังสือ

            <input
              name="title"
              required
              maxLength={200}
              defaultValue={
                editing?.title ||
                ''
              }
            />
          </label>

          {/* ผู้แต่ง */}
          <label>
            ผู้แต่ง

            <input
              name="author"
              required
              maxLength={150}
              defaultValue={
                editing?.author ||
                ''
              }
            />
          </label>

          {/* ISBN */}
          <label>
            ISBN

            <input
              name="isbn"
              maxLength={32}
              defaultValue={
                editing?.isbn ||
                ''
              }
            />
          </label>

          {/* Call Number */}
          <label>
            เลขเรียกหนังสือ
            (Call Number)

            <input
              name="call_number"
              maxLength={100}
              placeholder="เช่น 006.76 NEX"
              defaultValue={
                editing
                  ?.call_number ||
                ''
              }
            />
          </label>

          {/* หมวดหมู่ */}
          <label>
            หมวดหมู่

            <select
              name="category_id"
              defaultValue={
                editing
                  ?.category_id ||
                ''
              }
            >
              <option value="">
                -- เลือกหมวดหมู่ --
              </option>

              {categories.map(
                (category) => (
                  <option
                    key={
                      category.id
                    }
                    value={
                      category.id
                    }
                  >
                    {
                      category.name
                    }
                  </option>
                )
              )}
            </select>
          </label>

          {/* จำนวนเล่ม */}
          <label>
            จำนวนเล่มทั้งหมด

            <input
              type="number"
              name="total_copies"
              min={1}
              max={1000}
              required
              defaultValue={
                editing
                  ?.total_copies ??
                1
              }
            />

            <span className="muted text-xs block mt-1">
              1 เล่ม = 1 Copy ID
              แยกกันในระบบ
            </span>
          </label>

          {/* ราคา */}
          <label>
            ราคาหนังสือ (บาท)

            <input
              type="number"
              name="price"
              min={0}
              step="0.01"
              required
              defaultValue={
                editing?.price ??
                0
              }
            />
          </label>

          {/* Cover */}
          <label>
            รูปปกหนังสือ

            <input
              name="cover_url"
              type="text"
              placeholder="/uploads/covers/book.jpg หรือ URL รูปภาพ"
              defaultValue={
                editing
                  ?.cover_url ||
                ''
              }
            />
          </label>

          {/* Description */}
          <label className="sm:col-span-2">
            รายละเอียด

            <textarea
              name="description"
              rows={4}
              maxLength={10000}
              defaultValue={
                editing
                  ?.description ||
                ''
              }
            />
          </label>

          {/* Cover preview */}
          {editing?.cover_url && (
            <div className="sm:col-span-2">
              <p className="muted text-sm mb-2">
                ตัวอย่างรูปปกปัจจุบัน
              </p>

              <img
                src={
                  editing.cover_url
                }
                alt={`ปกหนังสือ ${editing.title}`}
                className="h-48 w-36 rounded-lg object-cover border"
              />
            </div>
          )}

          {/* =========================
              COPY INFO WHEN EDITING
          ========================== */}

          {editing && (
            <div className="sm:col-span-2 rounded-xl bg-gray-50 p-4">
              <h3 className="font-semibold mb-3">
                จำนวนหนังสือในระบบ
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="muted text-xs">
                    ใช้งานทั้งหมด
                  </p>

                  <p className="font-semibold">
                    {Number(
                      editing.total_copies ||
                        0
                    )}{' '}
                    เล่ม
                  </p>
                </div>

                <div>
                  <p className="muted text-xs">
                    ว่าง
                  </p>

                  <p className="font-semibold">
                    {Number(
                      editing.available_copies ||
                        0
                    )}{' '}
                    เล่ม
                  </p>
                </div>

                <div>
                  <p className="muted text-xs">
                    กำลังถูกยืม
                  </p>

                  <p className="font-semibold">
                    {Number(
                      editing.borrowed_copies ||
                        0
                    )}{' '}
                    เล่ม
                  </p>
                </div>

                <div>
                  <p className="muted text-xs">
                    สูญหาย
                  </p>

                  <p className="font-semibold">
                    {Number(
                      editing.lost_copies ||
                        0
                    )}{' '}
                    เล่ม
                  </p>
                </div>
              </div>

              <p className="muted text-xs mt-4">
                หากเพิ่มจำนวนเล่ม
                ระบบจะสร้าง Copy ID
                ใหม่อัตโนมัติ
                หากลดจำนวนเล่ม
                ระบบจะนำออกเฉพาะเล่มที่ว่างเท่านั้น
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            <button
              className="btn"
              disabled={busy}
            >
              {busy
                ? 'กำลังบันทึก…'
                : editing
                  ? 'บันทึกการแก้ไข'
                  : 'เพิ่มหนังสือ'}
            </button>

            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={
                closeForm
              }
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {/* =========================
          BOOK TABLE
      ========================== */}

      <div className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>
                ชื่อหนังสือ
              </th>

              <th>
                Call Number
              </th>

              <th>
                หมวดหมู่
              </th>

              <th>
                ราคา
              </th>

              <th>
                จำนวนเล่ม
              </th>

              <th>
                สถานะเล่ม
              </th>

              <th>
                จัดการ
              </th>
            </tr>
          </thead>

          <tbody>
            {books.map((book) => {
              const total =
                Number(
                  book.total_copies ||
                    0
                );

              const available =
                Number(
                  book.available_copies ||
                    0
                );

              const borrowed =
                Number(
                  book.borrowed_copies ||
                    0
                );

              const lost =
                Number(
                  book.lost_copies ||
                    0
                );

              return (
                <tr key={book.id}>
                  {/* หนังสือ */}
                  <td>
                    <strong>
                      {book.title}
                    </strong>

                    <p className="muted text-xs">
                      {book.author}
                    </p>

                    <p className="muted text-xs mt-1">
                      Book ID #
                      {book.id}
                    </p>
                  </td>

                  {/* Call Number */}
                  <td>
                    {book.call_number ||
                      '—'}
                  </td>

                  {/* Category */}
                  <td>
                    {book.category_name ||
                      'ยังไม่ระบุ'}
                  </td>

                  {/* Price */}
                  <td>
                    {Number(
                      book.price ||
                        0
                    ).toLocaleString(
                      'th-TH',
                      {
                        minimumFractionDigits:
                          2,

                        maximumFractionDigits:
                          2,
                      }
                    )}{' '}
                    บาท
                  </td>

                  {/* Total */}
                  <td>
                    <strong>
                      {total}
                    </strong>{' '}
                    เล่ม

                    <p className="muted text-xs">
                      ว่าง {available}
                    </p>
                  </td>

                  {/* Status */}
                  <td>
                    <div className="space-y-1 text-sm">
                      <p>
                        ว่าง:{' '}
                        <strong>
                          {available}
                        </strong>
                      </p>

                      <p>
                        ถูกยืม:{' '}
                        <strong>
                          {borrowed}
                        </strong>
                      </p>

                      {lost > 0 && (
                        <p className="text-red-700">
                          สูญหาย:{' '}
                          <strong>
                            {lost}
                          </strong>
                        </p>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="btn secondary"
                        disabled={
                          busy
                        }
                        onClick={() => {
                          setEditing(
                            book
                          );

                          setShowForm(
                            true
                          );

                          window.scrollTo(
                            {
                              top: 0,
                              behavior:
                                'smooth',
                            }
                          );
                        }}
                      >
                        แก้ไข
                      </button>

                      <button
                        className="btn danger"
                        disabled={
                          busy
                        }
                        onClick={async () => {
                          if (
                            !confirm(
                              `ลบหนังสือ “${book.title}”? หนังสือที่กำลังถูกยืมหรือมีการจองอยู่จะลบไม่ได้`
                            )
                          ) {
                            return;
                          }

                          setBusy(
                            true
                          );

                          try {
                            await api(
                              `/books/${book.id}`,
                              'DELETE'
                            );

                            setRevision(
                              (v) =>
                                v + 1
                            );

                            notify(
                              'ลบหนังสือแล้ว'
                            );
                          } catch (e) {
                            notify(
                              (
                                e as Error
                              ).message,
                              true
                            );
                          } finally {
                            setBusy(
                              false
                            );
                          }
                        }}
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!books.length && (
          <p className="mt-4 muted">
            ยังไม่มีหนังสือ
          </p>
        )}
      </div>
    </div>
  );
}