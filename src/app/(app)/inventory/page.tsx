import type { Metadata } from 'next';
import { AlertTriangle, ClipboardCheck, History, PackageX } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { buildFormatter } from '@/lib/formatter';
import { listInventory } from '@/modules/inventory/queries';
import { listCategories } from '@/modules/products/queries';
import { InventoryTable } from '@/modules/inventory/inventory-table';
import { ButtonLink } from '@/ui/primitives/button';
import { FilterBar } from '@/ui/filters/filter-bar';
import { LinkTabs } from '@/ui/primitives/tabs';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'المخزون' };

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('inventory.view');
  const params = await searchParams;
  const query = parseTableQuery(params, { defaultSort: 'state' });

  const stateRaw = firstParam(params, 'status');
  const state = stateRaw === 'low' || stateRaw === 'out' || stateRaw === 'ok' ? stateRaw : undefined;

  const [result, categories] = await Promise.all([
    listInventory({
      storeId: store.id,
      branchId: store.branch.id,
      query,
      categoryId: firstParam(params, 'category'),
      state,
      productId: firstParam(params, 'product'),
    }),
    listCategories(store.id),
  ]);

  const showValue = can(store, 'inventory.view_value');
  const canAdjust = can(store, 'inventory.adjust') && !store.subscription.isReadOnly;

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  return (
    <>
      <PageHeader
        title="المخزون"
        description={`${store.branch.name} · ${result.summary.variantCount} صنف متتبَّع`}
        actions={
          <>
            <ButtonLink href="/inventory/movements" variant="outline" iconStart={<History className="size-4" />}>
                سجل الحركات
              </ButtonLink>
            {canAdjust && (
              <ButtonLink href="/inventory/count" variant="accent" iconStart={<ClipboardCheck className="size-4" />}>
                  جرد وتسوية
                </ButtonLink>
            )}
          </>
        }
      />

      <LinkTabs
        className="mb-4"
        items={[
          { href: '/inventory', label: 'الأصناف', exact: true },
          { href: '/inventory/movements', label: 'حركات المخزون' },
          { href: '/inventory/adjustments', label: 'التسويات' },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {showValue && (
          <StatCard
            label="قيمة المخزون بالتكلفة"
            value={fmt.money(result.summary.totalValue)}
            hint="بمتوسط التكلفة المرجّح"
          />
        )}
        {showValue && (
          <StatCard
            label="قيمة المخزون بالبيع"
            value={fmt.money(result.summary.retailValue)}
            hint="لو بيع كامل المخزون بالسعر الحالي"
          />
        )}
        <StatCard
          label="أصناف منخفضة"
          value={fmt.number(result.summary.lowCount)}
          icon={<AlertTriangle className="size-[18px]" />}
          tone={result.summary.lowCount > 0 ? 'warning' : 'default'}
          href="/inventory?status=low"
        />
        <StatCard
          label="أصناف نافدة"
          value={fmt.number(result.summary.outCount)}
          icon={<PackageX className="size-[18px]" />}
          tone={result.summary.outCount > 0 ? 'danger' : 'default'}
          href="/inventory?status=out"
        />
      </div>

      <div className="mt-4">
        <FilterBar
          searchPlaceholder="اسم المنتج أو الكود…"
          filters={[
            {
              key: 'category',
              label: 'التصنيف',
              options: [
                { value: 'all', label: 'كل التصنيفات' },
                ...categories.map((category) => ({ value: category.id, label: category.name })),
              ],
            },
            {
              key: 'status',
              label: 'الحالة',
              options: [
                { value: 'all', label: 'كل الحالات' },
                { value: 'ok', label: 'متوفر' },
                { value: 'low', label: 'منخفض' },
                { value: 'out', label: 'نفد' },
              ],
            },
          ]}
        />

        <InventoryTable rows={result.rows} showValue={showValue} canAdjust={canAdjust} />

        <Pagination total={result.total} page={query.page} perPage={query.perPage} unit="صنف" />
      </div>
    </>
  );
}
