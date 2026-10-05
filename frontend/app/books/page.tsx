'use client';

import { useEffect, useState } from 'react';
import { api, Book, Category } from '@/lib/api';
import Link from 'next/link';

export default function BooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Category[]>('/categories')
      .then(setCategories)
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    let active = true;

    const timer = setTimeout(() => {
      setLoading(true);

      api<Book[]>(
        `/books?search=${encodeURIComponent(search)}&category=${category}`
      )
        .then(data => {
          if (active) {
            setBooks(data);
            setError('');
          }
        })
        .catch(e => {
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
      {/* HERO */}
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

     {/* LINE CHATBOT */}
<div className="block w-full panel mb-7">
  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <div className="flex items-center gap-3 mb-2">
        <div className="shrink-0 w-11 h-11 rounded-full bg-[#06C755] flex items-center justify-center text-white text-xl">
          💬
        </div>

        <div>
          <p className="text-xs tracking-widest text-[#06C755] font-semibold">
            LINE CHATBOT
          </p>

          <h2 className="text-lg sm:text-xl">
            ใช้งานห้องสมุดผ่าน LINE
          </h2>
        </div>
      </div>

      <p className="muted text-sm">
        ค้นหาหนังสือ ดูรายการจอง หนังสือที่กำลังยืม
        ประวัติการยืม/คืน รายการเกินกำหนด
        และตรวจสอบค่าปรับผ่าน LINE Chatbot
      </p>
    </div>

    <a
      href="https://lin.ee/z2zqpJ8"
      target="_blank"
      rel="noopener noreferrer"
      className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg bg-[#06C755] px-6 py-3 text-sm font-semibold text-white hover:opacity-90 transition"
    >
      เปิด LINE Chatbot
    </a>
  </div>
</div>
      {/* SEARCH */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <label className="flex-1">
          ค้นหาหนังสือ
          <input
            placeholder="ชื่อหนังสือ ผู้แต่ง ISBN หรือ Call Number"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </label>

        <label className="sm:w-56">
          หมวดหมู่
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            <option value="">
              ทุกหมวดหมู่
            </option>

            {categories.map(c => (
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

      {error && (
        <p
          role="alert"
          className="panel text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex justify-between mb-4">
        <h2>สำรวจหนังสือ</h2>

        <span className="muted">
          {books.length} รายการ
        </span>
      </div>

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
