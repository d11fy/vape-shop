import type { Metadata } from 'next';

import { requireWritePermission } from '@/core/auth/context';
import { SupplierForm } from '@/modules/suppliers/supplier-form';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'مورد جديد' };

export default async function NewSupplierPage() {
  await requireWritePermission('suppliers.create');

  return (
    <>
      <PageHeader
        title="مورد جديد"
        description="سجّل بيانات المورد لتتابع مشترياتك منه ومستحقاته"
        backHref="/suppliers"
        breadcrumbs={[{ label: 'الموردون', href: '/suppliers' }, { label: 'مورد جديد' }]}
      />
      <SupplierForm allowOpeningBalance />
    </>
  );
}
