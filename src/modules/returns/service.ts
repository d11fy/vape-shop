import 'server-only';

import type { Tx } from '@/core/db';
import { businessRule, notFound } from '@/core/errors';
import { fromDb, toDb, type Money } from '@/core/money';
import { costAmount, costFromDb, costToDb, qtyFromDb, qtyToDb, type Qty } from '@/core/quantity';
import { nextDocumentNumber } from '@/core/numbering';
import { recordAudit } from '@/core/audit';
import { applyStockMovement } from '@/modules/inventory/service';
import { postCustomerEntry } from '@/modules/ledger/service';
import { recordPayment } from '@/modules/payments/service';

/**
 * Returns.
 *
 * An invoice is never deleted and never edited. When goods come back, a
 * separate return document records exactly what came back, what it cost, and
 * where the money went — so the original sale still says what happened on the
 * day, and the books still balance.
 *
 * Money is settled in the order a shopkeeper would: first clear anything the
 * customer still owes on that invoice, and only hand back cash for the rest.
 */

export interface ReturnItemRequest {
  saleItemId: string;
  /** Base units (×1000) coming back. */
  quantity: Qty;
}

export interface CreateReturnInput {
  storeId: string;
  branchId: string;
  userId: string;
  saleId: string;
  items: ReturnItemRequest[];
  reason: string;
  note?: string | null;
  /** Put the goods back on the shelf. False for damaged stock. */
  restock: boolean;
  /** Method used to hand cash back. Omit to settle entirely against the debt. */
  refundMethodId?: string | null;
  returnedAt?: Date;
}

export interface CreateReturnResult {
  returnId: string;
  number: string;
  total: Money;
  refundTotal: Money;
  creditTotal: Money;
}

export async function createReturn(
  tx: Tx,
  input: CreateReturnInput,
): Promise<CreateReturnResult> {
  if (input.items.length === 0) {
    throw businessRule('اختر صنفاً واحداً على الأقل للإرجاع.');
  }

  const sale = await tx.sale.findFirst({
    where: { id: input.saleId, storeId: input.storeId, deletedAt: null },
    select: {
      id: true,
      number: true,
      branchId: true,
      status: true,
      customerId: true,
      dueTotal: true,
      shiftId: true,
      taxTotal: true,
      items: {
        select: {
          id: true,
          variantId: true,
          productName: true,
          quantityBase: true,
          returnedQuantityBase: true,
          displayFactor: true,
          unitPrice: true,
          lineTotal: true,
          taxAmount: true,
          costPerBase: true,
        },
      },
    },
  });

  if (!sale) throw notFound('الفاتورة');
  if (sale.status === 'CANCELED') {
    throw businessRule('لا يمكن تسجيل مرتجع على فاتورة ملغاة.');
  }
  if (sale.status === 'RETURNED') {
    throw businessRule('تم إرجاع هذه الفاتورة بالكامل مسبقاً.');
  }

  const settings = await tx.storeSettings.findUniqueOrThrow({
    where: { storeId: input.storeId },
    select: { invoicePrefix: true, invoicePadding: true, timezone: true },
  });

  const itemIndex = new Map(sale.items.map((item) => [item.id, item]));
  const returnedAt = input.returnedAt ?? new Date();

  // ── Validate and price each returned line ─────────────────────────────────
  const lines = input.items.map((request) => {
    const item = itemIndex.get(request.saleItemId);
    if (!item) throw notFound('أحد أصناف الفاتورة');

    const sold = qtyFromDb(item.quantityBase);
    const alreadyReturned = qtyFromDb(item.returnedQuantityBase);
    const remaining = sold - alreadyReturned;

    if (request.quantity <= 0) {
      throw businessRule(`أدخل كمية صحيحة لإرجاع "${item.productName}".`);
    }
    if (request.quantity > remaining) {
      throw businessRule(
        `الكمية المطلوب إرجاعها من "${item.productName}" أكبر من الكمية المتبقية في الفاتورة.`,
      );
    }

    // Refund at the price actually paid for that line, discounts included.
    const lineTotal = fromDb(item.lineTotal);
    const taxAmount = fromDb(item.taxAmount);
    const refundLineTotal = proportion(lineTotal, request.quantity, sold);
    const refundTax = proportion(taxAmount, request.quantity, sold);
    const costPerBase = costFromDb(item.costPerBase);

    return {
      item,
      quantity: request.quantity,
      sold,
      alreadyReturned,
      lineTotal: refundLineTotal,
      taxAmount: refundTax,
      costPerBase,
      cogs: costAmount(request.quantity, costPerBase),
      unitPrice: fromDb(item.unitPrice),
      factor: qtyFromDb(item.displayFactor),
    };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const taxTotal = lines.reduce((sum, line) => sum + line.taxAmount, 0);
  const cogsTotal = lines.reduce((sum, line) => sum + line.cogs, 0);
  const total = subtotal;

  // ── Settle the money ──────────────────────────────────────────────────────
  // Anything still owed on this invoice is cleared first; only the surplus is
  // handed back as cash.
  const outstanding = fromDb(sale.dueTotal);
  const creditTotal = Math.min(total, Math.max(0, outstanding));
  const refundTotal = total - creditTotal;

  if (refundTotal > 0 && !input.refundMethodId) {
    throw businessRule('اختر طريقة إعادة المبلغ للعميل.');
  }
  if (creditTotal > 0 && !sale.customerId) {
    throw businessRule('لا يمكن خصم المرتجع من دين فاتورة بدون عميل.');
  }

  const number = await nextDocumentNumber(tx, input.storeId, 'RETURN', {
    prefix: settings.invoicePrefix,
    padding: settings.invoicePadding,
    timezone: settings.timezone,
    now: returnedAt,
  });

  const saleReturn = await tx.saleReturn.create({
    data: {
      storeId: input.storeId,
      branchId: input.branchId,
      number,
      saleId: sale.id,
      customerId: sale.customerId,
      userId: input.userId,
      shiftId: sale.shiftId,
      subtotal: toDb(subtotal),
      taxTotal: toDb(taxTotal),
      total: toDb(total),
      refundTotal: toDb(refundTotal),
      creditTotal: toDb(creditTotal),
      cogsTotal: toDb(cogsTotal),
      restock: input.restock,
      reason: input.reason,
      note: input.note ?? null,
      returnedAt,
    },
    select: { id: true },
  });

  for (const line of lines) {
    await tx.saleReturnItem.create({
      data: {
        returnId: saleReturn.id,
        saleItemId: line.item.id,
        variantId: line.item.variantId,
        productName: line.item.productName,
        quantityBase: qtyToDb(line.quantity),
        displayFactor: qtyToDb(line.factor),
        unitPrice: toDb(line.unitPrice),
        lineTotal: toDb(line.lineTotal),
        costPerBase: costToDb(line.costPerBase),
        cogs: toDb(line.cogs),
      },
    });

    await tx.saleItem.update({
      where: { id: line.item.id },
      data: { returnedQuantityBase: qtyToDb(line.alreadyReturned + line.quantity) },
    });

    if (input.restock) {
      // Goods come back at the cost they left at, so the weighted average is
      // untouched — a return must not silently rewrite the margin.
      await applyStockMovement(tx, {
        storeId: input.storeId,
        branchId: input.branchId,
        variantId: line.item.variantId,
        type: 'SALE_RETURN',
        quantityChange: line.quantity,
        unitCostPerBase: line.costPerBase,
        referenceType: 'return',
        referenceId: saleReturn.id,
        userId: input.userId,
        reason: input.reason,
        occurredAt: returnedAt,
      });
    } else {
      await applyStockMovement(tx, {
        storeId: input.storeId,
        branchId: input.branchId,
        variantId: line.item.variantId,
        type: 'DAMAGE',
        quantityChange: 0,
        referenceType: 'return',
        referenceId: saleReturn.id,
        userId: input.userId,
        reason: `مرتجع تالف: ${input.reason}`,
        occurredAt: returnedAt,
      });
    }
  }

  // Reduce the outstanding balance on the invoice and the customer's account.
  if (creditTotal > 0 && sale.customerId) {
    await postCustomerEntry(tx, sale.customerId, {
      storeId: input.storeId,
      type: 'RETURN',
      amount: -creditTotal,
      referenceType: 'return',
      referenceId: saleReturn.id,
      description: `مرتجع على فاتورة ${sale.number}`,
      userId: input.userId,
      occurredAt: returnedAt,
    });

    await tx.sale.update({
      where: { id: sale.id },
      data: { dueTotal: toDb(outstanding - creditTotal) },
    });
  }

  if (refundTotal > 0 && input.refundMethodId) {
    await recordPayment(tx, {
      storeId: input.storeId,
      branchId: input.branchId,
      userId: input.userId,
      shiftId: sale.shiftId,
      direction: 'OUT',
      source: 'SALE_REFUND',
      amount: refundTotal,
      methodId: input.refundMethodId,
      saleId: sale.id,
      returnId: saleReturn.id,
      customerId: sale.customerId,
      note: `مرتجع ${number}`,
      paidAt: returnedAt,
      postToLedger: false,
      ledgerDescription: `إعادة مبلغ — مرتجع ${number}`,
    });
  }

  // ── Invoice status ────────────────────────────────────────────────────────
  const refreshed = await tx.saleItem.findMany({
    where: { saleId: sale.id },
    select: { quantityBase: true, returnedQuantityBase: true },
  });
  const fullyReturned = refreshed.every(
    (item) => qtyFromDb(item.returnedQuantityBase) >= qtyFromDb(item.quantityBase),
  );

  await tx.sale.update({
    where: { id: sale.id },
    data: { status: fullyReturned ? 'RETURNED' : 'PARTIALLY_RETURNED' },
  });

  if (sale.shiftId) {
    await tx.shift.update({
      where: { id: sale.shiftId },
      data: { refundsTotal: { increment: toDb(refundTotal) } },
    });
  }

  await recordAudit(tx, {
    storeId: input.storeId,
    userId: input.userId,
    action: 'return.create',
    entityType: 'sale_return',
    entityId: saleReturn.id,
    summary: `تسجيل مرتجع ${number} على الفاتورة ${sale.number}`,
    after: {
      number,
      saleNumber: sale.number,
      total,
      refundTotal,
      creditTotal,
      items: lines.length,
      restock: input.restock,
      reason: input.reason,
    },
  });

  return { returnId: saleReturn.id, number, total, refundTotal, creditTotal };
}

/** `round(value × part / whole)` in BigInt, so a partial refund never drifts. */
function proportion(value: Money, part: Qty, whole: Qty): Money {
  if (whole === 0) return 0;
  if (part >= whole) return value;
  const numerator = BigInt(value) * BigInt(part);
  const denominator = BigInt(whole);
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return Number(remainder * 2n >= denominator ? quotient + 1n : quotient);
}
