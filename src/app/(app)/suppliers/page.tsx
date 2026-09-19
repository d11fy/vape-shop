import type { Metadata } from 'next';
import { Plus } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { buildFormatter } from '@/lib/formatter';
import { listSuppliers } from '@/modules/suppliers/queries';
import { SupplierTable } from '@/modules/suppliers/supplier-table';
import { ButtonLink } from '@/ui/primitives/button';
import { FilterBar } from '@/ui/filters/filter-bar';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'الموردون' };

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('suppliers.view');
  const params = await searchParams;
  const query = parseTableQuery(params, { defaultSort: 'name' });

  const result = await listSuppliers({
    storeId: store.id,
    query,
    creditorsOnly: firstParam(params, 'debt') === 'yes',
  });

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const canCreate = can(store, 'suppliers.create') && !store.subscription.isReadOnly;

  return (
    <>
      <PageHeader
        title="الموردون"
        description="حسابات الموردين ومستحقاتهم"
        actions={
          canCreate ? (
            <ButtonLink href="/suppliers/new" variant="accent" iconStart={<Plus className="size-4" />}>
                مورد جديد
              </ButtonLink>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="عدد الموردين" value={fmt.number(result.total)} />
        <StatCard
          label="إجمالي المستحق"
          value={fmt.money(result.summary.totalPayable)}
          tone={result.summary.totalPayable > 0 ? 'warning' : 'default'}
        />
        <StatCard label="موردون لهم مستحقات" value={fmt.number(result.summary.creditorCount)} />
      </div>

      <FilterBar
        searchPlaceholder="اسم المورد أو الشركة…"
        filters={[
          {
            key: 'debt',
            label: 'المستحقات',
            options: [
              { value: 'all', label: 'كل الموردين' },
              { value: 'yes', label: 'الذين لهم مستحقات' },
            ],
          },
        ]}
      />

      <SupplierTable
        rows={result.rows}
        canCreate={canCreate}
        canPay={can(store, 'suppliers.pay') && !store.subscription.isReadOnly}
      />

      <Pagination total={result.total} page={query.page} perPage={query.perPage} unit="مورد" />
    </>
  );
}
