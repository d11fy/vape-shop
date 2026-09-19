import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireWritePermission } from '@/core/auth/context';
import { getSupplier } from '@/modules/suppliers/queries';
import { SupplierForm } from '@/modules/suppliers/supplier-form';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'تعديل المورد' };

export default async function EditSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { store } = await requireWritePermission('suppliers.edit');
  const { id } = await params;

  const supplier = await getSupplier(store.id, id);
  if (!supplier) notFound();

  return (
    <>
      <PageHeader
        title={`تعديل ${supplier.name}`}
        backHref={`/suppliers/${supplier.id}`}
        breadcrumbs={[
          { label: 'الموردون', href: '/suppliers' },
          { label: supplier.name, href: `/suppliers/${supplier.id}` },
          { label: 'تعديل' },
        ]}
      />

      <SupplierForm
        supplier={{
          id: supplier.id,
          name: supplier.name,
          company: supplier.company ?? '',
          phone: supplier.phone ?? '',
          email: supplier.email ?? '',
          address: supplier.address ?? '',
          note: supplier.note ?? '',
          isActive: supplier.isActive,
          openingBalance: 0,
        }}
        allowOpeningBalance={false}
      />
    </>
  );
}
