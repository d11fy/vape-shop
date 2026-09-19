import 'server-only';

import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { fromDb, type Money } from '@/core/money';
import type { ParsedTableQuery } from '@/lib/table-query';
import type { DateRange } from '@/core/datetime';
import type { CashboxTxnType, ShiftStatus } from '@/generated/prisma/enums';

/**
 * Cash drawer and shift queries.
 */

export { CASH_TYPE_LABEL } from './labels';

export interface CashMovementRow {
  id: string;
  type: CashboxTxnType;
  amount: Money;
  balanceAfter: Money;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  userName: string;
  occurredAt: Date;
}

export interface CashboxOverview {
  balance: Money;
  cashboxName: string;
  period: {
    inflow: Money;
    outflow: Money;
    net: Money;
    salesCash: Money;
    collections: Money;
    expenses: Money;
    supplierPayments: Money;
    refunds: Money;
  };
  openShift: {
    id: string;
    number: string;
    userName: string;
    openedAt: Date;
    openingCash: Money;
  } | null;
}

export async function getCashboxOverview(
  storeId: string,
  branchId: string,
  range: DateRange,
): Promise<CashboxOverview> {
  const cashbox = await db.cashbox.findFirst({
    where: { storeId, branchId, isActive: true },
    orderBy: { isDefault: 'desc' },
    select: { id: true, name: true, balance: true },
  });

  if (!cashbox) {
    return {
      balance: 0,
      cashboxName: 'الصندوق الرئيسي',
      period: {
        inflow: 0,
        outflow: 0,
        net: 0,
        salesCash: 0,
        collections: 0,
        expenses: 0,
        supplierPayments: 0,
        refunds: 0,
      },
      openShift: null,
    };
  }

  const [movements, openShift] = await Promise.all([
    db.cashboxTransaction.groupBy({
      by: ['type'],
      where: {
        cashboxId: cashbox.id,
        occurredAt: { gte: range.from, lt: range.to },
      },
      _sum: { amount: true },
    }),
    db.shift.findFirst({
      where: { storeId, branchId, status: 'OPEN' },
      orderBy: { openedAt: 'desc' },
      select: { id: true, number: true, openedAt: true, openingCash: true, userId: true },
    }),
  ]);

  const byType = new Map(movements.map((row) => [row.type, fromDb(row._sum.amount)]));
  const sum = (types: CashboxTxnType[]) =>
    types.reduce((total, type) => total + (byType.get(type) ?? 0), 0);

  const inflow = [...byType.values()].filter((value) => value > 0).reduce((a, b) => a + b, 0);
  const outflow = [...byType.values()].filter((value) => value < 0).reduce((a, b) => a + b, 0);

  let shiftUser = '—';
  if (openShift) {
    const user = await db.user.findUnique({
      where: { id: openShift.userId },
      select: { name: true },
    });
    shiftUser = user?.name ?? '—';
  }

  return {
    balance: fromDb(cashbox.balance),
    cashboxName: cashbox.name,
    period: {
      inflow,
      outflow: Math.abs(outflow),
      net: inflow + outflow,
      salesCash: sum(['SALE']),
      collections: sum(['DEBT_COLLECTION']),
      expenses: Math.abs(sum(['EXPENSE'])),
      supplierPayments: Math.abs(sum(['SUPPLIER_PAYMENT', 'PURCHASE'])),
      refunds: Math.abs(sum(['SALE_REFUND'])),
    },
    openShift: openShift
      ? {
          id: openShift.id,
          number: openShift.number,
          userName: shiftUser,
          openedAt: openShift.openedAt,
          openingCash: fromDb(openShift.openingCash),
        }
      : null,
  };
}

export async function listCashMovements(input: {
  storeId: string;
  branchId: string;
  query: ParsedTableQuery;
  range?: DateRange;
  type?: string;
}): Promise<{ rows: CashMovementRow[]; total: number }> {
  const cashbox = await db.cashbox.findFirst({
    where: { storeId: input.storeId, branchId: input.branchId, isActive: true },
    orderBy: { isDefault: 'desc' },
    select: { id: true },
  });

  if (!cashbox) return { rows: [], total: 0 };

  const where: Prisma.CashboxTransactionWhereInput = {
    cashboxId: cashbox.id,
    ...(input.type && input.type !== 'all' ? { type: input.type as CashboxTxnType } : {}),
    ...(input.range ? { occurredAt: { gte: input.range.from, lt: input.range.to } } : {}),
    ...(input.query.search
      ? { description: { contains: input.query.search, mode: 'insensitive' } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.cashboxTransaction.findMany({
      where,
      orderBy: { occurredAt: input.query.dir },
      skip: input.query.skip,
      take: input.query.take,
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
    db.cashboxTransaction.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((row) => row.userId))];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      type: row.type,
      amount: fromDb(row.amount),
      balanceAfter: fromDb(row.balanceAfter),
      description: row.description,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      userName: names.get(row.userId) ?? '—',
      occurredAt: row.occurredAt,
    })),
  };
}

// ── Shifts ───────────────────────────────────────────────────────────────────

export interface ShiftRow {
  id: string;
  number: string;
  status: ShiftStatus;
  userName: string;
  branchName: string;
  openingCash: Money;
  expectedCash: Money;
  actualCash: Money | null;
  difference: Money;
  differenceReason: string | null;
  salesTotal: Money;
  cashSalesTotal: Money;
  invoiceCount: number;
  openedAt: Date;
  closedAt: Date | null;
}

export async function listShifts(input: {
  storeId: string;
  branchId: string | null;
  query: ParsedTableQuery;
  range?: DateRange;
  userId?: string;
  status?: string;
}): Promise<{ rows: ShiftRow[]; total: number }> {
  const where: Prisma.ShiftWhereInput = {
    storeId: input.storeId,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.status && input.status !== 'all' ? { status: input.status as ShiftStatus } : {}),
    ...(input.range ? { openedAt: { gte: input.range.from, lt: input.range.to } } : {}),
  };

  const [rows, total] = await Promise.all([
    db.shift.findMany({
      where,
      orderBy: { openedAt: 'desc' },
      skip: input.query.skip,
      take: input.query.take,
      select: {
        id: true,
        number: true,
        status: true,
        openingCash: true,
        expectedCash: true,
        actualCash: true,
        difference: true,
        differenceReason: true,
        salesTotal: true,
        cashSalesTotal: true,
        invoiceCount: true,
        openedAt: true,
        closedAt: true,
        userId: true,
        branch: { select: { name: true } },
      },
    }),
    db.shift.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((row) => row.userId))];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      number: row.number,
      status: row.status,
      userName: names.get(row.userId) ?? '—',
      branchName: row.branch.name,
      openingCash: fromDb(row.openingCash),
      expectedCash: fromDb(row.expectedCash),
      actualCash: row.actualCash === null ? null : fromDb(row.actualCash),
      difference: fromDb(row.difference),
      differenceReason: row.differenceReason,
      salesTotal: fromDb(row.salesTotal),
      cashSalesTotal: fromDb(row.cashSalesTotal),
      invoiceCount: row.invoiceCount,
      openedAt: row.openedAt,
      closedAt: row.closedAt,
    })),
  };
}

export async function getShift(storeId: string, shiftId: string) {
  const shift = await db.shift.findFirst({
    where: { id: shiftId, storeId },
    select: {
      id: true,
      number: true,
      status: true,
      openingCash: true,
      expectedCash: true,
      actualCash: true,
      difference: true,
      differenceReason: true,
      openNote: true,
      closeNote: true,
      salesTotal: true,
      cashSalesTotal: true,
      refundsTotal: true,
      expensesTotal: true,
      collectionsTotal: true,
      payoutsTotal: true,
      invoiceCount: true,
      openedAt: true,
      closedAt: true,
      userId: true,
      branch: { select: { name: true } },
    },
  });

  if (!shift) return null;

  const [user, sales] = await Promise.all([
    db.user.findUnique({ where: { id: shift.userId }, select: { id: true, name: true } }),
    db.sale.findMany({
      where: { shiftId: shift.id, deletedAt: null },
      orderBy: { soldAt: 'desc' },
      take: 25,
      select: {
        id: true,
        number: true,
        total: true,
        dueTotal: true,
        status: true,
        soldAt: true,
      },
    }),
  ]);

  return {
    id: shift.id,
    number: shift.number,
    status: shift.status,
    userId: shift.userId,
    userName: user?.name ?? '—',
    branchName: shift.branch.name,
    openingCash: fromDb(shift.openingCash),
    expectedCash: fromDb(shift.expectedCash),
    actualCash: shift.actualCash === null ? null : fromDb(shift.actualCash),
    difference: fromDb(shift.difference),
    differenceReason: shift.differenceReason,
    openNote: shift.openNote,
    closeNote: shift.closeNote,
    salesTotal: fromDb(shift.salesTotal),
    cashSalesTotal: fromDb(shift.cashSalesTotal),
    refundsTotal: fromDb(shift.refundsTotal),
    expensesTotal: fromDb(shift.expensesTotal),
    collectionsTotal: fromDb(shift.collectionsTotal),
    payoutsTotal: fromDb(shift.payoutsTotal),
    invoiceCount: shift.invoiceCount,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    sales: sales.map((sale) => ({
      id: sale.id,
      number: sale.number,
      total: fromDb(sale.total),
      dueTotal: fromDb(sale.dueTotal),
      status: sale.status,
      soldAt: sale.soldAt,
    })),
  };
}
