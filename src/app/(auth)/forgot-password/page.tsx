import type { Metadata } from 'next';

import { ForgotPasswordForm } from '@/modules/auth/password-forms';

export const metadata: Metadata = { title: 'استعادة كلمة المرور' };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
