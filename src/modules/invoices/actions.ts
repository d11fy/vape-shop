'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requireWritePermission } from '@/core/auth/context';
import { transaction } from '@/core/db';
import { validation } from '@/core/errors';
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from '@/core/idempotency';
import type { ActionResult } from '@/core/result';
import { cancelSale } from '@/modules/sales/service';
import { createReturn } from '@/modules/returns/service';
import { toFieldErrors } from '@/modules/auth/validation';

const cancelSchema = z.object({
  saleId: z.string().min(1),
  reason: z.string().trim().min(3, 'اذكر سبب الإلغاء').max(300),
  restock: z.boolean().default(true),
});

export async function cancelInvoiceAction(
  input: z.input<typeof cancelSchema>,
): Promise<ActionResult<void>> {
  return runAction('invoices.cancel', async () => {
    const { store, user } = await requireWritePermission('sales.cancel');

    const parsed = cancelSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    }

    await transaction(async (tx) => {
      await cancelSale(tx, {
        storeId: store.id,
        userId: user.id,
        saleId: parsed.data.saleId,
        reason: parsed.data.reason,
        restock: parsed.data.restock,
      });
    });

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${parsed.data.saleId}`);
    revalidatePath('/dashboard');
  });
}

const returnSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  saleId: z.string().min(1),
  items: z
    .array(
      z.object({
        saleItemId: z.string().min(1),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, 'اختر صنفاً واحداً على الأقل'),
  reason: z.string().trim().min(3, 'اذكر سبب الإرجاع').max(300),
  note: z.string().max(500).optional().nullable(),
  restock: z.boolean().default(true),
  refundMethodId: z.string().min(1).optional().nullable(),
});

export interface ReturnResultPayload {
  returnId: string;
  number: string;
  total: number;
  refundTotal: number;
  creditTotal: number;
}

export async function createReturnAction(
  input: z.input<typeof returnSchema>,
): Promise<ActionResult<ReturnResultPayload>> {
  return runAction('invoices.return', async () => {
    const { store, user } = await requireWritePermission('sales.return');

    const parsed = returnSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات المرتجع', toFieldErrors(parsed.error));
    }
    const data = parsed.data;

    const result = await transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx, {
        storeId: store.id,
        scope: 'return.create',
        key: data.idempotencyKey,
        requestHash: hashRequest({ saleId: data.saleId, items: data.items }),
      });

      if (claim.status === 'duplicate' && claim.resultId) {
        const existing = await tx.saleReturn.findUniqueOrThrow({
          where: { id: claim.resultId },
          select: { id: true, number: true, total: true, refundTotal: true, creditTotal: true },
        });
        return {
          returnId: existing.id,
          number: existing.number,
          total: Number(existing.total),
          refundTotal: Number(existing.refundTotal),
          creditTotal: Number(existing.creditTotal),
        };
      }

      const created = await createReturn(tx, {
        storeId: store.id,
        branchId: store.branch.id,
        userId: user.id,
        saleId: data.saleId,
        items: data.items,
        reason: data.reason,
        note: data.note ?? null,
        restock: data.restock,
        refundMethodId: data.refundMethodId ?? null,
      });

      await completeIdempotencyKey(tx, {
        storeId: store.id,
        scope: 'return.create',
        key: data.idempotencyKey,
        resultId: created.returnId,
      });

      return created;
    });

    revalidatePath('/invoices');
    revalidatePath(`/invoices/${data.saleId}`);
    revalidatePath('/dashboard');
    revalidatePath('/inventory');

    return result;
  });
}

const noteSchema = z.object({
  saleId: z.string().min(1),
  note: z.string().max(500),
});

export async function updateInvoiceNoteAction(
  input: z.input<typeof noteSchema>,
): Promise<ActionResult<void>> {
  return runAction('invoices.updateNote', async () => {
    const { store } = await requireWritePermission('sales.edit');
    const parsed = noteSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));

    await transaction(async (tx) => {
      await tx.sale.updateMany({
        where: { id: parsed.data.saleId, storeId: store.id, deletedAt: null },
        data: { note: parsed.data.note || null },
      });
    });

    revalidatePath(`/invoices/${parsed.data.saleId}`);
  });
}
