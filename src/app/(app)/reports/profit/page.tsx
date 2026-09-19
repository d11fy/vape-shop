import type { Metadata } from 'next';

import { can, requirePermission } from '@/core/auth/context';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { getProfitReport } from '@/modules/reports/queries';
import { CategoryDonut } from '@/modules/reports/report-charts';
import { ExportButton } from '@/modules/reports/report-shell';
import { Alert } from '@/ui/feedback/alert';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { StatCard, percentChange } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'الأرباح والخسائر' };

export default async function ProfitReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('reports.profit');
  const params = await searchParams;

  const period = readPeriod(params, 'this_month');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const report = await getProfitReport({
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

  // A classic P&L ladder: each line explains how the one below it was reached.
  const ladder = [
    { label: 'إجمالي المبيعات', value: report.revenue, kind: 'base' as const },
    ...(report.tax > 0
      ? [{ label: 'ناقص الضريبة المحصّلة', value: -report.tax, kind: 'minus' as const }]
      : []),
    ...(report.returnsImpact !== 0
      ? [
          {
            label: 'أثر المرتجعات',
            value: -report.returnsImpact,
            kind: 'minus' as const,
          },
        ]
      : []),
    { label: 'صافي الإيرادات', value: report.netRevenue, kind: 'subtotal' as const },
    { label: 'ناقص تكلفة البضاعة المباعة', value: -report.cogs, kind: 'minus' as const },
    { label: 'مجمل الربح', value: report.grossProfit, kind: 'subtotal' as const },
    { label: 'ناقص مصاريف التشغيل', value: -report.expenses, kind: 'minus' as const },
    { label: 'صافي الربح', value: report.netProfit, kind: 'total' as const },
  ];

  return (
    <>
      <PageHeader
        title="الأرباح والخسائر"
        description={`${range.label} · ${store.branch.name}`}
        backHref="/reports"
        breadcrumbs={[{ label: 'التقارير', href: '/reports' }, { label: 'الأرباح والخسائر' }]}
        actions={
          <>
            <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
            {can(store, 'reports.export') && (
              <ExportButton
                report="profit"
                params={{ period: period.preset, from: period.from, to: period.to }}
              />
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="صافي الإيرادات" value={fmt.money(report.netRevenue)} tone="accent" />
        <StatCard
          label="تكلفة البضاعة"
          value={fmt.money(report.cogs)}
          hint="بمتوسط التكلفة وقت البيع"
        />
        <StatCard
          label="مجمل الربح"
          value={fmt.money(report.grossProfit)}
          tone="success"
          delta={percentChange(report.grossProfit, report.previous.grossProfit)}
          deltaLabel={`هامش ${fmt.percent(report.grossMargin)}`}
        />
        <StatCard
          label="صافي الربح"
          value={fmt.money(report.netProfit)}
          tone={report.netProfit >= 0 ? 'success' : 'danger'}
          delta={percentChange(report.netProfit, report.previous.netProfit)}
          deltaLabel={`هامش ${fmt.percent(report.netMargin)}`}
        />
      </div>

      <Alert tone="info" className="mt-3">
        تكلفة البضاعة المباعة محسوبة من متوسط التكلفة المرجّح لكل صنف <strong>وقت البيع</strong>،
        وليست من أسعار الشراء الحالية — لذلك يبقى تقرير أي فترة سابقة صحيحاً حتى لو تغيّرت الأسعار
        بعدها.
      </Alert>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card padded={false}>
          <div className="border-b border-line-subtle px-4 py-3 sm:px-5">
            <h2 className="text-[15px] font-bold text-primary">قائمة الدخل</h2>
            <p className="text-[12.5px] text-secondary">من المبيعات إلى صافي الربح، خطوة بخطوة</p>
          </div>

          <ul className="divide-y divide-line-subtle">
            {ladder.map((line, index) => {
              const isTotal = line.kind === 'total';
              const isSubtotal = line.kind === 'subtotal';

              return (
                <li
                  key={`${line.label}-${index}`}
                  className={`flex items-baseline justify-between gap-3 px-4 py-3 sm:px-5 ${
                    isTotal ? 'bg-sunken/60' : isSubtotal ? 'bg-sunken/30' : ''
                  }`}
                >
                  <span
                    className={`text-[13.5px] ${
                      isTotal || isSubtotal ? 'font-bold text-primary' : 'text-secondary'
                    }`}
                  >
                    {line.label}
                  </span>
                  <span
                    className={`num shrink-0 font-bold ${
                      isTotal
                        ? `text-[20px] ${line.value >= 0 ? 'text-success' : 'text-danger'}`
                        : isSubtotal
                          ? 'text-[16px] text-primary'
                          : line.kind === 'minus'
                            ? 'text-[14px] text-danger'
                            : 'text-[14px] text-primary'
                    }`}
                  >
                    {line.kind === 'minus' ? '− ' : ''}
                    {fmt.money(Math.abs(line.value))}
                  </span>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-line-subtle bg-sunken/40 px-4 py-3 text-[12.5px] text-secondary sm:px-5">
            هامش مجمل الربح{' '}
            <span className="num font-bold text-primary">{fmt.percent(report.grossMargin)}</span> ·
            هامش صافي الربح{' '}
            <span
              className={`num font-bold ${report.netMargin >= 0 ? 'text-success' : 'text-danger'}`}
            >
              {fmt.percent(report.netMargin)}
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader title="المصاريف حسب الفئة" subtitle="أين يذهب المال" />
          <div className="mt-4">
            {report.expenseBreakdown.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-tertiary">
                لم تُسجَّل مصاريف في هذه الفترة
              </p>
            ) : (
              <CategoryDonut
                slices={report.expenseBreakdown}
                centerLabel="إجمالي المصاريف"
              />
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
