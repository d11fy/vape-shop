import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { getAuthContext } from '@/core/auth/context';
import { env } from '@/core/env';
import { RegisterForm } from '@/modules/auth/register-form';

export const metadata: Metadata = { title: 'إنشاء متجر' };

export default async function RegisterPage() {
  // Self-service signup is a deployment choice; when it is off the route does
  // not exist rather than showing a form that cannot submit.
  if (!env.ALLOW_PUBLIC_SIGNUP) notFound();

  const context = await getAuthContext();
  if (context?.store) redirect('/dashboard');

  return <RegisterForm />;
}
