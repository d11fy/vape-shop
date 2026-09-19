import 'server-only';

import type { Tx } from '@/core/db';
import { businessRule, notFound } from '@/core/errors';
import { allocateByWeight, fromDb, toDb, type Money } from '@/core/money';
import {
  costFromDb,
  costToDb,
  factorFromDb,
  lineAmount,
  qtyFromDb,
  qtyToDb,
  unitCostFromTotal,
  type Qty,
} from '@/core/quantity';
import { nextDocumentNumber } from '@/core/numbering';
import { recordAudit } from '@/core/audit';
import { applyStockMovement } from '@/modules/inventory/service';
import { postSupplierEntry } from '@/modules/ledger/service';
import { recordPayment } from '@/modules/payments/service';

/**
 * Purchasing.
 *
 * The part that matters for profitability is landed cost: shipping, customs and
 * any other charge on the invoice are spread across the lines in proportion to
 * their value, and it is that landed figure — not the sticker price — that
 * rolls into the weighted-average cost of each variant. Get this wrong and
 * every margin in the reports is optimistic.
 */

export interface PurchaseLineRequest {
  variantId: string;
  /** Base units (×1000). */
  quantity: Qty;
  /** Cost per purchase unit, minor units. */
  unitCost: Money;
  discount?: Money;
}

export interface CreatePurchaseInput {
  storeId: string;
  branchId: string;
  userId: string;
  supplierId: string;
  reference?: string | null;
  lines: PurchaseLineRequest[];
  invoiceDiscount?: Money;
  /** Shipping, customs, handling — distributed over the lines. */
  extraCosts?: Money;
  taxTotal?: Money;
  note?: string | null;
  purchasedAt?: Date;
  /** Receive the goods immediately instead of saving a draft. */
  receiveNow?: boolean;
  payments?: Array<{ methodId: string; amount: Money; reference?: string | null }>;
}

export interface PurchaseResult {
  purchaseId: string;
  number: string;
  total: Money;
  paidTotal: Money;
  dueTotal: Money;
}

export async function createPurchase(
  tx: Tx,
  input: CreatePurchaseInput,
): Promise<PurchaseResult> {
  if (input.lines.length === 0) {
    throw businessRule('أضف صنفاً واحداً على الأقل لفاتورة الشراء.');
  }

  const settings = await tx.storeSettings.findUnique({
    where: { storeId: input.storeId },
    select: { invoicePrefix: true, invoicePadding: true, timezone: true },
  });
  if (!settings) throw notFound('إعدادات المتجر');

  const supplier = await tx.supplier.findFirst({
    where: { id: input.supplierId, storeId: input.storeId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!supplier) throw notFound('المورد');

  const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, storeId: input.storeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      sku: true,
      unitLabel: true,
      displayFactor: true,
      product: { select: { name: true } },
    },
  });
  const variantIndex = new Map(variants.map((variant) => [variant.id, variant]));

  // ── Totals ────────────────────────────────────────────────────────────────
  const computed = input.lines.map((line) => {
    const variant = variantIndex.get(line.variantId);
    if (!variant) throw notFound('أحد الأصناف');
    if (line.quantity <= 0) {
      throw businessRule(`أدخل كمية صحيحة للصنف "${variant.product.name}".`);
    }

    const factor = factorFromDb(variant.displayFactor);
    const gross = lineAmount(line.unitCost, line.quantity, factor);
    const discount = Math.min(Math.max(0, line.discount ?? 0), gross);

    return { line, variant, factor, gross, discount, net: gross - discount };
  });

  const subtotal = computed.reduce((sum, item) => sum + item.gross, 0);
  const lineDiscounts = computed.reduce((sum, item) => sum + item.discount, 0);
  const netBeforeInvoiceDiscount = subtotal - lineDiscounts;
  const invoiceDiscount = Math.min(
    Math.max(0, input.invoiceDiscount ?? 0),
    netBeforeInvoiceDiscount,
  );
  const spread = allocateByWeight(
    invoiceDiscount,
    computed.map((item) => item.net),
  );

  const extraCosts = Math.max(0, input.extraCosts ?? 0);
  const netTotals = computed.map((item, index) =>
    Math.max(0, item.net - (spread[index] ?? 0)),
  );
  const extraShares = allocateByWeight(extraCosts, netTotals);

  const discountTotal = lineDiscounts + invoiceDiscount;
  const taxTotal = Math.max(0, input.taxTotal ?? 0);
  const total = subtotal - discountTotal + extraCosts + taxTotal;

  const purchasedAt = input.purchasedAt ?? new Date();
  const number = await nextDocumentNumber(tx, input.storeId, 'PURCHASE', {
    prefix: settings.invoicePrefix,
    padding: settings.invoicePadding,
    timezone: settings.timezone,
    now: purchasedAt,
  });

  const receiveNow = input.receiveNow ?? false;

  const purchase = await tx.purchase.create({
    data: {
      storeId: input.storeId,
      branchId: input.branchId,
      supplierId: input.supplierId,
      number,
      reference: input.reference ?? null,
      userId: input.userId,
      subtotal: toDb(subtotal),
      discountTotal: toDb(discountTotal),
      extraCosts: toDb(extraCosts),
      taxTotal: toDb(taxTotal),
      total: toDb(total),
      paidTotal: 0n,
      dueTotal: toDb(total),
      status: receiveNow ? 'RECEIVED' : 'DRAFT',
      note: input.note ?? null,
      purchasedAt,
      receivedAt: receiveNow ? purchasedAt : null,
    },
    select: { id: true },
  });

  for (const [index, item] of computed.entries()) {
    const netTotal = netTotals[index] ?? 0;
    const landedTotal = netTotal + (extraShares[index] ?? 0);
    const landedCostPerBase = unitCostFromTotal(landedTotal, item.line.quantity);

    await tx.purchaseItem.create({
      data: {
        purchaseId: purchase.id,
        variantId: item.line.variantId,
        productName: item.variant.product.name,
        sku: item.variant.sku,
        unitLabel: item.variant.unitLabel,
        quantityBase: qtyToDb(item.line.quantity),
        displayFactor: qtyToDb(item.factor),
        unitCost: toDb(item.line.unitCost),
        discount: toDb(item.discount + (spread[index] ?? 0)),
        lineTotal: toDb(netTotal),
        landedCostPerBase: costToDb(landedCostPerBase),
        receivedQuantityBase: receiveNow ? qtyToDb(item.line.quantity) : '0.000',
        sortOrder: index,
      },
    });

    if (receiveNow) {
      await applyStockMovement(tx, {
        storeId: input.storeId,
        branchId: input.branchId,
        variantId: item.line.variantId,
        type: 'PURCHASE',
        quantityChange: item.line.quantity,
        unitCostPerBase: landedCostPerBase,
        referenceType: 'purchase',
        referenceId: purchase.id,
        userId: input.userId,
        occurredAt: purchasedAt,
      });

      // Remember the last price paid — the purchase form pre-fills from it.
      await tx.productVariant.update({
        where: { id: item.line.variantId },
        data: { purchasePrice: toDb(item.line.unitCost) },
      });
    }
  }

  let paidTotal = 0;

  if (receiveNow) {
    await postSupplierEntry(tx, input.supplierId, {
      storeId: input.storeId,
      type: 'INVOICE',
      amount: total,
      referenceType: 'purchase',
      referenceId: purchase.id,
      description: `فاتورة شراء ${number}`,
      userId: input.userId,
      occurredAt: purchasedAt,
    });

    for (const payment of input.payments ?? []) {
      if (payment.amount <= 0) continue;
      const applicable = Math.min(payment.amount, total - paidTotal);
      if (applicable <= 0) break;

      await recordPayment(tx, {
        storeId: input.storeId,
        branchId: input.branchId,
        userId: input.userId,
        direction: 'OUT',
        source: 'PURCHASE',
        amount: applicable,
        methodId: payment.methodId,
        reference: payment.reference ?? null,
        purchaseId: purchase.id,
        supplierId: input.supplierId,
        paidAt: purchasedAt,
        postToLedger: true,
        ledgerDescription: `سداد فاتورة شراء ${number}`,
      });
      paidTotal += applicable;
    }

    await tx.purchase.update({
      where: { id: purchase.id },
      data: { paidTotal: toDb(paidTotal), dueTotal: toDb(total - paidTotal) },
    });
  }

  await recordAudit(tx, {
    storeId: input.storeId,
    userId: input.userId,
    action: receiveNow ? 'purchase.receive' : 'purchase.create',
    entityType: 'purchase',
    entityId: purchase.id,
    summary: receiveNow
      ? `استلام فاتورة شراء ${number} من ${supplier.name}`
      : `إنشاء مسودة فاتورة شراء ${number}`,
    after: { number, total, items: computed.length, supplier: supplier.name },
  });

  return { purchaseId: purchase.id, number, total, paidTotal, dueTotal: total - paidTotal };
}

/** Approve a draft: bring the goods in, roll the cost, open the payable. */
export async function receivePurchase(
  tx: Tx,
  input: { storeId: string; userId: string; purchaseId: string },
): Promise<void> {
  const purchase = await tx.purchase.findFirst({
    where: { id: input.purchaseId, storeId: input.storeId, deletedAt: null },
    select: {
      id: true,
      number: true,
      branchId: true,
      supplierId: true,
      status: true,
      total: true,
      purchasedAt: true,
      items: {
        select: {
          id: true,
          variantId: true,
          quantityBase: true,
          unitCost: true,
          landedCostPerBase: true,
        },
      },
    },
  });

  if (!purchase) throw notFound('فاتورة الشراء');
  if (purchase.status !== 'DRAFT') {
    throw businessRule('تم اعتماد هذه الفاتورة مسبقاً.');
  }

  const receivedAt = new Date();

  for (const item of purchase.items) {
    const quantity = qtyFromDb(item.quantityBase);
    if (quantity <= 0) continue;

    await applyStockMovement(tx, {
      storeId: input.storeId,
      branchId: purchase.branchId,
      variantId: item.variantId,
      type: 'PURCHASE',
      quantityChange: quantity,
      unitCostPerBase: costFromDb(item.landedCostPerBase),
      referenceType: 'purchase',
      referenceId: purchase.id,
      userId: input.userId,
      occurredAt: receivedAt,
    });

    await tx.productVariant.update({
      where: { id: item.variantId },
      data: { purchasePrice: item.unitCost },
    });

    await tx.purchaseItem.update({
      where: { id: item.id },
      data: { receivedQuantityBase: item.quantityBase },
    });
  }

  await postSupplierEntry(tx, purchase.supplierId, {
    storeId: input.storeId,
    type: 'INVOICE',
    amount: fromDb(purchase.total),
    referenceType: 'purchase',
    referenceId: purchase.id,
    description: `فاتورة شراء ${purchase.number}`,
    userId: input.userId,
    occurredAt: receivedAt,
  });

  await tx.purchase.update({
    where: { id: purchase.id },
    data: { status: 'RECEIVED', receivedAt },
  });

  await recordAudit(tx, {
    storeId: input.storeId,
    userId: input.userId,
    action: 'purchase.receive',
    entityType: 'purchase',
    entityId: purchase.id,
    summary: `اعتماد واستلام فاتورة الشراء ${purchase.number}`,
    before: { status: 'DRAFT' },
    after: { status: 'RECEIVED' },
  });
}
