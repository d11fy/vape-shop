import type { Metadata } from 'next';

import { requireWritePermission } from '@/core/auth/context';
import { CustomerForm } from '@/modules/customers/customer-form';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'عميل جديد' };

export default async function NewCustomerPage() {
  const { store } = await requireWritePermission('customers.create');

  return (
    <>
      <PageHeader
        title="عميل جديد"
        description="سجّل بيانات العميل لتتابع مشترياته وحسابه"
        backHref="/customers"
        breadcrumbs={[{ label: 'العملاء', href: '/customers' }, { label: 'عميل جديد' }]}
      />

      <CustomerForm
        defaultDebtLimit={store.settings.defaultDebtLimit}
        ageVerificationEnabled={store.settings.ageVerificationEnabled}
        minimumAge={store.settings.minimumCustomerAge}
        allowOpeningBalance
      />
    </>
  );
}
