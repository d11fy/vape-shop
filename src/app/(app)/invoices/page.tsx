import type { Metadata } from 'next';
import { Plus } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { readPeriod, resolvePeriod, PERIOD_LABELS } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { listInvoices, listStoreCashiers } from '@/modules/invoices/queries';
import { InvoiceTable } from '@/modules/invoices/invoice-table';
import { ButtonLink } from '@/ui/primitives/button';
import { Card } from '@/ui/primitives/card';
import { FilterBar } from '@/ui/filters/filter-bar';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { firstParam, parseTableQuery } from '@/lib/table-query';

export const metadata: Metadata = { title: 'الفواتير' };

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requirePermission('sales.view');
  const { store, user } = context;
  const params = await searchParams;

  const query = parseTableQuery(params, { defaultSort: 'soldAt' });
  const period = readPeriod(params, 'this_month');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const seeAll = can(store, 'sales.view_all');
  const showProfit = can(store, 'reports.profit');

  const status = firstParam(params, 'status') ?? 'all';
  const paymentRaw = firstParam(params, 'payment');
  const paymentState =
    paymentRaw === 'paid' || paymentRaw === 'credit' || paymentRaw === 'partial'
      ? paymentRaw
      : undefined;
  const cashierId = firstParam(params, 'cashier');

  const [result, cashiers] = await Promise.all([
    listInvoices({
      storeId: store.id,
      branchId: store.branch.id,
      query,
      range,
      status,
      paymentState,
      cashierId: seeAll && cashierId && cashierId !== 'all' ? cashierId : undefined,
      onlyUserId: seeAll ? undefined : user.id,
    }),
    seeAll ? listStoreCashiers(store.id) : Promise.resolve([]),
  ]);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  return (
    <>
      <PageHeader
        title="الفواتير"
        description={`${PERIOD_LABELS[period.preset]} · ${store.branch.name}`}
        actions={
          can(store, 'sales.create') ? (
            <ButtonLink href="/pos" variant="accent" iconStart={<Plus className="size-4" />}>
                بيع جديد
              </ButtonLink>
          ) : undefined
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label="عدد الفواتير" value={fmt.number(result.total)} />
        <SummaryTile label="إجمالي المبيعات" value={fmt.money(result.totals.sales)} />
        <SummaryTile
          label="المستحق على العملاء"
          value={fmt.money(result.totals.due)}
          tone={result.totals.due > 0 ? 'warning' : undefined}
        />
        {showProfit ? (
          <SummaryTile
            label="مجمل الربح"
            value={fmt.money(result.totals.profit)}
            tone={result.totals.profit >= 0 ? 'success' : 'danger'}
          />
        ) : (
          <SummaryTile
            label="متوسط الفاتورة"
            value={fmt.money(result.total > 0 ? Math.round(result.totals.sales / result.total) : 0)}
          />
        )}
      </div>

      <FilterBar
        searchPlaceholder="رقم الفاتورة أو اسم العميل…"
        filters={[
          {
            key: 'status',
            label: 'الحالة',
            options: [
              { value: 'all', label: 'كل الحالات' },
              { value: 'COMPLETED', label: 'مكتملة' },
              { value: 'PARTIALLY_RETURNED', label: 'مرتجع جزئي' },
              { value: 'RETURNED', label: 'مرتجعة' },
              { value: 'CANCELED', label: 'ملغاة' },
            ],
          },
          {
            key: 'payment',
            label: 'حالة السداد',
            options: [
              { value: 'all', label: 'الكل' },
              { value: 'paid', label: 'مدفوعة بالكامل' },
              { value: 'credit', label: 'عليها متبقٍ' },
              { value: 'partial', label: 'مدفوعة جزئياً' },
            ],
          },
          ...(seeAll && cashiers.length > 1
            ? [
                {
                  key: 'cashier',
                  label: 'الكاشير',
                  options: [
                    { value: 'all', label: 'كل الموظفين' },
                    ...cashiers.map((cashier) => ({ value: cashier.id, label: cashier.name })),
                  ],
                },
              ]
            : []),
        ]}
      >
        <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
      </FilterBar>

      <InvoiceTable
        rows={result.rows}
        showProfit={showProfit}
        showCashier={seeAll}
        canCreate={can(store, 'sales.create')}
      />

      <Pagination
        total={result.total}
        page={query.page}
        perPage={query.perPage}
        unit="فاتورة"
      />
    </>
  );
}

function SummaryTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'warning' | 'danger';
}) {
  const color =
    tone === 'success'
      ? 'text-success'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-primary';

  return (
    <Card className="p-3.5 sm:p-4">
      <p className="text-[12px] text-secondary">{label}</p>
      <p className={`num mt-1.5 text-[19px] font-bold ${color}`}>{value}</p>
    </Card>
  );
}
