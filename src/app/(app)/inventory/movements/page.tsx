import type { Metadata } from 'next';

import { requirePermission } from '@/core/auth/context';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { listMovements } from '@/modules/inventory/queries';
import { MovementsTable } from '@/modules/inventory/movements-table';
import { FilterBar } from '@/ui/filters/filter-bar';
import { LinkTabs } from '@/ui/primitives/tabs';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { MOVEMENT_LABEL } from '@/modules/inventory/labels';

export const metadata: Metadata = { title: 'حركات المخزون' };

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('inventory.view');
  const params = await searchParams;

  const query = parseTableQuery(params, { defaultSort: 'occurredAt' });
  const period = readPeriod(params, 'last_30_days');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const result = await listMovements({
    storeId: store.id,
    branchId: store.branch.id,
    query,
    range,
    type: firstParam(params, 'type'),
    productId: firstParam(params, 'product'),
  });

  return (
    <>
      <PageHeader
        title="حركات المخزون"
        description="كل تغيير على الكميات ومصدره — سجل غير قابل للتعديل"
        backHref="/inventory"
      />

      <LinkTabs
        className="mb-4"
        items={[
          { href: '/inventory', label: 'الأصناف', exact: true },
          { href: '/inventory/movements', label: 'حركات المخزون' },
          { href: '/inventory/adjustments', label: 'التسويات' },
        ]}
      />

      <FilterBar
        searchPlaceholder="اسم المنتج أو الكود…"
        filters={[
          {
            key: 'type',
            label: 'نوع الحركة',
            options: [
              { value: 'all', label: 'كل الأنواع' },
              ...Object.entries(MOVEMENT_LABEL).map(([value, meta]) => ({
                value,
                label: meta.label,
              })),
            ],
          },
        ]}
      >
        <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
      </FilterBar>

      <MovementsTable rows={result.rows} />

      <Pagination total={result.total} page={query.page} perPage={query.perPage} unit="حركة" />
    </>
  );
}
