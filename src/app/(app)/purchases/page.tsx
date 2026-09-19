import type { Metadata } from 'next';
import { Plus, Truck } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { buildFormatter } from '@/lib/formatter';
import { listPurchases, listSupplierOptions } from '@/modules/suppliers/queries';
import { PurchaseTable } from '@/modules/purchases/purchase-table';
import { ButtonLink } from '@/ui/primitives/button';
import { FilterBar } from '@/ui/filters/filter-bar';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'المشتريات' };

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('purchases.view');
  const params = await searchParams;
  const query = parseTableQuery(params, { defaultSort: 'purchasedAt' });

  const [result, suppliers] = await Promise.all([
    listPurchases({
      storeId: store.id,
      branchId: store.branch.id,
      query,
      status: firstParam(params, 'status'),
      supplierId: firstParam(params, 'supplier'),
    }),
    listSupplierOptions(store.id),
  ]);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const canCreate = can(store, 'purchases.create') && !store.subscription.isReadOnly;

  return (
    <>
      <PageHeader
        title="المشتريات"
        description="فواتير الشراء واستلام البضاعة من الموردين"
        actions={
          <>
            <ButtonLink href="/suppliers" variant="outline" iconStart={<Truck className="size-4" />}>
                الموردون
              </ButtonLink>
            {canCreate && (
              <ButtonLink href="/purchases/new" variant="accent" iconStart={<Plus className="size-4" />}>
                  فاتورة شراء
                </ButtonLink>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="عدد الفواتير" value={fmt.number(result.total)} />
        <StatCard label="إجمالي المشتريات" value={fmt.money(result.totals.purchases)} />
        <StatCard
          label="مستحق للموردين"
          value={fmt.money(result.totals.due)}
          tone={result.totals.due > 0 ? 'warning' : 'default'}
        />
      </div>

      <FilterBar
        searchPlaceholder="رقم الفاتورة أو اسم المورد…"
        filters={[
          {
            key: 'status',
            label: 'الحالة',
            options: [
              { value: 'all', label: 'كل الحالات' },
              { value: 'DRAFT', label: 'مسودة' },
              { value: 'RECEIVED', label: 'مستلمة' },
              { value: 'CANCELED', label: 'ملغاة' },
            ],
          },
          {
            key: 'supplier',
            label: 'المورد',
            options: [
              { value: 'all', label: 'كل الموردين' },
              ...suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
            ],
          },
        ]}
      />

      <PurchaseTable rows={result.rows} canCreate={canCreate} />

      <Pagination total={result.total} page={query.page} perPage={query.perPage} unit="فاتورة" />
    </>
  );
}
