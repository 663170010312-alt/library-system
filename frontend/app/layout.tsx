import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';
export const metadata: Metadata = { title: 'Library • ระบบห้องสมุด', description: 'ค้นหา จอง ยืม และคืนหนังสือ' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body><AppShell>{children}</AppShell></body></html>;
}
