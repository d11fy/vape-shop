import type { Metadata } from 'next';

import { can, requirePermission } from '@/core/auth/context';
import { db } from '@/core/db';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { buildFormatter } from '@/lib/formatter';
import { listCustomers } from '@/modules/customers/queries';
import { AgeingBuckets, DebtsTable } from '@/modules/customers/debts-view';
import { FilterBar } from '@/ui/filters/filter-bar';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'الديون' };

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('debts.view');
  const params = await searchParams;
  const query = parseTableQuery(params, { defaultSort: 'balance', defaultPerPage: 50 });

  const overdueOnly = firstParam(params, 'overdue') === 'yes';

  const [result, paymentMethods] = await Promise.all([
    listCustomers({
      storeId: store.id,
      query,
      debtorsOnly: true,
      overdueOnly,
      overdueDays: store.settings.debtOverdueDays,
      status: 'all',
    }),
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

  const canCollect = can(store, 'debts.collect') && !store.subscription.isReadOnly;
  const averageDebt =
    result.summary.debtorCount > 0
      ? Math.round(result.summary.totalDebt / result.summary.debtorCount)
      : 0;

  return (
    <>
      <PageHeader
        title="الديون"
        description="المبالغ المستحقة على العملاء ومتابعة تحصيلها"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="إجمالي الديون"
          value={fmt.money(result.summary.totalDebt)}
          tone={result.summary.totalDebt > 0 ? 'warning' : 'default'}
          hint={`${fmt.number(result.summary.debtorCount)} عميل مدين`}
        />
        <StatCard
          label="ديون متأخرة"
          value={fmt.money(result.summary.overdueDebt)}
          tone={result.summary.overdueDebt > 0 ? 'danger' : 'default'}
          hint={`أقدم من ${store.settings.debtOverdueDays} يوم`}
          href="/debts?overdue=yes"
        />
        <StatCard label="متوسط الدين للعميل" value={fmt.money(averageDebt)} />
        <StatCard
          label="نسبة المتأخر"
          value={
            result.summary.totalDebt > 0
              ? fmt.percent(
                  Math.round((result.summary.overdueDebt / result.summary.totalDebt) * 1000) / 10,
                )
              : '0%'
          }
          hint="من إجمالي الديون"
        />
      </div>

      <div className="mt-3">
        <AgeingBuckets rows={result.rows} overdueDays={store.settings.debtOverdueDays} />
      </div>

      <div className="mt-4">
        <FilterBar
          searchPlaceholder="اسم العميل أو رقم الهاتف…"
          filters={[
            {
              key: 'overdue',
              label: 'الفترة',
              options: [
                { value: 'all', label: 'كل الديون' },
                { value: 'yes', label: `متأخرة أكثر من ${store.settings.debtOverdueDays} يوم` },
              ],
            },
          ]}
        />

        <DebtsTable
          rows={result.rows}
          paymentMethods={paymentMethods}
          canCollect={canCollect}
          overdueDays={store.settings.debtOverdueDays}
        />

        <Pagination
          total={result.total}
          page={query.page}
          perPage={query.perPage}
          unit="عميل"
        />
      </div>
    </>
  );
}
