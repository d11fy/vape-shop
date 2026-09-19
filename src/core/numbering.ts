import 'server-only';

import { randomUUID } from 'node:crypto';

import type { DbClient } from '@/core/db';
import { toWallClock } from '@/core/datetime';

/**
 * Human-facing document numbers: `VS-2026-000001`.
 *
 * The sequence lives in the `counters` table and is bumped with a single
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`, which PostgreSQL executes
 * atomically. Two cashiers ringing up a sale at the same instant therefore get
 * two different invoice numbers without any application-level locking.
 */

export type DocumentKind =
  | 'SALE'
  | 'RETURN'
  | 'PURCHASE'
  | 'ADJUSTMENT'
  | 'TRANSFER'
  | 'SHIFT'
  | 'PAYMENT';

const KIND_SEGMENT: Record<DocumentKind, string> = {
  SALE: '',
  RETURN: 'RT',
  PURCHASE: 'PO',
  ADJUSTMENT: 'ADJ',
  TRANSFER: 'TRF',
  SHIFT: 'SH',
  PAYMENT: 'RC',
};

export interface NumberingOptions {
  prefix: string;
  padding: number;
  timezone: string;
  /** Override the clock — used by tests and by back-dated imports. */
  now?: Date;
}

/**
 * Reserve the next number for `kind`. Must run inside the same transaction as
 * the document it names, so an aborted sale does not burn an invoice number.
 */
export async function nextDocumentNumber(
  client: DbClient,
  storeId: string,
  kind: DocumentKind,
  options: NumberingOptions,
): Promise<string> {
  const year = toWallClock(options.now ?? new Date(), options.timezone).year;
  const key = `${kind}:${year}`;

  const rows = await client.$queryRaw<Array<{ value: number }>>`
    INSERT INTO counters (id, "storeId", key, value, "updatedAt")
    VALUES (${randomUUID()}, ${storeId}, ${key}, 1, NOW())
    ON CONFLICT ("storeId", key)
    DO UPDATE SET value = counters.value + 1, "updatedAt" = NOW()
    RETURNING value
  `;

  const sequence = rows[0]?.value ?? 1;
  return formatDocumentNumber(kind, year, sequence, options);
}

export function formatDocumentNumber(
  kind: DocumentKind,
  year: number,
  sequence: number,
  options: Pick<NumberingOptions, 'prefix' | 'padding'>,
): string {
  const segment = KIND_SEGMENT[kind];
  const padded = String(sequence).padStart(Math.max(1, options.padding), '0');
  return [options.prefix, segment, year, padded].filter(Boolean).join('-');
}

/** Read the current value without consuming it — for settings previews. */
export async function peekNextNumber(
  client: DbClient,
  storeId: string,
  kind: DocumentKind,
  options: NumberingOptions,
): Promise<string> {
  const year = toWallClock(options.now ?? new Date(), options.timezone).year;
  const counter = await client.counter.findUnique({
    where: { storeId_key: { storeId, key: `${kind}:${year}` } },
    select: { value: true },
  });
  return formatDocumentNumber(kind, year, (counter?.value ?? 0) + 1, options);
}
