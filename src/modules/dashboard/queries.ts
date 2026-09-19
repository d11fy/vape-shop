import 'server-only';

import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { fromDb, type Money } from '@/core/money';
import { qtyFromDb, factorFromDb, type Qty } from '@/core/quantity';
import { overdueDebtSummary } from '@/modules/customers/queries';
import {
  dayKey,
  enumerateDays,
  previousRange,
  type DateRange,
} from '@/core/datetime';

/**
 * Dashboard data.
 *
 * Everything is aggregated in PostgreSQL — a store with 100,000 invoices must
 * not ship a single row of them to the browser. The queries run in parallel and
 * each one is covered by an index declared in the schema.
 */

export interface DashboardTotals {
  /** What the customer paid, tax included. */
  salesTotal: Money;
  /** Sales minus the tax portion — the part that is actually the shop's. */
  netRevenue: Money;
  taxTotal: Money;
  /** Cost of goods sold, from the weighted-average cost at time of sale. */
  cogsTotal: Money;
  invoiceCount: number;
  /** netRevenue − cogsTotal. */
  grossProfit: Money;
  expenses: Money;
  netProfit: Money;
  averageInvoice: Money;
  discountTotal: Money;
  returnsTotal: Money;
  cashCollected: Money;
  creditSales: Money;
}

export interface DashboardSnapshot {
  current: DashboardTotals;
  previous: DashboardTotals;
  /** Live balances, independent of the selected period. */
  balances: {
    cashbox: Money;
    receivables: Money;
    payables: Money;
    inventoryValue: Money;
    overdueReceivables: Money;
  };
  counts: {
    lowStock: number;
    outOfStock: number;
    activeCustomers: number;
    openShifts: number;
  };
  series: Array<{ label: string; value: number; display?: string }>;
  topProducts: Array<{
    id: string;
    name: string;
    variantName: string;
    quantityLabel: string;
    revenue: Money;
    profit: Money;
  }>;
  paymentMix: Array<{ id: string; label: string; value: number }>;
  recentSales: Array<{
    id: string;
    number: string;
    total: Money;
    dueTotal: Money;
    customerName: string | null;
    cashierName: string;
    soldAt: Date;
    status: string;
  }>;
  recentPayments: Array<{
    id: string;
    amount: Money;
    partyName: string;
    methodName: string;
    direction: 'IN' | 'OUT';
    paidAt: Date;
  }>;
  recentExpenses: Array<{
    id: string;
    amount: Money;
    description: string;
    categoryName: string;
    spentAt: Date;
  }>;
  staffLeaderboard: Array<{
    userId: string;
    name: string;
    invoiceCount: number;
    salesTotal: Money;
  }>;
}

export interface DashboardParams {
  storeId: string;
  /** `null` aggregates every branch the member can see. */
  branchId: string | null;
  range: DateRange;
  timezone: string;
  /** Hide profit, cost and balance figures from members without permission. */
  includeFinancials: boolean;
  /** The store's own threshold — the same one the debts page uses. */
  debtOverdueDays: number;
}

export async function getDashboardSnapshot(
  params: DashboardParams,
): Promise<DashboardSnapshot> {
  const { storeId, branchId, range, timezone } = params;
  const prior = previousRange(range);

  const branchFilter = branchId ? { branchId } : {};

  const [
    current,
    previous,
    balances,
    counts,
    series,
    topProducts,
    paymentMix,
    recentSales,
    recentPayments,
    recentExpenses,
    staffLeaderboard,
  ] = await Promise.all([
    periodTotals(storeId, branchId, range),
    periodTotals(storeId, branchId, prior),
    liveBalances(storeId, branchId, params.includeFinancials, params.debtOverdueDays),
    liveCounts(storeId, branchId),
    dailySeries(storeId, branchId, range, timezone),
    topSellingProducts(storeId, branchId, range),
    paymentMethodMix(storeId, branchId, range),
    db.sale
      .findMany({
        where: { storeId, ...branchFilter, deletedAt: null },
        orderBy: { soldAt: 'desc' },
        take: 6,
        select: {
          id: true,
          number: true,
          total: true,
          dueTotal: true,
          status: true,
          soldAt: true,
          customer: { select: { name: true } },
          userId: true,
        },
      })
      .then(async (sales) => {
        const userIds = [...new Set(sales.map((sale) => sale.userId))];
        const users = await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        });
        const names = new Map(users.map((user) => [user.id, user.name]));
        return sales.map((sale) => ({
          id: sale.id,
          number: sale.number,
          total: fromDb(sale.total),
          dueTotal: fromDb(sale.dueTotal),
          customerName: sale.customer?.name ?? null,
          cashierName: names.get(sale.userId) ?? '—',
          soldAt: sale.soldAt,
          status: sale.status,
        }));
      }),
    db.payment
      .findMany({
        where: {
          storeId,
          ...branchFilter,
          deletedAt: null,
          source: { in: ['CUSTOMER_DEBT', 'SUPPLIER_DEBT'] },
        },
        orderBy: { paidAt: 'desc' },
        take: 5,
        select: {
          id: true,
          amount: true,
          direction: true,
          paidAt: true,
          method: { select: { name: true } },
          customer: { select: { name: true } },
          supplier: { select: { name: true } },
        },
      })
      .then((payments) =>
        payments.map((payment) => ({
          id: payment.id,
          amount: fromDb(payment.amount),
          partyName: payment.customer?.name ?? payment.supplier?.name ?? '—',
          methodName: payment.method.name,
          direction: payment.direction,
          paidAt: payment.paidAt,
        })),
      ),
    db.expense
      .findMany({
        where: { storeId, ...branchFilter, deletedAt: null },
        orderBy: { spentAt: 'desc' },
        take: 5,
        select: {
          id: true,
          amount: true,
          description: true,
          spentAt: true,
          category: { select: { name: true } },
        },
      })
      .then((expenses) =>
        expenses.map((expense) => ({
          id: expense.id,
          amount: fromDb(expense.amount),
          description: expense.description,
          categoryName: expense.category.name,
          spentAt: expense.spentAt,
        })),
      ),
    staffTotals(storeId, branchId, range),
  ]);

  return {
    current,
    previous,
    balances,
    counts,
    series,
    topProducts,
    paymentMix,
    recentSales,
    recentPayments,
    recentExpenses,
    staffLeaderboard,
  };
}

// ── Period aggregates ────────────────────────────────────────────────────────

async function periodTotals(
  storeId: string,
  branchId: string | null,
  range: DateRange,
): Promise<DashboardTotals> {
  const branchFilter = branchId ? { branchId } : {};
  const window = { gte: range.from, lt: range.to };

  const [sales, expenses, returns, cashPayments] = await Promise.all([
    db.sale.aggregate({
      where: {
        storeId,
        ...branchFilter,
        deletedAt: null,
        status: { not: 'CANCELED' },
        soldAt: window,
      },
      _sum: {
        total: true,
        profitTotal: true,
        discountTotal: true,
        dueTotal: true,
        taxTotal: true,
        cogsTotal: true,
      },
      _count: true,
    }),
    db.expense.aggregate({
      where: { storeId, ...branchFilter, deletedAt: null, spentAt: window },
      _sum: { amount: true },
    }),
    db.saleReturn.aggregate({
      where: { storeId, ...branchFilter, deletedAt: null, returnedAt: window },
      _sum: { total: true },
    }),
    db.payment.aggregate({
      where: {
        storeId,
        ...branchFilter,
        deletedAt: null,
        direction: 'IN',
        paidAt: window,
        method: { affectsCashbox: true },
      },
      _sum: { amount: true },
    }),
  ]);

  const salesTotal = fromDb(sales._sum.total);
  const taxTotal = fromDb(sales._sum.taxTotal);
  const cogsTotal = fromDb(sales._sum.cogsTotal);
  const grossProfit = fromDb(sales._sum.profitTotal);
  const expenseTotal = fromDb(expenses._sum.amount);
  const invoiceCount = sales._count;

  // Tax collected on behalf of the authority is not revenue. Excluding it here
  // is what makes "مجمل الربح" agree with the profit-and-loss report.
  const netRevenue = salesTotal - taxTotal;

  return {
    salesTotal,
    netRevenue,
    taxTotal,
    cogsTotal,
    invoiceCount,
    grossProfit,
    expenses: expenseTotal,
    netProfit: grossProfit - expenseTotal,
    averageInvoice: invoiceCount > 0 ? Math.round(salesTotal / invoiceCount) : 0,
    discountTotal: fromDb(sales._sum.discountTotal),
    returnsTotal: fromDb(returns._sum.total),
    cashCollected: fromDb(cashPayments._sum.amount),
    creditSales: fromDb(sales._sum.dueTotal),
  };
}

// ── Live balances ────────────────────────────────────────────────────────────

async function liveBalances(
  storeId: string,
  branchId: string | null,
  includeFinancials: boolean,
  debtOverdueDays: number,
): Promise<DashboardSnapshot['balances']> {
  if (!includeFinancials) {
    return {
      cashbox: 0,
      receivables: 0,
      payables: 0,
      inventoryValue: 0,
      overdueReceivables: 0,
    };
  }

  const [cashbox, receivables, payables, inventoryValue, overdue] = await Promise.all([
    db.cashbox.aggregate({
      where: { storeId, ...(branchId ? { branchId } : {}), isActive: true },
      _sum: { balance: true },
    }),
    db.customer.aggregate({
      where: { storeId, deletedAt: null, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    db.supplier.aggregate({
      where: { storeId, deletedAt: null, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    inventoryValuation(storeId, branchId),
    overdueDebtSummary(storeId, debtOverdueDays),
  ]);

  return {
    cashbox: fromDb(cashbox._sum.balance),
    receivables: fromDb(receivables._sum.balance),
    payables: fromDb(payables._sum.balance),
    inventoryValue,
    overdueReceivables: overdue.total,
  };
}

/** Σ (on-hand quantity × weighted-average cost) at current cost. */
export async function inventoryValuation(
  storeId: string,
  branchId: string | null,
): Promise<Money> {
  const branchClause = branchId
    ? Prisma.sql`AND i."branchId" = ${branchId}`
    : Prisma.empty;

  const rows = await db.$queryRaw<Array<{ value: string | null }>>(Prisma.sql`
    SELECT COALESCE(SUM(i.quantity * v."avgCostPerBase"), 0)::text AS value
      FROM inventory_items i
      JOIN product_variants v ON v.id = i."variantId"
     WHERE i."storeId" = ${storeId}
       AND v."deletedAt" IS NULL
       AND i.quantity > 0
       ${branchClause}
  `);
  // quantity is in base units and avgCostPerBase is minor units per base unit,
  // so the product is already in minor units.
  return Math.round(Number(rows[0]?.value ?? 0));
}

async function liveCounts(
  storeId: string,
  branchId: string | null,
): Promise<DashboardSnapshot['counts']> {
  const branchFilter = branchId ? { branchId } : {};

  const [lowStockRows, activeCustomers, openShifts] = await Promise.all([
    db.$queryRaw<Array<{ low: bigint; out: bigint }>>`
      SELECT
        COUNT(*) FILTER (WHERE i.quantity > 0 AND i.quantity <= GREATEST(v."minimumStock", i."minimumStock"))::bigint AS low,
        COUNT(*) FILTER (WHERE i.quantity <= 0)::bigint AS out
        FROM inventory_items i
        JOIN product_variants v ON v.id = i."variantId"
        JOIN products p ON p.id = v."productId"
       WHERE i."storeId" = ${storeId}
         AND v."deletedAt" IS NULL
         AND p."deletedAt" IS NULL
         AND p."trackInventory" = true
         AND GREATEST(v."minimumStock", i."minimumStock") > 0
    `,
    db.customer.count({ where: { storeId, deletedAt: null, isActive: true } }),
    db.shift.count({ where: { storeId, ...branchFilter, status: 'OPEN' } }),
  ]);

  return {
    lowStock: Number(lowStockRows[0]?.low ?? 0n),
    outOfStock: Number(lowStockRows[0]?.out ?? 0n),
    activeCustomers,
    openShifts,
  };
}

// ── Series ───────────────────────────────────────────────────────────────────

async function dailySeries(
  storeId: string,
  branchId: string | null,
  range: DateRange,
  timezone: string,
): Promise<DashboardSnapshot['series']> {
  const sales = await db.sale.findMany({
    where: {
      storeId,
      ...(branchId ? { branchId } : {}),
      deletedAt: null,
      status: { not: 'CANCELED' },
      soldAt: { gte: range.from, lt: range.to },
    },
    select: { soldAt: true, total: true },
  });

  const buckets = new Map<string, number>();
  for (const key of enumerateDays(range, timezone)) buckets.set(key, 0);

  for (const sale of sales) {
    const key = dayKey(sale.soldAt, timezone);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + fromDb(sale.total));
  }

  return [...buckets.entries()].map(([key, value]) => ({
    label: key.slice(5).replace('-', '/'),
    value,
  }));
}

// ── Rankings ─────────────────────────────────────────────────────────────────

async function topSellingProducts(
  storeId: string,
  branchId: string | null,
  range: DateRange,
): Promise<DashboardSnapshot['topProducts']> {
  const grouped = await db.saleItem.groupBy({
    by: ['variantId'],
    where: {
      storeId,
      sale: {
        deletedAt: null,
        status: { not: 'CANCELED' },
        soldAt: { gte: range.from, lt: range.to },
        ...(branchId ? { branchId } : {}),
      },
    },
    _sum: { lineTotal: true, quantityBase: true, cogs: true },
    orderBy: { _sum: { lineTotal: 'desc' } },
    take: 6,
  });

  if (grouped.length === 0) return [];

  const variants = await db.productVariant.findMany({
    where: { id: { in: grouped.map((row) => row.variantId) } },
    select: {
      id: true,
      name: true,
      unitLabel: true,
      displayFactor: true,
      product: { select: { id: true, name: true } },
    },
  });
  const index = new Map(variants.map((variant) => [variant.id, variant]));

  return grouped.map((row) => {
    const variant = index.get(row.variantId);
    const factor = variant ? factorFromDb(variant.displayFactor) : 1000;
    const quantity: Qty = qtyFromDb(row._sum.quantityBase);
    const saleUnits = quantity / factor;
    const revenue = fromDb(row._sum.lineTotal);

    return {
      id: variant?.product.id ?? row.variantId,
      name: variant?.product.name ?? '—',
      variantName: variant?.name ?? '',
      quantityLabel: `${saleUnits.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${
        variant?.unitLabel ?? ''
      }`,
      revenue,
      profit: revenue - fromDb(row._sum.cogs),
    };
  });
}

async function paymentMethodMix(
  storeId: string,
  branchId: string | null,
  range: DateRange,
): Promise<DashboardSnapshot['paymentMix']> {
  const grouped = await db.payment.groupBy({
    by: ['methodId'],
    where: {
      storeId,
      ...(branchId ? { branchId } : {}),
      deletedAt: null,
      direction: 'IN',
      paidAt: { gte: range.from, lt: range.to },
    },
    _sum: { amount: true },
  });

  if (grouped.length === 0) return [];

  const methods = await db.paymentMethod.findMany({
    where: { id: { in: grouped.map((row) => row.methodId) } },
    select: { id: true, name: true },
  });
  const names = new Map(methods.map((method) => [method.id, method.name]));

  return grouped
    .map((row) => ({
      id: row.methodId,
      label: names.get(row.methodId) ?? '—',
      value: fromDb(row._sum.amount),
    }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value);
}

async function staffTotals(
  storeId: string,
  branchId: string | null,
  range: DateRange,
): Promise<DashboardSnapshot['staffLeaderboard']> {
  const grouped = await db.sale.groupBy({
    by: ['userId'],
    where: {
      storeId,
      ...(branchId ? { branchId } : {}),
      deletedAt: null,
      status: { not: 'CANCELED' },
      soldAt: { gte: range.from, lt: range.to },
    },
    _sum: { total: true },
    _count: true,
    orderBy: { _sum: { total: 'desc' } },
    take: 5,
  });

  if (grouped.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: grouped.map((row) => row.userId) } },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((user) => [user.id, user.name]));

  return grouped.map((row) => ({
    userId: row.userId,
    name: names.get(row.userId) ?? '—',
    invoiceCount: row._count,
    salesTotal: fromDb(row._sum.total),
  }));
}
