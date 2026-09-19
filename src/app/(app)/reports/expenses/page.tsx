import type { Metadata } from 'next';

import { can, requirePermission } from '@/core/auth/context';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { getExpensesReport } from '@/modules/reports/queries';
import { CategoryDonut, TopList } from '@/modules/reports/report-charts';
import { ExportButton } from '@/modules/reports/report-shell';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'تقرير المصاريف' };

export default async function ExpensesReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('expenses.view', 'reports.view');
  const params = await searchParams;

  const period = readPeriod(params, 'this_month');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const report = await getExpensesReport({
    storeId: store.id,
    branchId: store.branch.id,
    range,
    timezone: store.settings.timezone,
  });

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  return (
    <>
      <PageHeader
        title="تقرير المصاريف"
        description={`${range.label} · ${store.branch.name}`}
        backHref="/reports"
        breadcrumbs={[{ label: 'التقارير', href: '/reports' }, { label: 'المصاريف' }]}
        actions={
          <>
            <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
            {can(store, 'reports.export') && (
              <ExportButton
                report="expenses"
                params={{ period: period.preset, from: period.from, to: period.to }}
              />
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="إجمالي المصاريف" value={fmt.money(report.total)} tone="warning" />
        <StatCard label="عدد العمليات" value={fmt.number(report.count)} />
        <StatCard
          label="متوسط المصروف"
          value={fmt.money(report.count > 0 ? Math.round(report.total / report.count) : 0)}
        />
        <StatCard
          label="نسبة المصاريف للمبيعات"
          value={fmt.percent(report.salesComparison.ratio)}
          hint={`من ${fmt.money(report.salesComparison.sales)} مبيعات`}
          tone={report.salesComparison.ratio > 40 ? 'danger' : 'default'}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="المصاريف حسب الفئة" />
          <div className="mt-4">
            {report.byCategory.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-tertiary">
                لم تُسجَّل مصاريف في هذه الفترة
              </p>
            ) : (
              <CategoryDonut slices={report.byCategory} centerLabel="إجمالي المصاريف" />
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="حسب الموظف" subtitle="من سجّل المصاريف" />
          <div className="mt-4">
            <TopList
              items={report.byUser.map((row) => ({
                id: row.userId,
                label: row.name,
                sublabel: `${row.count} عملية`,
                value: row.amount,
              }))}
              color="var(--chart-5)"
              emptyLabel="لا توجد بيانات"
            />
          </div>
        </Card>
      </div>

      {report.monthly.length > 1 && (
        <Card className="mt-3">
          <CardHeader title="التوزيع الشهري" subtitle="لمتابعة اتجاه المصاريف" />
          <ul className="mt-4 space-y-2.5">
            {report.monthly.map((month) => {
              const max = Math.max(...report.monthly.map((entry) => entry.amount), 1);
              return (
                <li key={month.month}>
                  <div className="flex items-baseline justify-between">
                    <span className="num text-[13px] font-medium text-primary">{month.month}</span>
                    <span className="num text-[13px] font-bold text-primary">
                      {fmt.money(month.amount)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full bg-[var(--chart-5)]"
                      style={{ width: `${Math.max(2, (month.amount / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card className="mt-3" padded={false}>
        <div className="border-b border-line-subtle px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-bold text-primary">تفصيل الفئات</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-sunken/50 text-secondary">
              <tr>
                <th className="px-4 py-2.5 text-start font-semibold">الفئة</th>
                <th className="px-4 py-2.5 text-center font-semibold">عدد العمليات</th>
                <th className="px-4 py-2.5 text-end font-semibold">الإجمالي</th>
                <th className="px-4 py-2.5 text-end font-semibold">النسبة</th>
              </tr>
            </thead>
            <tbody>
              {report.byCategory.map((category) => (
                <tr key={category.id} className="border-t border-line-subtle">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: category.color ?? 'var(--chart-2)' }}
                        aria-hidden="true"
                      />
                      <span className="font-semibold text-primary">{category.name}</span>
                    </span>
                  </td>
                  <td className="num px-4 py-2.5 text-center text-secondary">{category.count}</td>
                  <td className="num px-4 py-2.5 text-end font-bold text-primary">
                    {fmt.money(category.amount)}
                  </td>
                  <td className="num px-4 py-2.5 text-end text-secondary">
                    {report.total > 0
                      ? fmt.percent(Math.round((category.amount / report.total) * 1000) / 10)
                      : '0%'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
