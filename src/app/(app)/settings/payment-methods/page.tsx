import type { Metadata } from 'next';

import { can, requirePermission } from '@/core/auth/context';
import { db } from '@/core/db';
import { PaymentMethodsView } from '@/modules/settings/payment-methods-view';
import { SettingsTabs } from '@/modules/settings/settings-tabs';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'طرق الدفع' };

export default async function PaymentMethodsPage() {
  const { store } = await requirePermission('settings.view');

  const methods = await db.paymentMethod.findMany({
    where: { storeId: store.id },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    select: {
      id: true,
      name: true,
      type: true,
      affectsCashbox: true,
      isDefault: true,
      isActive: true,
      _count: { select: { payments: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="طرق الدفع"
        description="الطرق المتاحة عند إتمام البيع وتحصيل الديون"
      />

      <SettingsTabs />

      <PaymentMethodsView
        methods={methods.map((method) => ({
          id: method.id,
          name: method.name,
          type: method.type,
          affectsCashbox: method.affectsCashbox,
          isDefault: method.isDefault,
          isActive: method.isActive,
          usageCount: method._count.payments,
        }))}
        canManage={can(store, 'settings.payment_methods') && !store.subscription.isReadOnly}
      />
    </>
  );
}
