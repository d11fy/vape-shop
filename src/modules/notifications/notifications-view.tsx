'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CreditCard,
  HandCoins,
  Megaphone,
  PackageX,
  Settings2,
  Truck,
  Wallet,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import type { NotificationKind, NotificationSeverity } from '@/generated/prisma/enums';
import { Pagination } from '@/ui/data/pagination';
import { EmptyState } from '@/ui/feedback/empty-state';
import { useToast } from '@/ui/feedback/toast';
import { useFormat } from '@/ui/format';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Card } from '@/ui/primitives/card';
import { markNotificationsReadAction } from './actions';
import { NOTIFICATION_KIND_LABEL } from './audience';
import type { NotificationPage, NotificationRow } from './queries';

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  LOW_STOCK: AlertTriangle,
  OUT_OF_STOCK: PackageX,
  CASH_MISMATCH: Wallet,
  OVERDUE_DEBT: HandCoins,
  SUPPLIER_DUE: Truck,
  SUBSCRIPTION_EXPIRING: CreditCard,
  SUBSCRIPTION_EXPIRED: CreditCard,
  PLATFORM_ANNOUNCEMENT: Megaphone,
  SYSTEM: Settings2,
};

const SEVERITY_TILE: Record<NotificationSeverity, string> = {
  INFO: 'bg-info-soft text-info',
  SUCCESS: 'bg-success-soft text-success',
  WARNING: 'bg-warning-soft text-warning',
  DANGER: 'bg-danger-soft text-danger',
};

export function NotificationsView({
  data,
  unreadOnly,
}: {
  data: NotificationPage;
  unreadOnly: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();
  const [pending, startTransition] = useTransition();

  const markAll = () =>
    startTransition(async () => {
      const result = await markNotificationsReadAction({});
      if (!result.ok) {
        toast.error('تعذر التحديث', result.error.message);
        return;
      }
      router.refresh();
    });

  const open = (row: NotificationRow) => {
    if (!row.read) {
      // Fire and forget: navigation should not wait on a read receipt.
      void markNotificationsReadAction({ ids: [row.id] }).then(() => router.refresh());
    }
    if (row.link) router.push(row.link);
  };

  // Group by calendar day in the store's timezone: "اليوم", "أمس", then dates.
  const groups = groupByDay(data.rows, (date) => fmt.date(date));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex gap-1 rounded-[var(--radius-sm)] bg-sunken p-1" aria-label="تصفية الإشعارات">
          <FilterTab href="/notifications" active={!unreadOnly}>
            الكل
          </FilterTab>
          <FilterTab href="/notifications?filter=unread" active={unreadOnly}>
            غير المقروءة
            {data.unread > 0 && (
              <Badge tone="accent" size="sm" className="ms-1.5">
                <span className="num">{data.unread}</span>
              </Badge>
            )}
          </FilterTab>
        </nav>

        {data.unread > 0 && (
          <Button
            size="sm"
            variant="ghost"
            iconStart={<CheckCheck className="size-4" />}
            onClick={markAll}
            loading={pending}
          >
            تحديد الكل كمقروء
          </Button>
        )}
      </div>

      {data.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bell className="size-6" />}
            title={unreadOnly ? 'لا توجد إشعارات غير مقروءة' : 'لا توجد إشعارات بعد'}
            description="ستظهر هنا تنبيهات المخزون المنخفض، الديون المتأخرة، فروقات الصندوق، وتذكيرات الاشتراك."
          />
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h2 className="mb-1.5 px-1 text-[12px] font-semibold text-tertiary">{group.label}</h2>
            <Card padded={false}>
              <ul className="divide-y divide-line-subtle">
                {group.rows.map((row) => {
                  const Icon = KIND_ICON[row.kind];
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => open(row)}
                        className={cn(
                          'flex w-full items-start gap-3 p-3.5 text-start transition-colors hover:bg-sunken/60 sm:p-4',
                          !row.read && 'bg-accent-soft/40',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]',
                            SEVERITY_TILE[row.severity],
                          )}
                        >
                          <Icon className="size-[18px]" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span
                              className={cn(
                                'truncate text-[13.5px] text-primary',
                                row.read ? 'font-medium' : 'font-bold',
                              )}
                            >
                              {row.title}
                            </span>
                            <span className="shrink-0 text-[11px] text-tertiary">
                              {NOTIFICATION_KIND_LABEL[row.kind]}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-secondary">
                            {row.body}
                          </span>
                          <span className="mt-1 block text-[11.5px] text-tertiary">
                            {fmt.relative(row.createdAt)}
                          </span>
                        </span>
                        {!row.read && (
                          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent-strong">
                            <span className="sr-only">غير مقروء</span>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        ))
      )}

      <Pagination
        total={data.total}
        page={data.page}
        perPage={data.pageSize}
        unit="إشعار"
        showPerPage={false}
      />
    </div>
  );
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center rounded-[calc(var(--radius-sm)-2px)] px-3 py-1.5 text-[13px] font-semibold transition-colors',
        active ? 'bg-card text-primary shadow-xs' : 'text-secondary hover:text-primary',
      )}
    >
      {children}
    </Link>
  );
}

function groupByDay(
  rows: NotificationRow[],
  label: (date: Date) => string,
): Array<{ label: string; rows: NotificationRow[] }> {
  const today = label(new Date());
  const yesterday = label(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const groups: Array<{ label: string; rows: NotificationRow[] }> = [];

  for (const row of rows) {
    const day = label(new Date(row.createdAt));
    const display = day === today ? 'اليوم' : day === yesterday ? 'أمس' : day;
    const last = groups.at(-1);
    if (last && last.label === display) last.rows.push(row);
    else groups.push({ label: display, rows: [row] });
  }
  return groups;
}
