import 'server-only';

import { db } from '@/core/db';
import { fromDb, type Money } from '@/core/money';
import type { PaymentDirection, PaymentSource } from '@/generated/prisma/enums';

/**
 * A single payment, shaped for its printed voucher: a receipt voucher (سند
 * قبض) for money in, a payment voucher (سند صرف) for money out.
 */
export interface PaymentVoucher {
  id: string;
  /** Short, stable reference printed on the voucher. */
  reference: string;
  direction: PaymentDirection;
  source: PaymentSource;
  amount: Money;
  methodName: string;
  methodReference: string | null;
  note: string | null;
  paidAt: Date;
  branchName: string;
  cashierName: string;
  party: { kind: 'customer' | 'supplier'; id: string; name: string; phone: string | null } | null;
  /** The party's balance right after this payment, from its ledger line. */
  balanceAfter: Money | null;
  saleNumber: string | null;
  purchaseNumber: string | null;
}

export async function getPaymentVoucher(
  storeId: string,
  paymentId: string,
): Promise<PaymentVoucher | null> {
  const payment = await db.payment.findFirst({
    where: { id: paymentId, storeId, deletedAt: null },
    select: {
      id: true,
      direction: true,
      source: true,
      amount: true,
      reference: true,
      note: true,
      paidAt: true,
      userId: true,
      method: { select: { name: true } },
      branch: { select: { name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      supplier: { select: { id: true, name: true, phone: true } },
      sale: { select: { number: true } },
      purchase: { select: { number: true } },
    },
  });
  if (!payment) return null;

  const [cashier, customerEntry, supplierEntry] = await Promise.all([
    db.user.findUnique({ where: { id: payment.userId }, select: { name: true } }),
    payment.customer
      ? db.customerLedgerEntry.findFirst({
          where: { storeId, referenceType: 'payment', referenceId: payment.id },
          select: { balanceAfter: true },
        })
      : null,
    payment.supplier
      ? db.supplierLedgerEntry.findFirst({
          where: { storeId, referenceType: 'payment', referenceId: payment.id },
          select: { balanceAfter: true },
        })
      : null,
  ]);

  const party = payment.customer
    ? { kind: 'customer' as const, ...payment.customer }
    : payment.supplier
      ? { kind: 'supplier' as const, ...payment.supplier }
      : null;
  const entry = customerEntry ?? supplierEntry;

  return {
    id: payment.id,
    reference: `PAY-${payment.id.slice(-8).toUpperCase()}`,
    direction: payment.direction,
    source: payment.source,
    amount: fromDb(payment.amount),
    methodName: payment.method.name,
    methodReference: payment.reference,
    note: payment.note,
    paidAt: payment.paidAt,
    branchName: payment.branch.name,
    cashierName: cashier?.name ?? '—',
    party,
    balanceAfter: entry ? fromDb(entry.balanceAfter) : null,
    saleNumber: payment.sale?.number ?? null,
    purchaseNumber: payment.purchase?.number ?? null,
  };
}
