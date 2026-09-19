import type { Metadata } from 'next';
import { FolderTree } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { db } from '@/core/db';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { listExpenseCategories, listExpenses } from '@/modules/expenses/queries';
import { ExpenseBreakdown, ExpenseButton, ExpenseTable } from '@/modules/expenses/expense-view';
import { ButtonLink } from '@/ui/primitives/button';
import { FilterBar } from '@/ui/filters/filter-bar';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'المصاريف' };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('expenses.view');
  const params = await searchParams;

  const query = parseTableQuery(params, { defaultSort: 'spentAt' });
  const period = readPeriod(params, 'this_month');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const [result, categories, paymentMethods] = await Promise.all([
    listExpenses({
      storeId: store.id,
      branchId: store.branch.id,
      query,
      range,
      categoryId: firstParam(params, 'category'),
    }),
    listExpenseCategories(store.id),
    db.paymentMethod.findMany({
      where: { storeId: store.id, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
      select: { id: true, name: true, affectsCashbox: true },
    }),
  ]);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const activeCategories = categories
    .filter((category) => category.isActive)
    .map((category) => ({ id: category.id, name: category.name, color: category.color }));

  const readOnly = store.subscription.isReadOnly;
  const canCreate = can(store, 'expenses.create') && !readOnly;

  return (
    <>
      <PageHeader
        title="المصاريف"
        description={`${range.label} · ${store.branch.name}`}
        actions={
          <>
            {can(store, 'expenses.manage_categories') && (
              <ButtonLink
                href="/expenses/categories"
                variant="outline"
                iconStart={<FolderTree className="size-4" />}
              >
                الفئات
              </ButtonLink>
            )}
            {canCreate && (
              <ExpenseButton
                categories={activeCategories}
                paymentMethods={paymentMethods}
                defaultOpen={firstParam(params, 'new') === '1'}
              />
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="إجمالي المصاريف"
          value={fmt.money(result.totals.amount)}
          tone="warning"
          hint={range.label}
        />
        <StatCard label="عدد المصاريف" value={fmt.number(result.totals.count)} />
        <StatCard label="متوسط المصروف" value={fmt.money(result.totals.average)} />
      </div>

      <div className="mt-3">
        <ExpenseBreakdown categories={result.byCategory} />
      </div>

      <div className="mt-4">
        <FilterBar
          searchPlaceholder="بيان المصروف…"
          filters={[
            {
              key: 'category',
              label: 'الفئة',
              options: [
                { value: 'all', label: 'كل الفئات' },
                ...categories.map((category) => ({ value: category.id, label: category.name })),
              ],
            },
          ]}
        >
          <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
        </FilterBar>

        <ExpenseTable
          rows={result.rows}
          categories={activeCategories}
          paymentMethods={paymentMethods}
          canCreate={canCreate}
          canEdit={can(store, 'expenses.edit') && !readOnly}
          canDelete={can(store, 'expenses.delete') && !readOnly}
        />

        <Pagination
          total={result.total}
          page={query.page}
          perPage={query.perPage}
          unit="مصروف"
        />
      </div>
    </>
  );
}
