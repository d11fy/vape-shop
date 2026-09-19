import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowDownToLine, ArrowUpFromLine, Timer, Wallet } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import {
  CASH_TYPE_LABEL,
  getCashboxOverview,
  listCashMovements,
} from '@/modules/cashbox/queries';
import { CashboxActions, CashMovementsTable } from '@/modules/cashbox/cashbox-view';
import { Card } from '@/ui/primitives/card';
import { FilterBar } from '@/ui/filters/filter-bar';
import { LinkTabs } from '@/ui/primitives/tabs';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'الصندوق' };

export default async function CashboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('cashbox.view');
  const params = await searchParams;

  const query = parseTableQuery(params, { defaultSort: 'occurredAt' });
  const period = readPeriod(params, 'today');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const [overview, movements] = await Promise.all([
    getCashboxOverview(store.id, store.branch.id, range),
    listCashMovements({
      storeId: store.id,
      branchId: store.branch.id,
      query,
      range,
      type: firstParam(params, 'type'),
    }),
  ]);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const readOnly = store.subscription.isReadOnly;

  return (
    <>
      <PageHeader
        title="الصندوق"
        description={`${overview.cashboxName} · ${store.branch.name}`}
        actions={
          <CashboxActions
            openShift={overview.openShift}
            canManage={can(store, 'cashbox.manage') && !readOnly}
            canOpenShift={can(store, 'shifts.open') && !readOnly}
            canCloseShift={can(store, 'shifts.close') && !readOnly}
          />
        }
      />

      <LinkTabs
        className="mb-4"
        items={[
          { href: '/cashbox', label: 'الحركة النقدية', exact: true },
          { href: '/cashbox/shifts', label: 'الورديات' },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="الرصيد الحالي"
          value={fmt.money(overview.balance)}
          icon={<Wallet className="size-[18px]" />}
          tone="accent"
          hint="النقدية في الدرج الآن"
        />
        <StatCard
          label="الوارد"
          value={fmt.money(overview.period.inflow)}
          icon={<ArrowDownToLine className="size-[18px]" />}
          tone="success"
          hint={range.label}
        />
        <StatCard
          label="الصادر"
          value={fmt.money(overview.period.outflow)}
          icon={<ArrowUpFromLine className="size-[18px]" />}
          tone="danger"
          hint={range.label}
        />
        <StatCard
          label="صافي الحركة"
          value={fmt.money(overview.period.net, { signed: true })}
          tone={overview.period.net >= 0 ? 'success' : 'danger'}
          hint={range.label}
        />
      </div>

      {overview.openShift && (
        <Card className="mt-3 border-accent-border bg-accent-soft/40">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-full bg-accent-strong text-white">
                <Timer className="size-4" />
              </span>
              <div>
                <p className="text-[13.5px] font-bold text-primary">
                  وردية مفتوحة{' '}
                  <span className="num">{overview.openShift.number}</span>
                </p>
                <p className="num-mixed text-[12px] text-secondary">
                  {overview.openShift.userName} · منذ {fmt.time(overview.openShift.openedAt)} ·
                  افتتاحي {fmt.money(overview.openShift.openingCash)}
                </p>
              </div>
            </div>
            <Link
              href={`/cashbox/shifts/${overview.openShift.id}`}
              className="text-[12.5px] font-bold text-accent-strong hover:underline"
            >
              تفاصيل الوردية
            </Link>
          </div>
        </Card>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <BreakdownTile label="مبيعات نقدية" value={fmt.money(overview.period.salesCash)} />
        <BreakdownTile label="تحصيل ديون" value={fmt.money(overview.period.collections)} />
        <BreakdownTile label="مصاريف" value={fmt.money(overview.period.expenses)} negative />
        <BreakdownTile
          label="مدفوعات موردين"
          value={fmt.money(overview.period.supplierPayments)}
          negative
        />
        <BreakdownTile label="مرتجعات" value={fmt.money(overview.period.refunds)} negative />
      </div>

      <div className="mt-4">
        <FilterBar
          searchPlaceholder="وصف الحركة…"
          filters={[
            {
              key: 'type',
              label: 'نوع الحركة',
              options: [
                { value: 'all', label: 'كل الأنواع' },
                ...Object.entries(CASH_TYPE_LABEL).map(([value, label]) => ({ value, label })),
              ],
            },
          ]}
        >
          <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
        </FilterBar>

        <CashMovementsTable rows={movements.rows} />

        <Pagination
          total={movements.total}
          page={query.page}
          perPage={query.perPage}
          unit="حركة"
        />
      </div>
    </>
  );
}

function BreakdownTile({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <Card className="p-3.5">
      <p className="text-[11.5px] text-secondary">{label}</p>
      <p className={`num mt-1 text-[16px] font-bold ${negative ? 'text-danger' : 'text-success'}`}>
        {negative ? '−' : '+'} {value}
      </p>
    </Card>
  );
}
