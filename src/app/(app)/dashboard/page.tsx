import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  HandCoins,
  PackageX,
  Receipt,
  ShoppingCart,
  TrendingUp,
  Truck,
  Wallet,
} from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { getDashboardSnapshot } from '@/modules/dashboard/queries';
import {
  MoneyText,
  DateText,
  PaymentMixChart,
  SalesTrend,
  StaffBars,
  TopProductsChart,
} from '@/modules/dashboard/dashboard-charts';
import { Badge } from '@/ui/primitives/badge';
import { Card, CardHeader } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { PageHeader } from '@/ui/layout/page-header';
import { PeriodFilter } from '@/ui/filters/period-filter';
import { StatCard, percentChange } from '@/ui/data/stat-card';
import { buildFormatter } from '@/lib/formatter';

export const metadata: Metadata = { title: 'الرئيسية' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store, user } = await requirePermission('dashboard.view');
  const params = await searchParams;
  const period = readPeriod(params, 'today');

  const showFinancials = can(store, 'dashboard.financials');
  const showProfit = can(store, 'reports.profit');

  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const snapshot = await getDashboardSnapshot({
    storeId: store.id,
    branchId: store.branch.id,
    range,
    timezone: store.settings.timezone,
    includeFinancials: showFinancials,
    debtOverdueDays: store.settings.debtOverdueDays,
  });

  // Server-side formatter mirrors the client context exactly.
  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const { current, previous, balances, counts } = snapshot;
  const firstName = user.name.split(' ')[0] ?? user.name;

  return (
    <>
      <PageHeader
        title={`أهلاً ${firstName}`}
        description={`${store.branch.name} · ${range.label}`}
        actions={
          <PeriodFilter value={period.preset} from={period.from} to={period.to} />
        }
      />

      {/* ── Headline numbers ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="المبيعات"
          value={fmt.money(current.salesTotal)}
          icon={<ShoppingCart className="size-[18px]" />}
          tone="accent"
          delta={percentChange(current.salesTotal, previous.salesTotal)}
          deltaLabel="مقارنة بالفترة السابقة"
        />
        <StatCard
          label="عدد الفواتير"
          value={fmt.number(current.invoiceCount)}
          icon={<Receipt className="size-[18px]" />}
          delta={percentChange(current.invoiceCount, previous.invoiceCount)}
          deltaLabel={`متوسط الفاتورة ${fmt.money(current.averageInvoice)}`}
        />
        {showProfit ? (
          <StatCard
            label="مجمل الربح"
            value={fmt.money(current.grossProfit)}
            icon={<TrendingUp className="size-[18px]" />}
            tone="success"
            delta={percentChange(current.grossProfit, previous.grossProfit)}
            deltaLabel="بعد خصم تكلفة البضاعة"
          />
        ) : (
          <StatCard
            label="المبيعات النقدية"
            value={fmt.money(current.cashCollected)}
            icon={<Banknote className="size-[18px]" />}
            delta={percentChange(current.cashCollected, previous.cashCollected)}
          />
        )}
        <StatCard
          label="المصاريف"
          value={fmt.money(current.expenses)}
          icon={<Receipt className="size-[18px]" />}
          tone="warning"
          delta={percentChange(current.expenses, previous.expenses)}
          invertDelta
          deltaLabel="ارتفاع المصاريف غير مرغوب"
        />
      </div>

      {showProfit && (
        <div className="mt-3">
          <NetProfitBar
            revenue={current.netRevenue}
            cogs={current.cogsTotal}
            expenses={current.expenses}
            tax={current.taxTotal}
            net={current.netProfit}
            fmt={fmt}
          />
        </div>
      )}

      {/* ── Balances ──────────────────────────────────────────────────────── */}
      {showFinancials && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="رصيد الصندوق"
            value={fmt.money(balances.cashbox)}
            icon={<Wallet className="size-[18px]" />}
            hint="نقدي في الدرج"
            href="/cashbox"
          />
          <StatCard
            label="مستحق على العملاء"
            value={fmt.money(balances.receivables)}
            icon={<HandCoins className="size-[18px]" />}
            tone={balances.overdueReceivables > 0 ? 'danger' : 'default'}
            hint={
              balances.overdueReceivables > 0
                ? `منها ${fmt.money(balances.overdueReceivables)} متأخر`
                : 'لا توجد ديون متأخرة'
            }
            href="/debts"
          />
          <StatCard
            label="مستحق للموردين"
            value={fmt.money(balances.payables)}
            icon={<Truck className="size-[18px]" />}
            hint="أرصدة الموردين"
            href="/suppliers"
          />
          <StatCard
            label="قيمة المخزون"
            value={fmt.money(balances.inventoryValue)}
            icon={<PackageX className="size-[18px]" />}
            hint="بسعر التكلفة"
            href="/inventory"
          />
        </div>
      )}

      {/* ── Alerts ────────────────────────────────────────────────────────── */}
      {(counts.lowStock > 0 || counts.outOfStock > 0) && (
        <Link
          href="/inventory?status=low"
          className="mt-3 flex items-center gap-3 rounded-[var(--radius-md)] border border-warning-border bg-warning-soft px-4 py-3 transition-colors hover:brightness-[0.98]"
        >
          <AlertTriangle className="size-[18px] shrink-0 text-warning" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[13px] text-primary">
            <span className="font-bold">
              {counts.outOfStock > 0 && `${fmt.number(counts.outOfStock)} صنف نفد`}
              {counts.outOfStock > 0 && counts.lowStock > 0 && ' · '}
              {counts.lowStock > 0 && `${fmt.number(counts.lowStock)} صنف قارب على النفاد`}
            </span>
            <span className="mx-1.5 text-tertiary">—</span>
            <span className="text-secondary">راجع المخزون وأعد الطلب من الموردين</span>
          </p>
          <ArrowLeft className="size-4 shrink-0 text-secondary" aria-hidden="true" />
        </Link>
      )}

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <div className="mt-5 grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="حركة المبيعات"
            subtitle={range.label}
            action={
              <Badge tone="neutral" size="sm">
                {fmt.money(current.salesTotal)}
              </Badge>
            }
          />
          <div className="mt-4">
            <SalesTrend data={snapshot.series} />
          </div>
        </Card>

        <Card>
          <CardHeader title="طرق الدفع" subtitle="توزيع المقبوضات" />
          <div className="mt-4">
            <PaymentMixChart slices={snapshot.paymentMix} />
          </div>
        </Card>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="الأكثر مبيعاً"
            subtitle="حسب قيمة المبيعات"
            action={
              <Link
                href="/reports/products"
                className="text-[12.5px] font-semibold text-accent-strong hover:underline"
              >
                التقرير الكامل
              </Link>
            }
          />
          <div className="mt-4">
            <TopProductsChart items={snapshot.topProducts} />
          </div>
        </Card>

        {can(store, 'reports.employees') ? (
          <Card>
            <CardHeader title="نشاط الفريق" subtitle="عدد وقيمة الفواتير المسجلة" />
            <div className="mt-4">
              <StaffBars items={snapshot.staffLeaderboard} />
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader title="آخر المصاريف" subtitle="أحدث خمس عمليات" />
            <RecentExpenses items={snapshot.recentExpenses} />
          </Card>
        )}
      </div>

      {/* ── Activity ──────────────────────────────────────────────────────── */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="أحدث الفواتير"
            action={
              <Link
                href="/invoices"
                className="text-[12.5px] font-semibold text-accent-strong hover:underline"
              >
                عرض الكل
              </Link>
            }
          />
          {snapshot.recentSales.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={<ShoppingCart className="size-6" />}
              title="لا توجد فواتير بعد"
              description="ابدأ أول عملية بيع من شاشة نقطة البيع."
            />
          ) : (
            <ul className="mt-2 divide-y divide-line-subtle">
              {snapshot.recentSales.map((sale) => (
                <li key={sale.id}>
                  <Link
                    href={`/invoices/${sale.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-[var(--radius-sm)] px-2 py-2.5 transition-colors hover:bg-sunken"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-sunken text-secondary">
                      <Receipt className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="num text-[13px] font-bold text-primary">{sale.number}</span>
                        {sale.status === 'CANCELED' && (
                          <Badge tone="danger" size="sm">
                            ملغاة
                          </Badge>
                        )}
                        {sale.dueTotal > 0 && sale.status !== 'CANCELED' && (
                          <Badge tone="warning" size="sm">
                            آجل
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-tertiary">
                        {sale.customerName ?? 'عميل نقدي'} · {sale.cashierName}
                      </span>
                    </span>
                    <span className="shrink-0 text-end">
                      <MoneyText value={sale.total} className="text-[13.5px] font-bold text-primary" />
                      <span className="mt-0.5 block text-[11.5px] text-tertiary">
                        <DateText value={sale.soldAt} relative />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="آخر الدفعات" subtitle="تحصيل وسداد" />
          {snapshot.recentPayments.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={<HandCoins className="size-6" />}
              title="لا توجد دفعات"
              description="ستظهر هنا دفعات العملاء والموردين."
            />
          ) : (
            <ul className="mt-2 divide-y divide-line-subtle">
              {snapshot.recentPayments.map((payment) => (
                <li key={payment.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${
                      payment.direction === 'IN'
                        ? 'bg-success-soft text-success'
                        : 'bg-danger-soft text-danger'
                    }`}
                  >
                    <HandCoins className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-primary">
                      {payment.partyName}
                    </span>
                    <span className="block text-[11.5px] text-tertiary">{payment.methodName}</span>
                  </span>
                  <span className="shrink-0 text-end">
                    <MoneyText
                      value={payment.direction === 'IN' ? payment.amount : -payment.amount}
                      className={`text-[13px] font-bold ${
                        payment.direction === 'IN' ? 'text-success' : 'text-danger'
                      }`}
                      signed
                    />
                    <span className="mt-0.5 block text-[11px] text-tertiary">
                      <DateText value={payment.paidAt} relative />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

function RecentExpenses({
  items,
}: {
  items: Array<{
    id: string;
    amount: number;
    description: string;
    categoryName: string;
    spentAt: Date;
  }>;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        variant="compact"
        icon={<Receipt className="size-6" />}
        title="لا توجد مصاريف"
        description="سجّل مصاريف المحل لتظهر في التقارير."
      />
    );
  }

  return (
    <ul className="mt-2 divide-y divide-line-subtle">
      {items.map((expense) => (
        <li key={expense.id} className="flex items-center gap-3 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-primary">
              {expense.description}
            </span>
            <span className="block text-[11.5px] text-tertiary">{expense.categoryName}</span>
          </span>
          <span className="shrink-0 text-end">
            <MoneyText value={expense.amount} className="text-[13px] font-bold text-primary" />
            <span className="mt-0.5 block text-[11px] text-tertiary">
              <DateText value={expense.spentAt} relative />
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Revenue → cost → expenses → net, as one horizontal bar. It answers the
 * question an owner actually asks — "did I make money this period?" — faster
 * than four separate tiles.
 *
 * `revenue` excludes tax: money collected for the tax authority was never the
 * shop's, and counting it would flatter every margin on the page.
 */
function NetProfitBar({
  revenue,
  cogs,
  expenses,
  tax,
  net,
  fmt,
}: {
  revenue: number;
  cogs: number;
  expenses: number;
  tax: number;
  net: number;
  fmt: ReturnType<typeof buildFormatter>;
}) {
  const consumed = cogs + expenses;
  const total = Math.max(revenue, consumed + Math.max(net, 0), 1);
  const share = (value: number) => `${Math.max(0, Math.min(100, (value / total) * 100))}%`;
  const margin = revenue > 0 ? Math.round((net / revenue) * 1000) / 10 : 0;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold text-primary">صافي الربح</h2>
          <p className="mt-0.5 text-[12px] text-secondary">
            الإيرادات بعد استبعاد الضريبة، ناقص تكلفة البضاعة والمصاريف
          </p>
        </div>
        <div className="text-end">
          <p className={`num text-[20px] font-bold ${net >= 0 ? 'text-success' : 'text-danger'}`}>
            {fmt.money(net, { signed: true })}
          </p>
          <p className="text-[11.5px] text-tertiary">
            هامش <span className="num">{fmt.percent(margin)}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-sunken">
        <div style={{ width: share(cogs) }} className="bg-[var(--chart-3)]" title="تكلفة البضاعة" />
        <div style={{ width: share(expenses) }} className="bg-[var(--chart-5)]" title="المصاريف" />
        <div
          style={{ width: share(Math.max(net, 0)) }}
          className="bg-[var(--chart-1)]"
          title="صافي الربح"
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-5">
        <LegendItem color="var(--chart-2)" label="الإيرادات" value={fmt.money(revenue)} />
        <LegendItem color="var(--chart-3)" label="تكلفة البضاعة" value={fmt.money(cogs)} />
        <LegendItem color="var(--chart-5)" label="المصاريف" value={fmt.money(expenses)} />
        <LegendItem color="var(--border-strong)" label="ضريبة محصّلة" value={fmt.money(tax)} />
        <LegendItem color="var(--chart-1)" label="الصافي" value={fmt.money(net)} />
      </dl>
    </Card>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="size-2.5 shrink-0 rounded-sm"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <dt className="text-[11.5px] text-tertiary">{label}</dt>
        <dd className="num truncate text-[13px] font-bold text-primary">{value}</dd>
      </div>
    </div>
  );
}
