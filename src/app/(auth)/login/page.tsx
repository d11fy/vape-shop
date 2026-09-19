import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/core/auth/context';
import { env } from '@/core/env';
import { LoginForm } from '@/modules/auth/login-form';

export const metadata: Metadata = {
  title: 'تسجيل الدخول',
};

export default async function LoginPage() {
  const context = await getAuthContext();
  if (context) {
    if (context.store) redirect('/dashboard');
    if (context.memberships.length > 1) redirect('/select-store');
    if (context.isPlatformAdmin) redirect('/platform');
  }

  return <LoginForm allowSignup={env.ALLOW_PUBLIC_SIGNUP} />;
}
