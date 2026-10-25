
'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, Book, User } from '@/lib/api';
import { useApp } from '@/components/AppShell';

export default function DashboardPage() {
  const { notify } = useApp();

  const [users, setUsers] = useState<User[]>([]);
  const [books, setBooks] = useState<Book[]>([]);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);

  const [userSearch, setUserSearch] = useState('');
  const [bookSearch, setBookSearch] = useState('');

  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedBookId, setSelectedBookId] = useState('');

  /* =========================
     LOAD USERS AND BOOKS
  ========================= */

  useEffect(() => {
    let cancelled = false;

    setLoading(true);

    Promise.all([
      api<User[]>('/users'),
      api<Book[]>('/books'),
    ])
      .then(([userData, bookData]) => {
        if (cancelled) return;

        setUsers(
          userData.filter(
            (user) =>
              user.role === 'MEMBER' &&
              user.active
          )
        );

        setBooks(bookData);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;

        setError(
          err instanceof Error
            ? err.message
            : 'ไม่สามารถโหลดข้อมูลได้'
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [revision]);

  /* =========================
     SEARCH MEMBERS
  ========================= */

  const filteredUsers = useMemo(() => {
    const keyword = userSearch
      .trim()
      .toLowerCase();

    if (!keyword) return users;

    return users.filter((user) => {
      const searchText = [
        user.name,
        user.school_code,
        user.user_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchText.includes(keyword);
    });
  }, [users, userSearch]);

  /* =========================
     SEARCH BOOKS
  ========================= */

  const filteredBooks = useMemo(() => {
    const keyword = bookSearch
      .trim()
      .toLowerCase();

    if (!keyword) return books;

    return books.filter((book) => {
      const searchText = [
        book.title,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchText.includes(keyword);
    });
  }, [books, bookSearch]);

  const selectedUser = users.find(
    (user) => String(user.id) === selectedUserId
  );

  const selectedBook = books.find(
    (book) => String(book.id) === selectedBookId
  );

  /* =========================
     CONFIRM LOAN
  ========================= */

  async function handleBorrow(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (busy) return;

    if (!selectedUserId || !selectedBookId) {
      notify(
        'กรุณาเลือกผู้ยืมและหนังสือ',
        true
      );
      return;
    }

    if (!selectedBook || selectedBook.available_copies < 1) {
      notify(
        'หนังสือเล่มนี้ไม่มีจำนวนคงเหลือสำหรับยืม',
        true
      );
      return;
    }

    const confirmed = window.confirm(
      `ยืนยันการยืมหนังสือที่เคาน์เตอร์?\n\n` +
      `ผู้ยืม: ${selectedUser?.name ?? '-'}\n` +
      `หนังสือ: ${selectedBook.title}\n\n` +
      `ผู้ยืมมารับหนังสือแล้วใช่หรือไม่?`
    );

    if (!confirmed) return;

    setBusy(true);

    try {
      await api('/loans', 'POST', {
        user_id: selectedUserId,
        book_id: selectedBookId,
      });

      setSelectedUserId('');
      setSelectedBookId('');

      setUserSearch('');
      setBookSearch('');

      setRevision((value) => value + 1);

      notify(
        'ยืนยันการยืมสำเร็จ กำหนดคืนใน 14 วัน'
      );
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : 'ไม่สามารถทำรายการยืมได้',
        true
      );
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     PAGE
  ========================= */

  return (
    <div className="space-y-6">

      {/* INTRODUCTION */}
      <section className="panel space-y-2">

        <p className="muted">
          สำหรับเจ้าหน้าที่บันทึกการยืมหนังสือ
          โดยไม่ต้องจองล่วงหน้า
        </p>

        <p className="muted text-sm">
          หากสมาชิกจองหนังสือไว้แล้ว
          ให้ยืนยันการรับหนังสือจากหน้า
          “รายการจอง”
        </p>
      </section>

      {/* LOAD ERROR */}
      {error && (
        <div
          role="alert"
          className="panel text-red-700 space-y-3"
        >
          <p>{error}</p>

          <button
            type="button"
            className="btn secondary"
            onClick={() =>
              setRevision((value) => value + 1)
            }
          >
            โหลดข้อมูลอีกครั้ง
          </button>
        </div>
      )}

      {/* LOAN FORM */}
      <form
        className="panel space-y-6 max-w-3xl"
        onSubmit={handleBorrow}
      >
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            ทำรายการยืมหนังสือ
          </h2>

          <p className="muted text-sm">
            เลือกผู้ยืมและหนังสือ
            จากนั้นตรวจสอบข้อมูลก่อนยืนยัน
          </p>
        </div>

        {/* MEMBER */}
        <div className="space-y-3">
          <label
            htmlFor="member-search"
            className="block font-medium"
          >
            1. ค้นหาผู้ยืม
          </label>

          <input
            id="member-search"
            type="search"
            value={userSearch}
            onChange={(event) =>
              setUserSearch(event.target.value)
            }
            placeholder="ค้นหาชื่อหรือรหัสประจำตัว"
            disabled={loading || busy}
            className="w-full"
          />

          <label
            htmlFor="borrower"
            className="block font-medium"
          >
            เลือกผู้ยืม
          </label>

          <select
            id="borrower"
            name="user_id"
            required
            value={selectedUserId}
            onChange={(event) =>
              setSelectedUserId(event.target.value)
            }
            disabled={loading || busy}
            className="w-full"
          >
            <option value="">
              -- เลือกผู้ยืม --
            </option>

            {filteredUsers.map((user) => (
              <option
                key={user.id}
                value={String(user.id)}
              >
                {user.name}
                {' — '}
                {user.user_type === 'TEACHER'
                  ? 'ครู'
                  : user.user_type === 'STUDENT'
                    ? 'นักเรียน'
                    : 'ผู้ใช้ห้องสมุด'}
                {user.school_code
                  ? ` (${user.school_code})`
                  : ''}
              </option>
            ))}
          </select>

          {filteredUsers.length === 0 && !loading && (
            <p className="text-sm muted">
              ไม่พบผู้ยืมที่ตรงกับคำค้นหา
            </p>
          )}
        </div>

        {/* BOOK */}
        <div className="space-y-3">
          <label
            htmlFor="book-search"
            className="block font-medium"
          >
            2. ค้นหาหนังสือ
          </label>

          <input
            id="book-search"
            type="search"
            value={bookSearch}
            onChange={(event) =>
              setBookSearch(event.target.value)
            }
            placeholder="ค้นหาชื่อหนังสือ"
            disabled={loading || busy}
            className="w-full"
          />

          <label
            htmlFor="borrow-book"
            className="block font-medium"
          >
            เลือกหนังสือ
          </label>

          <select
            id="borrow-book"
            name="book_id"
            required
            value={selectedBookId}
            onChange={(event) =>
              setSelectedBookId(event.target.value)
            }
            disabled={loading || busy}
            className="w-full"
          >
            <option value="">
              -- เลือกหนังสือ --
            </option>

            {filteredBooks.map((book) => (
              <option
                key={book.id}
                value={String(book.id)}
                disabled={book.available_copies < 1}
              >
                {book.title}
                {' — ว่าง '}
                {book.available_copies}
                {' เล่ม'}
              </option>
            ))}
          </select>

          {filteredBooks.length === 0 && !loading && (
            <p className="text-sm muted">
              ไม่พบหนังสือที่ตรงกับคำค้นหา
            </p>
          )}
        </div>

        {/* SELECTED INFORMATION */}
        {(selectedUser || selectedBook) && (
          <div className="rounded-xl bg-[#f5f7f1] p-4 space-y-2">
            <h3 className="font-semibold">
              ตรวจสอบรายการยืม
            </h3>

            <p className="text-sm">
              <span className="muted">
                ผู้ยืม:
              </span>{' '}
              {selectedUser?.name ?? 'ยังไม่ได้เลือก'}
            </p>

            <p className="text-sm">
              <span className="muted">
                หนังสือ:
              </span>{' '}
              {selectedBook?.title ?? 'ยังไม่ได้เลือก'}
            </p>

            {selectedBook && (
              <p className="text-sm">
                <span className="muted">
                  จำนวนที่ว่าง:
                </span>{' '}
                {selectedBook.available_copies} เล่ม
              </p>
            )}
          </div>
        )}

        {/* SUBMIT */}
        <button
          type="submit"
          className="btn"
          disabled={
            busy ||
            loading ||
            !!error ||
            !selectedUserId ||
            !selectedBookId ||
            !selectedBook ||
            selectedBook.available_copies < 1
          }
        >
          {busy
            ? 'กำลังบันทึกการยืม...'
            : 'ยืนยันการยืมที่เคาน์เตอร์'}
        </button>
      </form>
    </div>
  );
}
