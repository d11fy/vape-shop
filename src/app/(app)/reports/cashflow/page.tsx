import type { Metadata } from 'next';

import { can, requirePermission } from '@/core/auth/context';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { getCashFlowReport } from '@/modules/reports/queries';
import { CASH_TYPE_LABEL } from '@/modules/cashbox/queries';
import { CashFlowChart } from '@/modules/reports/report-charts';
import { ExportButton } from '@/modules/reports/report-shell';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { StatCard } from '@/ui/data/stat-card';
import type { CashboxTxnType } from '@/generated/prisma/enums';

export const metadata: Metadata = { title: 'التدفق النقدي' };

export default async function CashFlowReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('cashbox.view', 'reports.view');
  const params = await searchParams;

  const period = readPeriod(params, 'this_month');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const report = await getCashFlowReport({
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

  const net = report.inflow - report.outflow;

  return (
    <>
      <PageHeader
        title="التدفق النقدي"
        description={`${range.label} · ${store.branch.name}`}
        backHref="/reports"
        breadcrumbs={[{ label: 'التقارير', href: '/reports' }, { label: 'التدفق النقدي' }]}
        actions={
          <>
            <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
            {can(store, 'reports.export') && (
              <ExportButton
                report="cashflow"
                params={{ period: period.preset, from: period.from, to: period.to }}
              />
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="الرصيد الافتتاحي" value={fmt.money(report.opening)} />
        <StatCard label="الوارد" value={fmt.money(report.inflow)} tone="success" />
        <StatCard label="الصادر" value={fmt.money(report.outflow)} tone="danger" />
        <StatCard
          label="صافي الحركة"
          value={fmt.money(net, { signed: true })}
          tone={net >= 0 ? 'success' : 'danger'}
        />
        <StatCard label="الرصيد الختامي" value={fmt.money(report.closing)} tone="accent" />
      </div>

      <Card className="mt-3">
        <CardHeader
          title="الوارد والصادر يومياً"
          subtitle="الخط المتصل للوارد، المتقطع للصادر"
        />
        <div className="mt-4">
          <CashFlowChart data={report.daily} />
        </div>
      </Card>

      <Card className="mt-3" padded={false}>
        <div className="border-b border-line-subtle px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-bold text-primary">التفصيل حسب نوع الحركة</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-sunken/50 text-secondary">
              <tr>
                <th className="px-4 py-2.5 text-start font-semibold">نوع الحركة</th>
                <th className="px-4 py-2.5 text-center font-semibold">عدد الحركات</th>
                <th className="px-4 py-2.5 text-end font-semibold">الصافي</th>
              </tr>
            </thead>
            <tbody>
              {report.byType.map((row) => (
                <tr key={row.type} className="border-t border-line-subtle">
                  <td className="px-4 py-2.5 font-semibold text-primary">
                    {CASH_TYPE_LABEL[row.type as CashboxTxnType] ?? row.type}
                  </td>
                  <td className="num px-4 py-2.5 text-center text-secondary">{row.count}</td>
                  <td
                    className={`num px-4 py-2.5 text-end font-bold ${
                      row.amount >= 0 ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {fmt.money(row.amount, { signed: true })}
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
