import 'server-only';

import type { DbClient } from '@/core/db';
import { db } from '@/core/db';
import { logger } from '@/core/logger';
import { readFingerprint } from '@/core/auth/session';

/**
 * Audit trail.
 *
 * Every sensitive action writes one row here with a human-readable Arabic
 * sentence plus the before/after payload. Written inside the caller's
 * transaction so the log can never claim something that was rolled back.
 */

export interface AuditInput {
  storeId: string | null;
  userId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  isSupport?: boolean;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Keys that must never be persisted into an audit payload. */
const SENSITIVE = new Set(['passwordHash', 'password', 'tokenHash', 'token']);

function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE.has(key)) continue;
      out[key] = sanitize(item);
    }
    return out;
  }
  return value;
}

/**
 * Write an audit entry. `client` should be the surrounding transaction so the
 * entry commits atomically with the change it describes.
 */
export async function recordAudit(client: DbClient, input: AuditInput): Promise<void> {
  const before = input.before === undefined ? undefined : sanitize(input.before);
  const after = input.after === undefined ? undefined : sanitize(input.after);

  await client.auditLog.create({
    data: {
      storeId: input.storeId,
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      before: before === undefined ? undefined : (before as never),
      after: after === undefined ? undefined : (after as never),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
      isSupport: input.isSupport ?? false,
    },
  });
}

/**
 * Fire-and-forget variant used outside a transaction (login attempts, exports).
 * It captures the request fingerprint itself and never throws into the caller.
 */
export async function auditOutsideTransaction(
  input: Omit<AuditInput, 'ipAddress' | 'userAgent'>,
): Promise<void> {
  try {
    const fingerprint = await readFingerprint();
    await recordAudit(db, { ...input, ...fingerprint });
  } catch (error) {
    logger.error('failed to write audit entry', { action: input.action, error }, 'audit');
  }
}

/** Compare two records and describe only what actually changed. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: Array<keyof T>,
): { before: Partial<T>; after: Partial<T>; changed: Array<keyof T> } {
  const beforeDiff: Partial<T> = {};
  const afterDiff: Partial<T> = {};
  const changed: Array<keyof T> = [];

  for (const field of fields) {
    if (!(field in after)) continue;
    const previous = before[field];
    const next = after[field];
    if (String(previous ?? '') === String(next ?? '')) continue;
    beforeDiff[field] = previous;
    afterDiff[field] = next as T[keyof T];
    changed.push(field);
  }

  return { before: beforeDiff, after: afterDiff, changed };
}
