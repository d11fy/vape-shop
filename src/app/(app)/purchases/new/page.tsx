import type { Metadata } from 'next';
import Link from 'next/link';

import { can, requireWritePermission } from '@/core/auth/context';
import { db } from '@/core/db';
import { listSupplierOptions } from '@/modules/suppliers/queries';
import { PurchaseForm } from '@/modules/purchases/purchase-form';
import { Alert } from '@/ui/feedback/alert';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'فاتورة شراء جديدة' };

export default async function NewPurchasePage() {
  const { store } = await requireWritePermission('purchases.create');

  const [suppliers, paymentMethods] = await Promise.all([
    listSupplierOptions(store.id),
    db.paymentMethod.findMany({
      where: { storeId: store.id, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
      select: { id: true, name: true, affectsCashbox: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="فاتورة شراء جديدة"
        description="سجّل البضاعة الواردة من المورد لتحديث المخزون والتكلفة"
        backHref="/purchases"
        breadcrumbs={[{ label: 'المشتريات', href: '/purchases' }, { label: 'فاتورة جديدة' }]}
      />

      {suppliers.length === 0 ? (
        <Alert tone="warning" title="لا يوجد موردون">
          أضف مورداً أولاً قبل تسجيل فاتورة شراء.{' '}
          <Link href="/suppliers/new" className="font-bold text-accent-strong hover:underline">
            إضافة مورد
          </Link>
        </Alert>
      ) : (
        <PurchaseForm
          suppliers={suppliers.map((supplier) => ({
            id: supplier.id,
            name: supplier.name,
            balance: Number(supplier.balance),
          }))}
          paymentMethods={paymentMethods}
          canReceive={can(store, 'purchases.receive')}
          branchName={store.branch.name}
        />
      )}
    </>
  );
}
