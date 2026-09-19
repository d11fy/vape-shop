import 'server-only';

import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { fromDb, type Money } from '@/core/money';
import { costFromDb, factorFromDb, qtyFromDb } from '@/core/quantity';
import type { ParsedTableQuery } from '@/lib/table-query';
import type { DateRange } from '@/core/datetime';
import type { SaleStatus } from '@/generated/prisma/enums';

/**
 * Invoice queries.
 *
 * Listing is paginated and sorted in SQL. The detail view loads the invoice
 * plus everything hanging off it — lines, payments, returns — in one round
 * trip, because that page is opened constantly and a waterfall of queries
 * would be felt.
 */

export interface InvoiceListRow {
  id: string;
  number: string;
  total: Money;
  paidTotal: Money;
  dueTotal: Money;
  profitTotal: Money;
  itemCount: number;
  status: SaleStatus;
  customerName: string | null;
  customerId: string | null;
  cashierName: string;
  branchName: string;
  soldAt: Date;
}

export interface InvoiceListResult {
  rows: InvoiceListRow[];
  total: number;
  totals: { sales: Money; due: Money; profit: Money };
}

export interface InvoiceFilters {
  storeId: string;
  branchId: string | null;
  query: ParsedTableQuery;
  range?: DateRange;
  status?: string;
  customerId?: string;
  cashierId?: string;
  /** Restrict to this user's own invoices — for staff without `sales.view_all`. */
  onlyUserId?: string;
  paymentState?: 'paid' | 'partial' | 'credit';
}

const SORTABLE: Record<string, string> = {
  number: 'number',
  soldAt: 'soldAt',
  total: 'total',
  dueTotal: 'dueTotal',
};

export async function listInvoices(filters: InvoiceFilters): Promise<InvoiceListResult> {
  const where = buildInvoiceWhere(filters);

  const sortField = SORTABLE[filters.query.sort ?? 'soldAt'] ?? 'soldAt';
  const orderBy = { [sortField]: filters.query.dir } as Prisma.SaleOrderByWithRelationInput;

  const [rows, total, aggregate] = await Promise.all([
    db.sale.findMany({
      where,
      orderBy,
      skip: filters.query.skip,
      take: filters.query.take,
      select: {
        id: true,
        number: true,
        total: true,
        paidTotal: true,
        dueTotal: true,
        profitTotal: true,
        status: true,
        soldAt: true,
        userId: true,
        customer: { select: { id: true, name: true } },
        branch: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.sale.count({ where }),
    db.sale.aggregate({
      where,
      _sum: { total: true, dueTotal: true, profitTotal: true },
    }),
  ]);

  const userIds = [...new Set(rows.map((row) => row.userId))];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return {
    rows: rows.map((row) => ({
      id: row.id,
      number: row.number,
      total: fromDb(row.total),
      paidTotal: fromDb(row.paidTotal),
      dueTotal: fromDb(row.dueTotal),
      profitTotal: fromDb(row.profitTotal),
      itemCount: row._count.items,
      status: row.status,
      customerName: row.customer?.name ?? null,
      customerId: row.customer?.id ?? null,
      cashierName: names.get(row.userId) ?? '—',
      branchName: row.branch.name,
      soldAt: row.soldAt,
    })),
    total,
    totals: {
      sales: fromDb(aggregate._sum.total),
      due: fromDb(aggregate._sum.dueTotal),
      profit: fromDb(aggregate._sum.profitTotal),
    },
  };
}

function buildInvoiceWhere(filters: InvoiceFilters): Prisma.SaleWhereInput {
  const where: Prisma.SaleWhereInput = {
    storeId: filters.storeId,
    deletedAt: null,
    ...(filters.branchId ? { branchId: filters.branchId } : {}),
    ...(filters.onlyUserId ? { userId: filters.onlyUserId } : {}),
    ...(filters.cashierId ? { userId: filters.cashierId } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.range ? { soldAt: { gte: filters.range.from, lt: filters.range.to } } : {}),
  };

  if (filters.status && filters.status !== 'all') {
    where.status = filters.status as SaleStatus;
  }

  if (filters.paymentState === 'paid') where.dueTotal = { lte: 0 };
  if (filters.paymentState === 'credit') where.dueTotal = { gt: 0 };
  if (filters.paymentState === 'partial') {
    where.dueTotal = { gt: 0 };
    where.paidTotal = { gt: 0 };
  }

  const term = filters.query.search;
  if (term) {
    where.OR = [
      { number: { contains: term, mode: 'insensitive' } },
      { customer: { name: { contains: term, mode: 'insensitive' } } },
      { customer: { phone: { contains: term } } },
      { note: { contains: term, mode: 'insensitive' } },
    ];
  }

  return where;
}

// ── Detail ───────────────────────────────────────────────────────────────────

export interface InvoiceDetail {
  id: string;
  number: string;
  status: SaleStatus;
  soldAt: Date;
  note: string | null;
  cancelReason: string | null;
  canceledAt: Date | null;

  subtotal: Money;
  discountTotal: Money;
  taxTotal: Money;
  total: Money;
  paidTotal: Money;
  dueTotal: Money;
  cogsTotal: Money;
  profitTotal: Money;

  branch: { id: string; name: string; phone: string | null; address: string | null };
  cashier: { id: string; name: string };
  customer: { id: string; name: string; phone: string | null; balance: Money } | null;
  shift: { id: string; number: string } | null;

  items: Array<{
    id: string;
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    unitLabel: string;
    quantity: number;
    factor: number;
    saleUnits: number;
    unitPrice: Money;
    discount: Money;
    taxAmount: Money;
    lineTotal: Money;
    cogs: Money;
    returnedQuantity: number;
    returnedUnits: number;
    costPerBase: number;
  }>;

  payments: Array<{
    id: string;
    amount: Money;
    methodName: string;
    reference: string | null;
    paidAt: Date;
    direction: 'IN' | 'OUT';
  }>;

  returns: Array<{
    id: string;
    number: string;
    total: Money;
    refundTotal: Money;
    reason: string;
    returnedAt: Date;
  }>;
}

export async function getInvoice(
  storeId: string,
  saleId: string,
): Promise<InvoiceDetail | null> {
  const sale = await db.sale.findFirst({
    where: { id: saleId, storeId, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      soldAt: true,
      note: true,
      cancelReason: true,
      canceledAt: true,
      subtotal: true,
      discountTotal: true,
      taxTotal: true,
      total: true,
      paidTotal: true,
      dueTotal: true,
      cogsTotal: true,
      profitTotal: true,
      userId: true,
      branch: { select: { id: true, name: true, phone: true, address: true } },
      customer: { select: { id: true, name: true, phone: true, balance: true } },
      shift: { select: { id: true, number: true } },
      items: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          variantId: true,
          productName: true,
          variantName: true,
          sku: true,
          unitLabel: true,
          quantityBase: true,
          displayFactor: true,
          unitPrice: true,
          discount: true,
          taxAmount: true,
          lineTotal: true,
          cogs: true,
          costPerBase: true,
          returnedQuantityBase: true,
        },
      },
      payments: {
        where: { deletedAt: null },
        orderBy: { paidAt: 'asc' },
        select: {
          id: true,
          amount: true,
          reference: true,
          paidAt: true,
          direction: true,
          method: { select: { name: true } },
        },
      },
      returns: {
        where: { deletedAt: null },
        orderBy: { returnedAt: 'desc' },
        select: {
          id: true,
          number: true,
          total: true,
          refundTotal: true,
          reason: true,
          returnedAt: true,
        },
      },
    },
  });

  if (!sale) return null;

  const cashier = await db.user.findUnique({
    where: { id: sale.userId },
    select: { id: true, name: true },
  });

  return {
    id: sale.id,
    number: sale.number,
    status: sale.status,
    soldAt: sale.soldAt,
    note: sale.note,
    cancelReason: sale.cancelReason,
    canceledAt: sale.canceledAt,
    subtotal: fromDb(sale.subtotal),
    discountTotal: fromDb(sale.discountTotal),
    taxTotal: fromDb(sale.taxTotal),
    total: fromDb(sale.total),
    paidTotal: fromDb(sale.paidTotal),
    dueTotal: fromDb(sale.dueTotal),
    cogsTotal: fromDb(sale.cogsTotal),
    profitTotal: fromDb(sale.profitTotal),
    branch: sale.branch,
    cashier: cashier ?? { id: sale.userId, name: '—' },
    customer: sale.customer
      ? {
          id: sale.customer.id,
          name: sale.customer.name,
          phone: sale.customer.phone,
          balance: fromDb(sale.customer.balance),
        }
      : null,
    shift: sale.shift,
    items: sale.items.map((item) => {
      const factor = factorFromDb(item.displayFactor);
      const quantity = qtyFromDb(item.quantityBase);
      const returned = qtyFromDb(item.returnedQuantityBase);
      return {
        id: item.id,
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        unitLabel: item.unitLabel,
        quantity,
        factor,
        saleUnits: quantity / factor,
        unitPrice: fromDb(item.unitPrice),
        discount: fromDb(item.discount),
        taxAmount: fromDb(item.taxAmount),
        lineTotal: fromDb(item.lineTotal),
        cogs: fromDb(item.cogs),
        returnedQuantity: returned,
        returnedUnits: returned / factor,
        costPerBase: costFromDb(item.costPerBase),
      };
    }),
    payments: sale.payments.map((payment) => ({
      id: payment.id,
      amount: fromDb(payment.amount),
      methodName: payment.method.name,
      reference: payment.reference,
      paidAt: payment.paidAt,
      direction: payment.direction,
    })),
    returns: sale.returns.map((entry) => ({
      id: entry.id,
      number: entry.number,
      total: fromDb(entry.total),
      refundTotal: fromDb(entry.refundTotal),
      reason: entry.reason,
      returnedAt: entry.returnedAt,
    })),
  };
}

/** Store identity printed at the top of a receipt. */
export interface ReceiptStore {
  name: string;
  logoUrl: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  taxEnabled: boolean;
  taxRateBps: number;
  taxInclusive: boolean;
  receiptWidthMm: number;
  receiptFooterAr: string;
  showLogoOnReceipt: boolean;
  currency: string;
  currencyDecimals: number;
  timezone: string;
  locale: string;
  ageNoticeAr: string;
  ageVerificationEnabled: boolean;
}

export async function getReceiptStore(storeId: string): Promise<ReceiptStore | null> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: {
      name: true,
      logoUrl: true,
      phone: true,
      address: true,
      settings: true,
    },
  });

  if (!store?.settings) return null;
  const settings = store.settings;

  return {
    name: store.name,
    logoUrl: store.logoUrl,
    phone: store.phone,
    address: store.address,
    taxNumber: settings.taxNumber,
    taxEnabled: settings.taxEnabled,
    taxRateBps: settings.taxRateBps,
    taxInclusive: settings.taxInclusive,
    receiptWidthMm: settings.receiptWidthMm,
    receiptFooterAr: settings.receiptFooterAr,
    showLogoOnReceipt: settings.showLogoOnReceipt,
    currency: settings.currency,
    currencyDecimals: settings.currencyDecimals,
    timezone: settings.timezone,
    locale: settings.locale,
    ageNoticeAr: settings.ageNoticeAr,
    ageVerificationEnabled: settings.ageVerificationEnabled,
  };
}

/** Cashiers for the invoice filter dropdown. */
export async function listStoreCashiers(storeId: string) {
  const members = await db.storeUser.findMany({
    where: { storeId, status: 'ACTIVE' },
    select: { user: { select: { id: true, name: true } } },
    orderBy: { user: { name: 'asc' } },
  });
  return members.map((member) => member.user);
}
