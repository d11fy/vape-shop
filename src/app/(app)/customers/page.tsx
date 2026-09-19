import type { Metadata } from 'next';
import { Plus } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { buildFormatter } from '@/lib/formatter';
import { listCustomers } from '@/modules/customers/queries';
import { CustomerTable } from '@/modules/customers/customer-table';
import { ButtonLink } from '@/ui/primitives/button';
import { FilterBar } from '@/ui/filters/filter-bar';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'العملاء' };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('customers.view');
  const params = await searchParams;
  const query = parseTableQuery(params, { defaultSort: 'name' });

  const statusRaw = firstParam(params, 'status');
  const status =
    statusRaw === 'inactive' || statusRaw === 'all' ? statusRaw : ('active' as const);

  const result = await listCustomers({
    storeId: store.id,
    query,
    debtorsOnly: firstParam(params, 'debt') === 'yes',
    status,
    overdueDays: store.settings.debtOverdueDays,
  });

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const canCreate = can(store, 'customers.create') && !store.subscription.isReadOnly;
  const showDebt = can(store, 'debts.view');

  return (
    <>
      <PageHeader
        title="العملاء"
        description={`${result.total} عميل مسجّل`}
        actions={
          canCreate ? (
            <ButtonLink href="/customers/new" variant="accent" iconStart={<Plus className="size-4" />}>
                عميل جديد
              </ButtonLink>
          ) : undefined
        }
      />

      {showDebt && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="عدد العملاء" value={fmt.number(result.total)} />
          <StatCard
            label="إجمالي الديون"
            value={fmt.money(result.summary.totalDebt)}
            tone={result.summary.totalDebt > 0 ? 'warning' : 'default'}
            href="/debts"
          />
          <StatCard
            label="عملاء مدينون"
            value={fmt.number(result.summary.debtorCount)}
            href="/customers?debt=yes"
          />
          <StatCard
            label="ديون متأخرة"
            value={fmt.money(result.summary.overdueDebt)}
            hint={`أقدم من ${store.settings.debtOverdueDays} يوم`}
            tone={result.summary.overdueDebt > 0 ? 'danger' : 'default'}
            href="/debts?overdue=yes"
          />
        </div>
      )}

      <FilterBar
        searchPlaceholder="اسم العميل أو رقم الهاتف…"
        filters={[
          {
            key: 'debt',
            label: 'الرصيد',
            options: [
              { value: 'all', label: 'كل العملاء' },
              { value: 'yes', label: 'المدينون فقط' },
            ],
          },
          {
            key: 'status',
            label: 'الحالة',
            options: [
              { value: 'active', label: 'النشطون' },
              { value: 'inactive', label: 'الموقوفون' },
              { value: 'all', label: 'الكل' },
            ],
          },
        ]}
      />

      <CustomerTable
        rows={result.rows}
        canCreate={canCreate}
        searching={query.search !== ''}
        showDebtAge={showDebt}
      />

      <Pagination total={result.total} page={query.page} perPage={query.perPage} unit="عميل" />
    </>
  );
}
