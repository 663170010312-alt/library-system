'use client';
import Records from '@/components/Records';
import { useApp } from '@/components/AppShell';

export default function Page() {
  const { user, notify } = useApp();
  if (!user) return null;
  return <Records user={user} mode="overdue" notify={notify} />;
}
