'use client';

import { useEffect, useState } from 'react';
import { api, Book, Category } from '@/lib/api';
import Link from 'next/link';

export default function HomePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // เช็กว่าล็อกอินอยู่หรือไม่
  useEffect(() => {
    const token = localStorage.getItem('token');
    setIsLoggedIn(!!token);
  }, []);

  // โหลดหมวดหมู่
  useEffect(() => {
    api<Category[]>('/categories')
      .then(setCategories)
      .catch((e) => setError(e.message));
  }, []);

  // โหลดหนังสือ
  useEffect(() => {
    let active = true;

    const timer = setTimeout(() => {
      setLoading(true);

      api<Book[]>(
        `/books?search=${encodeURIComponent(search)}&category=${category}`
      )
        .then((data) => {
          if (active) {
            setBooks(data);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, category]);

  return (
    <>
      {/* ด้านบน */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/" className="text-xl font-bold text-library">
          📚 Library
        </Link>

        {!isLoggedIn ? (
          <Link href="/login" className="btn">
            เข้าสู่ระบบ
          </Link>
        ) : (
          <Link href="/profile" className="btn secondary">
            บัญชีของฉัน
          </Link>
        )}
      </div>

      {/* Hero */}
      <div className="rounded-2xl bg-[#e7eddf] p-7 md:p-10 mb-7">
        <p className="text-library tracking-widest text-xs mb-3">
          EXPLORE YOUR NEXT CHAPTER
        </p>

        <h1 className="md:text-4xl">
          หนังสือดี ๆ รอคุณอยู่
        </h1>

        <p className="mt-3 muted">
          ค้นหาเล่มที่ชอบ จองออนไลน์ แล้วรับหนังสือที่ห้องสมุด
        </p>

        <div className="flex flex-wrap gap-3 mt-6 text-xs">
          <span className="badge bg-white!">
            ยืมได้นาน 14 วัน
          </span>

          <span className="badge bg-white!">
            เก็บการจองไว้ 3 วัน
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <label className="flex-1">
          ค้นหาหนังสือ

          <input
            placeholder="ชื่อหนังสือ ผู้แต่ง หรือ ISBN"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <label className="sm:w-56">
          หมวดหมู่

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">
              ทุกหมวดหมู่
            </option>

            {categories.map((c) => (
              <option
                key={c.id}
                value={c.id}
              >
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Error */}
      {error && (
        <p
          role="alert"
          className="panel text-red-700"
        >
          {error}
        </p>
      )}

      {/* Title */}
      <div className="flex justify-between mb-4">
        <h2>สำรวจหนังสือ</h2>

        <span className="muted">
          {books.length} รายการ
        </span>
      </div>

      {/* Books */}
      {loading ? (
        <p className="panel">
          กำลังโหลดหนังสือ…
        </p>
      ) : !books.length ? (
        <p className="panel muted">
          ไม่พบหนังสือที่ตรงกับการค้นหา
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {books.map((book, index) => (
            <article
              key={book.id}
              className="panel flex flex-col"
            >
              <div
                className={`rounded-lg p-7 mb-5 h-40 flex items-center justify-center ${
                  [
                    'bg-[#e5eddf]',
                    'bg-[#eee6d9]',
                    'bg-[#e2e9ee]',
                  ][index % 3]
                }`}
              >
                <div className="border-l-4 border-library/40 bg-white/70 shadow-md px-5 py-6 w-36 text-center text-library font-semibold line-clamp-3">
                  {book.title}
                </div>
              </div>

              <span className="text-xs muted">
                {book.category_name || 'ทั่วไป'}
              </span>

              <h2 className="mt-2">
                {book.title}
              </h2>

              <p className="muted mt-1 mb-5">
                {book.author}
              </p>

              <div className="mt-auto flex items-center justify-between gap-2">
                <span
                  className={`text-xs ${
                    book.available_copies > 0
                      ? 'text-library'
                      : 'text-red-700'
                  }`}
                >
                  ว่าง {book.available_copies} / {book.total_copies} เล่ม
                </span>

                <Link
                  className="btn secondary"
                  href={`/books/${book.id}`}
                >
                  ดูรายละเอียด
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}