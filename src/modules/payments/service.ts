import 'server-only';

import type { Tx } from '@/core/db';
import { businessRule, notFound } from '@/core/errors';
import type { Money } from '@/core/money';
import type { PaymentDirection, PaymentSource } from '@/generated/prisma/enums';
import { cashTypeForPayment, getBranchCashbox, postCashMovement } from '@/modules/cashbox/service';
import { postCustomerEntry, postSupplierEntry } from '@/modules/ledger/service';

/**
 * A payment is the one place where three subsystems meet: the payment record
 * itself, the cash drawer (only for cash-like methods) and the party ledger.
 * Routing all of them through this function is what keeps the three in step.
 */

export interface RecordPaymentInput {
  storeId: string;
  branchId: string;
  userId: string;
  shiftId?: string | null;
  direction: PaymentDirection;
  source: PaymentSource;
  amount: Money;
  methodId: string;
  reference?: string | null;
  note?: string | null;
  paidAt?: Date;

  saleId?: string | null;
  purchaseId?: string | null;
  returnId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;

  /** Post a matching entry to the customer/supplier ledger. */
  postToLedger?: boolean;
  /** Text shown on the ledger line. */
  ledgerDescription?: string;
}

export interface RecordPaymentResult {
  paymentId: string;
  affectedCashbox: boolean;
}

export async function recordPayment(
  tx: Tx,
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  if (input.amount <= 0) {
    throw businessRule('قيمة الدفعة يجب أن تكون أكبر من صفر.');
  }

  const method = await tx.paymentMethod.findFirst({
    where: { id: input.methodId, storeId: input.storeId },
    select: { id: true, name: true, affectsCashbox: true, isActive: true },
  });

  if (!method) throw notFound('طريقة الدفع');
  if (!method.isActive) throw businessRule(`طريقة الدفع "${method.name}" معطّلة حالياً.`);

  const paidAt = input.paidAt ?? new Date();

  const payment = await tx.payment.create({
    data: {
      storeId: input.storeId,
      branchId: input.branchId,
      direction: input.direction,
      source: input.source,
      amount: BigInt(input.amount),
      methodId: method.id,
      reference: input.reference ?? null,
      saleId: input.saleId ?? null,
      purchaseId: input.purchaseId ?? null,
      returnId: input.returnId ?? null,
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      shiftId: input.shiftId ?? null,
      userId: input.userId,
      note: input.note ?? null,
      paidAt,
    },
    select: { id: true },
  });

  if (method.affectsCashbox) {
    const cashbox = await getBranchCashbox(tx, input.storeId, input.branchId);
    await postCashMovement(tx, {
      storeId: input.storeId,
      cashboxId: cashbox.id,
      type: cashTypeForPayment(input.source),
      amount: input.direction === 'IN' ? input.amount : -input.amount,
      referenceType: 'payment',
      referenceId: payment.id,
      shiftId: input.shiftId ?? null,
      userId: input.userId,
      description: input.ledgerDescription ?? input.note ?? undefined,
      occurredAt: paidAt,
    });
  }

  if (input.postToLedger) {
    if (input.customerId) {
      // Money in from a customer reduces what they owe.
      await postCustomerEntry(tx, input.customerId, {
        storeId: input.storeId,
        type: 'PAYMENT',
        amount: input.direction === 'IN' ? -input.amount : input.amount,
        referenceType: 'payment',
        referenceId: payment.id,
        description: input.ledgerDescription ?? `دفعة عبر ${method.name}`,
        userId: input.userId,
        occurredAt: paidAt,
      });
    } else if (input.supplierId) {
      // Money out to a supplier reduces what we owe them.
      await postSupplierEntry(tx, input.supplierId, {
        storeId: input.storeId,
        type: 'PAYMENT',
        amount: input.direction === 'OUT' ? -input.amount : input.amount,
        referenceType: 'payment',
        referenceId: payment.id,
        description: input.ledgerDescription ?? `دفعة عبر ${method.name}`,
        userId: input.userId,
        occurredAt: paidAt,
      });
    }
  }

  return { paymentId: payment.id, affectedCashbox: method.affectsCashbox };
}

/**
 * Split the tendered amounts across the invoice total.
 *
 * A cashier who takes a 100 note for an 85 invoice has handed over 100, but
 * only 85 belongs to the sale — the remaining 15 is change, not revenue.
 * Non-cash methods are never over-tendered, so cash absorbs the difference.
 */
export interface TenderLine {
  methodId: string;
  amount: Money;
  isCash: boolean;
  reference?: string | null;
}

export interface AllocatedTender {
  applied: Array<{ methodId: string; amount: Money; reference?: string | null }>;
  /** Total actually applied to the invoice. */
  paidTotal: Money;
  /** Cash to hand back. */
  change: Money;
}

export function allocateTender(tenders: TenderLine[], dueAmount: Money): AllocatedTender {
  const applied: AllocatedTender['applied'] = [];
  let remaining = dueAmount;
  let change = 0;

  // Non-cash first: those amounts are exact by definition.
  const ordered = [...tenders].sort((a, b) => Number(a.isCash) - Number(b.isCash));

  for (const tender of ordered) {
    if (tender.amount <= 0) continue;

    const usable = Math.min(tender.amount, Math.max(0, remaining));
    if (usable > 0) {
      applied.push({ methodId: tender.methodId, amount: usable, reference: tender.reference });
      remaining -= usable;
    }

    const excess = tender.amount - usable;
    if (excess > 0) {
      if (tender.isCash) change += excess;
      else {
        // An over-tendered card payment is a data-entry mistake, not change.
        throw businessRule('قيمة الدفع الإلكتروني أكبر من المتبقي على الفاتورة.');
      }
    }
  }

  return { applied, paidTotal: dueAmount - Math.max(0, remaining), change };
}
