'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requireWritePermission } from '@/core/auth/context';
import { recordAudit } from '@/core/audit';
import { transaction } from '@/core/db';
import { businessRule, notFound, validation } from '@/core/errors';
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from '@/core/idempotency';
import { fromDb, toDb } from '@/core/money';
import type { ActionResult } from '@/core/result';
import { storeFormatter } from '@/lib/formatter';
import { postSupplierEntry } from '@/modules/ledger/service';
import { recordPayment } from '@/modules/payments/service';
import { createPurchase, receivePurchase } from '@/modules/purchases/service';
import { toFieldErrors } from '@/modules/auth/validation';

/**
 * Supplier and purchasing actions.
 *
 * Receiving a purchase is the write that sets cost prices for everything sold
 * afterwards, so it runs in one transaction that moves stock, rolls the
 * weighted-average cost, opens the payable, and records any payment made on the
 * spot.
 */

const supplierSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2, 'أدخل اسم المورد').max(100),
  company: z.string().trim().max(100).optional().or(z.literal('')),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s-]{7,20}$/, 'رقم هاتف غير صالح')
    .optional()
    .or(z.literal('')),
  email: z.email('بريد إلكتروني غير صالح').optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
  isActive: z.boolean().default(true),
  openingBalance: z.number().int().default(0),
});

export type SupplierInput = z.input<typeof supplierSchema>;

export async function saveSupplierAction(
  input: SupplierInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction('suppliers.save', async () => {
    const { store, user } = await requireWritePermission(
      input.id ? 'suppliers.edit' : 'suppliers.create',
    );

    const parsed = supplierSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات المورد', toFieldErrors(parsed.error));
    }
    const data = parsed.data;

    const id = await transaction(async (tx) => {
      if (data.id) {
        const existing = await tx.supplier.findFirst({
          where: { id: data.id, storeId: store.id, deletedAt: null },
          select: { id: true, name: true },
        });
        if (!existing) throw notFound('المورد');

        await tx.supplier.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            company: data.company || null,
            phone: data.phone || null,
            email: data.email || null,
            address: data.address || null,
            note: data.note || null,
            isActive: data.isActive,
          },
        });

        await recordAudit(tx, {
          storeId: store.id,
          userId: user.id,
          action: 'supplier.update',
          entityType: 'supplier',
          entityId: existing.id,
          summary: `تعديل بيانات المورد: ${data.name}`,
        });

        return existing.id;
      }

      const created = await tx.supplier.create({
        data: {
          storeId: store.id,
          name: data.name,
          company: data.company || null,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          note: data.note || null,
          isActive: data.isActive,
        },
        select: { id: true },
      });

      if (data.openingBalance !== 0) {
        await postSupplierEntry(tx, created.id, {
          storeId: store.id,
          type: 'OPENING_BALANCE',
          amount: data.openingBalance,
          description: 'رصيد افتتاحي عند إضافة المورد',
          userId: user.id,
        });
      }

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'supplier.create',
        entityType: 'supplier',
        entityId: created.id,
        summary: `إضافة مورد جديد: ${data.name}`,
      });

      return created.id;
    });

    revalidatePath('/suppliers');
    revalidatePath(`/suppliers/${id}`);
    return { id };
  });
}

// ── Supplier payment ─────────────────────────────────────────────────────────

const paySupplierSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  supplierId: z.string().min(1),
  amount: z.number().int().positive('أدخل مبلغاً أكبر من صفر'),
  methodId: z.string().min(1, 'اختر طريقة الدفع'),
  reference: z.string().max(80).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export async function paySupplierAction(
  input: z.input<typeof paySupplierSchema>,
): Promise<ActionResult<{ paymentId: string; newBalance: number }>> {
  return runAction('suppliers.pay', async () => {
    const { store, user } = await requireWritePermission('suppliers.pay');

    const parsed = paySupplierSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات الدفعة', toFieldErrors(parsed.error));
    }
    const data = parsed.data;

    const result = await transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx, {
        storeId: store.id,
        scope: 'payment.create',
        key: data.idempotencyKey,
        requestHash: hashRequest({ supplierId: data.supplierId, amount: data.amount }),
      });

      if (claim.status === 'duplicate' && claim.resultId) {
        const existing = await tx.payment.findUniqueOrThrow({
          where: { id: claim.resultId },
          select: { id: true, supplier: { select: { balance: true } } },
        });
        return {
          paymentId: existing.id,
          newBalance: fromDb(existing.supplier?.balance ?? 0n),
        };
      }

      const supplier = await tx.supplier.findFirst({
        where: { id: data.supplierId, storeId: store.id, deletedAt: null },
        select: { id: true, name: true, balance: true },
      });
      if (!supplier) throw notFound('المورد');

      const balance = fromDb(supplier.balance);
      if (balance <= 0) throw businessRule('لا يوجد رصيد مستحق لهذا المورد.');
      if (data.amount > balance) {
        throw businessRule('المبلغ أكبر من الرصيد المستحق للمورد.');
      }

      const payment = await recordPayment(tx, {
        storeId: store.id,
        branchId: store.branch.id,
        userId: user.id,
        direction: 'OUT',
        source: 'SUPPLIER_DEBT',
        amount: data.amount,
        methodId: data.methodId,
        reference: data.reference ?? null,
        note: data.note ?? null,
        supplierId: supplier.id,
        postToLedger: true,
        ledgerDescription: 'سداد دفعة للمورد',
      });

      // Apply oldest-first across unpaid purchase invoices.
      const openInvoices = await tx.purchase.findMany({
        where: { storeId: store.id, supplierId: supplier.id, deletedAt: null, dueTotal: { gt: 0 } },
        orderBy: { purchasedAt: 'asc' },
        select: { id: true, dueTotal: true, paidTotal: true },
      });

      let remaining = data.amount;
      for (const invoice of openInvoices) {
        if (remaining <= 0) break;
        const due = fromDb(invoice.dueTotal);
        const applied = Math.min(due, remaining);
        await tx.purchase.update({
          where: { id: invoice.id },
          data: {
            dueTotal: toDb(due - applied),
            paidTotal: toDb(fromDb(invoice.paidTotal) + applied),
          },
        });
        remaining -= applied;
      }

      await completeIdempotencyKey(tx, {
        storeId: store.id,
        scope: 'payment.create',
        key: data.idempotencyKey,
        resultId: payment.paymentId,
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'supplier.pay',
        entityType: 'payment',
        entityId: payment.paymentId,
        summary: `سداد ${storeFormatter(store.settings).money(data.amount)} للمورد ${supplier.name}`,
        after: { amount: data.amount, balanceAfter: balance - data.amount },
      });

      return { paymentId: payment.paymentId, newBalance: balance - data.amount };
    });

    revalidatePath('/suppliers');
    revalidatePath(`/suppliers/${data.supplierId}`);
    revalidatePath('/purchases');
    revalidatePath('/cashbox');
    return result;
  });
}

// ── Purchase invoice ─────────────────────────────────────────────────────────

const purchaseLineSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive('أدخل كمية صحيحة'),
  unitCost: z.number().int().min(0),
  discount: z.number().int().min(0).default(0),
});

const purchaseSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  supplierId: z.string().min(1, 'اختر المورد'),
  reference: z.string().max(80).optional().nullable(),
  lines: z.array(purchaseLineSchema).min(1, 'أضف صنفاً واحداً على الأقل').max(200),
  invoiceDiscount: z.number().int().min(0).default(0),
  extraCosts: z.number().int().min(0).default(0),
  taxTotal: z.number().int().min(0).default(0),
  note: z.string().max(500).optional().nullable(),
  purchasedAt: z.string().optional().nullable(),
  receiveNow: z.boolean().default(true),
  payment: z
    .object({
      methodId: z.string().min(1),
      amount: z.number().int().min(0),
    })
    .optional()
    .nullable(),
});

export interface PurchaseResultPayload {
  purchaseId: string;
  number: string;
  total: number;
  dueTotal: number;
}

export async function createPurchaseAction(
  input: z.input<typeof purchaseSchema>,
): Promise<ActionResult<PurchaseResultPayload>> {
  return runAction('purchases.create', async () => {
    const { store, user } = await requireWritePermission('purchases.create');

    const parsed = purchaseSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات فاتورة الشراء', toFieldErrors(parsed.error));
    }
    const data = parsed.data;

    // Receiving goods needs its own permission, separate from drafting.
    if (data.receiveNow && !store.isOwner && !store.permissions.has('purchases.receive')) {
      throw validation('ليس لديك صلاحية اعتماد واستلام المشتريات. احفظها كمسودة.');
    }

    const result = await transaction(
      async (tx) => {
        const claim = await claimIdempotencyKey(tx, {
          storeId: store.id,
          scope: 'purchase.receive',
          key: data.idempotencyKey,
          requestHash: hashRequest({ supplierId: data.supplierId, lines: data.lines }),
        });

        if (claim.status === 'duplicate' && claim.resultId) {
          const existing = await tx.purchase.findUniqueOrThrow({
            where: { id: claim.resultId },
            select: { id: true, number: true, total: true, dueTotal: true },
          });
          return {
            purchaseId: existing.id,
            number: existing.number,
            total: Number(existing.total),
            dueTotal: Number(existing.dueTotal),
          };
        }

        const created = await createPurchase(tx, {
          storeId: store.id,
          branchId: store.branch.id,
          userId: user.id,
          supplierId: data.supplierId,
          reference: data.reference ?? null,
          lines: data.lines,
          invoiceDiscount: data.invoiceDiscount,
          extraCosts: data.extraCosts,
          taxTotal: data.taxTotal,
          note: data.note ?? null,
          purchasedAt: data.purchasedAt ? new Date(data.purchasedAt) : undefined,
          receiveNow: data.receiveNow,
          payments:
            data.receiveNow && data.payment && data.payment.amount > 0
              ? [{ methodId: data.payment.methodId, amount: data.payment.amount }]
              : [],
        });

        await completeIdempotencyKey(tx, {
          storeId: store.id,
          scope: 'purchase.receive',
          key: data.idempotencyKey,
          resultId: created.purchaseId,
        });

        return {
          purchaseId: created.purchaseId,
          number: created.number,
          total: created.total,
          dueTotal: created.dueTotal,
        };
      },
      { timeoutMs: 60_000 },
    );

    revalidatePath('/purchases');
    revalidatePath('/inventory');
    revalidatePath('/suppliers');
    revalidatePath('/dashboard');
    return result;
  });
}

export async function receivePurchaseAction(
  purchaseId: string,
): Promise<ActionResult<void>> {
  return runAction('purchases.receive', async () => {
    const { store, user } = await requireWritePermission('purchases.receive');

    await transaction(
      async (tx) => {
        await receivePurchase(tx, { storeId: store.id, userId: user.id, purchaseId });
      },
      { timeoutMs: 60_000 },
    );

    revalidatePath('/purchases');
    revalidatePath(`/purchases/${purchaseId}`);
    revalidatePath('/inventory');
    revalidatePath('/suppliers');
  });
}
