import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { requirePermission } from '@/core/auth/context';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { getProfitReport, getSalesReport } from '@/modules/reports/queries';
import { REPORT_GROUPS, visibleReports } from '@/modules/reports/catalog';
import { NavIcon } from '@/modules/shell/nav-icon';
import { can } from '@/core/auth/context';
import { Card } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { StatCard, percentChange } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'التقارير' };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('reports.view');
  const params = await searchParams;

  const period = readPeriod(params, 'this_month');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const scope = {
    storeId: store.id,
    branchId: store.branch.id,
    range,
    timezone: store.settings.timezone,
  };

  const showProfit = can(store, 'reports.profit');

  const [sales, profit] = await Promise.all([
    getSalesReport(scope),
    showProfit ? getProfitReport(scope) : Promise.resolve(null),
  ]);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const reports = visibleReports(store.permissions, store.isOwner);

  return (
    <>
      <PageHeader
        title="مركز التقارير"
        description={`${range.label} · ${store.branch.name}`}
        actions={<PeriodFilter value={period.preset} from={period.from} to={period.to} />}
      />

      {/* Headline figures so the centre is useful on its own */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="صافي المبيعات"
          value={fmt.money(sales.totals.netSales)}
          delta={percentChange(sales.totals.netSales, sales.previous.netSales)}
          deltaLabel="مقارنة بالفترة السابقة"
          tone="accent"
        />
        <StatCard
          label="عدد الفواتير"
          value={fmt.number(sales.totals.invoiceCount)}
          delta={percentChange(sales.totals.invoiceCount, sales.previous.invoiceCount)}
          deltaLabel={`متوسط ${fmt.money(sales.totals.averageInvoice)}`}
        />
        {profit ? (
          <>
            <StatCard
              label="مجمل الربح"
              value={fmt.money(profit.grossProfit)}
              hint={`هامش ${fmt.percent(profit.grossMargin)}`}
              tone="success"
            />
            <StatCard
              label="صافي الربح"
              value={fmt.money(profit.netProfit)}
              delta={percentChange(profit.netProfit, profit.previous.netProfit)}
              tone={profit.netProfit >= 0 ? 'success' : 'danger'}
              deltaLabel={`هامش ${fmt.percent(profit.netMargin)}`}
            />
          </>
        ) : (
          <>
            <StatCard label="الخصومات" value={fmt.money(sales.totals.discounts)} />
            <StatCard label="المرتجعات" value={fmt.money(sales.totals.returns)} tone="warning" />
          </>
        )}
      </div>

      {/* Report catalogue */}
      <div className="mt-6 space-y-6">
        {REPORT_GROUPS.map((group) => {
          const groupReports = reports.filter((report) => report.group === group.key);
          if (groupReports.length === 0) return null;

          return (
            <section key={group.key}>
              <div className="mb-3">
                <h2 className="text-[15px] font-bold text-primary">{group.label}</h2>
                <p className="text-[12.5px] text-secondary">{group.description}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {groupReports.map((report) => (
                  <Link
                    key={report.key}
                    href={
                      report.href.includes('?')
                        ? report.href
                        : `${report.href}?period=${period.preset}${
                            period.from ? `&from=${period.from}&to=${period.to}` : ''
                          }`
                    }
                    className="group"
                  >
                    <Card className="flex h-full items-start gap-3 transition-all hover:border-accent-border hover:shadow-sm">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-sunken text-secondary transition-colors group-hover:bg-accent-soft group-hover:text-accent-strong">
                        <NavIcon name={report.icon} className="size-5" />
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-bold text-primary">
                          {report.title}
                        </span>
                        <span className="mt-1 block text-[12.5px] leading-relaxed text-secondary">
                          {report.description}
                        </span>
                      </span>

                      <ArrowLeft
                        className="mt-1 size-4 shrink-0 text-tertiary transition-transform group-hover:-translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
