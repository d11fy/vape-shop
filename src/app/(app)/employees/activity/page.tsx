import type { Metadata } from 'next';

import { can, requirePermission } from '@/core/auth/context';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { getEmployeeActivity, listEmployees } from '@/modules/employees/queries';
import { Alert } from '@/ui/feedback/alert';
import { Avatar } from '@/ui/primitives/avatar';
import { Card } from '@/ui/primitives/card';
import { LinkTabs } from '@/ui/primitives/tabs';
import { PageHeader } from '@/ui/layout/page-header';
import { PeriodFilter } from '@/ui/filters/period-filter';

export const metadata: Metadata = { title: 'نشاط الموظفين' };

export default async function EmployeeActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('reports.employees', 'employees.view');
  const params = await searchParams;

  const period = readPeriod(params, 'this_month');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const employees = await listEmployees(store.id);
  const active = employees.filter((employee) => employee.status === 'ACTIVE');

  const activity = await Promise.all(
    active.map(async (employee) => ({
      employee,
      metrics: await getEmployeeActivity(store.id, employee.userId, range),
    })),
  );

  // Ordered by recorded sales value — a description of volume, not a ranking of
  // people. The copy below says so explicitly.
  activity.sort((a, b) => b.metrics.salesTotal - a.metrics.salesTotal);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const showFinancials = can(store, 'dashboard.financials');

  return (
    <>
      <PageHeader
        title="نشاط الموظفين"
        description={range.label}
        backHref="/employees"
        actions={<PeriodFilter value={period.preset} from={period.from} to={period.to} />}
      />

      <LinkTabs
        className="mb-4"
        items={[
          { href: '/employees', label: 'الفريق', exact: true },
          { href: '/employees/roles', label: 'الأدوار والصلاحيات' },
          { href: '/employees/activity', label: 'النشاط' },
        ]}
      />

      <Alert tone="info" className="mb-4">
        هذه بيانات تشغيلية وصفية لما سُجِّل في النظام خلال الفترة — وليست تقييماً للأداء. عدد
        الفواتير يتأثر بالورديات وساعات العمل وطبيعة كل فرع.
      </Alert>

      <div className="space-y-2">
        {activity.map(({ employee, metrics }) => (
          <Card key={employee.membershipId}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={employee.name} src={employee.avatarUrl} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold text-primary">{employee.name}</p>
                  <p className="truncate text-[12.5px] text-secondary">{employee.roleName}</p>
                </div>
              </div>

              <dl className="grid flex-1 grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
                <Metric label="الفواتير" value={fmt.number(metrics.invoiceCount)} />
                <Metric label="قيمة المبيعات" value={fmt.money(metrics.salesTotal)} />
                <Metric label="متوسط الفاتورة" value={fmt.money(metrics.averageInvoice)} />
                <Metric label="الخصومات" value={fmt.money(metrics.discountsGiven)} />
                <Metric label="المرتجعات" value={fmt.number(metrics.returnsHandled)} />
                {showFinancials ? (
                  <Metric
                    label="فروق الصندوق"
                    value={fmt.money(metrics.cashDifference, { signed: true })}
                    tone={
                      metrics.cashDifference === 0
                        ? undefined
                        : metrics.cashDifference > 0
                          ? 'info'
                          : 'danger'
                    }
                  />
                ) : (
                  <Metric label="الورديات" value={fmt.number(metrics.shiftsClosed)} />
                )}
              </dl>
            </div>

            {(metrics.collections > 0 || metrics.expensesRecorded > 0) && (
              <div className="mt-3 flex flex-wrap gap-4 border-t border-line-subtle pt-3 text-[12px] text-secondary">
                {metrics.collections > 0 && (
                  <span>
                    تحصيل ديون:{' '}
                    <span className="num font-semibold text-primary">
                      {fmt.money(metrics.collections)}
                    </span>
                  </span>
                )}
                {metrics.expensesRecorded > 0 && (
                  <span>
                    مصاريف سجّلها:{' '}
                    <span className="num font-semibold text-primary">
                      {fmt.money(metrics.expensesRecorded)}
                    </span>
                  </span>
                )}
                <span>
                  عمليات مسجلة في سجل النشاط:{' '}
                  <span className="num font-semibold text-primary">
                    {fmt.number(metrics.auditCount)}
                  </span>
                </span>
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'info' | 'danger';
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-tertiary">{label}</dt>
      <dd
        className={`num truncate text-[14px] font-bold ${
          tone === 'danger' ? 'text-danger' : tone === 'info' ? 'text-info' : 'text-primary'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
