import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireWritePermission } from '@/core/auth/context';
import { getCustomer } from '@/modules/customers/queries';
import { CustomerForm } from '@/modules/customers/customer-form';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'تعديل العميل' };

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { store } = await requireWritePermission('customers.edit');
  const { id } = await params;

  const customer = await getCustomer(store.id, id);
  if (!customer) notFound();

  return (
    <>
      <PageHeader
        title={`تعديل ${customer.name}`}
        backHref={`/customers/${customer.id}`}
        breadcrumbs={[
          { label: 'العملاء', href: '/customers' },
          { label: customer.name, href: `/customers/${customer.id}` },
          { label: 'تعديل' },
        ]}
      />

      <CustomerForm
        customer={{
          id: customer.id,
          name: customer.name,
          phone: customer.phone ?? '',
          email: customer.email ?? '',
          address: customer.address ?? '',
          note: customer.note ?? '',
          debtLimit: customer.debtLimit,
          ageVerified: customer.ageVerified,
          isActive: customer.isActive,
          openingBalance: 0,
        }}
        defaultDebtLimit={store.settings.defaultDebtLimit}
        ageVerificationEnabled={store.settings.ageVerificationEnabled}
        minimumAge={store.settings.minimumCustomerAge}
        // The balance is a ledger total; changing it goes through a documented
        // adjustment, not an edit form.
        allowOpeningBalance={false}
      />
    </>
  );
}
