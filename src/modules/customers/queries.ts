import 'server-only';

import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { fromDb, type Money } from '@/core/money';
import { ageInDays } from '@/core/datetime';
import type { ParsedTableQuery } from '@/lib/table-query';
import type { PartyLedgerType } from '@/generated/prisma/enums';

/**
 * Customer queries.
 *
 * The debt view is the reason this module matters: a shopkeeper needs to know
 * who owes what, for how long, and when they last paid anything — all three, on
 * one screen, sorted by urgency.
 */

export interface CustomerListRow {
  id: string;
  name: string;
  phone: string | null;
  balance: Money;
  debtLimit: Money;
  totalPurchases: Money;
  invoiceCount: number;
  lastPurchaseAt: Date | null;
  lastPaymentAt: Date | null;
  /** Days since the oldest unpaid invoice — 0 when nothing is owed. */
  debtAgeDays: number;
  isActive: boolean;
  createdAt: Date;
}

export interface CustomerListResult {
  rows: CustomerListRow[];
  total: number;
  summary: { totalDebt: Money; debtorCount: number; overdueDebt: Money };
}

export interface CustomerFilters {
  storeId: string;
  query: ParsedTableQuery;
  /** Only customers carrying a balance. */
  debtorsOnly?: boolean;
  /** Debt older than the store's overdue threshold. */
  overdueOnly?: boolean;
  overdueDays?: number;
  status?: 'active' | 'inactive' | 'all';
}

export async function listCustomers(filters: CustomerFilters): Promise<CustomerListResult> {
  const where: Prisma.CustomerWhereInput = {
    storeId: filters.storeId,
    deletedAt: null,
    ...(filters.debtorsOnly ? { balance: { gt: 0 } } : {}),
    ...(filters.status === 'inactive'
      ? { isActive: false }
      : filters.status === 'all'
        ? {}
        : { isActive: true }),
  };

  const term = filters.query.search;
  if (term) {
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { phone: { contains: term } },
      { email: { contains: term, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    filters.query.sort === 'balance'
      ? { balance: filters.query.dir }
      : filters.query.sort === 'name'
        ? { name: filters.query.dir }
        : filters.query.sort === 'createdAt'
          ? { createdAt: filters.query.dir }
          : filters.debtorsOnly
            ? { balance: 'desc' }
            : { name: 'asc' };

  const [customers, total, summary] = await Promise.all([
    db.customer.findMany({
      where,
      orderBy,
      skip: filters.query.skip,
      take: filters.query.take,
      select: {
        id: true,
        name: true,
        phone: true,
        balance: true,
        debtLimit: true,
        isActive: true,
        createdAt: true,
        sales: {
          where: { deletedAt: null, status: { not: 'CANCELED' } },
          select: { total: true, soldAt: true, dueTotal: true },
          orderBy: { soldAt: 'desc' },
        },
        ledger: {
          where: { type: 'PAYMENT' },
          select: { occurredAt: true },
          orderBy: { occurredAt: 'desc' },
          take: 1,
        },
      },
    }),
    db.customer.count({ where }),
    debtSummary(filters.storeId, filters.overdueDays ?? 30),
  ]);

  const now = new Date();

  const rows = customers.map((customer) => {
    const totalPurchases = customer.sales.reduce((sum, sale) => sum + fromDb(sale.total), 0);
    const lastPurchaseAt = customer.sales[0]?.soldAt ?? null;

    // Age of the debt = how long the oldest still-unpaid invoice has been open.
    const oldestUnpaid = [...customer.sales]
      .filter((sale) => fromDb(sale.dueTotal) > 0)
      .sort((a, b) => a.soldAt.getTime() - b.soldAt.getTime())[0];

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      balance: fromDb(customer.balance),
      debtLimit: fromDb(customer.debtLimit),
      totalPurchases,
      invoiceCount: customer.sales.length,
      lastPurchaseAt,
      lastPaymentAt: customer.ledger[0]?.occurredAt ?? null,
      debtAgeDays: oldestUnpaid ? ageInDays(oldestUnpaid.soldAt, now) : 0,
      isActive: customer.isActive,
      createdAt: customer.createdAt,
    } satisfies CustomerListRow;
  });

  const filtered =
    filters.overdueOnly && filters.overdueDays
      ? rows.filter((row) => row.balance > 0 && row.debtAgeDays >= filters.overdueDays!)
      : rows;

  return { rows: filtered, total, summary };
}

async function debtSummary(storeId: string, overdueDays: number) {
  const [totals, overdue] = await Promise.all([
    db.customer.aggregate({
      where: { storeId, deletedAt: null, balance: { gt: 0 } },
      _sum: { balance: true },
      _count: true,
    }),
    overdueDebtSummary(storeId, overdueDays),
  ]);

  return {
    totalDebt: fromDb(totals._sum.balance),
    debtorCount: totals._count,
    overdueDebt: overdue.total,
  };
}

/**
 * THE definition of an overdue debt, used by the debts page, the dashboard and
 * the daily alert alike: a customer who owes money and has at least one
 * invoice still unpaid after the store's `debtOverdueDays`.
 */
export async function overdueDebtSummary(
  storeId: string,
  overdueDays: number,
): Promise<{ total: Money; customers: number }> {
  const cutoff = new Date(Date.now() - overdueDays * 24 * 60 * 60 * 1000);

  const rows = await db.$queryRaw<Array<{ total: bigint | null; customers: bigint | null }>>`
    SELECT COALESCE(SUM(c.balance), 0)::bigint AS total,
           COUNT(*)::bigint AS customers
      FROM customers c
     WHERE c."storeId" = ${storeId}
       AND c."deletedAt" IS NULL
       AND c.balance > 0
       AND EXISTS (
         SELECT 1 FROM sales s
          WHERE s."customerId" = c.id
            AND s."deletedAt" IS NULL
            AND s."dueTotal" > 0
            AND s."soldAt" < ${cutoff}
       )
  `;

  return {
    total: fromDb(rows[0]?.total ?? 0n),
    customers: Number(rows[0]?.customers ?? 0n),
  };
}

// ── Detail ───────────────────────────────────────────────────────────────────

export interface LedgerEntryRow {
  id: string;
  type: PartyLedgerType;
  amount: Money;
  balanceAfter: Money;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  userName: string;
  occurredAt: Date;
}

export interface CustomerDetail {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  balance: Money;
  debtLimit: Money;
  isActive: boolean;
  ageVerified: boolean;
  ageVerifiedAt: Date | null;
  createdAt: Date;

  stats: {
    totalPurchases: Money;
    invoiceCount: number;
    averageInvoice: Money;
    totalPaid: Money;
    totalReturned: Money;
    lastPurchaseAt: Date | null;
    firstPurchaseAt: Date | null;
  };

  recentSales: Array<{
    id: string;
    number: string;
    total: Money;
    dueTotal: Money;
    status: string;
    soldAt: Date;
  }>;

  ledger: LedgerEntryRow[];
}

export async function getCustomer(
  storeId: string,
  customerId: string,
): Promise<CustomerDetail | null> {
  const customer = await db.customer.findFirst({
    where: { id: customerId, storeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      address: true,
      note: true,
      balance: true,
      debtLimit: true,
      isActive: true,
      ageVerified: true,
      ageVerifiedAt: true,
      createdAt: true,
    },
  });

  if (!customer) return null;

  const [salesAggregate, recentSales, ledger, returnsAggregate, paymentsAggregate] =
    await Promise.all([
      db.sale.aggregate({
        where: { storeId, customerId, deletedAt: null, status: { not: 'CANCELED' } },
        _sum: { total: true },
        _count: true,
        _min: { soldAt: true },
        _max: { soldAt: true },
      }),
      db.sale.findMany({
        where: { storeId, customerId, deletedAt: null },
        orderBy: { soldAt: 'desc' },
        take: 10,
        select: {
          id: true,
          number: true,
          total: true,
          dueTotal: true,
          status: true,
          soldAt: true,
        },
      }),
      db.customerLedgerEntry.findMany({
        where: { storeId, customerId },
        orderBy: { occurredAt: 'desc' },
        take: 40,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          description: true,
          referenceType: true,
          referenceId: true,
          occurredAt: true,
          userId: true,
        },
      }),
      db.saleReturn.aggregate({
        where: { storeId, customerId, deletedAt: null },
        _sum: { total: true },
      }),
      db.payment.aggregate({
        where: { storeId, customerId, deletedAt: null, direction: 'IN' },
        _sum: { amount: true },
      }),
    ]);

  const userIds = [...new Set(ledger.map((entry) => entry.userId).filter(Boolean))] as string[];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  const totalPurchases = fromDb(salesAggregate._sum.total);
  const invoiceCount = salesAggregate._count;

  return {
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    note: customer.note,
    balance: fromDb(customer.balance),
    debtLimit: fromDb(customer.debtLimit),
    isActive: customer.isActive,
    ageVerified: customer.ageVerified,
    ageVerifiedAt: customer.ageVerifiedAt,
    createdAt: customer.createdAt,
    stats: {
      totalPurchases,
      invoiceCount,
      averageInvoice: invoiceCount > 0 ? Math.round(totalPurchases / invoiceCount) : 0,
      totalPaid: fromDb(paymentsAggregate._sum.amount),
      totalReturned: fromDb(returnsAggregate._sum.total),
      lastPurchaseAt: salesAggregate._max.soldAt,
      firstPurchaseAt: salesAggregate._min.soldAt,
    },
    recentSales: recentSales.map((sale) => ({
      id: sale.id,
      number: sale.number,
      total: fromDb(sale.total),
      dueTotal: fromDb(sale.dueTotal),
      status: sale.status,
      soldAt: sale.soldAt,
    })),
    ledger: ledger.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: fromDb(entry.amount),
      balanceAfter: fromDb(entry.balanceAfter),
      description: entry.description,
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      userName: entry.userId ? (names.get(entry.userId) ?? '—') : 'النظام',
      occurredAt: entry.occurredAt,
    })),
  };
}

/** Invoices with an outstanding balance, oldest first — the collection queue. */
export async function getOpenInvoices(storeId: string, customerId: string) {
  const sales = await db.sale.findMany({
    where: { storeId, customerId, deletedAt: null, dueTotal: { gt: 0 } },
    orderBy: { soldAt: 'asc' },
    select: { id: true, number: true, total: true, paidTotal: true, dueTotal: true, soldAt: true },
  });

  const now = new Date();
  return sales.map((sale) => ({
    id: sale.id,
    number: sale.number,
    total: fromDb(sale.total),
    paidTotal: fromDb(sale.paidTotal),
    dueTotal: fromDb(sale.dueTotal),
    soldAt: sale.soldAt,
    ageDays: ageInDays(sale.soldAt, now),
  }));
}
