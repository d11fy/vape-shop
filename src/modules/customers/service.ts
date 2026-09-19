import 'server-only';

import { recordAudit } from '@/core/audit';
import type { Tx } from '@/core/db';
import { businessRule, forbidden } from '@/core/errors';
import { normalizePhone } from '@/lib/phone';

export interface DebtCustomerInput {
  storeId: string;
  userId: string;
  name: string;
  phone: string;
  /** Whether the cashier may add a customer who is not on the books yet. */
  canCreate: boolean;
}

/**
 * The customer a "دين" sale is recorded against, found by phone number.
 *
 * The phone is the identity: if it is already on the books the debt goes on
 * that existing account (whatever name was typed), so one person never ends up
 * with two balances. Otherwise the customer is created here, inside the sale's
 * transaction — if the sale fails, no half-made customer is left behind.
 */
export async function resolveDebtCustomer(
  tx: Tx,
  input: DebtCustomerInput,
): Promise<{ id: string; name: string; created: boolean }> {
  const phone = normalizePhone(input.phone);
  const typed = input.phone.trim();

  const existing = await tx.customer.findFirst({
    where: {
      storeId: input.storeId,
      deletedAt: null,
      phone: { in: [...new Set([phone, typed])] },
    },
    select: { id: true, name: true, isActive: true },
  });

  if (existing) {
    if (!existing.isActive) {
      throw businessRule(`حساب العميل ${existing.name} موقوف — لا يمكن تسجيل دين عليه.`);
    }
    return { id: existing.id, name: existing.name, created: false };
  }

  if (!input.canCreate) {
    throw forbidden('هذا الرقم غير مسجل، وليس لديك صلاحية إضافة عميل جديد. اطلب من المدير إضافته.');
  }

  const customer = await tx.customer.create({
    data: { storeId: input.storeId, name: input.name.trim(), phone },
    select: { id: true, name: true },
  });

  await recordAudit(tx, {
    storeId: input.storeId,
    userId: input.userId,
    action: 'customer.create',
    entityType: 'customer',
    entityId: customer.id,
    summary: `إضافة عميل من شاشة البيع لتسجيل دين: ${customer.name}`,
    after: { name: customer.name, phone },
  });

  return { id: customer.id, name: customer.name, created: true };
}
