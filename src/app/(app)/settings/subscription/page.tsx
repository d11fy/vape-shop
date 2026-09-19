import type { Metadata } from 'next';
import { Check, CreditCard, X } from 'lucide-react';

import { requirePermission } from '@/core/auth/context';
import { db } from '@/core/db';
import { daysBetween } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { PLAN_FEATURE_LABELS } from '@/modules/subscriptions/features';
import { SettingsTabs } from '@/modules/settings/settings-tabs';
import { Alert } from '@/ui/feedback/alert';
import { Badge } from '@/ui/primitives/badge';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'الاشتراك' };

const STATUS_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  TRIALING: { label: 'فترة تجريبية', tone: 'warning' },
  ACTIVE: { label: 'نشط', tone: 'success' },
  GRACE: { label: 'فترة سماح — قراءة فقط', tone: 'danger' },
  EXPIRED: { label: 'منتهي', tone: 'danger' },
  CANCELED: { label: 'ملغى', tone: 'danger' },
};

export default async function SubscriptionPage() {
  const { store } = await requirePermission('settings.view');

  const [subscription, plans, usage] = await Promise.all([
    db.subscription.findUnique({
      where: { storeId: store.id },
      select: {
        status: true,
        startsAt: true,
        endsAt: true,
        graceEndsAt: true,
        billingCycle: true,
        amount: true,
        plan: {
          select: {
            code: true,
            nameAr: true,
            descriptionAr: true,
            monthlyPrice: true,
            yearlyPrice: true,
            maxEmployees: true,
            maxBranches: true,
            maxProducts: true,
            maxMonthlyInvoices: true,
            features: true,
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, type: true, note: true, newEndsAt: true, createdAt: true },
        },
      },
    }),
    db.plan.findMany({
      where: { isActive: true, isPublic: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        code: true,
        nameAr: true,
        descriptionAr: true,
        monthlyPrice: true,
        yearlyPrice: true,
        maxEmployees: true,
        maxBranches: true,
        maxProducts: true,
        features: true,
      },
    }),
    Promise.all([
      db.storeUser.count({ where: { storeId: store.id, status: { in: ['ACTIVE', 'INVITED'] } } }),
      db.branch.count({ where: { storeId: store.id, deletedAt: null } }),
      db.product.count({ where: { storeId: store.id, deletedAt: null } }),
      db.sale.count({
        where: {
          storeId: store.id,
          deletedAt: null,
          soldAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
        },
      }),
    ]),
  ]);

  const [employeeCount, branchCount, productCount, monthlyInvoices] = usage;

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  if (!subscription) {
    return (
      <>
        <PageHeader title="الاشتراك" description="تفاصيل خطتك الحالية" />
        <SettingsTabs />
        <Alert tone="danger" title="لا يوجد اشتراك">
          هذا المتجر بدون اشتراك نشط. تواصل مع الدعم لتفعيل حسابك.
        </Alert>
      </>
    );
  }

  const status = STATUS_LABEL[store.subscription.status] ?? STATUS_LABEL.ACTIVE!;
  const daysLeft = daysBetween(new Date(), subscription.endsAt);
  const currentPlan = subscription.plan;

  const limits = [
    { label: 'الموظفون', used: employeeCount, limit: currentPlan.maxEmployees },
    { label: 'الفروع', used: branchCount, limit: currentPlan.maxBranches },
    { label: 'المنتجات', used: productCount, limit: currentPlan.maxProducts },
    { label: 'فواتير هذا الشهر', used: monthlyInvoices, limit: currentPlan.maxMonthlyInvoices },
  ];

  return (
    <>
      <PageHeader
        title="الاشتراك"
        description={`خطة ${currentPlan.nameAr}`}
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />

      <SettingsTabs />

      {store.subscription.isReadOnly && (
        <Alert tone="danger" className="mb-4" title="النظام يعمل بوضع القراءة فقط">
          انتهى اشتراكك، ولا يمكن تسجيل عمليات جديدة. بياناتك محفوظة بالكامل ولن تُحذف — جدّد
          الاشتراك لاستئناف العمل فوراً.
        </Alert>
      )}

      {!store.subscription.isReadOnly && daysLeft <= 7 && (
        <Alert tone="warning" className="mb-4" title="اشتراكك ينتهي قريباً">
          متبقٍ <span className="num font-bold">{daysLeft}</span> يوم على انتهاء الاشتراك في{' '}
          <span className="num">{fmt.date(subscription.endsAt)}</span>.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="الخطة الحالية" value={currentPlan.nameAr} tone="accent" />
        <StatCard
          label="تاريخ التجديد"
          value={fmt.date(subscription.endsAt)}
          hint={daysLeft > 0 ? `متبقٍ ${daysLeft} يوم` : 'انتهى'}
          tone={daysLeft <= 7 ? 'warning' : 'default'}
        />
        <StatCard
          label="قيمة الاشتراك"
          value={fmt.money(Number(subscription.amount))}
          hint={subscription.billingCycle === 'yearly' ? 'سنوياً' : 'شهرياً'}
        />
        <StatCard label="بداية الاشتراك" value={fmt.date(subscription.startsAt)} />
      </div>

      <Card className="mt-3">
        <CardHeader title="استخدامك للخطة" subtitle="الحدود المتاحة وما استُهلك منها" />
        <ul className="mt-4 space-y-4">
          {limits.map((entry) => {
            const cap = entry.limit;
            const percent =
              cap === null ? 0 : Math.min(100, Math.round((entry.used / Math.max(1, cap)) * 100));

            return (
              <li key={entry.label}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[13px] font-medium text-primary">{entry.label}</span>
                  <span className="num-mixed text-[13px] text-secondary">
                    {fmt.number(entry.used)}
                    {cap === null ? (
                      <span className="text-tertiary"> / غير محدود</span>
                    ) : (
                      <span className="text-tertiary"> / {fmt.number(cap)}</span>
                    )}
                  </span>
                </div>
                {cap !== null && (
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-sunken">
                    <div
                      className={`h-full rounded-full ${
                        percent >= 100
                          ? 'bg-danger'
                          : percent >= 80
                            ? 'bg-warning'
                            : 'bg-accent-strong'
                      }`}
                      style={{ width: `${Math.max(2, percent)}%` }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="mt-6">
        <h2 className="mb-3 text-[15px] font-bold text-primary">الخطط المتاحة</h2>
        <div className="grid gap-3 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.code === currentPlan.code;
            return (
              <Card
                key={plan.id}
                className={isCurrent ? 'border-accent-strong ring-1 ring-accent-border' : undefined}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-[16px] font-bold text-primary">{plan.nameAr}</h3>
                    {plan.descriptionAr && (
                      <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">
                        {plan.descriptionAr}
                      </p>
                    )}
                  </div>
                  {isCurrent && (
                    <Badge tone="accent" size="sm">
                      خطتك
                    </Badge>
                  )}
                </div>

                <p className="num-mixed mt-4 text-[24px] font-bold text-primary">
                  {fmt.money(Number(plan.monthlyPrice))}
                  <span className="text-[13px] font-normal text-tertiary"> / شهرياً</span>
                </p>
                <p className="num-mixed text-[12px] text-tertiary">
                  أو {fmt.money(Number(plan.yearlyPrice))} سنوياً
                </p>

                <ul className="mt-4 space-y-2 border-t border-line-subtle pt-4">
                  <PlanLimit label="موظف" value={plan.maxEmployees} />
                  <PlanLimit label="فرع" value={plan.maxBranches} />
                  <PlanLimit label="منتج" value={plan.maxProducts} />
                  {plan.features.slice(0, 6).map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-[12.5px]">
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                      <span className="text-secondary">
                        {PLAN_FEATURE_LABELS[feature] ?? feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>

        <Alert tone="info" className="mt-4" title="لترقية الخطة">
          التجديد والترقية يتمّان عبر فريق ڤيب شوب حالياً. تواصل معنا وسنحدّث اشتراكك فوراً دون
          أي تأثير على بياناتك.
        </Alert>
      </div>

      {subscription.events.length > 0 && (
        <Card className="mt-3">
          <CardHeader title="سجل الاشتراك" icon={<CreditCard className="size-4" />} />
          <ul className="mt-3 divide-y divide-line-subtle">
            {subscription.events.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-primary">
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
        </Card>
      )}
    </>
  );
}

const EVENT_LABEL: Record<string, string> = {
  created: 'إنشاء الاشتراك',
  extended: 'تمديد الاشتراك',
  plan_changed: 'تغيير الخطة',
  suspended: 'تعليق الاشتراك',
  reactivated: 'إعادة تفعيل',
  canceled: 'إلغاء الاشتراك',
};

function PlanLimit({ label, value }: { label: string; value: number | null }) {
  return (
    <li className="flex items-start gap-2 text-[12.5px]">
      {value === null ? (
        <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
      ) : (
        <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
      )}
      <span className="text-secondary">
        {value === null ? (
          <>عدد غير محدود من ال{label}</>
        ) : (
          <>
            حتى <span className="num font-semibold text-primary">{value}</span> {label}
          </>
        )}
      </span>
    </li>
  );
}
