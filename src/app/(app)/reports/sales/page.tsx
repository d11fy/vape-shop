import type { Metadata } from 'next';

import { can, requirePermission } from '@/core/auth/context';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { getSalesReport } from '@/modules/reports/queries';
import { DailySalesChart, HourlySalesChart, PaymentMixDonut } from '@/modules/reports/report-charts';
import { ExportButton, ReportMetric } from '@/modules/reports/report-shell';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { StatCard, percentChange } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'تقرير المبيعات' };

export default async function SalesReportPage({
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

  const report = await getSalesReport({
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

  const bestDay = [...report.daily].sort((a, b) => b.sales - a.sales)[0];

  return (
    <>
      <PageHeader
        title="تقرير المبيعات"
        description={`${range.label} · ${store.branch.name}`}
        backHref="/reports"
        breadcrumbs={[{ label: 'التقارير', href: '/reports' }, { label: 'المبيعات' }]}
        actions={
          <>
            <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
            {can(store, 'reports.export') && (
              <ExportButton
                report="sales"
                params={{ period: period.preset, from: period.from, to: period.to }}
              />
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="إجمالي المبيعات"
          value={fmt.money(report.totals.grossSales)}
          tone="accent"
          delta={percentChange(report.totals.netSales, report.previous.netSales)}
          deltaLabel="مقارنة بالفترة السابقة"
        />
        <StatCard
          label="عدد الفواتير"
          value={fmt.number(report.totals.invoiceCount)}
          delta={percentChange(report.totals.invoiceCount, report.previous.invoiceCount)}
          deltaLabel={`${fmt.number(report.totals.itemsSold)} صنف مباع`}
        />
        <StatCard label="متوسط الفاتورة" value={fmt.money(report.totals.averageInvoice)} />
        <StatCard
          label="صافي المبيعات"
          value={fmt.money(report.totals.netSales)}
          hint="بعد خصم المرتجعات"
          tone="success"
        />
      </div>

      <Card className="mt-3">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <ReportMetric label="الخصومات الممنوحة" value={fmt.money(report.totals.discounts)} />
          <ReportMetric
            label="المرتجعات"
            value={fmt.money(report.totals.returns)}
            tone={report.totals.returns > 0 ? 'warning' : undefined}
          />
          <ReportMetric label="الضريبة المحصّلة" value={fmt.money(report.totals.tax)} />
          <ReportMetric label="مبيعات نقدية" value={fmt.money(report.totals.cashSales)} />
          <ReportMetric
            label="مبيعات آجلة"
            value={fmt.money(report.totals.creditSales)}
            tone={report.totals.creditSales > 0 ? 'warning' : undefined}
          />
        </dl>
      </Card>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="حركة المبيعات اليومية"
            subtitle={
              bestDay && bestDay.sales > 0
                ? `أعلى يوم ${bestDay.date} بـ ${fmt.money(bestDay.sales)}`
                : range.label
            }
          />
          <div className="mt-4">
            <DailySalesChart data={report.daily} />
          </div>
        </Card>

        <Card>
          <CardHeader title="طرق الدفع" subtitle="توزيع المقبوضات" />
          <div className="mt-4">
            <PaymentMixDonut slices={report.byPaymentMethod} />
          </div>
        </Card>
      </div>

      {report.byHour.length > 0 && (
        <Card className="mt-3">
          <CardHeader
            title="المبيعات حسب ساعة اليوم"
            subtitle="متى يكون المحل في أوجّ نشاطه"
          />
          <div className="mt-4">
            <HourlySalesChart data={report.byHour} />
          </div>
        </Card>
      )}

      <Card className="mt-3" padded={false}>
        <div className="border-b border-line-subtle px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-bold text-primary">التفصيل اليومي</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-sunken/50 text-secondary">
              <tr>
                <th className="px-4 py-2.5 text-start font-semibold">التاريخ</th>
                <th className="px-4 py-2.5 text-center font-semibold">الفواتير</th>
                <th className="px-4 py-2.5 text-end font-semibold">المبيعات</th>
                <th className="px-4 py-2.5 text-end font-semibold">متوسط الفاتورة</th>
                {can(store, 'reports.profit') && (
                  <th className="px-4 py-2.5 text-end font-semibold">مجمل الربح</th>
                )}
              </tr>
            </thead>
            <tbody>
              {report.daily
                .filter((day) => day.invoices > 0)
                .reverse()
                .map((day) => (
                  <tr key={day.date} className="border-t border-line-subtle">
                    <td className="num px-4 py-2.5 text-primary">{day.date}</td>
                    <td className="num px-4 py-2.5 text-center text-secondary">{day.invoices}</td>
                    <td className="num px-4 py-2.5 text-end font-bold text-primary">
                      {fmt.money(day.sales)}
                    </td>
                    <td className="num px-4 py-2.5 text-end text-secondary">
                      {fmt.money(day.invoices > 0 ? Math.round(day.sales / day.invoices) : 0)}
                    </td>
                    {can(store, 'reports.profit') && (
                      <td className="num px-4 py-2.5 text-end text-success">
                        {fmt.money(day.profit)}
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
