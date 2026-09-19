import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Building2, Receipt, TrendingUp, Users } from 'lucide-react';

import { requirePlatformAdmin } from '@/core/auth/context';
import { buildFormatter } from '@/lib/formatter';
import { getPlatformOverview } from '@/modules/platform/queries';
import { AnnouncementButton } from '@/modules/platform/platform-actions';
import { StoreStatusBadge } from '@/modules/platform/store-status';
import { Badge } from '@/ui/primitives/badge';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'لوحة إدارة المنصة' };

export default async function PlatformOverviewPage() {
  await requirePlatformAdmin();

  const overview = await getPlatformOverview();

  // The console reports in the platform's own currency, not any tenant's.
  const fmt = buildFormatter({
    currency: 'SAR',
    decimals: 2,
    timezone: 'Asia/Riyadh',
    locale: 'ar',
  });

  return (
    <>
      <PageHeader
        title="نظرة عامة"
        description="حالة المنصة والاشتراكات والمتاجر"
        actions={<AnnouncementButton />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="الإيراد الشهري المتكرر"
          value={fmt.money(overview.mrr)}
          hint="MRR من الاشتراكات النشطة"
          icon={<TrendingUp className="size-[18px]" />}
          tone="accent"
        />
        <StatCard
          label="المتاجر النشطة"
          value={fmt.number(overview.stores.active)}
          hint={`${overview.stores.total} متجر إجمالاً`}
          icon={<Building2 className="size-[18px]" />}
          href="/platform/stores?status=ACTIVE"
        />
        <StatCard
          label="متاجر جديدة هذا الشهر"
          value={fmt.number(overview.stores.newThisMonth)}
          icon={<Users className="size-[18px]" />}
        />
        <StatCard
          label="اشتراكات تنتهي قريباً"
          value={fmt.number(overview.subscriptions.expiringSoon)}
          hint="خلال 14 يوماً"
          tone={overview.subscriptions.expiringSoon > 0 ? 'warning' : 'default'}
          icon={<AlertTriangle className="size-[18px]" />}
          href="/platform/stores?status=expiring"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MiniStat label="فترة تجريبية" value={fmt.number(overview.subscriptions.trialing)} />
        <MiniStat label="اشتراكات نشطة" value={fmt.number(overview.subscriptions.active)} />
        <MiniStat
          label="فترة سماح"
          value={fmt.number(overview.subscriptions.grace)}
          tone="warning"
        />
        <MiniStat
          label="منتهية"
          value={fmt.number(overview.subscriptions.expired)}
          tone="danger"
        />
        <MiniStat
          label="معلّقة"
          value={fmt.number(overview.stores.suspended)}
          tone={overview.stores.suspended > 0 ? 'danger' : undefined}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="استخدام المنصة" icon={<Receipt className="size-4" />} />
          <dl className="mt-4 space-y-3">
            <Row label="إجمالي الفواتير المسجلة" value={fmt.number(overview.totalInvoices)} />
            <Row label="فواتير هذا الشهر" value={fmt.number(overview.invoicesThisMonth)} />
            <Row label="المستخدمون النشطون" value={fmt.number(overview.users)} />
          </dl>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="توزيع الخطط" subtitle="عدد المتاجر وإيرادها الشهري" />
          <ul className="mt-4 space-y-3">
            {overview.planDistribution.length === 0 ? (
              <li className="py-6 text-center text-[13px] text-tertiary">لا توجد اشتراكات نشطة</li>
            ) : (
              overview.planDistribution.map((plan) => {
                const share = overview.mrr > 0 ? (plan.mrr / overview.mrr) * 100 : 0;
                return (
                  <li key={plan.code}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[13px] font-semibold text-primary">
                        {plan.name}
                        <span className="num-mixed ms-2 text-[11.5px] font-normal text-tertiary">
                          {plan.count} متجر
                        </span>
                      </span>
                      <span className="num text-[13px] font-bold text-primary">
                        {fmt.money(plan.mrr)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-sunken">
                      <div
                        className="h-full rounded-full bg-accent-strong"
                        style={{ width: `${Math.max(2, share)}%` }}
                      />
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="أحدث المتاجر"
            action={
              <Link
                href="/platform/stores"
                className="text-[12.5px] font-semibold text-accent-strong hover:underline"
              >
                عرض الكل
              </Link>
            }
          />
          <ul className="mt-3 divide-y divide-line-subtle">
            {overview.recentStores.map((store) => (
              <li key={store.id}>
                <Link
                  href={`/platform/stores/${store.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-2.5 transition-colors hover:bg-sunken"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-primary">
                      {store.name}
                    </span>
                    <span className="block truncate text-[11.5px] text-tertiary">
                      {store.ownerName ?? '—'} · {store.planName}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <StoreStatusBadge status={store.status} />
                    <span className="num mt-1 block text-[11px] text-tertiary">
                      {fmt.date(store.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="اشتراكات تحتاج متابعة" subtitle="تنتهي خلال 14 يوماً أو انتهت" />
          {overview.expiringSoon.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-tertiary">
              لا توجد اشتراكات تحتاج متابعة الآن
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-line-subtle">
              {overview.expiringSoon.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={`/platform/stores/${entry.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-2.5 transition-colors hover:bg-sunken"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-primary">
                        {entry.name}
                      </span>
                      <span className="block text-[11.5px] text-tertiary">{entry.planName}</span>
                    </span>
                    <span className="shrink-0 text-end">
                      <Badge
                        tone={
                          entry.daysLeft < 0 ? 'danger' : entry.daysLeft <= 3 ? 'warning' : 'neutral'
                        }
                        size="sm"
                      >
                        {entry.daysLeft < 0
                          ? `انتهى منذ ${Math.abs(entry.daysLeft)} يوم`
                          : `${entry.daysLeft} يوم`}
                      </Badge>
                      <span className="num mt-1 block text-[11px] text-tertiary">
                        {fmt.date(entry.endsAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'warning' | 'danger';
}) {
  return (
    <Card className="p-3.5">
      <p className="text-[11.5px] text-secondary">{label}</p>
      <p
        className={`num mt-1 text-[18px] font-bold ${
          tone === 'danger' ? 'text-danger' : tone === 'warning' ? 'text-warning' : 'text-primary'
        }`}
      >
        {value}
      </p>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[13px] text-secondary">{label}</dt>
      <dd className="num text-[14px] font-bold text-primary">{value}</dd>
    </div>
  );
}
