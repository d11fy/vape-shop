import type { Metadata } from 'next';

import { requirePlatformAdmin } from '@/core/auth/context';
import { buildFormatter } from '@/lib/formatter';
import { listPlans } from '@/modules/platform/queries';
import { PlansView } from '@/modules/platform/plans-view';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'خطط الاشتراك' };

export default async function PlatformPlansPage() {
  await requirePlatformAdmin();

  const plans = await listPlans();

  const fmt = buildFormatter({
    currency: 'SAR',
    decimals: 2,
    timezone: 'Asia/Riyadh',
    locale: 'ar',
  });

  return (
    <>
      <PageHeader
        title="خطط الاشتراك"
        description="الحدود والمزايا محفوظة في قاعدة البيانات — تعديلها لا يحتاج إصداراً جديداً"
      />

      <PlansView
        plans={plans.map((plan) => ({
          id: plan.id,
          code: plan.code,
          nameAr: plan.nameAr,
          nameEn: plan.nameEn,
          descriptionAr: plan.descriptionAr,
          monthlyPrice: Number(plan.monthlyPrice),
          yearlyPrice: Number(plan.yearlyPrice),
          trialDays: plan.trialDays,
          graceDays: plan.graceDays,
          maxEmployees: plan.maxEmployees,
          maxBranches: plan.maxBranches,
          maxProducts: plan.maxProducts,
          maxMonthlyInvoices: plan.maxMonthlyInvoices,
          features: plan.features,
          isPublic: plan.isPublic,
          isActive: plan.isActive,
          sortOrder: plan.sortOrder,
          subscriberCount: plan._count.subscriptions,
        }))}
      />
    </>
  );
}
