import 'server-only';

import type { Tx } from '@/core/db';
import { fromDb, toDb, type Money } from '@/core/money';
import { notFound } from '@/core/errors';
import type { PartyLedgerType } from '@/generated/prisma/enums';

/**
 * Receivables and payables.
 *
 * The rule the whole debt feature rests on: a balance is NEVER written
 * directly. Every change is a ledger entry, and the `balance` column is a cache
 * of the running total, updated in the same statement that reads it back. If
 * the two ever disagree, `recomputeCustomerBalance` re-derives the truth from
 * the entries.
 *
 * Sign convention
 *   Customer: +ve balance = the customer owes the store.
 *   Supplier: +ve balance = the store owes the supplier.
 */

export interface LedgerEntryInput {
  storeId: string;
  type: PartyLedgerType;
  /** Signed minor units. Positive increases the debt. */
  amount: Money;
  referenceType?: string;
  referenceId?: string;
  description?: string;
  userId?: string | null;
  occurredAt?: Date;
}

export interface LedgerEntryResult {
  entryId: string;
  balanceAfter: Money;
}

export async function postCustomerEntry(
  tx: Tx,
  customerId: string,
  input: LedgerEntryInput,
): Promise<LedgerEntryResult> {
  const rows = await tx.$queryRaw<Array<{ balance: bigint }>>`
    UPDATE customers
       SET balance = balance + ${toDb(input.amount)},
           "updatedAt" = NOW()
     WHERE id = ${customerId} AND "storeId" = ${input.storeId}
    RETURNING balance
  `;

  const row = rows[0];
  if (!row) throw notFound('العميل');

  const balanceAfter = fromDb(row.balance);

  const entry = await tx.customerLedgerEntry.create({
    data: {
      storeId: input.storeId,
      customerId,
      type: input.type,
      amount: toDb(input.amount),
      balanceAfter: toDb(balanceAfter),
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      description: input.description ?? null,
      userId: input.userId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
    select: { id: true },
  });

  return { entryId: entry.id, balanceAfter };
}

export async function postSupplierEntry(
  tx: Tx,
  supplierId: string,
  input: LedgerEntryInput,
): Promise<LedgerEntryResult> {
  const rows = await tx.$queryRaw<Array<{ balance: bigint }>>`
    UPDATE suppliers
       SET balance = balance + ${toDb(input.amount)},
           "updatedAt" = NOW()
     WHERE id = ${supplierId} AND "storeId" = ${input.storeId}
    RETURNING balance
  `;

  const row = rows[0];
  if (!row) throw notFound('المورد');

  const balanceAfter = fromDb(row.balance);

  const entry = await tx.supplierLedgerEntry.create({
    data: {
      storeId: input.storeId,
      supplierId,
      type: input.type,
      amount: toDb(input.amount),
      balanceAfter: toDb(balanceAfter),
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      description: input.description ?? null,
      userId: input.userId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
    select: { id: true },
  });

  return { entryId: entry.id, balanceAfter };
}

/**
 * Re-derive a customer's balance from their ledger and repair the cache.
 * Exposed for the integrity check in settings and used by the tests.
 */
export async function recomputeCustomerBalance(tx: Tx, customerId: string): Promise<Money> {
  const aggregate = await tx.customerLedgerEntry.aggregate({
    where: { customerId },
    _sum: { amount: true },
  });
  const balance = fromDb(aggregate._sum.amount ?? 0n);
  await tx.customer.update({ where: { id: customerId }, data: { balance: toDb(balance) } });
  return balance;
}

export async function recomputeSupplierBalance(tx: Tx, supplierId: string): Promise<Money> {
  const aggregate = await tx.supplierLedgerEntry.aggregate({
    where: { supplierId },
    _sum: { amount: true },
  });
  const balance = fromDb(aggregate._sum.amount ?? 0n);
  await tx.supplier.update({ where: { id: supplierId }, data: { balance: toDb(balance) } });
  return balance;
}

/**
 * Would this credit sale push the customer past their limit?
 * `0` on either the customer or the store default means "no limit".
 */
export async function checkDebtLimit(
  tx: Tx,
  storeId: string,
  customerId: string,
  additionalDebt: Money,
): Promise<{ allowed: boolean; limit: Money; balance: Money; projected: Money }> {
  const [customer, settings] = await Promise.all([
    tx.customer.findFirst({
      where: { id: customerId, storeId },
      select: { balance: true, debtLimit: true },
    }),
    tx.storeSettings.findUnique({
      where: { storeId },
      select: { defaultDebtLimit: true },
    }),
  ]);

  if (!customer) throw notFound('العميل');

  const balance = fromDb(customer.balance);
  const explicit = fromDb(customer.debtLimit);
  const limit = explicit > 0 ? explicit : fromDb(settings?.defaultDebtLimit ?? 0n);
  const projected = balance + additionalDebt;

  return { allowed: limit <= 0 || projected <= limit, limit, balance, projected };
}
