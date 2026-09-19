import 'server-only';

import type { Tx } from '@/core/db';
import { businessRule, forbidden, notFound } from '@/core/errors';
import { fromDb, toDb, type Money } from '@/core/money';
import {
  costAmount,
  costFromDb,
  costToDb,
  factorFromDb,
  qtyFromDb,
  qtyToDb,
  type Qty,
} from '@/core/quantity';
import { nextDocumentNumber } from '@/core/numbering';
import { recordAudit } from '@/core/audit';
import { storeFormatter } from '@/lib/formatter';
import { applyStockMovement, checkAvailability, maybeNotifyLowStock } from '@/modules/inventory/service';
import { checkDebtLimit, postCustomerEntry } from '@/modules/ledger/service';
import { allocateTender, recordPayment, type TenderLine } from '@/modules/payments/service';
import { priceSale, type LineInput, type TaxConfig } from './pricing';

/**
 * Completing a sale.
 *
 * One transaction does all of it: reserve the invoice number, move the stock,
 * write the invoice and its lines, record the payments, hit the cash drawer,
 * post the customer's debt, update the shift totals and log the audit entry.
 * If any single step fails — most often "not enough stock" — PostgreSQL rolls
 * the whole thing back and the shop is left exactly as it was.
 */

export interface SaleLineRequest {
  variantId: string;
  /** Base units (×1000). */
  quantity: Qty;
  /** Override the catalogue price. Requires `sales.price_edit`. */
  unitPrice?: Money;
  /** Discount on this line. Requires `sales.discount`. */
  discount?: Money;
}

export interface SaleTenderRequest {
  methodId: string;
  amount: Money;
  reference?: string | null;
}

export interface CreateSaleInput {
  storeId: string;
  branchId: string;
  userId: string;
  shiftId?: string | null;
  customerId?: string | null;
  lines: SaleLineRequest[];
  /** Discount on the invoice total, spread proportionally over the lines. */
  invoiceDiscount?: Money;
  tenders: SaleTenderRequest[];
  note?: string | null;
  soldAt?: Date;
  /** What the acting user is allowed to do — checked here, not just in the UI. */
  permissions: {
    canDiscount: boolean;
    canEditPrice: boolean;
    canSellOnCredit: boolean;
  };
  /** Set by the caller when the store permits negative stock. */
  allowNegativeStock?: boolean;
}

export interface CreateSaleResult {
  saleId: string;
  number: string;
  total: Money;
  paidTotal: Money;
  dueTotal: Money;
  change: Money;
  profitTotal: Money;
}

export async function createSale(tx: Tx, input: CreateSaleInput): Promise<CreateSaleResult> {
  if (input.lines.length === 0) {
    throw businessRule('لا يمكن إتمام فاتورة بدون أصناف.');
  }
  if (input.lines.length > 200) {
    throw businessRule('عدد الأصناف في الفاتورة الواحدة كبير جداً.');
  }

  const settings = await tx.storeSettings.findUnique({
    where: { storeId: input.storeId },
    select: {
      taxEnabled: true,
      taxRateBps: true,
      taxInclusive: true,
      invoicePrefix: true,
      invoicePadding: true,
      timezone: true,
      negativeStockAllowed: true,
      debtEnabled: true,
      currency: true,
      currencyDecimals: true,
      locale: true,
    },
  });
  if (!settings) throw notFound('إعدادات المتجر');

  // ── Load the catalogue rows the invoice will snapshot ─────────────────────
  const variantIds = [...new Set(input.lines.map((line) => line.variantId))];
  const variants = await tx.productVariant.findMany({
    where: { id: { in: variantIds }, storeId: input.storeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      sku: true,
      sellingPrice: true,
      avgCostPerBase: true,
      isActive: true,
      unitLabel: true,
      displayFactor: true,
      allowsFractional: true,
      product: {
        select: { id: true, name: true, trackInventory: true, status: true },
      },
    },
  });

  const variantIndex = new Map(variants.map((variant) => [variant.id, variant]));
  for (const id of variantIds) {
    const variant = variantIndex.get(id);
    if (!variant) throw notFound('أحد الأصناف المطلوبة');
    if (!variant.isActive || variant.product.status !== 'ACTIVE') {
      throw businessRule(`المنتج "${variant.product.name}" غير متاح للبيع حالياً.`);
    }
  }

  // ── Validate quantities and permissions ───────────────────────────────────
  const priceInputs: LineInput[] = input.lines.map((line) => {
    const variant = variantIndex.get(line.variantId)!;
    const factor = factorFromDb(variant.displayFactor);

    if (line.quantity <= 0) {
      throw businessRule(`أدخل كمية صحيحة للمنتج "${variant.product.name}".`);
    }
    if (!variant.allowsFractional && line.quantity % factor !== 0) {
      throw businessRule(`لا يمكن بيع كسور من "${variant.product.name}".`);
    }

    const catalogPrice = fromDb(variant.sellingPrice);
    let unitPrice = catalogPrice;
    if (line.unitPrice !== undefined && line.unitPrice !== catalogPrice) {
      if (!input.permissions.canEditPrice) {
        throw forbidden('ليس لديك صلاحية تعديل السعر عند البيع.');
      }
      if (line.unitPrice < 0) throw businessRule('السعر لا يمكن أن يكون سالباً.');
      unitPrice = line.unitPrice;
    }

    if (line.discount && line.discount > 0 && !input.permissions.canDiscount) {
      throw forbidden('ليس لديك صلاحية تطبيق خصم.');
    }

    return {
      variantId: line.variantId,
      quantity: line.quantity,
      factor,
      unitPrice,
      lineDiscount: line.discount ?? 0,
      costPerBase: costFromDb(variant.avgCostPerBase),
    };
  });

  const invoiceDiscount = input.invoiceDiscount ?? 0;
  if (invoiceDiscount > 0 && !input.permissions.canDiscount) {
    throw forbidden('ليس لديك صلاحية تطبيق خصم.');
  }

  // ── Stock pre-flight, so the cashier gets one complete message ────────────
  const allowNegative = input.allowNegativeStock ?? settings.negativeStockAllowed;
  if (!allowNegative) {
    const problems = await checkAvailability(
      tx,
      input.storeId,
      input.branchId,
      input.lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
    );
    if (problems.length > 0) {
      const names = problems
        .map((problem) => {
          const variant = variantIndex.get(problem.variantId);
          const factor = variant ? factorFromDb(variant.displayFactor) : 1000;
          const available = (problem.available / factor).toLocaleString('en-US', {
            maximumFractionDigits: 3,
          });
          return `${problem.productName} (المتوفر ${available})`;
        })
        .join('، ');
      throw businessRule(`الكمية غير كافية للأصناف التالية: ${names}`);
    }
  }

  // ── Price it ──────────────────────────────────────────────────────────────
  const tax: TaxConfig = {
    enabled: settings.taxEnabled,
    rateBps: settings.taxRateBps,
    inclusive: settings.taxInclusive,
  };
  const priced = priceSale(priceInputs, invoiceDiscount, tax);

  if (priced.total < 0) throw businessRule('إجمالي الفاتورة غير صالح.');

  // ── Tender allocation ─────────────────────────────────────────────────────
  const methodIds = [...new Set(input.tenders.map((tender) => tender.methodId))];
  const methods = methodIds.length
    ? await tx.paymentMethod.findMany({
        where: { id: { in: methodIds }, storeId: input.storeId, isActive: true },
        select: { id: true, affectsCashbox: true, name: true },
      })
    : [];
  const methodIndex = new Map(methods.map((method) => [method.id, method]));

  const tenderLines: TenderLine[] = input.tenders.map((tender) => {
    const method = methodIndex.get(tender.methodId);
    if (!method) throw notFound('طريقة الدفع');
    return {
      methodId: tender.methodId,
      amount: tender.amount,
      isCash: method.affectsCashbox,
      reference: tender.reference ?? null,
    };
  });

  const tender = allocateTender(tenderLines, priced.total);
  const dueTotal = priced.total - tender.paidTotal;

  if (dueTotal > 0) {
    if (!settings.debtEnabled) {
      throw businessRule('البيع الآجل غير مفعّل في إعدادات المتجر.');
    }
    if (!input.permissions.canSellOnCredit) {
      throw forbidden('ليس لديك صلاحية البيع الآجل.');
    }
    if (!input.customerId) {
      throw businessRule('اختر العميل لتسجيل المبلغ المتبقي كدين.');
    }
    const limit = await checkDebtLimit(tx, input.storeId, input.customerId, dueTotal);
    if (!limit.allowed) {
      throw businessRule('تجاوز هذا العميل حد الدين المسموح به.', {
        limit: limit.limit,
        balance: limit.balance,
      });
    }
  }

  if (input.customerId) {
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, storeId: input.storeId, deletedAt: null },
      select: { id: true, isActive: true },
    });
    if (!customer) throw notFound('العميل');
    if (!customer.isActive) throw businessRule('حساب هذا العميل موقوف.');
  }

  // ── Persist ───────────────────────────────────────────────────────────────
  const soldAt = input.soldAt ?? new Date();
  const number = await nextDocumentNumber(tx, input.storeId, 'SALE', {
    prefix: settings.invoicePrefix,
    padding: settings.invoicePadding,
    timezone: settings.timezone,
    now: soldAt,
  });

  const sale = await tx.sale.create({
    data: {
      storeId: input.storeId,
      branchId: input.branchId,
      number,
      customerId: input.customerId ?? null,
      userId: input.userId,
      shiftId: input.shiftId ?? null,
      subtotal: toDb(priced.subtotal),
      discountTotal: toDb(priced.discountTotal),
      taxTotal: toDb(priced.taxTotal),
      total: toDb(priced.total),
      paidTotal: toDb(tender.paidTotal),
      dueTotal: toDb(dueTotal),
      status: 'COMPLETED',
      note: input.note ?? null,
      soldAt,
    },
    select: { id: true },
  });

  // Stock out, line by line, capturing the cost basis used for each.
  let cogsTotal = 0;
  for (const [index, line] of priced.lines.entries()) {
    const variant = variantIndex.get(line.variantId)!;

    const movement = await applyStockMovement(tx, {
      storeId: input.storeId,
      branchId: input.branchId,
      variantId: line.variantId,
      type: 'SALE',
      quantityChange: -line.quantity,
      referenceType: 'sale',
      referenceId: sale.id,
      userId: input.userId,
      occurredAt: soldAt,
      allowNegative,
    });

    const costPerBase = movement.unitCostPerBase;
    const cogs = costAmount(line.quantity, costPerBase);
    cogsTotal += cogs;

    await tx.saleItem.create({
      data: {
        storeId: input.storeId,
        saleId: sale.id,
        variantId: line.variantId,
        productName: variant.product.name,
        variantName: variant.name,
        sku: variant.sku,
        unitLabel: variant.unitLabel,
        quantityBase: qtyToDb(line.quantity),
        displayFactor: qtyToDb(line.factor),
        unitPrice: toDb(line.unitPrice),
        discount: toDb(line.discount),
        taxAmount: toDb(line.taxAmount),
        lineTotal: toDb(line.lineTotal),
        costPerBase: costToDb(costPerBase),
        cogs: toDb(cogs),
        sortOrder: index,
      },
    });

    await maybeNotifyLowStock(tx, {
      storeId: input.storeId,
      branchId: input.branchId,
      variantId: line.variantId,
      quantityBefore: movement.quantityBefore,
      quantityAfter: movement.quantityAfter,
    });
  }

  const revenueExclTax = tax.inclusive ? priced.netTotal - priced.taxTotal : priced.netTotal;
  const profitTotal = revenueExclTax - cogsTotal;

  await tx.sale.update({
    where: { id: sale.id },
    data: { cogsTotal: toDb(cogsTotal), profitTotal: toDb(profitTotal) },
  });

  // Payments — these also move the drawer.
  for (const applied of tender.applied) {
    await recordPayment(tx, {
      storeId: input.storeId,
      branchId: input.branchId,
      userId: input.userId,
      shiftId: input.shiftId ?? null,
      direction: 'IN',
      source: 'SALE',
      amount: applied.amount,
      methodId: applied.methodId,
      reference: applied.reference ?? null,
      saleId: sale.id,
      customerId: input.customerId ?? null,
      paidAt: soldAt,
      postToLedger: false,
      ledgerDescription: `فاتورة ${number}`,
    });
  }

  // Outstanding balance becomes a documented receivable.
  if (dueTotal > 0 && input.customerId) {
    await postCustomerEntry(tx, input.customerId, {
      storeId: input.storeId,
      type: 'INVOICE',
      amount: dueTotal,
      referenceType: 'sale',
      referenceId: sale.id,
      description: `فاتورة آجلة ${number}`,
      userId: input.userId,
      occurredAt: soldAt,
    });
  }

  if (input.shiftId) {
    await tx.shift.update({
      where: { id: input.shiftId },
      data: {
        salesTotal: { increment: toDb(priced.total) },
        invoiceCount: { increment: 1 },
      },
    });
  }

  await recordAudit(tx, {
    storeId: input.storeId,
    userId: input.userId,
    action: 'sale.create',
    entityType: 'sale',
    entityId: sale.id,
    summary: `تسجيل فاتورة ${number} بقيمة ${storeFormatter(settings).money(priced.total)}`,
    after: {
      number,
      total: priced.total,
      paid: tender.paidTotal,
      due: dueTotal,
      items: priced.lines.length,
      customerId: input.customerId ?? null,
    },
  });

  return {
    saleId: sale.id,
    number,
    total: priced.total,
    paidTotal: tender.paidTotal,
    dueTotal,
    change: tender.change,
    profitTotal,
  };
}

// ── Cancellation ─────────────────────────────────────────────────────────────

export interface CancelSaleInput {
  storeId: string;
  userId: string;
  saleId: string;
  reason: string;
  /** Put the goods back on the shelf. */
  restock?: boolean;
}

/**
 * Cancelling never deletes. The invoice stays, marked `CANCELED`, and every
 * effect it had is reversed with its own documented movement — stock back in,
 * cash back out, receivable cleared.
 */
export async function cancelSale(tx: Tx, input: CancelSaleInput): Promise<void> {
  const sale = await tx.sale.findFirst({
    where: { id: input.saleId, storeId: input.storeId, deletedAt: null },
    select: {
      id: true,
      number: true,
      branchId: true,
      status: true,
      customerId: true,
      total: true,
      dueTotal: true,
      shiftId: true,
      soldAt: true,
      items: {
        select: {
          variantId: true,
          quantityBase: true,
          returnedQuantityBase: true,
          costPerBase: true,
          productName: true,
        },
      },
      payments: {
        where: { deletedAt: null },
        select: { id: true, amount: true, methodId: true, method: { select: { affectsCashbox: true } } },
      },
    },
  });

  if (!sale) throw notFound('الفاتورة');
  if (sale.status === 'CANCELED') throw businessRule('تم إلغاء هذه الفاتورة مسبقاً.');
  if (sale.status !== 'COMPLETED') {
    throw businessRule('لا يمكن إلغاء فاتورة تمت عليها عمليات إرجاع. سجّل مرتجعاً بدلاً من ذلك.');
  }

  const restock = input.restock ?? true;

  if (restock) {
    for (const item of sale.items) {
      const quantity = qtyFromDb(item.quantityBase) - qtyFromDb(item.returnedQuantityBase);
      if (quantity <= 0) continue;
      await applyStockMovement(tx, {
        storeId: input.storeId,
        branchId: sale.branchId,
        variantId: item.variantId,
        type: 'SALE_RETURN',
        quantityChange: quantity,
        unitCostPerBase: costFromDb(item.costPerBase),
        referenceType: 'sale_cancel',
        referenceId: sale.id,
        userId: input.userId,
        reason: input.reason,
      });
    }
  }

  // Reverse each payment with an offsetting movement.
  for (const payment of sale.payments) {
    await recordPayment(tx, {
      storeId: input.storeId,
      branchId: sale.branchId,
      userId: input.userId,
      shiftId: sale.shiftId,
      direction: 'OUT',
      source: 'SALE_REFUND',
      amount: fromDb(payment.amount),
      methodId: payment.methodId,
      saleId: sale.id,
      customerId: sale.customerId,
      note: `إلغاء فاتورة ${sale.number}`,
      postToLedger: false,
    });
  }

  // Clear any receivable the invoice created.
  const dueTotal = fromDb(sale.dueTotal);
  if (dueTotal > 0 && sale.customerId) {
    await postCustomerEntry(tx, sale.customerId, {
      storeId: input.storeId,
      type: 'ADJUSTMENT',
      amount: -dueTotal,
      referenceType: 'sale_cancel',
      referenceId: sale.id,
      description: `إلغاء فاتورة ${sale.number}`,
      userId: input.userId,
    });
  }

  await tx.sale.update({
    where: { id: sale.id },
    data: {
      status: 'CANCELED',
      canceledAt: new Date(),
      canceledById: input.userId,
      cancelReason: input.reason,
      dueTotal: 0n,
    },
  });

  if (sale.shiftId) {
    await tx.shift.update({
      where: { id: sale.shiftId },
      data: {
        salesTotal: { decrement: sale.total },
        invoiceCount: { decrement: 1 },
      },
    });
  }

  await recordAudit(tx, {
    storeId: input.storeId,
    userId: input.userId,
    action: 'sale.cancel',
    entityType: 'sale',
    entityId: sale.id,
    summary: `إلغاء الفاتورة ${sale.number}`,
    before: { status: sale.status, total: fromDb(sale.total) },
    after: { status: 'CANCELED', reason: input.reason, restocked: restock },
  });
}
