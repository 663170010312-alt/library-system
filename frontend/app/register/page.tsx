'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return <p className="panel">บัญชีผู้ใช้ห้องสมุดสร้างโดยผู้ดูแลระบบ กำลังไปหน้าเข้าสู่ระบบ…</p>;
}
