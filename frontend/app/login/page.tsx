'use client';
import AuthForm from '@/components/AuthForm';
import { useApp } from '@/components/AppShell';

export default function Page() {
  const { login } = useApp();
  return <AuthForm onLogin={login} />;
}
