import 'server-only';

import type { Tx } from '@/core/db';
import { fromDb, toDb, type Money } from '@/core/money';
import { notFound } from '@/core/errors';
import type { CashboxTxnType } from '@/generated/prisma/enums';

/**
 * The cash drawer.
 *
 * Same discipline as the party ledgers: the balance column is a cache, every
 * movement is an append-only row, and the update and the read-back happen in
 * one statement so concurrent sales cannot lose a transaction.
 *
 * Only payment methods flagged `affectsCashbox` reach this module — a card
 * payment lands in the bank, not the drawer, and counting it here would make
 * every shift close out wrong.
 */

export interface CashMovementInput {
  storeId: string;
  cashboxId: string;
  type: CashboxTxnType;
  /** Signed minor units: positive is cash in, negative is cash out. */
  amount: Money;
  referenceType?: string;
  referenceId?: string;
  shiftId?: string | null;
  userId: string;
  description?: string;
  occurredAt?: Date;
}

export interface CashMovementResult {
  transactionId: string;
  balanceAfter: Money;
}

export async function postCashMovement(
  tx: Tx,
  input: CashMovementInput,
): Promise<CashMovementResult> {
  const rows = await tx.$queryRaw<Array<{ balance: bigint }>>`
    UPDATE cashboxes
       SET balance = balance + ${toDb(input.amount)},
           "updatedAt" = NOW()
     WHERE id = ${input.cashboxId} AND "storeId" = ${input.storeId}
    RETURNING balance
  `;

  const row = rows[0];
  if (!row) throw notFound('الصندوق');

  const balanceAfter = fromDb(row.balance);

  const transaction = await tx.cashboxTransaction.create({
    data: {
      storeId: input.storeId,
      cashboxId: input.cashboxId,
      type: input.type,
      amount: toDb(input.amount),
      balanceAfter: toDb(balanceAfter),
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      shiftId: input.shiftId ?? null,
      userId: input.userId,
      description: input.description ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
    select: { id: true },
  });

  return { transactionId: transaction.id, balanceAfter };
}

/** The branch's default drawer, created on demand if a branch was added later. */
export async function getBranchCashbox(
  tx: Tx,
  storeId: string,
  branchId: string,
): Promise<{ id: string; balance: Money }> {
  const existing = await tx.cashbox.findFirst({
    where: { storeId, branchId, isActive: true },
    orderBy: { isDefault: 'desc' },
    select: { id: true, balance: true },
  });

  if (existing) return { id: existing.id, balance: fromDb(existing.balance) };

  const created = await tx.cashbox.create({
    data: { storeId, branchId, name: 'الصندوق الرئيسي', isDefault: true },
    select: { id: true, balance: true },
  });
  return { id: created.id, balance: fromDb(created.balance) };
}

/** Re-derive the drawer balance from its movements. */
export async function recomputeCashboxBalance(tx: Tx, cashboxId: string): Promise<Money> {
  const aggregate = await tx.cashboxTransaction.aggregate({
    where: { cashboxId },
    _sum: { amount: true },
  });
  const balance = fromDb(aggregate._sum.amount ?? 0n);
  await tx.cashbox.update({ where: { id: cashboxId }, data: { balance: toDb(balance) } });
  return balance;
}

/** Which cashbox transaction type a payment produces. */
export function cashTypeForPayment(
  source:
    | 'SALE'
    | 'CUSTOMER_DEBT'
    | 'PURCHASE'
    | 'SUPPLIER_DEBT'
    | 'SALE_REFUND'
    | 'PURCHASE_REFUND'
    | 'OTHER',
): CashboxTxnType {
  switch (source) {
    case 'SALE':
      return 'SALE';
    case 'CUSTOMER_DEBT':
      return 'DEBT_COLLECTION';
    case 'PURCHASE':
      return 'PURCHASE';
    case 'SUPPLIER_DEBT':
      return 'SUPPLIER_PAYMENT';
    case 'SALE_REFUND':
      return 'SALE_REFUND';
    case 'PURCHASE_REFUND':
      return 'PURCHASE_REFUND';
    default:
      return 'ADJUSTMENT';
  }
}
