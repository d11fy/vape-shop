import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, PackageX } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { buildFormatter } from '@/lib/formatter';
import { getInventoryReport } from '@/modules/reports/queries';
import { ExportButton } from '@/modules/reports/report-shell';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'قيمة المخزون' };

export default async function InventoryReportPage() {
  const { store } = await requirePermission('inventory.view_value', 'reports.view');

  const report = await getInventoryReport(store.id, store.branch.id);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const margin =
    report.totalRetail > 0
      ? Math.round((report.potentialProfit / report.totalRetail) * 1000) / 10
      : 0;

  return (
    <>
      <PageHeader
        title="قيمة المخزون"
        description={`لحظة الآن · ${store.branch.name}`}
        backHref="/reports"
        breadcrumbs={[{ label: 'التقارير', href: '/reports' }, { label: 'قيمة المخزون' }]}
        actions={
          can(store, 'reports.export') ? (
            <ExportButton report="inventory" params={{}} />
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="القيمة بالتكلفة"
          value={fmt.money(report.totalCost)}
          hint="ما دفعته فعلياً للبضاعة"
          tone="accent"
        />
        <StatCard
          label="القيمة بسعر البيع"
          value={fmt.money(report.totalRetail)}
          hint="لو بيع كامل المخزون"
        />
        <StatCard
          label="الربح المتوقع"
          value={fmt.money(report.potentialProfit)}
          hint={`هامش ${fmt.percent(margin)}`}
          tone="success"
        />
        <StatCard
          label="أصناف تحتاج انتباه"
          value={fmt.number(report.lowStock + report.outOfStock)}
          hint={`${report.outOfStock} نفد · ${report.lowStock} منخفض`}
          tone={report.outOfStock > 0 ? 'danger' : report.lowStock > 0 ? 'warning' : 'default'}
          icon={<AlertTriangle className="size-[18px]" />}
          href="/inventory?status=low"
        />
      </div>

      <Card className="mt-3" padded={false}>
        <div className="border-b border-line-subtle px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-bold text-primary">القيمة حسب التصنيف</h2>
          <p className="text-[12.5px] text-secondary">
            {fmt.number(report.variantCount)} صنف متتبَّع في {store.branch.name}
          </p>
        </div>

        {report.byCategory.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
            <PackageX className="size-7 text-tertiary" aria-hidden="true" />
            <p className="text-[14px] font-semibold text-primary">لا يوجد مخزون</p>
            <p className="text-[13px] text-secondary">
              أضف منتجات وسجّل فواتير شراء لتظهر قيمة المخزون هنا.
            </p>
            <Link
              href="/purchases/new"
              className="mt-2 text-[13px] font-bold text-accent-strong hover:underline"
            >
              تسجيل فاتورة شراء
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-sunken/50 text-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-start font-semibold">التصنيف</th>
                  <th className="px-4 py-2.5 text-center font-semibold">عدد الأصناف</th>
                  <th className="px-4 py-2.5 text-end font-semibold">القيمة بالتكلفة</th>
                  <th className="px-4 py-2.5 text-end font-semibold">القيمة بالبيع</th>
                  <th className="px-4 py-2.5 text-end font-semibold">الربح المتوقع</th>
                  <th className="px-4 py-2.5 text-end font-semibold">النسبة من المخزون</th>
                </tr>
              </thead>
              <tbody>
                {report.byCategory.map((category) => (
                  <tr key={category.name} className="border-t border-line-subtle">
                    <td className="px-4 py-2.5 font-semibold text-primary">{category.name}</td>
                    <td className="num px-4 py-2.5 text-center text-secondary">
                      {category.variantCount}
                    </td>
                    <td className="num px-4 py-2.5 text-end font-bold text-primary">
                      {fmt.money(category.cost)}
                    </td>
                    <td className="num px-4 py-2.5 text-end text-secondary">
                      {fmt.money(category.retail)}
                    </td>
                    <td className="num px-4 py-2.5 text-end text-success">
                      {fmt.money(category.retail - category.cost)}
                    </td>
                    <td className="num px-4 py-2.5 text-end text-secondary">
                      {report.totalCost > 0
                        ? fmt.percent(Math.round((category.cost / report.totalCost) * 1000) / 10)
                        : '0%'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-sunken/60">
                <tr>
                  <td className="px-4 py-3 font-bold text-primary">الإجمالي</td>
                  <td className="num px-4 py-3 text-center font-bold text-primary">
                    {report.variantCount}
                  </td>
                  <td className="num px-4 py-3 text-end font-bold text-primary">
                    {fmt.money(report.totalCost)}
                  </td>
                  <td className="num px-4 py-3 text-end font-bold text-primary">
                    {fmt.money(report.totalRetail)}
                  </td>
                  <td className="num px-4 py-3 text-end font-bold text-success">
                    {fmt.money(report.potentialProfit)}
                  </td>
                  <td className="num px-4 py-3 text-end text-secondary">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
