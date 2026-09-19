/**
 * Money arithmetic.
 *
 * Every monetary amount in this system is an INTEGER number of minor currency
 * units (halalas, cents, agorot …). Floating point never touches money: all
 * multiplication and division goes through `mulDiv`, which does the work in
 * BigInt and rounds once, deterministically.
 *
 * The database stores money as `BigInt`. At the application boundary we widen
 * to `number`, which is exact for integers up to 2^53 − 1 ≈ 9.007e15 minor
 * units — about 90 trillion currency units. `fromDb` enforces that bound so an
 * overflow can never pass silently.
 */

/** An integer amount of minor currency units. */
export type Money = number;

export const ZERO: Money = 0;

/** Largest amount we accept from the database or from user input. */
const MAX_SAFE_MONEY = Number.MAX_SAFE_INTEGER;

export class MoneyRangeError extends Error {
  constructor(value: bigint | number) {
    super(`Monetary value out of safe range: ${value}`);
    this.name = 'MoneyRangeError';
  }
}

// ── Database boundary ────────────────────────────────────────────────────────

/** Convert a `BigInt` column into a `Money`, guarding the safe-integer range. */
export function fromDb(value: bigint | null | undefined): Money {
  if (value === null || value === undefined) return 0;
  if (value > BigInt(MAX_SAFE_MONEY) || value < BigInt(-MAX_SAFE_MONEY)) {
    throw new MoneyRangeError(value);
  }
  return Number(value);
}

/** Convert a `Money` back into a `BigInt` for persistence. */
export function toDb(value: Money): bigint {
  assertMoney(value);
  return BigInt(value);
}

export function assertMoney(value: number): asserts value is Money {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyRangeError(value);
  }
}

// ── Construction ─────────────────────────────────────────────────────────────

/**
 * Build a `Money` from a major-unit value (12.75 → 1275 when decimals = 2).
 * Uses string manipulation rather than `* 100` so 12.345 never becomes 1234.
 */
export function fromMajor(value: number | string, decimals = 2): Money {
  const text = typeof value === 'number' ? formatNumberExact(value) : value.trim();
  const parsed = parseDecimalString(text, decimals);
  if (parsed === null) return 0;
  assertMoney(parsed);
  return parsed;
}

/** Inverse of {@link fromMajor} — for display and export only, never for math. */
export function toMajor(value: Money, decimals = 2): number {
  return value / 10 ** decimals;
}

/**
 * Parse free-form user input ("١٢٫٥٠", "1,250.75", "12.5") into minor units.
 * Returns `null` when the text is not a number.
 */
export function parseMoneyInput(input: string, decimals = 2): Money | null {
  const normalized = normalizeDigits(input).replace(/[\s,٬ ]/g, '');
  if (normalized === '' || normalized === '-') return null;
  if (!/^-?\d*(?:\.\d*)?$/.test(normalized)) return null;
  const parsed = parseDecimalString(normalized, decimals);
  if (parsed === null || !Number.isSafeInteger(parsed)) return null;
  return parsed;
}

/**
 * Convert Arabic-Indic and Extended Arabic-Indic digits to ASCII, and Arabic
 * decimal separators to `.` — customers type on many different keyboards.
 */
export function normalizeDigits(input: string): string {
  let out = '';
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (code >= 0x0660 && code <= 0x0669) out += String.fromCharCode(code - 0x0660 + 48);
    else if (code >= 0x06f0 && code <= 0x06f9) out += String.fromCharCode(code - 0x06f0 + 48);
    else if (char === '٫') out += '.';
    else out += char;
  }
  return out;
}

function formatNumberExact(value: number): string {
  if (!Number.isFinite(value)) return '0';
  // Avoid exponent notation for very small/large magnitudes.
  return Math.abs(value) < 1e21 ? value.toFixed(12).replace(/0+$/, '').replace(/\.$/, '') : '0';
}

/** "12.345" with decimals=2 → 1235 (half-up on the dropped digit). */
function parseDecimalString(text: string, decimals: number): number | null {
  const match = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text);
  if (!match) return null;
  const [, sign = '', whole = '', frac = ''] = match;
  if (whole === '' && frac === '') return null;

  const padded = frac.padEnd(decimals + 1, '0');
  const kept = padded.slice(0, decimals);
  const nextDigit = Number(padded[decimals] ?? '0');

  const magnitude = Number(`${whole || '0'}${kept}`) + (nextDigit >= 5 ? 1 : 0);
  if (!Number.isFinite(magnitude)) return null;
  return sign === '-' ? -magnitude : magnitude;
}

// ── Arithmetic ───────────────────────────────────────────────────────────────

export function add(...values: Money[]): Money {
  let total = 0;
  for (const value of values) total += value;
  assertMoney(total);
  return total;
}

export function sub(a: Money, b: Money): Money {
  const result = a - b;
  assertMoney(result);
  return result;
}

export function negate(value: Money): Money {
  return -value;
}

export function abs(value: Money): Money {
  return Math.abs(value);
}

export function max(a: Money, b: Money): Money {
  return a > b ? a : b;
}

export function min(a: Money, b: Money): Money {
  return a < b ? a : b;
}

export function isZero(value: Money): boolean {
  return value === 0;
}

export function clampNonNegative(value: Money): Money {
  return value < 0 ? 0 : value;
}

/**
 * Exact `round(a * b / divisor)` with half-away-from-zero rounding, computed in
 * BigInt so intermediate products never lose precision.
 */
export function mulDiv(a: number, b: number, divisor: number): number {
  if (divisor === 0) throw new Error('mulDiv: division by zero');
  const product = BigInt(Math.trunc(a)) * BigInt(Math.trunc(b));
  const div = BigInt(Math.trunc(divisor));
  const rounded = divRoundHalfUp(product, div);
  const result = Number(rounded);
  assertMoney(result);
  return result;
}

/** BigInt division rounding halves away from zero (commercial rounding). */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error('division by zero');
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d;
  const remainder = n % d;
  const bumped = remainder * 2n >= d ? quotient + 1n : quotient;
  return negative ? -bumped : bumped;
}

/** Multiply money by a rational factor expressed as `numerator / denominator`. */
export function scale(value: Money, numerator: number, denominator: number): Money {
  return mulDiv(value, numerator, denominator);
}

/** Percentage expressed in basis points: 1500 bps = 15%. */
export function percentOfBps(value: Money, bps: number): Money {
  return mulDiv(value, bps, 10_000);
}

/**
 * Extract the tax portion from a tax-INCLUSIVE amount.
 * gross = net × (1 + r)  ⇒  tax = gross × r / (1 + r)
 */
export function taxFromInclusive(gross: Money, bps: number): Money {
  return mulDiv(gross, bps, 10_000 + bps);
}

/**
 * Split `value` into `count` parts as evenly as possible, giving the leftover
 * minor units to the earliest parts. The parts always sum back to `value`.
 */
export function splitEvenly(value: Money, count: number): Money[] {
  if (count <= 0) return [];
  const base = Math.trunc(value / count);
  let remainder = value - base * count;
  const step = remainder >= 0 ? 1 : -1;
  return Array.from({ length: count }, () => {
    if (remainder !== 0) {
      remainder -= step;
      return base + step;
    }
    return base;
  });
}

/**
 * Distribute `value` across parts in proportion to `weights`, with the rounding
 * remainder handed to the largest weights first. Used for spreading an invoice
 * discount or a purchase's shipping cost over its lines without losing a single
 * minor unit.
 */
export function allocateByWeight(value: Money, weights: number[]): Money[] {
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (weights.length === 0) return [];
  if (totalWeight === 0) return splitEvenly(value, weights.length);

  const shares = weights.map((w) => Math.trunc((value * w) / totalWeight));
  let remainder = value - shares.reduce((sum, s) => sum + s, 0);

  const order = weights
    .map((weight, index) => ({ weight, index }))
    .sort((a, b) => b.weight - a.weight);

  const step = remainder >= 0 ? 1 : -1;
  let cursor = 0;
  while (remainder !== 0 && order.length > 0) {
    const target = order[cursor % order.length]!;
    shares[target.index] = shares[target.index]! + step;
    remainder -= step;
    cursor += 1;
  }
  return shares;
}

// ── Formatting ───────────────────────────────────────────────────────────────

export interface MoneyFormatOptions {
  currency: string;
  decimals?: number;
  locale?: string;
  /** Omit the currency symbol — used inside tables where the column is labelled. */
  bare?: boolean;
  /** Always show a leading + or −. */
  signed?: boolean;
  /** Render 12,500 as "12.5 ألف" for compact dashboard tiles. */
  compact?: boolean;
}

const formatterCache = new Map<string, Intl.NumberFormat>();

function getFormatter(key: string, build: () => Intl.NumberFormat): Intl.NumberFormat {
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = build();
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Format money for display. Arabic business software overwhelmingly uses
 * Western digits, so the numbering system is pinned to `latn` while the rest of
 * the locale (separators, currency placement) stays Arabic.
 */
export function formatMoney(value: Money, options: MoneyFormatOptions): string {
  const { currency, decimals = 2, locale = 'ar', bare = false, signed = false, compact = false } = options;
  const major = toMajor(value, decimals);
  const cacheKey = `${locale}|${currency}|${decimals}|${bare}|${compact}`;

  const formatter = getFormatter(cacheKey, () =>
    new Intl.NumberFormat(`${locale}-u-nu-latn`, {
      style: bare ? 'decimal' : 'currency',
      currency: bare ? undefined : currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: compact ? 0 : decimals,
      maximumFractionDigits: compact ? 1 : decimals,
      notation: compact ? 'compact' : 'standard',
    }),
  );

  const text = formatter.format(major);
  if (signed && value > 0) return `+${text}`;
  return text;
}

/** Plain grouped number without any currency decoration. */
export function formatAmount(value: Money, decimals = 2, locale = 'ar'): string {
  return formatMoney(value, { currency: 'XXX', decimals, locale, bare: true });
}
