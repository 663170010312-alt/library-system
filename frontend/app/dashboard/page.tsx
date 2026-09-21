'use client';
import { useEffect, useState } from 'react';
import { api, Book, User } from '@/lib/api';
import { useApp } from '@/components/AppShell';
export default function DashboardPage() {
  const { notify } = useApp();
  const [stats, setStats] = useState<Record<string, number>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    Promise.all([api<Record<string, number>>('/loans/dashboard'), api<User[]>('/users'), api<Book[]>('/books')])
      .then(([s, u, b]) => { setStats(s); setUsers(u.filter(v => v.role === 'MEMBER' && v.active)); setBooks(b); setError(''); })
      .catch(e => setError(e.message));
  }, [revision]);
  return <div className="space-y-6">{error && <p role="alert" className="text-red-700">{error}</p>}<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">{Object.entries({ books: 'หนังสือทั้งหมด', members: 'ผู้ใช้ห้องสมุด', pending: 'การจองรอรับ', borrowed: 'กำลังยืม', overdue: 'เกินกำหนด', unpaid_fines: 'ค่าปรับค้างชำระ' }).map(([key, title]) => <div className="panel" key={key}><p className="muted">{title}</p><p className={`text-4xl font-semibold mt-4 ${key === 'overdue' ? 'text-red-700' : 'text-library'}`}>{stats[key] ?? '—'}</p></div>)}</div>
    <form className="panel space-y-5 max-w-2xl" onSubmit={async e => {
      e.preventDefault(); const form = e.currentTarget; const data = Object.fromEntries(new FormData(form));
      if (!confirm('ยืนยันว่าผู้ยืมมารับหนังสือที่เคาน์เตอร์แล้ว?')) return;
      setBusy(true);
      try { await api('/loans', 'POST', data); form.reset(); setRevision(v => v + 1); notify('ยืนยันการยืมสำเร็จ กำหนดคืนใน 14 วัน'); }
      catch (err) { notify((err as Error).message, true); } finally { setBusy(false); }
    }}><h2>ยืมที่เคาน์เตอร์ • ไม่ได้จองล่วงหน้า</h2><p className="muted">ถ้าผู้ยืมจองไว้แล้ว ให้ยืนยันจากหน้า “รายการจอง”</p><label>ผู้ยืม<select name="user_id" required defaultValue=""><option value="" disabled>เลือกผู้ยืม</option>{users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.user_type === 'TEACHER' ? 'ครู' : u.user_type === 'STUDENT' ? 'นักเรียน' : 'ผู้ใช้ห้องสมุด'} {u.school_code ? `(${u.school_code})` : ''}</option>)}</select></label><label>หนังสือ<select name="book_id" required defaultValue=""><option value="" disabled>เลือกหนังสือ</option>{books.map(b => <option key={b.id} value={b.id} disabled={b.available_copies < 1}>{b.title} — ว่าง {b.available_copies} เล่ม</option>)}</select></label><button className="btn" disabled={busy}>ยืนยันการยืมที่เคาน์เตอร์</button></form>
  </div>;
}
