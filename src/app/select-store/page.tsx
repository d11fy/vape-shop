import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ArrowLeft, LogOut, Store } from 'lucide-react';

import { getAuthContext } from '@/core/auth/context';
import { countAr, NOUNS } from '@/lib/arabic-count';
import { chooseStoreAction } from '@/modules/auth/actions';
import { signOutAction } from '@/modules/shell/actions';
import { LogoTile } from '@/ui/primitives/avatar';
import { Wordmark } from '@/ui/brand/logo';

export const metadata: Metadata = { title: 'اختيار المتجر' };

/**
 * Store picker for people who work in more than one shop.
 *
 * Each option is a plain form post, so it works with JavaScript disabled and
 * needs no client bundle at all.
 */
export default async function SelectStorePage() {
  const context = await getAuthContext();
  if (!context) redirect('/login');
  if (context.memberships.length === 0) {
    redirect(context.isPlatformAdmin ? '/platform' : '/no-access');
  }
  if (context.memberships.length === 1) {
    redirect('/dashboard');
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between px-5 py-6 sm:px-10">
        <Wordmark size="sm" />
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-sunken hover:text-primary"
          >
            <LogOut className="size-4" />
            خروج
          </button>
        </form>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-16">
        <div className="w-full max-w-lg">
          <div className="mb-7 text-center">
            <h1 className="text-[24px] font-bold text-primary">اختر المتجر</h1>
            <p className="mt-2 text-[14px] text-secondary">
              أهلاً {context.user.name} — لديك وصول إلى{' '}
              {countAr(context.memberships.length, NOUNS.store)}.
            </p>
          </div>

          <ul className="space-y-2">
            {context.memberships.map((membership) => (
              <li key={membership.storeId}>
                <form
                  action={async () => {
                    'use server';
                    await chooseStoreAction(membership.storeId);
                  }}
                >
                  <button
                    type="submit"
                    className="group flex w-full items-center gap-3.5 rounded-[var(--radius-md)] border border-line-subtle bg-card p-4 text-start transition-all hover:border-accent-border hover:shadow-sm"
                  >
                    <LogoTile name={membership.storeName} src={membership.logoUrl} size="lg" />

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-primary">
                        {membership.storeName}
                      </span>
                      <span className="block truncate text-[12.5px] text-secondary">
                        {membership.roleName}
                      </span>
                    </span>

                    <ArrowLeft
                      className="size-4 shrink-0 text-tertiary transition-transform group-hover:-translate-x-0.5"
                      aria-hidden="true"
                    />
                  </button>
                </form>
              </li>
            ))}
          </ul>

          {context.isPlatformAdmin && (
            <a
              href="/platform"
              className="mt-4 flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-line-strong p-4 text-[13.5px] font-semibold text-secondary transition-colors hover:border-accent-border hover:text-primary"
            >
              <Store className="size-4" />
              الانتقال إلى لوحة إدارة المنصة
            </a>
          )}
        </div>
      </main>
    </div>
  );
}
