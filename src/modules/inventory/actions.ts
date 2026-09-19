'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requireWritePermission } from '@/core/auth/context';
import { recordAudit } from '@/core/audit';
import { transaction } from '@/core/db';
import { businessRule, notFound, validation } from '@/core/errors';
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from '@/core/idempotency';
import { nextDocumentNumber } from '@/core/numbering';
import { costAmount, costFromDb, costToDb, qtyFromDb, qtyToDb } from '@/core/quantity';
import type { ActionResult } from '@/core/result';
import { applyStockMovement } from '@/modules/inventory/service';
import { toFieldErrors } from '@/modules/auth/validation';

/**
 * Stock corrections.
 *
 * A stock-take is a document, not a silent edit: it records what the system
 * believed, what the shelf actually held, the difference, and who signed off.
 * That is the only honest way to answer "where did five tins go?" a month
 * later.
 */

const adjustmentItemSchema = z.object({
  variantId: z.string().min(1),
  /** Counted quantity in base units (×1000). */
  countedQuantity: z.number().int().min(0),
  note: z.string().max(200).optional().nullable(),
});

const adjustmentSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  reason: z.string().trim().min(2, 'اختر سبب التسوية').max(120),
  note: z.string().max(500).optional().nullable(),
  items: z.array(adjustmentItemSchema).min(1, 'أدخل صنفاً واحداً على الأقل').max(500),
});

export interface AdjustmentResult {
  id: string;
  number: string;
  changedCount: number;
  /** Net change in stock value, in minor units. Negative means a loss. */
  valueImpact: number;
}

export async function applyAdjustmentAction(
  input: z.input<typeof adjustmentSchema>,
): Promise<ActionResult<AdjustmentResult>> {
  return runAction('inventory.adjust', async () => {
    const { store, user } = await requireWritePermission('inventory.adjust');

    const parsed = adjustmentSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات التسوية', toFieldErrors(parsed.error));
    }
    const data = parsed.data;

    const result = await transaction(
      async (tx) => {
        const claim = await claimIdempotencyKey(tx, {
          storeId: store.id,
          scope: 'adjustment.apply',
          key: data.idempotencyKey,
          requestHash: hashRequest(data.items),
        });

        if (claim.status === 'duplicate' && claim.resultId) {
          const existing = await tx.inventoryAdjustment.findUniqueOrThrow({
            where: { id: claim.resultId },
            select: { id: true, number: true, _count: { select: { items: true } } },
          });
          return {
            id: existing.id,
            number: existing.number,
            changedCount: existing._count.items,
            valueImpact: 0,
          };
        }

        const settings = await tx.storeSettings.findUniqueOrThrow({
          where: { storeId: store.id },
          select: { invoicePrefix: true, timezone: true },
        });

        const variants = await tx.productVariant.findMany({
          where: {
            id: { in: data.items.map((item) => item.variantId) },
            storeId: store.id,
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            avgCostPerBase: true,
            product: { select: { name: true } },
            inventoryItems: {
              where: { branchId: store.branch.id },
              select: { quantity: true },
            },
          },
        });

        const index = new Map(variants.map((variant) => [variant.id, variant]));

        // Only lines whose count differs from the system move anything.
        const changes = data.items
          .map((item) => {
            const variant = index.get(item.variantId);
            if (!variant) return null;
            const systemQuantity = qtyFromDb(variant.inventoryItems[0]?.quantity);
            const difference = item.countedQuantity - systemQuantity;
            if (difference === 0) return null;
            return { item, variant, systemQuantity, difference };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

        if (changes.length === 0) {
          throw businessRule('لا توجد فروقات — الكميات المدخلة مطابقة للنظام.');
        }

        const number = await nextDocumentNumber(tx, store.id, 'ADJUSTMENT', {
          prefix: settings.invoicePrefix,
          padding: 4,
          timezone: settings.timezone,
        });

        const adjustment = await tx.inventoryAdjustment.create({
          data: {
            storeId: store.id,
            branchId: store.branch.id,
            number,
            status: 'APPLIED',
            reason: data.reason,
            note: data.note ?? null,
            userId: user.id,
            appliedAt: new Date(),
          },
          select: { id: true },
        });

        let valueImpact = 0;

        for (const change of changes) {
          // Exact decimal → scaled integer; never through a float multiply.
          const roundedCost = costFromDb(change.variant.avgCostPerBase);

          await tx.inventoryAdjustmentItem.create({
            data: {
              adjustmentId: adjustment.id,
              variantId: change.item.variantId,
              systemQty: qtyToDb(change.systemQuantity),
              countedQty: qtyToDb(change.item.countedQuantity),
              difference: qtyToDb(change.difference),
              costPerBase: costToDb(roundedCost),
              note: change.item.note ?? null,
            },
          });

          await applyStockMovement(tx, {
            storeId: store.id,
            branchId: store.branch.id,
            variantId: change.item.variantId,
            type: 'ADJUSTMENT',
            quantityChange: change.difference,
            referenceType: 'adjustment',
            referenceId: adjustment.id,
            userId: user.id,
            reason: data.reason,
            note: change.item.note ?? undefined,
            // A stock-take records reality, including a negative one.
            allowNegative: true,
          });

          valueImpact += costAmount(change.difference, roundedCost);
        }

        await tx.inventoryItem.updateMany({
          where: {
            branchId: store.branch.id,
            variantId: { in: changes.map((change) => change.item.variantId) },
          },
          data: { lastCountedAt: new Date() },
        });

        await completeIdempotencyKey(tx, {
          storeId: store.id,
          scope: 'adjustment.apply',
          key: data.idempotencyKey,
          resultId: adjustment.id,
        });

        await recordAudit(tx, {
          storeId: store.id,
          userId: user.id,
          action: 'inventory.adjust',
          entityType: 'inventory_adjustment',
          entityId: adjustment.id,
          summary: `تسوية مخزون ${number} — ${changes.length} صنف · ${data.reason}`,
          after: {
            number,
            reason: data.reason,
            valueImpact,
            changes: changes.map((change) => ({
              product: change.variant.product.name,
              variant: change.variant.name,
              from: change.systemQuantity / 1000,
              to: change.item.countedQuantity / 1000,
            })),
          },
        });

        return {
          id: adjustment.id,
          number,
          changedCount: changes.length,
          valueImpact,
        };
      },
      { timeoutMs: 60_000 },
    );

    revalidatePath('/inventory');
    revalidatePath('/products');
    revalidatePath('/dashboard');
    return result;
  });
}

// ── Single-line quick adjust ─────────────────────────────────────────────────

const quickAdjustSchema = z.object({
  variantId: z.string().min(1),
  countedQuantity: z.number().int().min(0),
  reason: z.string().trim().min(2).max(120),
  note: z.string().max(300).optional().nullable(),
});

export async function quickAdjustAction(
  input: z.input<typeof quickAdjustSchema>,
): Promise<ActionResult<{ difference: number }>> {
  return runAction('inventory.quickAdjust', async () => {
    const { store, user } = await requireWritePermission('inventory.adjust');

    const parsed = quickAdjustSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    const difference = await transaction(async (tx) => {
      const variant = await tx.productVariant.findFirst({
        where: { id: data.variantId, storeId: store.id, deletedAt: null },
        select: {
          id: true,
          name: true,
          product: { select: { name: true } },
          inventoryItems: { where: { branchId: store.branch.id }, select: { quantity: true } },
        },
      });
      if (!variant) throw notFound('الصنف');

      const systemQuantity = qtyFromDb(variant.inventoryItems[0]?.quantity);
      const change = data.countedQuantity - systemQuantity;
      if (change === 0) throw businessRule('الكمية المدخلة مطابقة للكمية في النظام.');

      await applyStockMovement(tx, {
        storeId: store.id,
        branchId: store.branch.id,
        variantId: variant.id,
        type: 'ADJUSTMENT',
        quantityChange: change,
        userId: user.id,
        reason: data.reason,
        note: data.note ?? undefined,
        allowNegative: true,
      });

      await tx.inventoryItem.updateMany({
        where: { branchId: store.branch.id, variantId: variant.id },
        data: { lastCountedAt: new Date() },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'inventory.adjust',
        entityType: 'product_variant',
        entityId: variant.id,
        summary: `تعديل مخزون ${variant.product.name} من ${systemQuantity / 1000} إلى ${
          data.countedQuantity / 1000
        } · ${data.reason}`,
        before: { quantity: systemQuantity / 1000 },
        after: { quantity: data.countedQuantity / 1000, reason: data.reason },
      });

      return change;
    });

    revalidatePath('/inventory');
    revalidatePath('/products');
    return { difference };
  });
}

// ── Threshold ────────────────────────────────────────────────────────────────

const thresholdSchema = z.object({
  variantId: z.string().min(1),
  minimumStock: z.number().int().min(0),
});

export async function setStockThresholdAction(
  input: z.input<typeof thresholdSchema>,
): Promise<ActionResult<void>> {
  return runAction('inventory.threshold', async () => {
    const { store } = await requireWritePermission('inventory.adjust', 'products.edit');

    const parsed = thresholdSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));

    await transaction(async (tx) => {
      const updated = await tx.productVariant.updateMany({
        where: { id: parsed.data.variantId, storeId: store.id },
        data: { minimumStock: qtyToDb(parsed.data.minimumStock) },
      });
      if (updated.count === 0) throw notFound('الصنف');
    });

    revalidatePath('/inventory');
  });
}
