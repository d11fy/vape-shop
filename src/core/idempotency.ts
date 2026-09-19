import 'server-only';

import { createHash } from 'node:crypto';

import type { Tx } from '@/core/db';
import { logger } from '@/core/logger';

/**
 * Idempotency for money-moving writes.
 *
 * A cashier on a weak connection taps "إتمام" twice, or the PWA replays a
 * queued request after reconnecting. Both carry the same client-generated key,
 * and only the first one may create an invoice.
 *
 * The claim row is inserted INSIDE the caller's transaction. If two requests
 * race, the second blocks on the unique index until the first commits, then
 * sees the existing row and returns the original result instead of duplicating
 * the sale.
 */

export type IdempotencyScope =
  | 'sale.create'
  | 'sale.cancel'
  | 'return.create'
  | 'payment.create'
  | 'expense.create'
  | 'purchase.receive'
  | 'adjustment.apply'
  | 'shift.close';

export type ClaimResult =
  | { status: 'claimed' }
  | { status: 'duplicate'; resultId: string | null };

export function hashRequest(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('base64url').slice(0, 43);
}

/** Deterministic JSON — key order must not change the hash. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? `${value}n` : JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

/**
 * Try to take ownership of `key`. Returns `duplicate` when this exact request
 * has already been processed.
 */
export async function claimIdempotencyKey(
  tx: Tx,
  input: { storeId: string; scope: IdempotencyScope; key: string; requestHash: string },
): Promise<ClaimResult> {
  const existing = await tx.idempotencyKey.findUnique({
    where: {
      storeId_scope_key: { storeId: input.storeId, scope: input.scope, key: input.key },
    },
    select: { resultId: true, requestHash: true },
  });

  if (existing) {
    if (existing.requestHash !== input.requestHash) {
      logger.security('idempotency key reused with a different payload', {
        storeId: input.storeId,
        scope: input.scope,
      });
    }
    return { status: 'duplicate', resultId: existing.resultId };
  }

  await tx.idempotencyKey.create({
    data: {
      storeId: input.storeId,
      scope: input.scope,
      key: input.key,
      requestHash: input.requestHash,
    },
  });

  return { status: 'claimed' };
}

/** Attach the created record's id so a replay can return the same result. */
export async function completeIdempotencyKey(
  tx: Tx,
  input: { storeId: string; scope: IdempotencyScope; key: string; resultId: string },
): Promise<void> {
  await tx.idempotencyKey.update({
    where: {
      storeId_scope_key: { storeId: input.storeId, scope: input.scope, key: input.key },
    },
    data: { resultId: input.resultId },
  });
}

/** Client-side keys older than this are certainly not being retried any more. */
export const IDEMPOTENCY_RETENTION_DAYS = 14;
