import 'server-only';

import { randomUUID } from 'node:crypto';

import type { Tx } from '@/core/db';
import { businessRule } from '@/core/errors';
import {
  costFromDb,
  costToDb,
  qtyFromDb,
  qtyToDb,
  weightedAverageCost,
  type Qty,
  type UnitCost,
} from '@/core/quantity';
import type { InventoryTxnType } from '@/generated/prisma/enums';

/**
 * Stock movements.
 *
 * Every change to on-hand quantity — a sale, a purchase receipt, a return, a
 * stock-take correction — funnels through `applyStockMovement`. That single
 * choke point is what guarantees three things:
 *
 *   1. `inventory_items.quantity` is updated ATOMICALLY in SQL, so two cashiers
 *      selling the last tin at the same moment cannot both succeed.
 *   2. Every movement leaves an immutable row in `inventory_transactions` with
 *      the before/after quantities — the audit trail a stock-take relies on.
 *   3. Inbound movements roll the weighted-average cost forward, which is what
 *      makes the profit report real rather than decorative.
 */

export interface StockMovementInput {
  storeId: string;
  branchId: string;
  variantId: string;
  type: InventoryTxnType;
  /** Signed, in base units (×1000). Negative takes stock out. */
  quantityChange: Qty;
  /** Required for inbound movements; ignored otherwise. */
  unitCostPerBase?: UnitCost;
  referenceType?: string;
  referenceId?: string;
  userId?: string | null;
  reason?: string;
  note?: string;
  occurredAt?: Date;
  /** Allow the quantity to go below zero for this movement. */
  allowNegative?: boolean;
}

export interface StockMovementResult {
  quantityBefore: Qty;
  quantityAfter: Qty;
  /** The cost basis used for this movement (outbound) or set by it (inbound). */
  unitCostPerBase: UnitCost;
}

const INBOUND: ReadonlySet<InventoryTxnType> = new Set<InventoryTxnType>([
  'OPENING',
  'PURCHASE',
  'SALE_RETURN',
  'TRANSFER_IN',
]);

export async function applyStockMovement(
  tx: Tx,
  input: StockMovementInput,
): Promise<StockMovementResult> {
  if (input.quantityChange === 0) {
    const current = await readOnHand(tx, input.branchId, input.variantId);
    const variant = await tx.productVariant.findUniqueOrThrow({
      where: { id: input.variantId },
      select: { avgCostPerBase: true },
    });
    return {
      quantityBefore: current,
      quantityAfter: current,
      unitCostPerBase: costFromDb(variant.avgCostPerBase),
    };
  }

  const variant = await tx.productVariant.findFirstOrThrow({
    where: { id: input.variantId, storeId: input.storeId },
    select: {
      id: true,
      name: true,
      avgCostPerBase: true,
      product: { select: { name: true, trackInventory: true } },
    },
  });

  // Products flagged as "don't track" (services, bags) still get a transaction
  // row for the audit trail, but no quantity is moved.
  if (!variant.product.trackInventory) {
    const cost = costFromDb(variant.avgCostPerBase);
    await writeTransactionRow(tx, input, 0, 0, cost);
    return { quantityBefore: 0, quantityAfter: 0, unitCostPerBase: cost };
  }

  // ── Atomic quantity update ────────────────────────────────────────────────
  // A single statement: insert the row if this branch has never carried the
  // variant, otherwise add the delta. PostgreSQL serialises conflicting
  // upserts on the unique index, so no read-modify-write race is possible.
  const rows = await tx.$queryRaw<Array<{ quantity: string; previous: string }>>`
    INSERT INTO inventory_items (
      id, "storeId", "branchId", "variantId", quantity, reserved, "minimumStock", "createdAt", "updatedAt"
    )
    VALUES (
      ${randomUUID()}, ${input.storeId}, ${input.branchId}, ${input.variantId},
      ${qtyToDb(input.quantityChange)}::decimal, 0, 0, NOW(), NOW()
    )
    ON CONFLICT ("branchId", "variantId") DO UPDATE
      SET quantity = inventory_items.quantity + EXCLUDED.quantity,
          "updatedAt" = NOW()
    RETURNING quantity::text AS quantity,
              (quantity - ${qtyToDb(input.quantityChange)}::decimal)::text AS previous
  `;

  const row = rows[0];
  if (!row) throw businessRule('تعذر تحديث المخزون. يرجى المحاولة مرة أخرى.');

  const quantityAfter = qtyFromDb(row.quantity);
  const quantityBefore = qtyFromDb(row.previous);

  if (quantityAfter < 0 && !input.allowNegative) {
    const label = `${variant.product.name}${variant.name !== 'افتراضي' ? ` (${variant.name})` : ''}`;
    // Throwing rolls the whole transaction back, including this update.
    throw businessRule(`الكمية المتوفرة من "${label}" غير كافية لإتمام العملية.`, {
      variantId: input.variantId,
      available: quantityBefore,
      requested: -input.quantityChange,
    });
  }

  // ── Cost basis ────────────────────────────────────────────────────────────
  let unitCostPerBase = costFromDb(variant.avgCostPerBase);

  if (INBOUND.has(input.type) && input.unitCostPerBase !== undefined) {
    if (input.type === 'SALE_RETURN') {
      // A return comes back at the cost it left at — it must not move the
      // average, or returning a sale would quietly rewrite the margin.
      unitCostPerBase = input.unitCostPerBase;
    } else {
      const onHandBefore = await readTotalOnHand(tx, input.variantId, input.quantityChange);
      unitCostPerBase = weightedAverageCost(
        onHandBefore,
        costFromDb(variant.avgCostPerBase),
        input.quantityChange,
        input.unitCostPerBase,
      );
      await tx.productVariant.update({
        where: { id: input.variantId },
        data: { avgCostPerBase: costToDb(unitCostPerBase) },
      });
    }
  }

  await writeTransactionRow(tx, input, quantityBefore, quantityAfter, unitCostPerBase);

  return { quantityBefore, quantityAfter, unitCostPerBase };
}

async function writeTransactionRow(
  tx: Tx,
  input: StockMovementInput,
  quantityBefore: Qty,
  quantityAfter: Qty,
  unitCostPerBase: UnitCost,
): Promise<void> {
  await tx.inventoryTransaction.create({
    data: {
      storeId: input.storeId,
      branchId: input.branchId,
      variantId: input.variantId,
      type: input.type,
      quantityChange: qtyToDb(input.quantityChange),
      quantityBefore: qtyToDb(quantityBefore),
      quantityAfter: qtyToDb(quantityAfter),
      unitCostPerBase: costToDb(unitCostPerBase),
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      userId: input.userId ?? null,
      reason: input.reason ?? null,
      note: input.note ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}

async function readOnHand(tx: Tx, branchId: string, variantId: string): Promise<Qty> {
  const item = await tx.inventoryItem.findUnique({
    where: { branchId_variantId: { branchId, variantId } },
    select: { quantity: true },
  });
  return qtyFromDb(item?.quantity);
}

/**
 * Total on-hand for a variant across every branch, as it was BEFORE the
 * movement that has already been applied — which is what the weighted average
 * formula needs.
 */
async function readTotalOnHand(tx: Tx, variantId: string, appliedChange: Qty): Promise<Qty> {
  const aggregate = await tx.inventoryItem.aggregate({
    where: { variantId },
    _sum: { quantity: true },
  });
  return qtyFromDb(aggregate._sum.quantity) - appliedChange;
}

// ── Availability checks ──────────────────────────────────────────────────────

export interface AvailabilityRequest {
  variantId: string;
  quantity: Qty;
}

export interface AvailabilityProblem {
  variantId: string;
  productName: string;
  variantName: string;
  available: Qty;
  requested: Qty;
}

/**
 * Pre-flight check before a sale, so the cashier sees one clear message listing
 * every short item rather than failing on the first one.
 */
export async function checkAvailability(
  tx: Tx,
  storeId: string,
  branchId: string,
  requests: AvailabilityRequest[],
): Promise<AvailabilityProblem[]> {
  if (requests.length === 0) return [];

  const variantIds = [...new Set(requests.map((request) => request.variantId))];

  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, storeId },
    select: {
      id: true,
      name: true,
      product: { select: { name: true, trackInventory: true } },
      inventoryItems: {
        where: { branchId },
        select: { quantity: true },
      },
    },
  });

  const index = new Map(variants.map((variant) => [variant.id, variant]));
  const wanted = new Map<string, Qty>();
  for (const request of requests) {
    wanted.set(request.variantId, (wanted.get(request.variantId) ?? 0) + request.quantity);
  }

  const problems: AvailabilityProblem[] = [];
  for (const [variantId, quantity] of wanted) {
    const variant = index.get(variantId);
    if (!variant || !variant.product.trackInventory) continue;
    const available = qtyFromDb(variant.inventoryItems[0]?.quantity);
    if (available < quantity) {
      problems.push({
        variantId,
        productName: variant.product.name,
        variantName: variant.name,
        available,
        requested: quantity,
      });
    }
  }

  return problems;
}

// ── Low-stock notifications ──────────────────────────────────────────────────

/**
 * Raise a notification when a movement drops a variant to or below its
 * threshold. Only fires on the crossing, so a product sitting at zero does not
 * generate an alert on every sale.
 */
export async function maybeNotifyLowStock(
  tx: Tx,
  params: {
    storeId: string;
    branchId: string;
    variantId: string;
    quantityBefore: Qty;
    quantityAfter: Qty;
  },
): Promise<void> {
  if (params.quantityAfter >= params.quantityBefore) return;

  const settings = await tx.storeSettings.findUnique({
    where: { storeId: params.storeId },
    select: { lowStockAlerts: true },
  });
  if (!settings?.lowStockAlerts) return;

  const variant = await tx.productVariant.findUnique({
    where: { id: params.variantId },
    select: {
      name: true,
      minimumStock: true,
      product: { select: { id: true, name: true, trackInventory: true } },
      inventoryItems: { where: { branchId: params.branchId }, select: { minimumStock: true } },
    },
  });
  if (!variant || !variant.product.trackInventory) return;

  const branchMinimum = qtyFromDb(variant.inventoryItems[0]?.minimumStock);
  const threshold = branchMinimum > 0 ? branchMinimum : qtyFromDb(variant.minimumStock);
  if (threshold <= 0) return;

  const crossed = params.quantityBefore > threshold && params.quantityAfter <= threshold;
  if (!crossed) return;

  const label = `${variant.product.name}${variant.name !== 'افتراضي' ? ` — ${variant.name}` : ''}`;
  const outOfStock = params.quantityAfter <= 0;

  await tx.notification.create({
    data: {
      storeId: params.storeId,
      kind: outOfStock ? 'OUT_OF_STOCK' : 'LOW_STOCK',
      severity: outOfStock ? 'DANGER' : 'WARNING',
      title: outOfStock ? 'نفد المخزون' : 'مخزون منخفض',
      body: outOfStock
        ? `نفدت الكمية من ${label}. أعد الطلب من المورد.`
        : `الكمية المتبقية من ${label} وصلت للحد الأدنى.`,
      entityType: 'product',
      entityId: variant.product.id,
      link: `/products/${variant.product.id}`,
    },
  });
}
