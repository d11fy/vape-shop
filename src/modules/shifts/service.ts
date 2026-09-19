import 'server-only';

import type { Tx } from '@/core/db';
import { businessRule, notFound } from '@/core/errors';
import { fromDb, toDb, type Money } from '@/core/money';
import { nextDocumentNumber } from '@/core/numbering';
import { recordAudit } from '@/core/audit';
import { storeFormatter } from '@/lib/formatter';
import { getBranchCashbox, postCashMovement } from '@/modules/cashbox/service';

/**
 * Cashier shifts.
 *
 * A shift is the unit of accountability at the till: it starts with a counted
 * float, accumulates the cash that passed through it, and ends with a physical
 * count. The difference between expected and actual is the number that matters
 * — it is recorded, it needs a reason, and a closed shift can never be edited.
 */

export interface OpenShiftInput {
  storeId: string;
  branchId: string;
  userId: string;
  openingCash: Money;
  note?: string | null;
}

export async function openShift(tx: Tx, input: OpenShiftInput) {
  const existing = await tx.shift.findFirst({
    where: {
      storeId: input.storeId,
      branchId: input.branchId,
      userId: input.userId,
      status: 'OPEN',
    },
    select: { id: true, number: true },
  });

  if (existing) {
    throw businessRule(`لديك وردية مفتوحة بالفعل (${existing.number}). أغلقها أولاً.`);
  }

  const settings = await tx.storeSettings.findUniqueOrThrow({
    where: { storeId: input.storeId },
    select: {
      invoicePrefix: true,
      timezone: true,
      currency: true,
      currencyDecimals: true,
      locale: true,
    },
  });

  const cashbox = await getBranchCashbox(tx, input.storeId, input.branchId);
  const number = await nextDocumentNumber(tx, input.storeId, 'SHIFT', {
    prefix: settings.invoicePrefix,
    padding: 4,
    timezone: settings.timezone,
  });

  const shift = await tx.shift.create({
    data: {
      storeId: input.storeId,
      branchId: input.branchId,
      cashboxId: cashbox.id,
      userId: input.userId,
      number,
      status: 'OPEN',
      openingCash: toDb(input.openingCash),
      expectedCash: toDb(input.openingCash),
      openNote: input.note ?? null,
    },
    select: { id: true, number: true },
  });

  await recordAudit(tx, {
    storeId: input.storeId,
    userId: input.userId,
    action: 'shift.open',
    entityType: 'shift',
    entityId: shift.id,
    summary: `فتح وردية ${number} برصيد افتتاحي ${storeFormatter(settings).money(input.openingCash)}`,
    after: { number, openingCash: input.openingCash },
  });

  return shift;
}

export interface ShiftTotals {
  openingCash: Money;
  cashSales: Money;
  cardSales: Money;
  collections: Money;
  refunds: Money;
  expenses: Money;
  payouts: Money;
  cashIn: Money;
  cashOut: Money;
  /** What should physically be in the drawer. */
  expectedCash: Money;
  invoiceCount: number;
  salesTotal: Money;
}

/**
 * Recompute a shift's totals from its underlying movements.
 *
 * Derived rather than trusted: incremental counters can drift if a sale is
 * cancelled or an expense deleted mid-shift, and the closing count has to be
 * compared against the truth.
 */
export async function computeShiftTotals(
  tx: Tx,
  shiftId: string,
): Promise<ShiftTotals> {
  const shift = await tx.shift.findUniqueOrThrow({
    where: { id: shiftId },
    select: { openingCash: true, openedAt: true, closedAt: true, storeId: true },
  });

  const [sales, payments, expenses, cashMovements] = await Promise.all([
    tx.sale.aggregate({
      where: { shiftId, deletedAt: null, status: { not: 'CANCELED' } },
      _sum: { total: true },
      _count: true,
    }),
    tx.payment.findMany({
      where: { shiftId, deletedAt: null },
      select: {
        amount: true,
        direction: true,
        source: true,
        method: { select: { affectsCashbox: true } },
      },
    }),
    tx.expense.aggregate({
      where: { shiftId, deletedAt: null, method: { affectsCashbox: true } },
      _sum: { amount: true },
    }),
    tx.cashboxTransaction.findMany({
      where: { shiftId, type: { in: ['CASH_IN', 'CASH_OUT'] } },
      select: { amount: true, type: true },
    }),
  ]);

  let cashSales = 0;
  let cardSales = 0;
  let collections = 0;
  let refunds = 0;
  let payouts = 0;

  for (const payment of payments) {
    const amount = fromDb(payment.amount);
    const isCash = payment.method.affectsCashbox;

    if (payment.direction === 'IN') {
      if (payment.source === 'SALE') {
        if (isCash) cashSales += amount;
        else cardSales += amount;
      } else if (payment.source === 'CUSTOMER_DEBT' && isCash) {
        collections += amount;
      }
    } else if (isCash) {
      if (payment.source === 'SALE_REFUND') refunds += amount;
      else payouts += amount;
    }
  }

  const cashIn = cashMovements
    .filter((movement) => movement.type === 'CASH_IN')
    .reduce((sum, movement) => sum + fromDb(movement.amount), 0);
  const cashOut = cashMovements
    .filter((movement) => movement.type === 'CASH_OUT')
    .reduce((sum, movement) => sum + Math.abs(fromDb(movement.amount)), 0);

  const openingCash = fromDb(shift.openingCash);
  const expenseTotal = fromDb(expenses._sum.amount);

  return {
    openingCash,
    cashSales,
    cardSales,
    collections,
    refunds,
    expenses: expenseTotal,
    payouts,
    cashIn,
    cashOut,
    expectedCash:
      openingCash + cashSales + collections + cashIn - refunds - expenseTotal - payouts - cashOut,
    invoiceCount: sales._count,
    salesTotal: fromDb(sales._sum.total),
  };
}

export interface CloseShiftInput {
  storeId: string;
  userId: string;
  shiftId: string;
  /** What the cashier actually counted in the drawer. */
  actualCash: Money;
  differenceReason?: string | null;
  note?: string | null;
}

export async function closeShift(tx: Tx, input: CloseShiftInput) {
  const shift = await tx.shift.findFirst({
    where: { id: input.shiftId, storeId: input.storeId },
    select: {
      id: true,
      number: true,
      status: true,
      userId: true,
      cashboxId: true,
      branchId: true,
    },
  });

  if (!shift) throw notFound('الوردية');
  if (shift.status === 'CLOSED') throw businessRule('هذه الوردية مغلقة بالفعل.');

  const totals = await computeShiftTotals(tx, shift.id);
  const difference = input.actualCash - totals.expectedCash;

  if (difference !== 0 && !input.differenceReason?.trim()) {
    throw businessRule('يوجد فرق في النقدية — اذكر سبب الفرق قبل إغلاق الوردية.');
  }

  // Amounts in the audit line and the owner's alert are written in the store's
  // currency — "عجز 25.00 ر.س", never a raw "-2500".
  const settings = await tx.storeSettings.findUniqueOrThrow({
    where: { storeId: input.storeId },
    select: { currency: true, currencyDecimals: true, timezone: true, locale: true },
  });
  const fmt = storeFormatter(settings);
  const differenceLabel = `${difference > 0 ? 'زيادة' : 'عجز'} ${fmt.money(Math.abs(difference))}`;

  await tx.shift.update({
    where: { id: shift.id },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      expectedCash: toDb(totals.expectedCash),
      actualCash: toDb(input.actualCash),
      difference: toDb(difference),
      differenceReason: input.differenceReason?.trim() || null,
      closeNote: input.note ?? null,
      salesTotal: toDb(totals.salesTotal),
      cashSalesTotal: toDb(totals.cashSales),
      refundsTotal: toDb(totals.refunds),
      expensesTotal: toDb(totals.expenses),
      collectionsTotal: toDb(totals.collections),
      payoutsTotal: toDb(totals.payouts),
      invoiceCount: totals.invoiceCount,
    },
  });

  // A counted surplus or shortfall is itself a cash movement: without it, the
  // drawer balance would keep carrying an error nobody can trace.
  if (difference !== 0) {
    await postCashMovement(tx, {
      storeId: input.storeId,
      cashboxId: shift.cashboxId,
      type: 'SHIFT_SETTLEMENT',
      amount: difference,
      referenceType: 'shift',
      referenceId: shift.id,
      shiftId: shift.id,
      userId: input.userId,
      description: `تسوية فرق وردية ${shift.number}: ${input.differenceReason ?? ''}`.trim(),
    });
  }

  await recordAudit(tx, {
    storeId: input.storeId,
    userId: input.userId,
    action: 'shift.close',
    entityType: 'shift',
    entityId: shift.id,
    summary:
      difference === 0
        ? `إغلاق وردية ${shift.number} بدون فروقات`
        : `إغلاق وردية ${shift.number} بفرق (${differenceLabel})`,
    after: {
      number: shift.number,
      expectedCash: totals.expectedCash,
      actualCash: input.actualCash,
      difference,
      reason: input.differenceReason ?? null,
      invoices: totals.invoiceCount,
    },
  });

  // A discrepancy worth noticing gets a notification for the owner.
  if (Math.abs(difference) > 0) {
    await tx.notification.create({
      data: {
        storeId: input.storeId,
        kind: 'CASH_MISMATCH',
        // Large means 50 in the store's own currency, whatever its decimals.
        severity: Math.abs(difference) > 50 * 10 ** settings.currencyDecimals ? 'DANGER' : 'WARNING',
        title: 'فرق في تسوية الوردية',
        body: `وردية ${shift.number} أُغلقت بـ${differenceLabel}. السبب: ${
          input.differenceReason ?? 'غير محدد'
        }`,
        entityType: 'shift',
        entityId: shift.id,
        link: `/cashbox/shifts/${shift.id}`,
      },
    });
  }

  return { shiftId: shift.id, number: shift.number, difference, expected: totals.expectedCash };
}

/** Manual cash in / out — the owner topping up the float or taking cash to the bank. */
export async function recordCashMovement(
  tx: Tx,
  input: {
    storeId: string;
    branchId: string;
    userId: string;
    direction: 'in' | 'out';
    amount: Money;
    reason: string;
  },
) {
  if (input.amount <= 0) throw businessRule('أدخل مبلغاً أكبر من صفر.');

  const cashbox = await getBranchCashbox(tx, input.storeId, input.branchId);

  if (input.direction === 'out' && cashbox.balance < input.amount) {
    throw businessRule('رصيد الصندوق لا يكفي لهذا السحب.');
  }

  const shift = await tx.shift.findFirst({
    where: {
      storeId: input.storeId,
      branchId: input.branchId,
      userId: input.userId,
      status: 'OPEN',
    },
    select: { id: true },
  });

  const movement = await postCashMovement(tx, {
    storeId: input.storeId,
    cashboxId: cashbox.id,
    type: input.direction === 'in' ? 'CASH_IN' : 'CASH_OUT',
    amount: input.direction === 'in' ? input.amount : -input.amount,
    referenceType: 'manual',
    shiftId: shift?.id ?? null,
    userId: input.userId,
    description: input.reason,
  });

  const settings = await tx.storeSettings.findUniqueOrThrow({
    where: { storeId: input.storeId },
    select: { currency: true, currencyDecimals: true, timezone: true, locale: true },
  });

  await recordAudit(tx, {
    storeId: input.storeId,
    userId: input.userId,
    action: input.direction === 'in' ? 'cashbox.cash_in' : 'cashbox.cash_out',
    entityType: 'cashbox',
    entityId: cashbox.id,
    summary: `${input.direction === 'in' ? 'إيداع' : 'سحب'} نقدي ${storeFormatter(settings).money(
      input.amount,
    )} — ${input.reason}`,
    after: { amount: input.amount, reason: input.reason, balanceAfter: movement.balanceAfter },
  });

  return movement;
}
