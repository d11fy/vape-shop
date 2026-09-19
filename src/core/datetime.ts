/**
 * Timezone-aware date handling.
 *
 * Reports are only trustworthy if "today" means the shop's today. Everything is
 * stored in UTC; this module converts between UTC instants and wall-clock time
 * in the store's configured timezone using the platform's own IANA database —
 * no dependency, and correct across DST changes.
 */

export type PeriodPreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'last_7_days'
  | 'last_30_days'
  | 'custom';

export interface DateRange {
  /** Inclusive start instant. */
  from: Date;
  /** Exclusive end instant. */
  to: Date;
}

export interface LabelledRange extends DateRange {
  preset: PeriodPreset;
  label: string;
}

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: 'اليوم',
  yesterday: 'أمس',
  this_week: 'هذا الأسبوع',
  last_week: 'الأسبوع الماضي',
  this_month: 'هذا الشهر',
  last_month: 'الشهر الماضي',
  this_year: 'هذا العام',
  last_7_days: 'آخر 7 أيام',
  last_30_days: 'آخر 30 يوم',
  custom: 'فترة مخصصة',
};

/** Arabic business weeks start on Saturday. */
const WEEK_START_DAY = 6; // 0 = Sunday … 6 = Saturday

const partsCache = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    partsCache.set(timeZone, formatter);
  }
  return formatter;
}

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0 = Sunday
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Wall-clock reading of a UTC instant inside `timeZone`. */
export function toWallClock(instant: Date, timeZone: string): WallClock {
  const parts = zoneFormatter(timeZone).formatToParts(instant);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour === '24' ? '0' : lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
    weekday: WEEKDAY_INDEX[lookup.weekday ?? 'Sun'] ?? 0,
  };
}

function offsetMs(timeZone: string, instant: Date): number {
  const wall = toWallClock(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - instant.getTime();
}

/**
 * Build the UTC instant for a wall-clock time in `timeZone`.
 * Two passes settle the DST edge cases where the offset differs on either side
 * of the guessed instant.
 */
export function fromWallClock(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffset = offsetMs(timeZone, new Date(guess));
  const corrected = guess - firstOffset;
  const secondOffset = offsetMs(timeZone, new Date(corrected));
  return new Date(guess - secondOffset);
}

export function startOfDayIn(timeZone: string, instant: Date = new Date()): Date {
  const wall = toWallClock(instant, timeZone);
  return fromWallClock(timeZone, wall.year, wall.month, wall.day);
}

export function addDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * 86_400_000);
}

/** Start of the day `days` after the local day containing `instant`. */
export function startOfDayOffset(timeZone: string, days: number, instant: Date = new Date()): Date {
  const wall = toWallClock(instant, timeZone);
  return fromWallClock(timeZone, wall.year, wall.month, wall.day + days);
}

export function resolvePeriod(
  preset: PeriodPreset,
  timeZone: string,
  custom?: { from?: string | Date | null; to?: string | Date | null },
  now: Date = new Date(),
): LabelledRange {
  const wall = toWallClock(now, timeZone);
  const startToday = fromWallClock(timeZone, wall.year, wall.month, wall.day);

  const make = (from: Date, to: Date): LabelledRange => ({
    from,
    to,
    preset,
    label: PERIOD_LABELS[preset],
  });

  switch (preset) {
    case 'today':
      return make(startToday, startOfDayOffset(timeZone, 1, now));
    case 'yesterday':
      return make(startOfDayOffset(timeZone, -1, now), startToday);
    case 'this_week': {
      const back = (wall.weekday - WEEK_START_DAY + 7) % 7;
      return make(startOfDayOffset(timeZone, -back, now), startOfDayOffset(timeZone, 1, now));
    }
    case 'last_week': {
      const back = (wall.weekday - WEEK_START_DAY + 7) % 7;
      return make(
        startOfDayOffset(timeZone, -back - 7, now),
        startOfDayOffset(timeZone, -back, now),
      );
    }
    case 'this_month':
      return make(
        fromWallClock(timeZone, wall.year, wall.month, 1),
        fromWallClock(timeZone, wall.year, wall.month + 1, 1),
      );
    case 'last_month':
      return make(
        fromWallClock(timeZone, wall.year, wall.month - 1, 1),
        fromWallClock(timeZone, wall.year, wall.month, 1),
      );
    case 'this_year':
      return make(
        fromWallClock(timeZone, wall.year, 1, 1),
        fromWallClock(timeZone, wall.year + 1, 1, 1),
      );
    case 'last_7_days':
      return make(startOfDayOffset(timeZone, -6, now), startOfDayOffset(timeZone, 1, now));
    case 'last_30_days':
      return make(startOfDayOffset(timeZone, -29, now), startOfDayOffset(timeZone, 1, now));
    case 'custom': {
      const from = parseLocalDate(custom?.from, timeZone) ?? startToday;
      const toStart = parseLocalDate(custom?.to, timeZone) ?? startToday;
      const toWall = toWallClock(toStart, timeZone);
      const to = fromWallClock(timeZone, toWall.year, toWall.month, toWall.day + 1);
      return { from, to, preset, label: PERIOD_LABELS.custom };
    }
    default:
      return make(startToday, startOfDayOffset(timeZone, 1, now));
  }
}

/**
 * Read the selected period out of a page's `searchParams`.
 *
 * Lives here rather than beside the `<PeriodFilter>` component because server
 * components call it — and a `'use client'` module cannot be invoked from the
 * server.
 */
export function readPeriod(
  params: Record<string, string | string[] | undefined>,
  fallback: PeriodPreset = 'today',
): { preset: PeriodPreset; from?: string; to?: string } {
  const first = (key: string): string | undefined => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const raw = first('period');
  const preset = (raw && raw in PERIOD_LABELS ? raw : fallback) as PeriodPreset;
  return { preset, from: first('from'), to: first('to') };
}

/** Parse a `YYYY-MM-DD` string as midnight in the store's timezone. */
export function parseLocalDate(
  value: string | Date | null | undefined,
  timeZone: string,
): Date | null {
  if (!value) return null;
  if (value instanceof Date) return startOfDayIn(timeZone, value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : startOfDayIn(timeZone, parsed);
  }
  return fromWallClock(timeZone, Number(match[1]), Number(match[2]), Number(match[3]));
}

/** The previous period of equal length — used for "compared to" deltas. */
export function previousRange(range: DateRange): DateRange {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span), to: new Date(range.from.getTime()) };
}

/** Local `YYYY-MM-DD` key for grouping rows into daily buckets. */
export function dayKey(instant: Date, timeZone: string): string {
  const wall = toWallClock(instant, timeZone);
  return `${wall.year}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`;
}

/** Every day key in `[from, to)` in order — so charts show empty days too. */
export function enumerateDays(range: DateRange, timeZone: string): string[] {
  const keys: string[] = [];
  let cursor = startOfDayIn(timeZone, range.from);
  let guard = 0;
  while (cursor < range.to && guard < 400) {
    keys.push(dayKey(cursor, timeZone));
    cursor = startOfDayOffset(timeZone, 1, cursor);
    guard += 1;
  }
  return keys;
}

// ── Formatting ───────────────────────────────────────────────────────────────

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(key: string, build: () => Intl.DateTimeFormat): Intl.DateTimeFormat {
  let formatter = dateFormatterCache.get(key);
  if (!formatter) {
    formatter = build();
    dateFormatterCache.set(key, formatter);
  }
  return formatter;
}

export function formatDate(instant: Date, timeZone: string, locale = 'ar'): string {
  return cachedFormatter(`d|${timeZone}|${locale}`, () =>
    new Intl.DateTimeFormat(`${locale}-u-nu-latn-ca-gregory`, {
      timeZone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
  ).format(instant);
}

export function formatDateNumeric(instant: Date, timeZone: string, locale = 'ar'): string {
  return cachedFormatter(`dn|${timeZone}|${locale}`, () =>
    new Intl.DateTimeFormat(`${locale}-u-nu-latn-ca-gregory`, {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
  ).format(instant);
}

export function formatTime(instant: Date, timeZone: string, locale = 'ar'): string {
  return cachedFormatter(`t|${timeZone}|${locale}`, () =>
    new Intl.DateTimeFormat(`${locale}-u-nu-latn`, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }),
  ).format(instant);
}

export function formatDateTime(instant: Date, timeZone: string, locale = 'ar'): string {
  return `${formatDate(instant, timeZone, locale)} · ${formatTime(instant, timeZone, locale)}`;
}

export function formatMonth(instant: Date, timeZone: string, locale = 'ar'): string {
  return cachedFormatter(`m|${timeZone}|${locale}`, () =>
    new Intl.DateTimeFormat(`${locale}-u-nu-latn-ca-gregory`, {
      timeZone,
      year: 'numeric',
      month: 'long',
    }),
  ).format(instant);
}

const relativeFormatterCache = new Map<string, Intl.RelativeTimeFormat>();

/** `منذ 3 أيام`, `قبل ساعتين` … */
export function formatRelative(instant: Date, locale = 'ar', now: Date = new Date()): string {
  const diffMs = instant.getTime() - now.getTime();
  let formatter = relativeFormatterCache.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(`${locale}-u-nu-latn`, { numeric: 'auto' });
    relativeFormatterCache.set(locale, formatter);
  }

  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      return formatter.format(Math.round(diffMs / ms), unit);
    }
  }
  return formatter.format(Math.round(diffMs / 1000), 'second');
}

/** Whole days between two instants, positive when `later` is after `earlier`. */
export function daysBetween(earlier: Date, later: Date): number {
  return Math.round((later.getTime() - earlier.getTime()) / 86_400_000);
}

/** Age of a receivable, in days — drives the debt-ageing columns. */
export function ageInDays(instant: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - instant.getTime()) / 86_400_000));
}

export const COMMON_TIMEZONES = [
  { value: 'Asia/Riyadh', label: 'الرياض (GMT+3)' },
  { value: 'Asia/Dubai', label: 'دبي (GMT+4)' },
  { value: 'Asia/Kuwait', label: 'الكويت (GMT+3)' },
  { value: 'Asia/Qatar', label: 'الدوحة (GMT+3)' },
  { value: 'Asia/Bahrain', label: 'المنامة (GMT+3)' },
  { value: 'Asia/Muscat', label: 'مسقط (GMT+4)' },
  { value: 'Asia/Amman', label: 'عمّان (GMT+3)' },
  { value: 'Asia/Beirut', label: 'بيروت (GMT+3)' },
  { value: 'Asia/Baghdad', label: 'بغداد (GMT+3)' },
  { value: 'Asia/Hebron', label: 'فلسطين (GMT+3)' },
  { value: 'Africa/Cairo', label: 'القاهرة (GMT+3)' },
  { value: 'Africa/Khartoum', label: 'الخرطوم (GMT+2)' },
  { value: 'Africa/Tripoli', label: 'طرابلس (GMT+2)' },
  { value: 'Africa/Tunis', label: 'تونس (GMT+1)' },
  { value: 'Africa/Algiers', label: 'الجزائر (GMT+1)' },
  { value: 'Africa/Casablanca', label: 'الدار البيضاء (GMT+1)' },
] as const;
