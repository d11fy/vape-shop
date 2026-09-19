import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Building2, LifeBuoy, Mail, Phone, Receipt, Users } from 'lucide-react';

import { requirePlatformAdmin } from '@/core/auth/context';
import { daysBetween } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { getPlatformStore, listPlans } from '@/modules/platform/queries';
import { AnnouncementButton, StoreActions } from '@/modules/platform/platform-actions';
import { StoreStatusBadge, SubscriptionStatusBadge } from '@/modules/platform/store-status';
import { Alert } from '@/ui/feedback/alert';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'تفاصيل المتجر' };

export default async function PlatformStoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;

  const [store, plans] = await Promise.all([getPlatformStore(id), listPlans()]);
  if (!store) notFound();

  // Tenant money is shown in the tenant's own currency — anything else would be
  // misleading when the platform owner is comparing figures.
  const fmt = buildFormatter({
    currency: store.settings?.currency ?? 'SAR',
    decimals: 2,
    timezone: store.settings?.timezone ?? 'Asia/Riyadh',
    locale: 'ar',
  });

  const daysLeft = store.subscription ? daysBetween(new Date(), store.subscription.endsAt) : null;

  return (
    <>
      <PageHeader
        title={store.name}
        description={`${store.slug} · أُنشئ في ${fmt.date(store.createdAt)}`}
        backHref="/platform/stores"
        breadcrumbs={[
          { label: 'المتاجر', href: '/platform/stores' },
          { label: store.name },
        ]}
        actions={
          <>
            <AnnouncementButton storeId={store.id} />
            <StoreActions
              store={{
                id: store.id,
                name: store.name,
                status: store.status,
                planId: store.subscription?.plan.id ?? null,
              }}
              plans={plans.map((plan) => ({ id: plan.id, nameAr: plan.nameAr }))}
            />
          </>
        }
      />

      {store.status === 'SUSPENDED' && (
        <Alert tone="danger" className="mb-4" title="هذا المتجر معلّق">
          {store.suspendReason ?? 'لم يُذكر سبب'}
          {store.suspendedAt && (
            <span className="num-mixed block mt-1 text-tertiary">
              منذ {fmt.dateTime(store.suspendedAt)}
            </span>
          )}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="حالة المتجر"
          value={store.status === 'ACTIVE' ? 'نشط' : store.status === 'PENDING' ? 'قيد التهيئة' : 'معلّق'}
          hint={store.onboardedAt ? `اكتملت التهيئة ${fmt.date(store.onboardedAt)}` : 'لم تكتمل التهيئة'}
          tone={store.status === 'ACTIVE' ? 'accent' : store.status === 'SUSPENDED' ? 'danger' : 'warning'}
        />
        <StatCard
          label="الخطة"
          value={store.subscription?.plan.nameAr ?? '—'}
          hint={
            daysLeft === null
              ? 'بدون اشتراك'
              : daysLeft < 0
                ? `انتهى منذ ${Math.abs(daysLeft)} يوم`
                : `متبقٍ ${daysLeft} يوم`
          }
          tone={daysLeft !== null && daysLeft <= 7 ? 'warning' : 'default'}
        />
        <StatCard
          label="إجمالي المبيعات"
          value={fmt.money(store.salesTotal)}
          hint={`${store._count.sales} فاتورة`}
          icon={<Receipt className="size-[18px]" />}
        />
        <StatCard
          label="آخر نشاط"
          value={store.lastSaleAt ? fmt.date(store.lastSaleAt) : '—'}
          hint={store.lastSaleAt ? fmt.relative(store.lastSaleAt) : 'لم تُسجَّل مبيعات'}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <Card>
            <CardHeader title="الاشتراك" />
            {store.subscription ? (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <SubscriptionStatusBadge status={store.subscription.status} />
                  <StoreStatusBadge status={store.status} />
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Metric label="البداية" value={fmt.date(store.subscription.startsAt)} />
                  <Metric label="الانتهاء" value={fmt.date(store.subscription.endsAt)} />
                  <Metric
                    label="نهاية السماح"
                    value={
                      store.subscription.graceEndsAt
                        ? fmt.date(store.subscription.graceEndsAt)
                        : '—'
                    }
                  />
                  <Metric
                    label="القيمة"
                    value={fmt.money(Number(store.subscription.amount))}
                  />
                </dl>

                {store.subscription.events.length > 0 && (
                  <ul className="mt-4 divide-y divide-line-subtle border-t border-line-subtle pt-2">
                    {store.subscription.events.map((event) => (
                      <li key={event.id} className="flex items-start justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block text-[12.5px] font-semibold text-primary">
                            {EVENT_LABEL[event.type] ?? event.type}
                          </span>
                          {event.note && (
                            <span className="block text-[11.5px] text-tertiary">{event.note}</span>
                          )}
                        </span>
                        <span className="num shrink-0 text-[11.5px] text-tertiary">
                          {fmt.date(event.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="mt-3 text-[13px] text-tertiary">لا يوجد اشتراك مرتبط بهذا المتجر.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="حجم الاستخدام" icon={<Building2 className="size-4" />} />
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Metric label="الفروع" value={String(store._count.branches)} />
              <Metric label="الموظفون" value={String(store._count.members)} />
              <Metric label="المنتجات" value={String(store._count.products)} />
              <Metric label="العملاء" value={String(store._count.customers)} />
              <Metric label="الفواتير" value={String(store._count.sales)} />
            </dl>
          </Card>

          {store.supportSessions.length > 0 && (
            <Card>
              <CardHeader
                title="جلسات الدعم الفني"
                subtitle="كل دخول لحساب هذا المتجر مسجّل"
                icon={<LifeBuoy className="size-4" />}
              />
              <ul className="mt-3 divide-y divide-line-subtle">
                {store.supportSessions.map((session) => (
                  <li key={session.id} className="flex items-start justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-primary">
                        {session.user.name}
                      </span>
                      <span className="block text-[11.5px] text-tertiary">{session.reason}</span>
                    </span>
                    <span className="num-mixed shrink-0 text-end text-[11.5px] text-tertiary">
                      <span className="block">{fmt.dateTime(session.startedAt)}</span>
                      <span className="block">
                        {session.endedAt ? `انتهت ${fmt.time(session.endedAt)}` : 'جارية الآن'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader title="المالك" icon={<Users className="size-4" />} />
            {store.owner ? (
              <dl className="mt-3 space-y-2.5 text-[13px]">
                <div>
                  <dt className="text-[11.5px] text-tertiary">الاسم</dt>
                  <dd className="font-semibold text-primary">{store.owner.name}</dd>
                </div>
                {store.owner.email && (
                  <div className="flex items-start gap-2">
                    <Mail className="mt-0.5 size-3.5 shrink-0 text-tertiary" />
                    <span className="num text-secondary">{store.owner.email}</span>
                  </div>
                )}
                {store.owner.phone && (
                  <div className="flex items-start gap-2">
                    <Phone className="mt-0.5 size-3.5 shrink-0 text-tertiary" />
                    <span className="num text-secondary">{store.owner.phone}</span>
                  </div>
                )}
                <div>
                  <dt className="text-[11.5px] text-tertiary">آخر دخول</dt>
                  <dd className="num-mixed text-secondary">
                    {store.owner.lastLoginAt ? fmt.dateTime(store.owner.lastLoginAt) : 'لم يدخل بعد'}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-[13px] text-tertiary">لا يوجد مالك مرتبط.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="بيانات المتجر" />
            <dl className="mt-3 space-y-2 text-[13px]">
              <Row label="العملة" value={store.settings?.currency ?? '—'} />
              <Row label="المنطقة الزمنية" value={store.settings?.timezone ?? '—'} />
              <Row label="الدولة" value={store.country} />
              {store.city && <Row label="المدينة" value={store.city} />}
              {store.phone && <Row label="الهاتف" value={store.phone} />}
            </dl>
          </Card>
        </div>
      </div>
    </>
  );
}

const EVENT_LABEL: Record<string, string> = {
  created: 'إنشاء الاشتراك',
  extended: 'تمديد',
  plan_changed: 'تغيير الخطة',
  suspended: 'تعليق',
  reactivated: 'إعادة تفعيل',
  canceled: 'إلغاء',
};

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-tertiary">{label}</dt>
      <dd className="num truncate text-[14px] font-bold text-primary">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-secondary">{label}</dt>
      <dd className="num font-semibold text-primary">{value}</dd>
    </div>
  );
}
