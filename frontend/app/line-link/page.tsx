'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import {
  api,
  LineLinkConfirmResult,
} from '@/lib/api';

import {
  useApp,
} from '@/components/AppShell';


export default function LineLinkPage() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const {
    user,
  } = useApp();


  const [
    message,
    setMessage,
  ] = useState(
    'กำลังตรวจสอบข้อมูล...'
  );


  const [
    error,
    setError,
  ] = useState(
    ''
  );


  const [
    loading,
    setLoading,
  ] = useState(
    true
  );


  useEffect(() => {
    const token =
      searchParams.get(
        'token'
      );


    /*
      ไม่มี token
    */

    if (!token) {
      setError(
        'ไม่พบข้อมูลสำหรับเชื่อมบัญชี กรุณาสร้างลิงก์ใหม่จาก LINE'
      );

      setLoading(false);

      return;
    }


    /*
      เก็บ token ไว้ชั่วคราว

      เผื่อผู้ใช้ยังไม่ได้ Login
    */

    sessionStorage.setItem(
      'line-link-token',
      token
    );


    /*
      ถ้ายังไม่ได้ Login
      ส่งไปหน้า Login
    */

    if (!user) {
      setMessage(
        'กรุณาเข้าสู่ระบบห้องสมุดก่อน'
      );

      router.replace(
        '/login?next=/line-link'
      );

      return;
    }


    /*
      Login แล้ว
      เริ่มเชื่อมบัญชี
    */

    async function confirmLink() {
      try {
        setLoading(true);

        setError('');

        setMessage(
          'กำลังเชื่อมบัญชี LINE...'
        );


        const savedToken =
          sessionStorage.getItem(
            'line-link-token'
          );


        if (!savedToken) {
          throw new Error(
            'ไม่พบ token สำหรับเชื่อมบัญชี'
          );
        }


        const result =
          await api<LineLinkConfirmResult>(
            '/line-link/confirm',
            'POST',
            {
              token:
                savedToken,
            }
          );


        sessionStorage.removeItem(
          'line-link-token'
        );


        setMessage(
          `เชื่อมบัญชีสำเร็จ ✅\n${result.user.name}`
        );

        setLoading(false);

      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'เชื่อมบัญชีไม่สำเร็จ'
        );

        setLoading(false);
      }
    }


    confirmLink();

  }, [
    user,
    router,
    searchParams,
  ]);


  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center justify-center p-6">
      <div className="w-full rounded-2xl border bg-white p-6 shadow-sm">

        <div className="mb-4 text-center">
          <div className="text-4xl">
            🔗
          </div>

          <h1 className="mt-3 text-2xl font-bold">
            เชื่อมบัญชี LINE
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            ระบบห้องสมุดโรงเรียน
          </p>
        </div>


        {loading && !error && (
          <div className="rounded-xl bg-blue-50 p-4 text-center text-blue-700">
            {message}
          </div>
        )}


        {!loading && !error && (
          <>
            <div className="rounded-xl bg-green-50 p-4 text-center text-green-700 whitespace-pre-line">
              {message}
            </div>

            <p className="mt-4 text-center text-sm text-gray-500">
              ตอนนี้คุณสามารถกลับไปใช้เมนูข้อมูลส่วนตัวใน LINE ได้แล้ว
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  '/books'
                )
              }
              className="mt-5 w-full rounded-xl bg-black px-4 py-3 font-medium text-white"
            >
              กลับไปหน้าหนังสือ
            </button>
          </>
        )}


        {error && (
          <>
            <div className="rounded-xl bg-red-50 p-4 text-center text-red-700">
              {error}
            </div>

            <p className="mt-4 text-center text-sm text-gray-500">
              กรุณากลับไปที่ LINE แล้วกด
              &quot;เชื่อมบัญชี&quot;
              เพื่อสร้างลิงก์ใหม่
            </p>

            <button
              type="button"
              onClick={() =>
                router.push(
                  '/books'
                )
              }
              className="mt-5 w-full rounded-xl bg-black px-4 py-3 font-medium text-white"
            >
              กลับไปหน้าหนังสือ
            </button>
          </>
        )}

      </div>
    </main>
  );
}