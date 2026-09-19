'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Eye, LogOut, X } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * Support mode must be impossible to miss — both for the admin, who could
 * otherwise forget whose data they are looking at, and as a visible record that
 * the tenant's screens are being viewed.
 */
export function SupportBanner({
  storeName,
  onExit,
}: {
  storeName: string;
  onExit: () => Promise<void>;
}) {
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="no-print sticky top-[var(--header-height)] z-[15] flex items-center gap-3 border-b border-warning-border bg-warning-soft px-4 py-2.5">
      <Eye className="size-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[12.5px] font-semibold text-primary">
        أنت الآن في وضع الدعم الفني داخل متجر{' '}
        <span className="font-bold">{storeName}</span> — الوصول للقراءة فقط وكل خطوة مسجّلة.
      </p>
      <button
        type="button"
        disabled={leaving}
        onClick={async () => {
          setLeaving(true);
          await onExit();
        }}
        className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] bg-ink px-3 py-1.5 text-[12px] font-bold text-on-inverse transition-opacity disabled:opacity-60"
      >
        <LogOut className="size-3.5" />
        إنهاء الجلسة
      </button>
    </div>
  );
}

const SUBSCRIPTION_COPY: Record<
  string,
  { tone: 'warning' | 'danger'; title: string; body: string } | undefined
> = {
  GRACE: {
    tone: 'danger',
    title: 'انتهى اشتراكك',
    body: 'النظام يعمل الآن بوضع القراءة فقط. بياناتك محفوظة بالكامل — جدّد الاشتراك لاستئناف تسجيل العمليات.',
  },
  EXPIRED: {
    tone: 'danger',
    title: 'الاشتراك منتهي',
    body: 'تم تعليق الوصول. تواصل معنا لتجديد الاشتراك واستعادة كامل الصلاحيات.',
  },
};

export function SubscriptionBanner({
  status,
  daysRemaining,
  isReadOnly,
}: {
  status: string;
  daysRemaining: number;
  isReadOnly: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);

  const expiring =
    !isReadOnly && (status === 'ACTIVE' || status === 'TRIALING') && daysRemaining <= 7;

  const copy =
    SUBSCRIPTION_COPY[status] ??
    (expiring
      ? {
          tone: 'warning' as const,
          title: status === 'TRIALING' ? 'الفترة التجريبية تنتهي قريباً' : 'اشتراكك ينتهي قريباً',
          body:
            daysRemaining <= 0
              ? 'ينتهي اشتراكك اليوم.'
              : `متبقٍ ${daysRemaining} ${daysRemaining === 1 ? 'يوم' : daysRemaining === 2 ? 'يومان' : daysRemaining <= 10 ? 'أيام' : 'يوماً'} على انتهاء الاشتراك.`,
        }
      : undefined);

  if (!copy || dismissed) return null;

  const danger = copy.tone === 'danger';

  return (
    <div
      className={cn(
        'no-print flex items-center gap-3 border-b px-4 py-2.5',
        danger ? 'border-danger-border bg-danger-soft' : 'border-warning-border bg-warning-soft',
      )}
    >
      <AlertTriangle
        className={cn('size-4 shrink-0', danger ? 'text-danger' : 'text-warning')}
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 text-[12.5px] text-primary">
        <span className="font-bold">{copy.title}</span>
        <span className="mx-1.5 text-tertiary">·</span>
        <span className="text-secondary">{copy.body}</span>
      </p>
      <Link
        href="/settings/subscription"
        className="shrink-0 rounded-[var(--radius-sm)] bg-ink px-3 py-1.5 text-[12px] font-bold text-on-inverse"
      >
        تفاصيل الاشتراك
      </Link>
      {!danger && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="إخفاء التنبيه"
          className="shrink-0 rounded-[var(--radius-xs)] p-1 text-tertiary transition-colors hover:text-primary"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
