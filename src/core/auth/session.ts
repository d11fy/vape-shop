import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';

import { db } from '@/core/db';
import { env } from '@/core/env';

/**
 * Database-backed sessions.
 *
 * The browser holds an opaque 256-bit token in an HttpOnly cookie; the database
 * stores only its HMAC. A stolen database dump therefore cannot be replayed as
 * a login, and any session can be revoked instantly — which is what makes
 * "disable this employee right now" and the support-mode banner trustworthy.
 */

export const SESSION_COOKIE = 'vs_session';
const TOKEN_BYTES = 32;

export function hashToken(token: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(token).digest('base64url');
}

export function safeCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export interface RequestFingerprint {
  ipAddress: string | null;
  userAgent: string | null;
}

/** Best-effort client identification, tolerant of proxies. */
export async function readFingerprint(): Promise<RequestFingerprint> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  const ipAddress =
    forwarded?.split(',')[0]?.trim() ||
    headerList.get('x-real-ip') ||
    headerList.get('cf-connecting-ip') ||
    null;
  return { ipAddress, userAgent: headerList.get('user-agent') };
}

export interface CreatedSession {
  id: string;
  token: string;
  expiresAt: Date;
}

export async function createSession(
  userId: string,
  options: { activeStoreId?: string | null; fingerprint?: RequestFingerprint } = {},
): Promise<CreatedSession> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const fingerprint = options.fingerprint ?? (await readFingerprint());
  const expiresAt = new Date(Date.now() + env.SESSION_DAYS * 24 * 60 * 60 * 1000);

  const session = await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      activeStoreId: options.activeStoreId ?? null,
      ipAddress: fingerprint.ipAddress,
      userAgent: fingerprint.userAgent?.slice(0, 500) ?? null,
      expiresAt,
    },
    select: { id: true },
  });

  return { id: session.id, token, expiresAt };
}

export async function writeSessionCookie(session: CreatedSession): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.IS_PRODUCTION,
    path: '/',
    expires: session.expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.IS_PRODUCTION,
    path: '/',
    maxAge: 0,
  });
}

export async function readSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value ?? null;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Sign a user out everywhere — used when an account is disabled. */
export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Switch which store the session is currently looking at. */
export async function setActiveStore(sessionId: string, storeId: string | null): Promise<void> {
  await db.session.update({
    where: { id: sessionId },
    data: { activeStoreId: storeId, supportStoreId: null },
  });
}

export async function setSupportStore(sessionId: string, storeId: string | null): Promise<void> {
  await db.session.update({
    where: { id: sessionId },
    data: { supportStoreId: storeId, activeStoreId: storeId },
  });
}

/** Housekeeping: drop sessions that expired more than a week ago. */
export async function pruneExpiredSessions(): Promise<number> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result = await db.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }] },
  });
  return result.count;
}
