import { redirect } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';

import { CHANGE_PASSWORD_PATH, getAuthContext } from '@/core/auth/context';
import { signOutAction } from '@/modules/shell/actions';
import { ConfirmProvider } from '@/ui/feedback/confirm';
import { FormatProvider } from '@/ui/format';
import { Logo } from '@/ui/brand/logo';
import { PlatformNav } from '@/modules/platform/platform-nav';

/**
 * The platform console.
 *
 * Deliberately a different shell from the tenant app: a distinct chrome makes
 * it obvious at a glance whether you are looking at one shop's data or the
 * whole service.
 */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext();

  if (!context) redirect('/login');
  if (context.user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  if (context.user.platformRole !== 'SUPER_ADMIN') {
    // Not an admin — send them wherever they do belong.
    redirect(context.store ? '/dashboard' : '/no-access');
  }

  const items = [
    { href: '/platform', label: 'نظرة عامة', icon: 'BarChart3', exact: true },
    { href: '/platform/stores', label: 'المتاجر', icon: 'Store' },
    { href: '/platform/plans', label: 'الخطط', icon: 'CreditCard' },
  ];

  return (
    <FormatProvider
      settings={{ currency: 'SAR', decimals: 2, timezone: 'Asia/Riyadh', locale: 'ar' }}
    >
      <ConfirmProvider>
        <div className="min-h-dvh bg-canvas">
          <header className="sticky top-0 z-20 border-b border-line-subtle bg-ink text-on-inverse">
            <div className="mx-auto flex h-[var(--header-height)] max-w-[1400px] items-center gap-4 px-4 sm:px-6">
              <Link href="/platform" className="flex items-center gap-2.5">
                <Logo size={30} />
                <span className="leading-tight">
                  <span className="block text-[14px] font-bold">ڤيب شوب</span>
                  <span className="block text-[10.5px] text-white/50">لوحة إدارة المنصة</span>
                </span>
              </Link>

              <PlatformNav items={items} />

              <div className="flex-1" />

              <span className="hidden text-[12.5px] text-white/60 sm:block">
                {context.user.name}
              </span>

              <form action={signOutAction}>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[12.5px] font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="size-3.5" />
                  خروج
                </button>
              </form>
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6">{children}</main>
        </div>
      </ConfirmProvider>
    </FormatProvider>
  );
}
