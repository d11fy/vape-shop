/**
 * Quantity arithmetic.
 *
 * Stock is stored in a product's BASE UNIT (piece, gram, millilitre) as
 * `Decimal(18,3)`. Because that column has exactly three decimal places, we can
 * represent every quantity in the application as an integer number of
 * THOUSANDTHS of a base unit — a `Qty`. Integers make addition, subtraction and
 * comparison exact, so `10kg − 250g` is always `9.750kg`, never `9.749999…`.
 *
 *   1 piece  = 1_000 Qty
 *   1 gram   = 1_000 Qty
 *   1 kg     = 1_000_000 Qty (base unit is the gram, displayFactor = 1000)
 */

import type { UnitKind } from '@/generated/prisma/enums';

/** Integer thousandths of one base unit. */
export type Qty = number;

/** Base units per sale unit, also scaled ×1000 (kg → 1_000_000). */
export type Factor = number;

/** Minor currency units per base unit, scaled ×1_000_000 for precision. */
export type UnitCost = number;

export const QTY_SCALE = 1_000;
export const COST_SCALE = 1_000_000;

export const ZERO_QTY: Qty = 0;

type DecimalLike = { toString(): string };

// ── Database boundary ────────────────────────────────────────────────────────

/** Read a `Decimal(18,3)` column into an exact integer `Qty`. */
export function qtyFromDb(value: DecimalLike | string | number | null | undefined): Qty {
  if (value === null || value === undefined) return 0;
  return decimalStringToScaled(String(value), 3);
}

/** Serialise a `Qty` for a `Decimal(18,3)` column. */
export function qtyToDb(value: Qty): string {
  return scaledToDecimalString(value, 3);
}

/** Read a `Decimal(20,6)` cost column into an exact integer `UnitCost`. */
export function costFromDb(value: DecimalLike | string | number | null | undefined): UnitCost {
  if (value === null || value === undefined) return 0;
  return decimalStringToScaled(String(value), 6);
}

/** Serialise a `UnitCost` for a `Decimal(20,6)` column. */
export function costToDb(value: UnitCost): string {
  return scaledToDecimalString(value, 6);
}

/** Read a `displayFactor` column (`Decimal(18,3)`) into a `Factor`. */
export function factorFromDb(value: DecimalLike | string | number | null | undefined): Factor {
  const factor = qtyFromDb(value);
  return factor <= 0 ? QTY_SCALE : factor;
}

// ── Scaled-decimal helpers ───────────────────────────────────────────────────

function decimalStringToScaled(text: string, decimals: number): number {
  const match = /^\s*(-?)(\d*)(?:\.(\d*))?\s*$/.exec(text);
  if (!match) return 0;
  const [, sign = '', whole = '0', frac = ''] = match;
  const padded = frac.padEnd(decimals + 1, '0');
  const kept = padded.slice(0, decimals);
  const nextDigit = Number(padded[decimals] ?? '0');
  const magnitude = Number(`${whole || '0'}${kept}`) + (nextDigit >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(magnitude)) {
    throw new RangeError(`Quantity out of safe range: ${text}`);
  }
  return sign === '-' ? -magnitude : magnitude;
}

function scaledToDecimalString(value: number, decimals: number): string {
  const negative = value < 0;
  const digits = String(Math.abs(Math.trunc(value))).padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const frac = digits.slice(digits.length - decimals);
  return `${negative ? '-' : ''}${whole}.${frac}`;
}

// ── Construction from user input ─────────────────────────────────────────────

/**
 * Convert a quantity typed in SALE units (e.g. "2.5" kilos) into base-unit
 * `Qty`. Returns `null` when the text is not a valid number.
 */
export function qtyFromSaleUnits(input: string | number, factor: Factor): Qty | null {
  const text = typeof input === 'number' ? String(input) : normalizeNumericInput(input);
  if (text === '' || !/^-?\d*(?:\.\d*)?$/.test(text) || text === '-' || text === '.') return null;
  let saleUnitsScaled: number;
  try {
    saleUnitsScaled = decimalStringToScaled(text, 3);
  } catch {
    return null;
  }
  // saleUnits(×1000) × factor(×1000) / 1000 → base units ×1000
  return Math.round((saleUnitsScaled * factor) / QTY_SCALE);
}

/** Inverse of {@link qtyFromSaleUnits} — a plain number of sale units. */
export function qtyToSaleUnits(qty: Qty, factor: Factor): number {
  if (factor === 0) return 0;
  return qty / factor;
}

export function normalizeNumericInput(input: string): string {
  let out = '';
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (code >= 0x0660 && code <= 0x0669) out += String.fromCharCode(code - 0x0660 + 48);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String.fromCharCode(code - 0x06f0 + 48);
    else if (char === '٫') out += '.';
    else if (char === ',' || char === '٬' || char === ' ' || char === ' ') continue;
    else out += char;
  }
  return out.trim();
}

// ── Arithmetic ───────────────────────────────────────────────────────────────

export function addQty(...values: Qty[]): Qty {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

export function subQty(a: Qty, b: Qty): Qty {
  return a - b;
}

export function isPositiveQty(value: Qty): boolean {
  return value > 0;
}

export function maxQty(a: Qty, b: Qty): Qty {
  return a > b ? a : b;
}

export function minQty(a: Qty, b: Qty): Qty {
  return a < b ? a : b;
}

/**
 * Line total for a quantity sold at `unitPrice` per sale unit.
 * `round(unitPrice × qty / factor)` computed in BigInt.
 */
export function lineAmount(unitPrice: number, qty: Qty, factor: Factor): number {
  if (factor === 0) return 0;
  return roundedRatio(BigInt(unitPrice) * BigInt(qty), BigInt(factor));
}

/**
 * Cost of goods for `qty` base units at `unitCost` (minor units per base unit,
 * scaled ×1e6): `round(qty × unitCost / (QTY_SCALE × COST_SCALE))`.
 */
export function costAmount(qty: Qty, unitCost: UnitCost): number {
  return roundedRatio(BigInt(qty) * BigInt(unitCost), BigInt(QTY_SCALE) * BigInt(COST_SCALE));
}

/**
 * Per-base-unit cost (×1e6) from a price per SALE unit — "a 250g pack costs
 * 30.00" → 0.12 per gram: `round(price × QTY_SCALE × COST_SCALE / factor)`.
 */
export function unitCostFromSaleUnitPrice(price: number, factor: Factor): UnitCost {
  if (factor <= 0) return 0;
  return roundedRatio(BigInt(price) * BigInt(QTY_SCALE) * BigInt(COST_SCALE), BigInt(factor));
}

/**
 * Derive a per-base-unit cost from a total money amount and a quantity.
 * Used when receiving a purchase: landed cost ÷ received quantity.
 */
export function unitCostFromTotal(totalAmount: number, qty: Qty): UnitCost {
  if (qty === 0) return 0;
  return roundedRatio(
    BigInt(totalAmount) * BigInt(QTY_SCALE) * BigInt(COST_SCALE),
    BigInt(qty),
  );
}

/**
 * Weighted-average cost after receiving `inQty` at `inCost`.
 * newAvg = (onHand × oldAvg + inQty × inCost) / (onHand + inQty)
 *
 * When the resulting quantity is zero or negative we keep the incoming cost, so
 * a variant that went negative and was replenished still has a sane cost basis.
 */
export function weightedAverageCost(
  onHandQty: Qty,
  currentCost: UnitCost,
  inQty: Qty,
  inCost: UnitCost,
): UnitCost {
  const totalQty = onHandQty + inQty;
  if (totalQty <= 0) return inCost;
  if (onHandQty <= 0) return inCost;
  const numerator = BigInt(onHandQty) * BigInt(currentCost) + BigInt(inQty) * BigInt(inCost);
  return roundedRatio(numerator, BigInt(totalQty));
}

function roundedRatio(numerator: bigint, denominator: bigint): number {
  if (denominator === 0n) return 0;
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const bumped = remainder * 2n >= d ? quotient + 1n : quotient;
  const signed = negative ? -bumped : bumped;
  const result = Number(signed);
  if (!Number.isSafeInteger(result)) {
    throw new RangeError(`Quantity/cost overflow: ${signed}`);
  }
  return result;
}

// ── Units & formatting ───────────────────────────────────────────────────────

export const BASE_UNIT_LABEL: Record<UnitKind, string> = {
  COUNT: 'قطعة',
  WEIGHT: 'جرام',
  VOLUME: 'مل',
};

export interface UnitDescriptor {
  unitKind: UnitKind;
  unitLabel: string;
  factor: Factor;
  allowsFractional: boolean;
}

/** Preset sale units offered in the product form, per measurement family. */
export const UNIT_PRESETS: Record<UnitKind, Array<{ label: string; factor: number }>> = {
  COUNT: [
    { label: 'قطعة', factor: 1 },
    { label: 'علبة', factor: 12 },
    { label: 'كرتون', factor: 24 },
    { label: 'دزينة', factor: 12 },
  ],
  WEIGHT: [
    { label: 'جرام', factor: 1 },
    { label: '50 جرام', factor: 50 },
    { label: '250 جرام', factor: 250 },
    { label: 'نصف كيلو', factor: 500 },
    { label: 'كيلو', factor: 1000 },
  ],
  VOLUME: [
    { label: 'مل', factor: 1 },
    { label: '30 مل', factor: 30 },
    { label: '60 مل', factor: 60 },
    { label: '100 مل', factor: 100 },
    { label: 'لتر', factor: 1000 },
  ],
};

const qtyFormatterCache = new Map<string, Intl.NumberFormat>();

function qtyFormatter(locale: string, decimals: number): Intl.NumberFormat {
  const key = `${locale}|${decimals}`;
  let formatter = qtyFormatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(`${locale}-u-nu-latn`, {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    });
    qtyFormatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Render a quantity the way a shopkeeper reads it: `9.75 كيلو`, `3 قطعة`.
 * Counting units never show decimals; weights and volumes show up to three.
 */
export function formatQuantity(
  qty: Qty,
  unit: Pick<UnitDescriptor, 'unitKind' | 'unitLabel' | 'factor'>,
  options: { locale?: string; withUnit?: boolean } = {},
): string {
  const { locale = 'ar', withUnit = true } = options;
  const saleUnits = qtyToSaleUnits(qty, unit.factor);
  const decimals = unit.unitKind === 'COUNT' && unit.factor === QTY_SCALE ? 0 : 3;
  const text = qtyFormatter(locale, decimals).format(saleUnits);
  return withUnit ? `${text} ${unit.unitLabel}` : text;
}

/** Render a raw base-unit quantity: `9750 جرام`. */
export function formatBaseQuantity(qty: Qty, unitKind: UnitKind, locale = 'ar'): string {
  const text = qtyFormatter(locale, 3).format(qty / QTY_SCALE);
  return `${text} ${BASE_UNIT_LABEL[unitKind]}`;
}

/** Plain number string suitable for an `<input>` value. */
export function qtyToInputValue(qty: Qty, factor: Factor): string {
  const saleUnits = qtyToSaleUnits(qty, factor);
  if (Number.isInteger(saleUnits)) return String(saleUnits);
  return saleUnits.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
