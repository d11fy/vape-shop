import {
  add,
  allocateByWeight,
  clampNonNegative,
  percentOfBps,
  taxFromInclusive,
  type Money,
} from '@/core/money';
import { costAmount, lineAmount, type Factor, type Qty, type UnitCost } from '@/core/quantity';

/**
 * Invoice arithmetic — pure, deterministic, and unit-tested.
 *
 * Deliberately free of any database or request context so the numbers can be
 * verified in isolation and reused by the POS preview, the server action and
 * the receipt renderer without three chances to disagree.
 *
 * Invariants it guarantees:
 *   Σ line.lineTotal  === subtotal − discountTotal
 *   Σ line.taxAmount  === taxTotal
 *   total             === subtotal − discountTotal + (tax exclusive ? taxTotal : 0)
 *
 * An invoice-level discount is spread across the lines in proportion to their
 * value, with the rounding remainder given to the largest lines — so no minor
 * unit is ever created or lost.
 */

export interface TaxConfig {
  enabled: boolean;
  /** Basis points: 1500 = 15%. */
  rateBps: number;
  /** True when displayed prices already contain the tax. */
  inclusive: boolean;
}

export const NO_TAX: TaxConfig = { enabled: false, rateBps: 0, inclusive: false };

export interface LineInput {
  variantId: string;
  /** Base units (×1000). */
  quantity: Qty;
  /** Base units per sale unit (×1000). */
  factor: Factor;
  /** Price per sale unit, minor units. */
  unitPrice: Money;
  /** Discount applied directly to this line. */
  lineDiscount?: Money;
  /** Weighted-average cost per base unit, for COGS. */
  costPerBase?: UnitCost;
}

export interface PricedLine {
  variantId: string;
  quantity: Qty;
  factor: Factor;
  unitPrice: Money;
  /** Quantity × price, before any discount. */
  gross: Money;
  /** Line discount plus this line's share of the invoice discount. */
  discount: Money;
  /** Gross − discount. Contains tax when the store prices tax-inclusive. */
  lineTotal: Money;
  taxAmount: Money;
  cogs: Money;
}

export interface PricedSale {
  lines: PricedLine[];
  /** Sum of gross line values. */
  subtotal: Money;
  discountTotal: Money;
  /** Subtotal − discounts. */
  netTotal: Money;
  taxTotal: Money;
  /** What the customer pays. */
  total: Money;
  cogsTotal: Money;
  /** Revenue excluding tax, minus cost of goods sold. */
  profitTotal: Money;
}

export function priceSale(
  inputs: LineInput[],
  invoiceDiscount: Money,
  tax: TaxConfig = NO_TAX,
): PricedSale {
  const gross = inputs.map((line) => lineAmount(line.unitPrice, line.quantity, line.factor));
  // A line discount can never exceed the line itself.
  const lineDiscounts = inputs.map((line, index) =>
    Math.min(Math.max(0, line.lineDiscount ?? 0), gross[index] ?? 0),
  );

  // Each line's value after its own discount — the weight for spreading the
  // invoice-level discount.
  const afterLineDiscount = gross.map((value, index) =>
    clampNonNegative(value - (lineDiscounts[index] ?? 0)),
  );

  const netBeforeInvoiceDiscount = afterLineDiscount.reduce((sum, value) => sum + value, 0);
  const cappedInvoiceDiscount = Math.min(Math.max(0, invoiceDiscount), netBeforeInvoiceDiscount);
  const spread = allocateByWeight(cappedInvoiceDiscount, afterLineDiscount);

  const lineTotals = afterLineDiscount.map((value, index) =>
    clampNonNegative(value - (spread[index] ?? 0)),
  );
  const netTotal = lineTotals.reduce((sum, value) => sum + value, 0);

  // Tax is computed on the invoice net and then distributed, rather than
  // computed per line and summed: that way the header figure is exact and the
  // line figures always add back up to it.
  let taxTotal = 0;
  if (tax.enabled && tax.rateBps > 0) {
    taxTotal = tax.inclusive
      ? taxFromInclusive(netTotal, tax.rateBps)
      : percentOfBps(netTotal, tax.rateBps);
  }
  const taxShares = allocateByWeight(taxTotal, lineTotals);

  const lines: PricedLine[] = inputs.map((input, index) => ({
    variantId: input.variantId,
    quantity: input.quantity,
    factor: input.factor,
    unitPrice: input.unitPrice,
    gross: gross[index] ?? 0,
    discount: (lineDiscounts[index] ?? 0) + (spread[index] ?? 0),
    lineTotal: lineTotals[index] ?? 0,
    taxAmount: taxShares[index] ?? 0,
    cogs: input.costPerBase ? costAmount(input.quantity, input.costPerBase) : 0,
  }));

  const subtotal = gross.reduce((sum, value) => sum + value, 0);
  const discountTotal = lines.reduce((sum, line) => sum + line.discount, 0);
  const total = tax.inclusive ? netTotal : add(netTotal, taxTotal);
  const cogsTotal = lines.reduce((sum, line) => sum + line.cogs, 0);
  const revenueExclTax = tax.inclusive ? netTotal - taxTotal : netTotal;

  return {
    lines,
    subtotal,
    discountTotal,
    netTotal,
    taxTotal,
    total,
    cogsTotal,
    profitTotal: revenueExclTax - cogsTotal,
  };
}

/** Convert a percentage discount on a line into a money amount. */
export function discountFromPercent(gross: Money, percent: number): Money {
  const bps = Math.round(Math.max(0, Math.min(100, percent)) * 100);
  return percentOfBps(gross, bps);
}

/** What percentage a money discount represents — for showing "%15" in the UI. */
export function percentFromDiscount(gross: Money, discount: Money): number {
  if (gross <= 0) return 0;
  return Math.round((discount / gross) * 1000) / 10;
}

/** Margin on a completed sale, as a percentage of revenue. */
export function marginPercent(revenue: Money, cogs: Money): number {
  if (revenue <= 0) return 0;
  return Math.round(((revenue - cogs) / revenue) * 1000) / 10;
}
