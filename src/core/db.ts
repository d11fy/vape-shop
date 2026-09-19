import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { env } from '@/core/env';

/**
 * A single Prisma client per process. Next.js hot-reloads modules in
 * development, so the instance is parked on `globalThis` to avoid exhausting
 * the connection pool with a new client on every edit.
 */

declare global {
  // eslint-disable-next-line no-var
  var __vapeshop_prisma__: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: env.IS_PRODUCTION ? 20 : 10,
    // Hand back idle sockets before the server decides to drop them. Without
    // this the pool eventually serves a connection the database has already
    // closed, and the request fails with P1017 "Server has closed the
    // connection" — which the user would see as a random error on a page that
    // worked a minute ago.
    // The local `prisma dev` server drops idle sockets almost immediately (its
    // own guidance is "the smallest positive idle timeout"), so in development
    // a connection is closed as soon as it is released.
    idleTimeoutMillis: env.IS_PRODUCTION ? 30_000 : 1,
    connectionTimeoutMillis: 10_000,
    // Recycle long-lived sockets so a connection that has quietly gone bad is
    // replaced rather than handed out again.
    maxUses: 2_000,
  });

  const client = new PrismaClient({
    adapter,
    log: ['error', 'warn'],
  });

  // Reads that fail because the socket died under them are retried once, on a
  // fresh connection — the pool discards the broken one. Writes are never
  // retried here: whether a write that lost its connection was applied is
  // unknowable, and the idempotency keys on financial actions are the right
  // tool for a user retry. Inside a transaction the retry fails again on the
  // same dead connection and the error surfaces as before, so atomicity holds.
  const extended = client.$extends({
    query: {
      async $allOperations({ operation, args, query }) {
        // Several pooled sockets can die together, so a retry may draw another
        // dead one; two retries cover that without hiding a real outage.
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await query(args);
          } catch (error) {
            if (attempt >= 2 || !READ_OPERATIONS.has(operation) || !isConnectionDrop(error)) {
              throw error;
            }
          }
        }
      },
    },
  });

  // The extension adds behaviour, not API — the shape is still a PrismaClient.
  return extended as unknown as PrismaClient;
}

const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  '$queryRaw',
  '$queryRawUnsafe',
]);

/** P1017 "Server has closed the connection" and its driver-level twins. */
function isConnectionDrop(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'P1017') return true;
  const message = String((error as { message?: unknown }).message ?? '');
  return /closed the connection|ConnectionClosed|Connection terminated/i.test(message);
}

export const db: PrismaClient = globalThis.__vapeshop_prisma__ ?? createClient();

if (!env.IS_PRODUCTION) {
  globalThis.__vapeshop_prisma__ = db;
}

/** Transaction client type — what every service method receives. */
export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/** Either the root client or an open transaction. */
export type DbClient = PrismaClient | Tx;

/**
 * Run `fn` inside a serializable-enough transaction with sensible timeouts.
 * Financial writes (a sale, a purchase receipt, a shift close) must all go
 * through here so a partial failure rolls back completely.
 */
export async function transaction<T>(
  fn: (tx: Tx) => Promise<T>,
  options: { timeoutMs?: number; maxWaitMs?: number } = {},
): Promise<T> {
  return db.$transaction(fn, {
    timeout: options.timeoutMs ?? 15_000,
    maxWait: options.maxWaitMs ?? 5_000,
  });
}
