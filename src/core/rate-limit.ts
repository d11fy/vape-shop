import 'server-only';

import { rateLimited } from '@/core/errors';
import { logger } from '@/core/logger';

/**
 * In-process sliding-window rate limiter.
 *
 * Guards the endpoints an attacker would hammer: sign-in, password reset, and
 * store registration. It is per-process, which is exactly right for a single
 * Node instance and the common small deployment. Behind several replicas this
 * becomes a per-replica limit — move the counter to Redis at that point; the
 * call sites do not change.
 */

interface Bucket {
  hits: number[];
  blockedUntil: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export interface RateLimitRule {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Attempts allowed inside the window. */
  max: number;
  /** How long to lock out once the limit is exceeded. */
  blockMs: number;
}

export const RATE_LIMITS = {
  signIn: { windowMs: 10 * 60_000, max: 8, blockMs: 15 * 60_000 },
  passwordReset: { windowMs: 60 * 60_000, max: 5, blockMs: 60 * 60_000 },
  register: { windowMs: 60 * 60_000, max: 3, blockMs: 60 * 60_000 },
  search: { windowMs: 60_000, max: 120, blockMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    const stale = bucket.hits.every((hit) => now - hit > 60 * 60_000);
    if (stale && bucket.blockedUntil < now) buckets.delete(key);
  }
}

/** Throws `AppError('RATE_LIMIT')` when the caller has run out of attempts. */
export function enforceRateLimit(scope: keyof typeof RATE_LIMITS, identity: string): void {
  const rule = RATE_LIMITS[scope];
  const key = `${scope}:${identity}`;
  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key) ?? { hits: [], blockedUntil: 0 };

  if (bucket.blockedUntil > now) {
    const minutes = Math.ceil((bucket.blockedUntil - now) / 60_000);
    throw rateLimited(`محاولات كثيرة جداً. حاول مرة أخرى بعد ${minutes} دقيقة.`);
  }

  bucket.hits = bucket.hits.filter((hit) => now - hit < rule.windowMs);
  bucket.hits.push(now);

  if (bucket.hits.length > rule.max) {
    bucket.blockedUntil = now + rule.blockMs;
    bucket.hits = [];
    buckets.set(key, bucket);
    logger.security('rate limit exceeded', { scope, identity });
    throw rateLimited(
      `محاولات كثيرة جداً. حاول مرة أخرى بعد ${Math.ceil(rule.blockMs / 60_000)} دقيقة.`,
    );
  }

  buckets.set(key, bucket);
}

/** Clear the counter after a successful attempt. */
export function clearRateLimit(scope: keyof typeof RATE_LIMITS, identity: string): void {
  buckets.delete(`${scope}:${identity}`);
}
