'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, Book, Category } from '@/lib/api';
import { useApp } from '@/components/AppShell';

type SearchField =
  | 'all'
  | 'title'
  | 'author'
  | 'call_number'
  | 'isbn'
  | 'category_name';

export default function ManageBooksPage() {
  const { notify } = useApp();

  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Book | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  // เพิ่มระบบค้นหา
  const [search, setSearch] = useState('');
  const [searchField, setSearchField] =
    useState<SearchField>('all');

  useEffect(() => {
    let active = true;

    Promise.all([
      api<Book[]>('/books'),
      api<Category[]>('/categories'),
    ])
      .then(([bookData, categoryData]) => {
        if (!active) return;

        setBooks(bookData);
        setCategories(categoryData);
        setError('');
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
        }
      });

    return () => {
      active = false;
    };
  }, [revision]);

  // กรองหนังสือจากคำค้นและประเภทที่เลือก
  const filteredBooks = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase();

    if (!keyword) return books;

    return books.filter((book) => {
      const fields = {
        title: String(book.title ?? ''),
        author: String(book.author ?? ''),
        call_number: String(book.call_number ?? ''),
        isbn: String(book.isbn ?? ''),
        category_name: String(book.category_name ?? ''),
      };

      const values =
        searchField === 'all'
          ? Object.values(fields)
          : [fields[searchField]];

      return values.some((value) =>
        value.toLocaleLowerCase().includes(keyword)
      );
    });
  }, [books, search, searchField]);

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  function openEditForm(book: Book) {
    setEditing(book);
    setShowForm(true);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  async function handleDelete(book: Book) {
    if (
      !window.confirm(
        `ลบหนังสือ “${book.title}”? หนังสือที่กำลังถูกยืมหรือมีการจองอยู่จะลบไม่ได้`
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      await api(`/books/${book.id}`, 'DELETE');

      setRevision((v) => v + 1);
      notify('ลบหนังสือแล้ว');
    } catch (err) {
      notify((err as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ปุ่มเพิ่มหนังสือ */}
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
        <p role="alert" className="panel text-red-700">
          {error}
        </p>
      )}

      {/* ฟอร์มเพิ่มและแก้ไขหนังสือ */}
      {showForm && (
        <form
          key={editing?.id || 'new'}
          className="panel grid sm:grid-cols-2 gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);

            const form = e.currentTarget;

            const raw = Object.fromEntries(
              new FormData(form)
            );

            const data = {
              ...raw,

              category_id:
                raw.category_id === ''
                  ? null
                  : Number(raw.category_id),

              total_copies: Number(raw.total_copies),

              price: Number(raw.price),

              isbn:
                typeof raw.isbn === 'string'
                  ? raw.isbn.trim() || null
                  : null,

              call_number:
                typeof raw.call_number === 'string'
                  ? raw.call_number.trim() || null
                  : null,

              cover_url:
                typeof raw.cover_url === 'string'
                  ? raw.cover_url.trim() || null
                  : null,

              description:
                typeof raw.description === 'string'
                  ? raw.description.trim()
                  : '',
            };

            try {
              await api(
                editing
                  ? `/books/${editing.id}`
                  : '/books',
                editing ? 'PUT' : 'POST',
                data
              );

              closeForm();
              setRevision((v) => v + 1);

              notify(
                editing
                  ? 'แก้ไขข้อมูลหนังสือแล้ว'
                  : 'เพิ่มหนังสือแล้ว'
              );
            } catch (err) {
              notify((err as Error).message, true);
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
              หนังสือแต่ละเล่มจะได้รับ Copy ID
              และรหัสประจำเล่มแยกกันอัตโนมัติ
            </p>
          </div>

          <label>
            ชื่อหนังสือ
            <input
              name="title"
              required
              maxLength={200}
              defaultValue={editing?.title || ''}
            />
          </label>

          <label>
            ผู้แต่ง
            <input
              name="author"
              required
              maxLength={150}
              defaultValue={editing?.author || ''}
            />
          </label>

          <label>
            ISBN
            <input
              name="isbn"
              maxLength={32}
              defaultValue={editing?.isbn || ''}
            />
          </label>

          <label>
            เลขเรียกหนังสือ (Call Number)
            <input
              name="call_number"
              maxLength={100}
              placeholder="เช่น 006.76 NEX"
              defaultValue={editing?.call_number || ''}
            />
          </label>

          <label>
            หมวดหมู่
            <select
              name="category_id"
              defaultValue={editing?.category_id || ''}
            >
              <option value="">
                -- เลือกหมวดหมู่ --
              </option>

              {categories.map((category) => (
                <option
                  key={category.id}
                  value={category.id}
                >
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            จำนวนเล่มทั้งหมด
            <input
              type="number"
              name="total_copies"
              min={1}
              max={1000}
              required
              defaultValue={
                editing?.total_copies ?? 1
              }
            />

            <span className="muted text-xs block mt-1">
              1 เล่ม = 1 Copy ID แยกกันในระบบ
            </span>
          </label>

          <label>
            ราคาหนังสือ (บาท)
            <input
              type="number"
              name="price"
              min={0}
              step="0.01"
              required
              defaultValue={editing?.price ?? 0}
            />
          </label>

          <label>
            รูปปกหนังสือ
            <input
              name="cover_url"
              type="text"
              placeholder="/uploads/covers/book.jpg หรือ URL รูปภาพ"
              defaultValue={editing?.cover_url || ''}
            />
          </label>

          <label className="sm:col-span-2">
            รายละเอียด
            <textarea
              name="description"
              rows={4}
              maxLength={10000}
              defaultValue={editing?.description || ''}
            />
          </label>

          {editing?.cover_url && (
            <div className="sm:col-span-2">
              <p className="muted text-sm mb-2">
                ตัวอย่างรูปปกปัจจุบัน
              </p>

              <img
                src={editing.cover_url}
                alt={`ปกหนังสือ ${editing.title}`}
                className="h-48 w-36 rounded-lg object-cover border"
              />
            </div>
          )}

          {/* ข้อมูลจำนวนเล่มขณะแก้ไข */}
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
                    {Number(editing.total_copies || 0)} เล่ม
                  </p>
                </div>

                <div>
                  <p className="muted text-xs">
                    ว่าง
                  </p>
                  <p className="font-semibold">
                    {Number(editing.available_copies || 0)} เล่ม
                  </p>
                </div>

                <div>
                  <p className="muted text-xs">
                    กำลังถูกยืม
                  </p>
                  <p className="font-semibold">
                    {Number(editing.borrowed_copies || 0)} เล่ม
                  </p>
                </div>

                <div>
                  <p className="muted text-xs">
                    สูญหาย
                  </p>
                  <p className="font-semibold">
                    {Number(editing.lost_copies || 0)} เล่ม
                  </p>
                </div>
              </div>

              <p className="muted text-xs mt-4">
                หากเพิ่มจำนวนเล่ม ระบบจะสร้าง Copy ID
                ใหม่อัตโนมัติ หากลดจำนวนเล่ม
                ระบบจะนำออกเฉพาะเล่มที่ว่างเท่านั้น
              </p>
            </div>
          )}

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
              onClick={closeForm}
            >
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      {/* ระบบค้นหาหนังสือใหม่ */}
      <div className="panel">
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="flex-1">
            ค้นหาหนังสือ
            <input
              type="search"
              placeholder="พิมพ์คำที่ต้องการค้นหา..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>

          <label className="sm:w-56">
            ค้นหาจาก
            <select
              value={searchField}
              onChange={(e) =>
                setSearchField(
                  e.target.value as SearchField
                )
              }
            >
              <option value="all">
                ทั้งหมด
              </option>

              <option value="title">
                ชื่อหนังสือ
              </option>

              <option value="author">
                ผู้แต่ง
              </option>

              <option value="call_number">
                เลขเรียกหนังสือ
              </option>

              <option value="isbn">
                ISBN
              </option>

              <option value="category_name">
                หมวดหมู่
              </option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="muted text-sm">
            พบหนังสือ {filteredBooks.length} จาก {books.length} รายการ
          </p>

          {(search || searchField !== 'all') && (
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setSearch('');
                setSearchField('all');
              }}
            >
              ล้างการค้นหา
            </button>
          )}
        </div>
      </div>

      {/* ตารางจัดการหนังสือเดิม */}
      <div className="panel overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>ชื่อหนังสือ</th>
              <th>Call Number</th>
              <th>หมวดหมู่</th>
              <th>ราคา</th>
              <th>จำนวนเล่ม</th>
              <th>สถานะเล่ม</th>
              <th>จัดการ</th>
            </tr>
          </thead>

          <tbody>
            {filteredBooks.map((book) => {
              const total = Number(book.total_copies || 0);
              const available = Number(
                book.available_copies || 0
              );
              const borrowed = Number(
                book.borrowed_copies || 0
              );
              const lost = Number(book.lost_copies || 0);

              return (
                <tr key={book.id}>
                  <td>
                    <strong>{book.title}</strong>

                    <p className="muted text-xs">
                      {book.author}
                    </p>

                    <p className="muted text-xs mt-1">
                      Book ID #{book.id}
                    </p>
                  </td>

                  <td>
                    {book.call_number || '—'}
                  </td>

                  <td>
                    {book.category_name || 'ยังไม่ระบุ'}
                  </td>

                  <td>
                    {Number(book.price || 0).toLocaleString(
                      'th-TH',
                      {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }
                    )}{' '}
                    บาท
                  </td>

                  <td>
                    <strong>{total}</strong> เล่ม

                    <p className="muted text-xs">
                      ว่าง {available}
                    </p>
                  </td>

                  <td>
                    <div className="space-y-1 text-sm">
                      <p>
                        ว่าง: <strong>{available}</strong>
                      </p>

                      <p>
                        ถูกยืม: <strong>{borrowed}</strong>
                      </p>

                      {lost > 0 && (
                        <p className="text-red-700">
                          สูญหาย: <strong>{lost}</strong>
                        </p>
                      )}
                    </div>
                  </td>

                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn secondary"
                        disabled={busy}
                        onClick={() => openEditForm(book)}
                      >
                        แก้ไข
                      </button>

                      <button
                        type="button"
                        className="btn danger"
                        disabled={busy}
                        onClick={() => handleDelete(book)}
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

        {filteredBooks.length === 0 && (
          <p className="mt-4 muted text-center py-5">
            {books.length === 0
              ? 'ยังไม่มีหนังสือ'
              : 'ไม่พบหนังสือที่ตรงกับการค้นหา'}
          </p>
        )}
      </div>
    </div>
  );
}