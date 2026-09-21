'use client';

import { useState } from 'react';
import { api, User } from '@/lib/api';

export default function AuthForm({
  onLogin,
}: {
  onLogin: (user: User) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="max-w-md mx-auto panel mt-10">
      <p className="muted mb-2">SCHOOL LIBRARY ACCOUNT</p>
      <h1>เข้าสู่ระบบห้องสมุด</h1>
      <p className="muted mt-2 mb-6">
        บัญชีผู้ใช้ห้องสมุดสร้างโดยผู้ดูแลระบบ กรุณาใช้อีเมลและรหัสผ่านที่ได้รับ
      </p>

      <form
        className="space-y-4"
        onSubmit={async e => {
          e.preventDefault();
          setBusy(true);
          setError('');

          const data = Object.fromEntries(new FormData(e.currentTarget));

          try {
            const result = await api<{ user: User; token: string }>(
              '/auth/login',
              'POST',
              data
            );

            sessionStorage.setItem('library-token', result.token);
            onLogin(result.user);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          อีเมล
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
          />
        </label>

        <label>
          รหัสผ่าน
          <input
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete="current-password"
          />
        </label>

        {error && <p role="alert" className="text-red-700">{error}</p>}

        <button className="btn w-full" disabled={busy}>
          {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
        </button>
      </form>
    </div>
  );
}
