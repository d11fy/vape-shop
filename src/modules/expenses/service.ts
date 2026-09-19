import 'server-only';

import type { Tx } from '@/core/db';
import { businessRule } from '@/core/errors';
import { toDb, type Money } from '@/core/money';
import { getBranchCashbox, postCashMovement } from '@/modules/cashbox/service';

export interface RecordExpenseInput {
  storeId: string;
  branchId: string;
  userId: string;
  categoryId: string;
  /** How it was paid; `null` when paid from outside the shop's money. */
  method: { id: string; affectsCashbox: boolean } | null;
  amount: Money;
  description: string;
  note?: string | null;
  receiptUrl?: string | null;
  spentAt: Date;
}

/**
 * Record an expense and its effect on the money.
 *
 * Paid in cash, it leaves the drawer as an EXPENSE movement and is counted
 * against the paying cashier's open shift, so the closing count expects less
 * cash. Paid any other way, the drawer is untouched. Either way it reduces net
 * profit in the reports, which read the expense rows themselves.
 */
export async function recordExpense(
  tx: Tx,
  input: RecordExpenseInput,
): Promise<{ expenseId: string; shiftId: string | null }> {
  if (input.amount <= 0) throw businessRule('أدخل مبلغاً أكبر من صفر.');

  const shift = await tx.shift.findFirst({
    where: {
      storeId: input.storeId,
      branchId: input.branchId,
      userId: input.userId,
      status: 'OPEN',
    },
    select: { id: true },
  });

  const expense = await tx.expense.create({
    data: {
      storeId: input.storeId,
      branchId: input.branchId,
      categoryId: input.categoryId,
      methodId: input.method?.id ?? null,
      amount: toDb(input.amount),
      description: input.description,
      note: input.note || null,
      receiptUrl: input.receiptUrl || null,
      userId: input.userId,
      shiftId: shift?.id ?? null,
      spentAt: input.spentAt,
    },
    select: { id: true },
  });

  if (input.method?.affectsCashbox) {
    const cashbox = await getBranchCashbox(tx, input.storeId, input.branchId);
    await postCashMovement(tx, {
      storeId: input.storeId,
      cashboxId: cashbox.id,
      type: 'EXPENSE',
      amount: -input.amount,
      referenceType: 'expense',
      referenceId: expense.id,
      shiftId: shift?.id ?? null,
      userId: input.userId,
      description: input.description,
      occurredAt: input.spentAt,
    });
  }

  if (shift) {
    await tx.shift.update({
      where: { id: shift.id },
      data: { expensesTotal: { increment: toDb(input.amount) } },
    });
  }

  return { expenseId: expense.id, shiftId: shift?.id ?? null };
}
