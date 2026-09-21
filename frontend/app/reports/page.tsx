'use client';
import Administration from '@/components/Administration';
import { useApp } from '@/components/AppShell';

export default function Page() {
  const { user, notify } = useApp();
  if (!user) return null;
  return <Administration mode="reports" user={user} notify={notify} />;
}
