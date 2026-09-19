import type { Metadata } from 'next';
import Link from 'next/link';
import { PackageX } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { getProductsReport } from '@/modules/reports/queries';
import { TopList } from '@/modules/reports/report-charts';
import { ExportButton } from '@/modules/reports/report-shell';
import { Card, CardHeader } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { PageHeader } from '@/ui/layout/page-header';
import { PeriodFilter } from '@/ui/filters/period-filter';

export const metadata: Metadata = { title: 'تقرير المنتجات' };

export default async function ProductsReportPage({
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

  const report = await getProductsReport({
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

  const showProfit = can(store, 'reports.profit');
  const byProfit = [...report.rows].sort((a, b) => b.profit - a.profit).slice(0, 8);
  const byQuantity = [...report.rows].sort((a, b) => b.quantitySold - a.quantitySold).slice(0, 8);

  return (
    <>
      <PageHeader
        title="تقرير المنتجات"
        description={`${range.label} · ${store.branch.name}`}
        backHref="/reports"
        breadcrumbs={[{ label: 'التقارير', href: '/reports' }, { label: 'المنتجات' }]}
        actions={
          <>
            <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
            {can(store, 'reports.export') && (
              <ExportButton
                report="products"
                params={{ period: period.preset, from: period.from, to: period.to }}
              />
            )}
          </>
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="الأكثر مبيعاً" subtitle="حسب قيمة المبيعات" />
          <div className="mt-4">
            <TopList
              items={report.rows.slice(0, 8).map((row) => ({
                id: row.variantId,
                label: row.name,
                sublabel: `${row.quantitySold.toLocaleString('en-US', {
                  maximumFractionDigits: 2,
                })} ${row.unitLabel}`,
                value: row.revenue,
              }))}
              emptyLabel="لم تُسجَّل مبيعات في هذه الفترة"
            />
          </div>
        </Card>

        {showProfit ? (
          <Card>
            <CardHeader title="الأكثر ربحاً" subtitle="حسب مجمل الربح" />
            <div className="mt-4">
              <TopList
                items={byProfit.map((row) => ({
                  id: row.variantId,
                  label: row.name,
                  sublabel: `هامش ${row.margin}%`,
                  value: row.profit,
                }))}
                color="var(--chart-2)"
                emptyLabel="لا توجد بيانات"
              />
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader title="الأكثر حركة" subtitle="حسب الكمية المباعة" />
            <div className="mt-4">
              <TopList
                items={byQuantity.map((row) => ({
                  id: row.variantId,
                  label: row.name,
                  sublabel: row.unitLabel,
                  value: row.revenue,
                }))}
                color="var(--chart-2)"
              />
            </div>
          </Card>
        )}
      </div>

      <Card className="mt-3" padded={false}>
        <div className="border-b border-line-subtle px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-bold text-primary">تفصيل المنتجات</h2>
          <p className="text-[12.5px] text-secondary">كل صنف بيع خلال الفترة</p>
        </div>

        {report.rows.length === 0 ? (
          <EmptyState
            variant="compact"
            icon={<PackageX className="size-6" />}
            title="لا توجد مبيعات"
            description="لم يُبَع أي صنف في الفترة المحددة."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-sunken/50 text-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-start font-semibold">الصنف</th>
                  <th className="px-4 py-2.5 text-start font-semibold">التصنيف</th>
                  <th className="px-4 py-2.5 text-center font-semibold">الكمية</th>
                  <th className="px-4 py-2.5 text-end font-semibold">الإيراد</th>
                  {showProfit && (
                    <>
                      <th className="px-4 py-2.5 text-end font-semibold">التكلفة</th>
                      <th className="px-4 py-2.5 text-end font-semibold">الربح</th>
                      <th className="px-4 py-2.5 text-end font-semibold">الهامش</th>
                    </>
                  )}
                  <th className="px-4 py-2.5 text-end font-semibold">المتوفر</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.variantId} className="border-t border-line-subtle">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/products/${row.productId}`}
                        className="font-semibold text-primary hover:text-accent-strong"
                      >
                        {row.name}
                      </Link>
                      <span className="num-mixed block text-[11.5px] text-tertiary">
                        {row.variantName !== 'افتراضي' ? `${row.variantName} · ` : ''}
                        {row.sku}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-secondary">{row.categoryName ?? '—'}</td>
                    <td className="num-mixed px-4 py-2.5 text-center text-secondary">
                      {row.quantitySold.toLocaleString('en-US', { maximumFractionDigits: 2 })}{' '}
                      <span className="text-tertiary">{row.unitLabel}</span>
                    </td>
                    <td className="num px-4 py-2.5 text-end font-bold text-primary">
                      {fmt.money(row.revenue)}
                    </td>
                    {showProfit && (
                      <>
                        <td className="num px-4 py-2.5 text-end text-secondary">
                          {fmt.money(row.cogs)}
                        </td>
                        <td className="num px-4 py-2.5 text-end font-semibold text-success">
                          {fmt.money(row.profit)}
                        </td>
                        <td className="num px-4 py-2.5 text-end text-secondary">
                          {fmt.percent(row.margin)}
                        </td>
                      </>
                    )}
                    <td className="num px-4 py-2.5 text-end text-secondary">
                      {row.currentStock.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {report.slowMovers.length > 0 && (
        <Card className="mt-3" padded={false}>
          <div className="border-b border-line-subtle px-4 py-3 sm:px-5">
            <h2 className="text-[15px] font-bold text-primary">المخزون الراكد</h2>
            <p className="text-[12.5px] text-secondary">
              أصناف عليها بضاعة ولم تُبع في هذه الفترة — مال معطّل على الرف
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-sunken/50 text-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-start font-semibold">الصنف</th>
                  <th className="px-4 py-2.5 text-end font-semibold">الكمية</th>
                  <th className="px-4 py-2.5 text-end font-semibold">القيمة بالتكلفة</th>
                  <th className="px-4 py-2.5 text-end font-semibold">آخر بيع</th>
                </tr>
              </thead>
              <tbody>
                {report.slowMovers.map((row) => (
                  <tr key={row.variantId} className="border-t border-line-subtle">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/products/${row.productId}`}
                        className="font-semibold text-primary hover:text-accent-strong"
                      >
                        {row.name}
                      </Link>
                      <span className="num block text-[11.5px] text-tertiary">{row.sku}</span>
                    </td>
                    <td className="num-mixed px-4 py-2.5 text-end text-secondary">
                      {row.stock.toLocaleString('en-US', { maximumFractionDigits: 2 })}{' '}
                      <span className="text-tertiary">{row.unitLabel}</span>
                    </td>
                    <td className="num px-4 py-2.5 text-end font-bold text-warning">
                      {fmt.money(row.stockValue)}
                    </td>
                    <td className="num-mixed px-4 py-2.5 text-end text-secondary">
                      {row.lastSoldAt
                        ? `${fmt.date(row.lastSoldAt)} (${row.daysSinceSale} يوم)`
                        : 'لم يُبَع أبداً'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
