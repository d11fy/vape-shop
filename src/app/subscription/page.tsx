import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AlertOctagon, Mail, Phone } from 'lucide-react';

import { getAuthContext } from '@/core/auth/context';
import { env } from '@/core/env';
import { buildFormatter } from '@/lib/formatter';
import { signOutAction } from '@/modules/shell/actions';
import { Button } from '@/ui/primitives/button';
import { Card } from '@/ui/primitives/card';
import { Wordmark } from '@/ui/brand/logo';

export const metadata: Metadata = { title: 'الاشتراك منتهي' };

/**
 * The wall shown when a store's access is blocked.
 *
 * Its single most important job is reassurance: the data is intact. A
 * shopkeeper who thinks their records are gone will not renew — they will
 * panic.
 */
export default async function SubscriptionBlockedPage() {
  const context = await getAuthContext();
  if (!context) redirect('/login');
  if (!context.store) redirect('/select-store');
  if (!context.store.subscription.isBlocked) redirect('/dashboard');

  const { store } = context;
  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const suspended = store.status === 'SUSPENDED';

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 py-12">
      <Wordmark size="md" className="mb-10" />

      <Card className="w-full max-w-lg text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger">
          <AlertOctagon className="size-8" />
        </span>

        <h1 className="mt-5 text-[22px] font-bold text-primary">
          {suspended ? 'تم تعليق حساب المتجر' : 'انتهى اشتراكك'}
        </h1>

        <p className="mt-3 text-[14px] leading-relaxed text-secondary">
          {suspended
            ? 'تم تعليق الوصول لهذا المتجر مؤقتاً. تواصل معنا لمعرفة التفاصيل وإعادة التفعيل.'
            : `انتهى اشتراك «${store.name}» في ${fmt.date(store.subscription.endsAt)}، وانتهت كذلك فترة السماح.`}
        </p>

        <div className="mt-5 rounded-[var(--radius-md)] border border-success-border bg-success-soft px-4 py-3.5 text-start">
          <p className="text-[13.5px] font-bold text-primary">بياناتك كاملة ومحفوظة</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">
            كل فواتيرك ومنتجاتك وعملائك وحساباتك موجودة كما هي. بمجرد التجديد ستجد كل شيء في
            مكانه — لا نحذف بيانات المتاجر.
          </p>
        </div>

        <div className="mt-6 space-y-3 border-t border-line-subtle pt-6 text-start">
          <p className="text-[13px] font-bold text-primary">للتجديد تواصل معنا</p>
          <div className="flex flex-wrap gap-4 text-[13px]">
            <a
              href={`mailto:${env.SUPPORT_EMAIL}`}
              className="flex items-center gap-2 text-accent-strong hover:underline"
            >
              <Mail className="size-4" />
              <span className="num">{env.SUPPORT_EMAIL}</span>
            </a>
            {env.SUPPORT_PHONE && (
              <a
                href={`tel:${env.SUPPORT_PHONE.replace(/\s/g, '')}`}
                className="flex items-center gap-2 text-accent-strong hover:underline"
              >
                <Phone className="size-4" />
                <span className="num">{env.SUPPORT_PHONE}</span>
              </a>
            )}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-center gap-2">
          <form action={signOutAction}>
            <Button type="submit" variant="ghost">
              تسجيل الخروج
            </Button>
          </form>
        </div>
      </Card>

      <p className="num-mixed mt-6 text-[12px] text-tertiary">
        {store.name} · خطة {store.subscription.planName}
      </p>
    </div>
  );
}
