import 'server-only';

import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { fromDb, type Money } from '@/core/money';
import { costAmount, costFromDb, factorFromDb, qtyFromDb } from '@/core/quantity';
import { dayKey, enumerateDays, previousRange, type DateRange } from '@/core/datetime';

/**
 * Report data.
 *
 * Every figure here is derived from the same stored facts the rest of the app
 * uses — cost of goods sold comes from `sale_items.cogs`, captured at the
 * moment of sale from the weighted-average cost, not recomputed from today's
 * prices. That is what makes a profit report from three months ago still true.
 */

export interface ReportScope {
  storeId: string;
  branchId: string | null;
  range: DateRange;
  timezone: string;
}

function branchFilter(branchId: string | null) {
  return branchId ? { branchId } : {};
}

// ── Sales report ─────────────────────────────────────────────────────────────

export interface SalesReport {
  totals: {
    grossSales: Money;
    discounts: Money;
    returns: Money;
    netSales: Money;
    tax: Money;
    invoiceCount: number;
    averageInvoice: Money;
    itemsSold: number;
    cashSales: Money;
    creditSales: Money;
  };
  previous: { netSales: Money; invoiceCount: number };
  daily: Array<{
    date: string;
    sales: Money;
    invoices: number;
    profit: Money;
  }>;
  byPaymentMethod: Array<{ id: string; name: string; amount: Money; count: number }>;
  byHour: Array<{ hour: number; sales: Money; invoices: number }>;
}

export async function getSalesReport(scope: ReportScope): Promise<SalesReport> {
  const { storeId, branchId, range, timezone } = scope;
  const window = { gte: range.from, lt: range.to };
  const prior = previousRange(range);

  const [sales, returns, items, payments, previousSales, rows] = await Promise.all([
    db.sale.aggregate({
      where: {
        storeId,
        ...branchFilter(branchId),
        deletedAt: null,
        status: { not: 'CANCELED' },
        soldAt: window,
      },
      _sum: { total: true, discountTotal: true, taxTotal: true, dueTotal: true },
      _count: true,
    }),
    db.saleReturn.aggregate({
      where: { storeId, ...branchFilter(branchId), deletedAt: null, returnedAt: window },
      _sum: { total: true },
    }),
    db.saleItem.aggregate({
      where: {
        storeId,
        sale: {
          ...branchFilter(branchId),
          deletedAt: null,
          status: { not: 'CANCELED' },
          soldAt: window,
        },
      },
      _count: true,
    }),
    db.payment.groupBy({
      by: ['methodId'],
      where: {
        storeId,
        ...branchFilter(branchId),
        deletedAt: null,
        direction: 'IN',
        source: 'SALE',
        paidAt: window,
      },
      _sum: { amount: true },
      _count: true,
    }),
    db.sale.aggregate({
      where: {
        storeId,
        ...branchFilter(branchId),
        deletedAt: null,
        status: { not: 'CANCELED' },
        soldAt: { gte: prior.from, lt: prior.to },
      },
      _sum: { total: true },
      _count: true,
    }),
    db.sale.findMany({
      where: {
        storeId,
        ...branchFilter(branchId),
        deletedAt: null,
        status: { not: 'CANCELED' },
        soldAt: window,
      },
      select: { soldAt: true, total: true, profitTotal: true },
    }),
  ]);

  // Daily buckets in the store's timezone, including days with no sales.
  const dailyMap = new Map<string, { sales: Money; invoices: number; profit: Money }>();
  for (const key of enumerateDays(range, timezone)) {
    dailyMap.set(key, { sales: 0, invoices: 0, profit: 0 });
  }

  const hourly = new Map<number, { sales: Money; invoices: number }>();

  for (const sale of rows) {
    const key = dayKey(sale.soldAt, timezone);
    const bucket = dailyMap.get(key);
    if (bucket) {
      bucket.sales += fromDb(sale.total);
      bucket.invoices += 1;
      bucket.profit += fromDb(sale.profitTotal);
    }

    const hour = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hour12: false })
        .format(sale.soldAt)
        .replace(/\D/g, ''),
    );
    const hourBucket = hourly.get(hour) ?? { sales: 0, invoices: 0 };
    hourBucket.sales += fromDb(sale.total);
    hourBucket.invoices += 1;
    hourly.set(hour, hourBucket);
  }

  const methodIds = payments.map((row) => row.methodId);
  const methods = methodIds.length
    ? await db.paymentMethod.findMany({
        where: { id: { in: methodIds } },
        select: { id: true, name: true, affectsCashbox: true },
      })
    : [];
  const methodIndex = new Map(methods.map((method) => [method.id, method]));

  const grossSales = fromDb(sales._sum.total);
  const returnTotal = fromDb(returns._sum.total);
  const invoiceCount = sales._count;

  const cashSales = payments
    .filter((row) => methodIndex.get(row.methodId)?.affectsCashbox)
    .reduce((sum, row) => sum + fromDb(row._sum.amount), 0);

  return {
    totals: {
      grossSales,
      discounts: fromDb(sales._sum.discountTotal),
      returns: returnTotal,
      netSales: grossSales - returnTotal,
      tax: fromDb(sales._sum.taxTotal),
      invoiceCount,
      averageInvoice: invoiceCount > 0 ? Math.round(grossSales / invoiceCount) : 0,
      itemsSold: items._count,
      cashSales,
      creditSales: fromDb(sales._sum.dueTotal),
    },
    previous: {
      netSales: fromDb(previousSales._sum.total),
      invoiceCount: previousSales._count,
    },
    daily: [...dailyMap.entries()].map(([date, value]) => ({ date, ...value })),
    byPaymentMethod: payments
      .map((row) => ({
        id: row.methodId,
        name: methodIndex.get(row.methodId)?.name ?? '—',
        amount: fromDb(row._sum.amount),
        count: row._count,
      }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount),
    byHour: [...hourly.entries()]
      .map(([hour, value]) => ({ hour, ...value }))
      .sort((a, b) => a.hour - b.hour),
  };
}

// ── Profit & loss ────────────────────────────────────────────────────────────

export interface ProfitReport {
  revenue: Money;
  tax: Money;
  netRevenue: Money;
  cogs: Money;
  grossProfit: Money;
  grossMargin: number;
  returnsImpact: Money;
  expenses: Money;
  expenseBreakdown: Array<{ id: string; name: string; color: string | null; amount: Money }>;
  netProfit: Money;
  netMargin: number;
  previous: { netProfit: Money; grossProfit: Money };
}

export async function getProfitReport(scope: ReportScope): Promise<ProfitReport> {
  const { storeId, branchId, range } = scope;
  const window = { gte: range.from, lt: range.to };
  const prior = previousRange(range);

  const [sales, returns, expenses, expenseGroups, previousSales, previousExpenses] =
    await Promise.all([
      db.sale.aggregate({
        where: {
          storeId,
          ...branchFilter(branchId),
          deletedAt: null,
          status: { not: 'CANCELED' },
          soldAt: window,
        },
        _sum: { total: true, taxTotal: true, cogsTotal: true, profitTotal: true },
      }),
      db.saleReturn.aggregate({
        where: { storeId, ...branchFilter(branchId), deletedAt: null, returnedAt: window },
        _sum: { total: true, taxTotal: true, cogsTotal: true },
      }),
      db.expense.aggregate({
        where: { storeId, ...branchFilter(branchId), deletedAt: null, spentAt: window },
        _sum: { amount: true },
      }),
      db.expense.groupBy({
        by: ['categoryId'],
        where: { storeId, ...branchFilter(branchId), deletedAt: null, spentAt: window },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
      db.sale.aggregate({
        where: {
          storeId,
          ...branchFilter(branchId),
          deletedAt: null,
          status: { not: 'CANCELED' },
          soldAt: { gte: prior.from, lt: prior.to },
        },
        _sum: { profitTotal: true },
      }),
      db.expense.aggregate({
        where: {
          storeId,
          ...branchFilter(branchId),
          deletedAt: null,
          spentAt: { gte: prior.from, lt: prior.to },
        },
        _sum: { amount: true },
      }),
    ]);

  const categoryIds = expenseGroups.map((row) => row.categoryId);
  const categories = categoryIds.length
    ? await db.expenseCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true, color: true },
      })
    : [];
  const categoryIndex = new Map(categories.map((category) => [category.id, category]));

  const revenue = fromDb(sales._sum.total);
  const tax = fromDb(sales._sum.taxTotal);
  const cogs = fromDb(sales._sum.cogsTotal);

  // Returns reverse both the revenue and its cost, so the net effect on profit
  // is the margin that was given back — not the full refund.
  const returnRevenue = fromDb(returns._sum.total) - fromDb(returns._sum.taxTotal);
  const returnCogs = fromDb(returns._sum.cogsTotal);
  const returnsImpact = returnRevenue - returnCogs;

  const netRevenue = revenue - tax - returnRevenue;
  const effectiveCogs = cogs - returnCogs;
  const grossProfit = netRevenue - effectiveCogs;
  const expenseTotal = fromDb(expenses._sum.amount);
  const netProfit = grossProfit - expenseTotal;

  const previousGross = fromDb(previousSales._sum.profitTotal);

  return {
    revenue,
    tax,
    netRevenue,
    cogs: effectiveCogs,
    grossProfit,
    grossMargin: netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 1000) / 10 : 0,
    returnsImpact,
    expenses: expenseTotal,
    expenseBreakdown: expenseGroups.map((row) => ({
      id: row.categoryId,
      name: categoryIndex.get(row.categoryId)?.name ?? '—',
      color: categoryIndex.get(row.categoryId)?.color ?? null,
      amount: fromDb(row._sum.amount),
    })),
    netProfit,
    netMargin: netRevenue > 0 ? Math.round((netProfit / netRevenue) * 1000) / 10 : 0,
    previous: {
      grossProfit: previousGross,
      netProfit: previousGross - fromDb(previousExpenses._sum.amount),
    },
  };
}

// ── Products report ──────────────────────────────────────────────────────────

export interface ProductReportRow {
  variantId: string;
  productId: string;
  name: string;
  variantName: string;
  sku: string;
  categoryName: string | null;
  unitLabel: string;
  quantitySold: number;
  revenue: Money;
  cogs: Money;
  profit: Money;
  margin: number;
  currentStock: number;
}

export interface ProductsReport {
  rows: ProductReportRow[];
  slowMovers: Array<{
    variantId: string;
    productId: string;
    name: string;
    sku: string;
    stock: number;
    unitLabel: string;
    stockValue: Money;
    lastSoldAt: Date | null;
    daysSinceSale: number | null;
  }>;
}

export async function getProductsReport(
  scope: ReportScope,
  options: { limit?: number } = {},
): Promise<ProductsReport> {
  const { storeId, branchId, range } = scope;
  const window = { gte: range.from, lt: range.to };

  const grouped = await db.saleItem.groupBy({
    by: ['variantId'],
    where: {
      storeId,
      sale: {
        ...branchFilter(branchId),
        deletedAt: null,
        status: { not: 'CANCELED' },
        soldAt: window,
      },
    },
    _sum: { quantityBase: true, lineTotal: true, cogs: true, taxAmount: true },
    orderBy: { _sum: { lineTotal: 'desc' } },
    take: options.limit ?? 100,
  });

  const variantIds = grouped.map((row) => row.variantId);
  const variants = variantIds.length
    ? await db.productVariant.findMany({
        where: { id: { in: variantIds } },
        select: {
          id: true,
          name: true,
          sku: true,
          unitLabel: true,
          displayFactor: true,
          product: { select: { id: true, name: true, category: { select: { name: true } } } },
          inventoryItems: branchId
            ? { where: { branchId }, select: { quantity: true } }
            : { select: { quantity: true } },
        },
      })
    : [];
  const variantIndex = new Map(variants.map((variant) => [variant.id, variant]));

  const rows: ProductReportRow[] = grouped.map((row) => {
    const variant = variantIndex.get(row.variantId);
    const factor = variant ? factorFromDb(variant.displayFactor) : 1000;
    const revenue = fromDb(row._sum.lineTotal) - fromDb(row._sum.taxAmount);
    const cogs = fromDb(row._sum.cogs);

    return {
      variantId: row.variantId,
      productId: variant?.product.id ?? row.variantId,
      name: variant?.product.name ?? '—',
      variantName: variant?.name ?? '',
      sku: variant?.sku ?? '',
      categoryName: variant?.product.category?.name ?? null,
      unitLabel: variant?.unitLabel ?? '',
      quantitySold: qtyFromDb(row._sum.quantityBase) / factor,
      revenue,
      cogs,
      profit: revenue - cogs,
      margin: revenue > 0 ? Math.round(((revenue - cogs) / revenue) * 1000) / 10 : 0,
      currentStock:
        (variant?.inventoryItems.reduce(
          (sum, item) => sum + qtyFromDb(item.quantity),
          0,
        ) ?? 0) / factor,
    };
  });

  // Stock sitting on the shelf that has not sold in the period — the money a
  // shop most often forgets it has tied up.
  const soldIds = new Set(variantIds);
  const stale = await db.productVariant.findMany({
    where: {
      storeId,
      deletedAt: null,
      isActive: true,
      id: { notIn: soldIds.size > 0 ? [...soldIds] : undefined },
      product: { deletedAt: null, status: 'ACTIVE', trackInventory: true },
      inventoryItems: { some: { quantity: { gt: 0 }, ...(branchId ? { branchId } : {}) } },
    },
    take: 40,
    select: {
      id: true,
      name: true,
      sku: true,
      unitLabel: true,
      displayFactor: true,
      avgCostPerBase: true,
      product: { select: { id: true, name: true } },
      inventoryItems: branchId
        ? { where: { branchId }, select: { quantity: true } }
        : { select: { quantity: true } },
      saleItems: {
        orderBy: { sale: { soldAt: 'desc' } },
        take: 1,
        select: { sale: { select: { soldAt: true } } },
      },
    },
  });

  const now = Date.now();

  return {
    rows,
    slowMovers: stale
      .map((variant) => {
        const factor = factorFromDb(variant.displayFactor);
        const quantity = variant.inventoryItems.reduce(
          (sum, item) => sum + qtyFromDb(item.quantity),
          0,
        );
        const lastSoldAt = variant.saleItems[0]?.sale.soldAt ?? null;

        return {
          variantId: variant.id,
          productId: variant.product.id,
          name:
            variant.name && variant.name !== 'افتراضي'
              ? `${variant.product.name} — ${variant.name}`
              : variant.product.name,
          sku: variant.sku,
          stock: quantity / factor,
          unitLabel: variant.unitLabel,
          stockValue: costAmount(quantity, costFromDb(variant.avgCostPerBase)),
          lastSoldAt,
          daysSinceSale: lastSoldAt
            ? Math.floor((now - lastSoldAt.getTime()) / 86_400_000)
            : null,
        };
      })
      .sort((a, b) => b.stockValue - a.stockValue),
  };
}

// ── Customers report ─────────────────────────────────────────────────────────

export interface CustomersReport {
  top: Array<{
    id: string;
    name: string;
    phone: string | null;
    invoiceCount: number;
    total: Money;
    averageInvoice: Money;
    balance: Money;
    lastPurchaseAt: Date | null;
  }>;
  totals: {
    activeCustomers: number;
    newCustomers: number;
    withDebt: number;
    totalDebt: Money;
    averageCustomerValue: Money;
  };
}

export async function getCustomersReport(scope: ReportScope): Promise<CustomersReport> {
  const { storeId, branchId, range } = scope;
  const window = { gte: range.from, lt: range.to };

  const grouped = await db.sale.groupBy({
    by: ['customerId'],
    where: {
      storeId,
      ...branchFilter(branchId),
      deletedAt: null,
      status: { not: 'CANCELED' },
      soldAt: window,
      customerId: { not: null },
    },
    _sum: { total: true },
    _count: true,
    _max: { soldAt: true },
    orderBy: { _sum: { total: 'desc' } },
    take: 50,
  });

  const customerIds = grouped
    .map((row) => row.customerId)
    .filter((id): id is string => id !== null);

  const [customers, newCount, debtors] = await Promise.all([
    customerIds.length
      ? db.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true, phone: true, balance: true },
        })
      : Promise.resolve([]),
    db.customer.count({ where: { storeId, deletedAt: null, createdAt: window } }),
    db.customer.aggregate({
      where: { storeId, deletedAt: null, balance: { gt: 0 } },
      _sum: { balance: true },
      _count: true,
    }),
  ]);

  const customerIndex = new Map(customers.map((customer) => [customer.id, customer]));
  const totalValue = grouped.reduce((sum, row) => sum + fromDb(row._sum.total), 0);

  return {
    top: grouped
      .filter((row) => row.customerId !== null)
      .map((row) => {
        const customer = customerIndex.get(row.customerId!);
        const total = fromDb(row._sum.total);
        return {
          id: row.customerId!,
          name: customer?.name ?? '—',
          phone: customer?.phone ?? null,
          invoiceCount: row._count,
          total,
          averageInvoice: row._count > 0 ? Math.round(total / row._count) : 0,
          balance: fromDb(customer?.balance ?? 0n),
          lastPurchaseAt: row._max.soldAt,
        };
      }),
    totals: {
      activeCustomers: grouped.length,
      newCustomers: newCount,
      withDebt: debtors._count,
      totalDebt: fromDb(debtors._sum.balance),
      averageCustomerValue:
        grouped.length > 0 ? Math.round(totalValue / grouped.length) : 0,
    },
  };
}

// ── Expenses report ──────────────────────────────────────────────────────────

export interface ExpensesReport {
  total: Money;
  count: number;
  byCategory: Array<{ id: string; name: string; color: string | null; amount: Money; count: number }>;
  byUser: Array<{ userId: string; name: string; amount: Money; count: number }>;
  monthly: Array<{ month: string; amount: Money }>;
  salesComparison: { sales: Money; expenses: Money; ratio: number };
}

export async function getExpensesReport(scope: ReportScope): Promise<ExpensesReport> {
  const { storeId, branchId, range, timezone } = scope;
  const window = { gte: range.from, lt: range.to };

  const [aggregate, byCategory, byUser, rows, sales] = await Promise.all([
    db.expense.aggregate({
      where: { storeId, ...branchFilter(branchId), deletedAt: null, spentAt: window },
      _sum: { amount: true },
      _count: true,
    }),
    db.expense.groupBy({
      by: ['categoryId'],
      where: { storeId, ...branchFilter(branchId), deletedAt: null, spentAt: window },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
    }),
    db.expense.groupBy({
      by: ['userId'],
      where: { storeId, ...branchFilter(branchId), deletedAt: null, spentAt: window },
      _sum: { amount: true },
      _count: true,
      orderBy: { _sum: { amount: 'desc' } },
      take: 10,
    }),
    db.expense.findMany({
      where: { storeId, ...branchFilter(branchId), deletedAt: null, spentAt: window },
      select: { amount: true, spentAt: true },
    }),
    db.sale.aggregate({
      where: {
        storeId,
        ...branchFilter(branchId),
        deletedAt: null,
        status: { not: 'CANCELED' },
        soldAt: window,
      },
      _sum: { total: true },
    }),
  ]);

  const [categories, users] = await Promise.all([
    byCategory.length
      ? db.expenseCategory.findMany({
          where: { id: { in: byCategory.map((row) => row.categoryId) } },
          select: { id: true, name: true, color: true },
        })
      : Promise.resolve([]),
    byUser.length
      ? db.user.findMany({
          where: { id: { in: byUser.map((row) => row.userId) } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const categoryIndex = new Map(categories.map((category) => [category.id, category]));
  const userIndex = new Map(users.map((user) => [user.id, user.name]));

  const monthly = new Map<string, Money>();
  for (const expense of rows) {
    const key = dayKey(expense.spentAt, timezone).slice(0, 7);
    monthly.set(key, (monthly.get(key) ?? 0) + fromDb(expense.amount));
  }

  const total = fromDb(aggregate._sum.amount);
  const salesTotal = fromDb(sales._sum.total);

  return {
    total,
    count: aggregate._count,
    byCategory: byCategory.map((row) => ({
      id: row.categoryId,
      name: categoryIndex.get(row.categoryId)?.name ?? '—',
      color: categoryIndex.get(row.categoryId)?.color ?? null,
      amount: fromDb(row._sum.amount),
      count: row._count,
    })),
    byUser: byUser.map((row) => ({
      userId: row.userId,
      name: userIndex.get(row.userId) ?? '—',
      amount: fromDb(row._sum.amount),
      count: row._count,
    })),
    monthly: [...monthly.entries()]
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    salesComparison: {
      sales: salesTotal,
      expenses: total,
      ratio: salesTotal > 0 ? Math.round((total / salesTotal) * 1000) / 10 : 0,
    },
  };
}

// ── Inventory valuation ──────────────────────────────────────────────────────

export interface InventoryReport {
  totalCost: Money;
  totalRetail: Money;
  potentialProfit: Money;
  variantCount: number;
  byCategory: Array<{
    name: string;
    cost: Money;
    retail: Money;
    variantCount: number;
  }>;
  lowStock: number;
  outOfStock: number;
}

export async function getInventoryReport(
  storeId: string,
  branchId: string | null,
): Promise<InventoryReport> {
  const rows = await db.$queryRaw<
    Array<{
      category: string | null;
      cost: string;
      retail: string;
      variants: bigint;
      low: bigint;
      out: bigint;
    }>
  >(Prisma.sql`
    SELECT
      c.name AS category,
      COALESCE(SUM(i.quantity * v."avgCostPerBase"), 0)::text AS cost,
      COALESCE(SUM(i.quantity * v."sellingPrice" / NULLIF(v."displayFactor", 0)), 0)::text AS retail,
      COUNT(*)::bigint AS variants,
      COUNT(*) FILTER (
        WHERE i.quantity > 0
          AND i.quantity <= GREATEST(v."minimumStock", i."minimumStock")
          AND GREATEST(v."minimumStock", i."minimumStock") > 0
      )::bigint AS low,
      COUNT(*) FILTER (WHERE i.quantity <= 0)::bigint AS out
    FROM inventory_items i
    JOIN product_variants v ON v.id = i."variantId"
    JOIN products p ON p.id = v."productId"
    LEFT JOIN categories c ON c.id = p."categoryId"
    WHERE i."storeId" = ${storeId}
      AND v."deletedAt" IS NULL
      AND p."deletedAt" IS NULL
      AND p."trackInventory" = true
      ${branchId ? Prisma.sql`AND i."branchId" = ${branchId}` : Prisma.empty}
    GROUP BY c.name
    ORDER BY cost DESC
  `);

  const byCategory = rows.map((row) => ({
    name: row.category ?? 'بدون تصنيف',
    cost: Math.round(Number(row.cost)),
    retail: Math.round(Number(row.retail)),
    variantCount: Number(row.variants),
  }));

  const totalCost = byCategory.reduce((sum, row) => sum + row.cost, 0);
  const totalRetail = byCategory.reduce((sum, row) => sum + row.retail, 0);

  return {
    totalCost,
    totalRetail,
    potentialProfit: totalRetail - totalCost,
    variantCount: byCategory.reduce((sum, row) => sum + row.variantCount, 0),
    byCategory,
    lowStock: rows.reduce((sum, row) => sum + Number(row.low), 0),
    outOfStock: rows.reduce((sum, row) => sum + Number(row.out), 0),
  };
}

// ── Cash flow ────────────────────────────────────────────────────────────────

export interface CashFlowReport {
  opening: Money;
  closing: Money;
  inflow: Money;
  outflow: Money;
  byType: Array<{ type: string; amount: Money; count: number }>;
  daily: Array<{ date: string; inflow: Money; outflow: Money; net: Money }>;
}

export async function getCashFlowReport(scope: ReportScope): Promise<CashFlowReport> {
  const { storeId, branchId, range, timezone } = scope;

  const cashbox = await db.cashbox.findFirst({
    where: { storeId, ...(branchId ? { branchId } : {}), isActive: true },
    orderBy: { isDefault: 'desc' },
    select: { id: true, balance: true },
  });

  if (!cashbox) {
    return { opening: 0, closing: 0, inflow: 0, outflow: 0, byType: [], daily: [] };
  }

  const [movements, grouped, before] = await Promise.all([
    db.cashboxTransaction.findMany({
      where: { cashboxId: cashbox.id, occurredAt: { gte: range.from, lt: range.to } },
      select: { amount: true, occurredAt: true },
      orderBy: { occurredAt: 'asc' },
    }),
    db.cashboxTransaction.groupBy({
      by: ['type'],
      where: { cashboxId: cashbox.id, occurredAt: { gte: range.from, lt: range.to } },
      _sum: { amount: true },
      _count: true,
    }),
    db.cashboxTransaction.aggregate({
      where: { cashboxId: cashbox.id, occurredAt: { lt: range.from } },
      _sum: { amount: true },
    }),
  ]);

  const opening = fromDb(before._sum.amount);
  const daily = new Map<string, { inflow: Money; outflow: Money }>();
  for (const key of enumerateDays(range, timezone)) {
    daily.set(key, { inflow: 0, outflow: 0 });
  }

  let inflow = 0;
  let outflow = 0;

  for (const movement of movements) {
    const amount = fromDb(movement.amount);
    const bucket = daily.get(dayKey(movement.occurredAt, timezone));

    if (amount >= 0) {
      inflow += amount;
      if (bucket) bucket.inflow += amount;
    } else {
      outflow += Math.abs(amount);
      if (bucket) bucket.outflow += Math.abs(amount);
    }
  }

  return {
    opening,
    closing: opening + inflow - outflow,
    inflow,
    outflow,
    byType: grouped
      .map((row) => ({
        type: row.type,
        amount: fromDb(row._sum.amount),
        count: row._count,
      }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    daily: [...daily.entries()].map(([date, value]) => ({
      date,
      ...value,
      net: value.inflow - value.outflow,
    })),
  };
}
