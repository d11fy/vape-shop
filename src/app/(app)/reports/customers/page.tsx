import type { Metadata } from 'next';
import Link from 'next/link';
import { Users } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { getCustomersReport } from '@/modules/reports/queries';
import { TopList } from '@/modules/reports/report-charts';
import { ExportButton } from '@/modules/reports/report-shell';
import { Alert } from '@/ui/feedback/alert';
import { Card, CardHeader } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { PageHeader } from '@/ui/layout/page-header';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'تقرير العملاء' };

export default async function CustomersReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('reports.view', 'customers.view');
  const params = await searchParams;

  const period = readPeriod(params, 'this_month');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const report = await getCustomersReport({
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
        title="تقرير العملاء"
        description={`${range.label} · ${store.branch.name}`}
        backHref="/reports"
        breadcrumbs={[{ label: 'التقارير', href: '/reports' }, { label: 'العملاء' }]}
        actions={
          <>
            <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
            {can(store, 'reports.export') && (
              <ExportButton
                report="customers"
                params={{ period: period.preset, from: period.from, to: period.to }}
              />
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="عملاء اشتروا في الفترة"
          value={fmt.number(report.totals.activeCustomers)}
        />
        <StatCard label="عملاء جدد" value={fmt.number(report.totals.newCustomers)} tone="accent" />
        <StatCard
          label="متوسط قيمة العميل"
          value={fmt.money(report.totals.averageCustomerValue)}
        />
        <StatCard
          label="إجمالي الديون"
          value={fmt.money(report.totals.totalDebt)}
          hint={`${fmt.number(report.totals.withDebt)} عميل مدين`}
          tone={report.totals.totalDebt > 0 ? 'warning' : 'default'}
          href="/debts"
        />
      </div>

      <Alert tone="info" className="mt-3">
        هذا التقرير يعرض أرقام التعامل فقط. النظام لا ينشئ تصنيفات شخصية للعملاء ولا يستنتج
        خصائص عنهم.
      </Alert>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="أكثر العملاء شراءً" subtitle="حسب قيمة المشتريات في الفترة" />
          <div className="mt-4">
            <TopList
              items={report.top.slice(0, 8).map((customer) => ({
                id: customer.id,
                label: customer.name,
                sublabel: `${customer.invoiceCount} فاتورة`,
                value: customer.total,
              }))}
              emptyLabel="لم يشترِ أي عميل مسجّل في هذه الفترة"
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="أعلى الأرصدة المستحقة" subtitle="العملاء المدينون حالياً" />
          <div className="mt-4">
            <TopList
              items={report.top
                .filter((customer) => customer.balance > 0)
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 8)
                .map((customer) => ({
                  id: `${customer.id}-debt`,
                  label: customer.name,
                  value: customer.balance,
                }))}
              color="var(--status-warning)"
              emptyLabel="لا توجد ديون مستحقة"
            />
          </div>
        </Card>
      </div>

      <Card className="mt-3" padded={false}>
        <div className="border-b border-line-subtle px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-bold text-primary">تفصيل العملاء</h2>
        </div>

        {report.top.length === 0 ? (
          <EmptyState
            variant="compact"
            icon={<Users className="size-6" />}
            title="لا توجد مبيعات لعملاء مسجّلين"
            description="اربط الفواتير بالعملاء لتتابع تعاملهم معك."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-sunken/50 text-secondary">
                <tr>
                  <th className="px-4 py-2.5 text-start font-semibold">العميل</th>
                  <th className="px-4 py-2.5 text-center font-semibold">الفواتير</th>
                  <th className="px-4 py-2.5 text-end font-semibold">إجمالي المشتريات</th>
                  <th className="px-4 py-2.5 text-end font-semibold">متوسط الفاتورة</th>
                  <th className="px-4 py-2.5 text-end font-semibold">الرصيد</th>
                  <th className="px-4 py-2.5 text-end font-semibold">آخر شراء</th>
                </tr>
              </thead>
              <tbody>
                {report.top.map((customer) => (
                  <tr key={customer.id} className="border-t border-line-subtle">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="font-semibold text-primary hover:text-accent-strong"
                      >
                        {customer.name}
                      </Link>
                      {customer.phone && (
                        <span className="num block text-[11.5px] text-tertiary">
                          {customer.phone}
                        </span>
                      )}
                    </td>
                    <td className="num px-4 py-2.5 text-center text-secondary">
                      {customer.invoiceCount}
                    </td>
                    <td className="num px-4 py-2.5 text-end font-bold text-primary">
                      {fmt.money(customer.total)}
                    </td>
                    <td className="num px-4 py-2.5 text-end text-secondary">
                      {fmt.money(customer.averageInvoice)}
                    </td>
                    <td className="num px-4 py-2.5 text-end">
                      {customer.balance > 0 ? (
                        <span className="font-semibold text-warning">
                          {fmt.money(customer.balance)}
                        </span>
                      ) : (
                        <span className="text-tertiary">—</span>
                      )}
                    </td>
                    <td className="num px-4 py-2.5 text-end text-secondary">
                      {customer.lastPurchaseAt ? fmt.date(customer.lastPurchaseAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
