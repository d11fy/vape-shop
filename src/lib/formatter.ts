import { formatAmount, formatMoney, type Money } from '@/core/money';
import { formatQuantity, qtyToSaleUnits, type Factor, type Qty } from '@/core/quantity';
import {
  formatDate,
  formatDateNumeric,
  formatDateTime,
  formatRelative,
  formatTime,
} from '@/core/datetime';
import type { UnitKind } from '@/generated/prisma/enums';

/**
 * Store-aware formatting, isomorphic on purpose.
 *
 * Server components call `buildFormatter()` directly; client components reach
 * the same object through the `FormatProvider` context. Because both sides run
 * identical code with identical settings, a number rendered on the server and
 * re-rendered in the browser always matches and hydration stays silent.
 *
 * This file must never be `'use client'` — a server component cannot call into
 * a client module.
 */

export interface FormatSettings {
  currency: string;
  decimals: number;
  timezone: string;
  locale: string;
}

/** Straight from a store's settings row (`currencyDecimals` → `decimals`). */
export function storeFormatter(settings: {
  currency: string;
  currencyDecimals: number;
  timezone: string;
  locale: string;
}): Formatter {
  return buildFormatter({
    currency: settings.currency,
    decimals: settings.currencyDecimals,
    timezone: settings.timezone,
    locale: settings.locale,
  });
}

export interface Formatter extends FormatSettings {
  /** "48.00 ر.س" */
  money: (value: Money, options?: { signed?: boolean; compact?: boolean }) => string;
  /** "48.00" — no currency mark, for a column with a labelled header. */
  amount: (value: Money) => string;
  /** Condensed for dense tiles and chart axes: "48" / "12.5K". */
  short: (value: Money) => string;
  quantity: (
    value: Qty,
    unit: { unitKind: UnitKind; unitLabel: string; factor: Factor },
    options?: { withUnit?: boolean },
  ) => string;
  saleUnits: (value: Qty, factor: Factor) => number;
  date: (value: Date | string) => string;
  dateNumeric: (value: Date | string) => string;
  time: (value: Date | string) => string;
  dateTime: (value: Date | string) => string;
  relative: (value: Date | string) => string;
  number: (value: number, maximumFractionDigits?: number) => string;
  percent: (value: number, maximumFractionDigits?: number) => string;
}

export const DEFAULT_FORMAT: FormatSettings = {
  currency: 'SAR',
  decimals: 2,
  timezone: 'Asia/Riyadh',
  locale: 'ar',
};

const RTL_LOCALES = /^(ar|fa|he|ur)(-|$)/i;

export function buildFormatter(settings: FormatSettings): Formatter {
  const { currency, decimals, timezone, locale } = settings;
  const asDate = (value: Date | string) => (value instanceof Date ? value : new Date(value));

  // Dates, times and quantities mix digits with Arabic words ("18 سبتمبر 2026",
  // "03:45 م", "2.5 كيلو"). Wrapped in a right-to-left isolate (RLI … PDI)
  // they read correctly wherever they land — including inside a `.num` cell,
  // which is left-to-right and would otherwise scramble the word order.
  const isolate = RTL_LOCALES.test(locale)
    ? (text: string) => `⁧${text}⁩`
    : (text: string) => text;

  const wholeNumbers = new Intl.NumberFormat(`${locale}-u-nu-latn`, {
    maximumFractionDigits: 0,
  });

  return {
    ...settings,
    money: (value, options) =>
      formatMoney(value, {
        currency,
        decimals,
        locale,
        signed: options?.signed,
        compact: options?.compact,
      }),
    amount: (value) => formatAmount(value, decimals, locale),
    short: (value) =>
      formatMoney(value, { currency, decimals, locale, bare: true, compact: true }),
    quantity: (value, unit, options) =>
      isolate(formatQuantity(value, unit, { locale, ...options })),
    saleUnits: (value, factor) => qtyToSaleUnits(value, factor),
    date: (value) => isolate(formatDate(asDate(value), timezone, locale)),
    dateNumeric: (value) => formatDateNumeric(asDate(value), timezone, locale),
    time: (value) => isolate(formatTime(asDate(value), timezone, locale)),
    dateTime: (value) => isolate(formatDateTime(asDate(value), timezone, locale)),
    relative: (value) => isolate(formatRelative(asDate(value), locale)),
    number: (value, maximumFractionDigits = 0) =>
      maximumFractionDigits === 0
        ? wholeNumbers.format(value)
        : new Intl.NumberFormat(`${locale}-u-nu-latn`, { maximumFractionDigits }).format(value),
    percent: (value, maximumFractionDigits = 1) =>
      `${new Intl.NumberFormat(`${locale}-u-nu-latn`, { maximumFractionDigits }).format(value)}%`,
  };
}
