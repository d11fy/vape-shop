import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LogOut, ShieldAlert } from 'lucide-react';

import { getAuthContext } from '@/core/auth/context';
import { ChangePasswordForm } from '@/modules/auth/password-forms';
import { signOutAction } from '@/modules/shell/actions';

export const metadata: Metadata = { title: 'تغيير كلمة المرور' };

/**
 * The one screen a user holding a temporary password can reach. Every store
 * and platform guard sends them here until the password is theirs alone.
 */
export default async function ChangePasswordPage() {
  const context = await getAuthContext();
  if (!context) redirect('/login');
  // Nothing to force — a voluntary change lives on the account page.
  if (!context.user.mustChangePassword) redirect('/account');

  // Continue exactly where signing in would have gone.
  const next =
    context.memberships.length === 0
      ? context.isPlatformAdmin
        ? '/platform'
        : '/no-access'
      : context.memberships.length > 1 && !context.store
        ? '/select-store'
        : '/dashboard';

  return (
    <div>
      <div className="mb-7">
        <span className="flex size-12 items-center justify-center rounded-[var(--radius-md)] bg-warning-soft text-warning">
          <ShieldAlert className="size-6" aria-hidden="true" />
        </span>
        <h1 className="mt-5 text-[24px] font-bold tracking-tight text-primary">
          اختر كلمة مرور خاصة بك
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          أهلاً {context.user.name}. دخلت بكلمة مرور مؤقتة أنشأها غيرك، فلا بد من تغييرها قبل
          استخدام النظام — لا يجب أن يعرف أحد كلمة مرورك غيرك.
        </p>
      </div>

      <ChangePasswordForm redirectTo={next} />

      <form action={signOutAction} className="mt-6 text-center">
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-secondary transition-colors hover:text-primary"
        >
          <LogOut className="size-4" aria-hidden="true" />
          تسجيل الخروج
        </button>
      </form>
    </div>
  );
}
