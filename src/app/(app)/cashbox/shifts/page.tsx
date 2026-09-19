import type { Metadata } from 'next';
import Link from 'next/link';

import { can, requirePermission } from '@/core/auth/context';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { listShifts } from '@/modules/cashbox/queries';
import { Badge } from '@/ui/primitives/badge';
import { Card } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { FilterBar } from '@/ui/filters/filter-bar';
import { LinkTabs } from '@/ui/primitives/tabs';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { Timer } from 'lucide-react';

export const metadata: Metadata = { title: 'الورديات' };

export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requirePermission('cashbox.view', 'shifts.open', 'shifts.close');
  const { store, user } = context;
  const params = await searchParams;

  const query = parseTableQuery(params, { defaultSort: 'openedAt' });
  const period = readPeriod(params, 'last_30_days');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  // Without `shifts.view_all`, a cashier sees only their own shifts.
  const seeAll = can(store, 'shifts.view_all');

  const result = await listShifts({
    storeId: store.id,
    branchId: store.branch.id,
    query,
    range,
    status: firstParam(params, 'status'),
    userId: seeAll ? undefined : user.id,
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
        title="الورديات"
        description={seeAll ? 'ورديات كل الموظفين' : 'ورديّاتك'}
        backHref="/cashbox"
      />

      <LinkTabs
        className="mb-4"
        items={[
          { href: '/cashbox', label: 'الحركة النقدية', exact: true },
          { href: '/cashbox/shifts', label: 'الورديات' },
        ]}
      />

      <FilterBar
        searchPlaceholder="رقم الوردية…"
        filters={[
          {
            key: 'status',
            label: 'الحالة',
            options: [
              { value: 'all', label: 'كل الحالات' },
              { value: 'OPEN', label: 'مفتوحة' },
              { value: 'CLOSED', label: 'مغلقة' },
            ],
          },
        ]}
      >
        <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
      </FilterBar>

      {result.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Timer className="size-6" />}
            title="لا توجد ورديات في هذه الفترة"
            description="افتح وردية من صفحة الصندوق قبل بدء البيع، وأغلقها في نهاية الدوام لتسوية النقدية."
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-2">
            {result.rows.map((shift) => (
              <li key={shift.id}>
                <Link href={`/cashbox/shifts/${shift.id}`}>
                  <Card className="transition-colors hover:border-line">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="num text-[14px] font-bold text-primary">
                            {shift.number}
                          </span>
                          <Badge
                            tone={shift.status === 'OPEN' ? 'accent' : 'neutral'}
                            size="sm"
                            dot={shift.status === 'OPEN'}
                          >
                            {shift.status === 'OPEN' ? 'مفتوحة' : 'مغلقة'}
                          </Badge>
                          {shift.status === 'CLOSED' && shift.difference !== 0 && (
                            <Badge tone={shift.difference > 0 ? 'info' : 'danger'} size="sm">
                              {shift.difference > 0 ? 'زيادة' : 'عجز'}{' '}
                              {fmt.money(Math.abs(shift.difference))}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-[12.5px] text-secondary">
                          {shift.userName} · {shift.branchName}
                        </p>
                        <p className="num mt-0.5 text-[11.5px] text-tertiary">
                          {fmt.dateTime(shift.openedAt)}
                          {shift.closedAt && ` ← ${fmt.time(shift.closedAt)}`}
                        </p>
                      </div>

                      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-end sm:grid-cols-4">
                        <Metric label="الفواتير" value={fmt.number(shift.invoiceCount)} />
                        <Metric label="المبيعات" value={fmt.money(shift.salesTotal)} />
                        <Metric label="نقدي" value={fmt.money(shift.cashSalesTotal)} />
                        <Metric
                          label={shift.status === 'OPEN' ? 'المتوقع' : 'الفعلي'}
                          value={fmt.money(
                            shift.status === 'OPEN'
                              ? shift.expectedCash
                              : (shift.actualCash ?? 0),
                          )}
                        />
                      </dl>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination
            total={result.total}
            page={query.page}
            perPage={query.perPage}
            unit="وردية"
          />
        </>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-tertiary">{label}</dt>
      <dd className="num text-[13.5px] font-bold text-primary">{value}</dd>
    </div>
  );
}
