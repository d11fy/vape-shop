'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { getAuthContext, requireAuth } from '@/core/auth/context';
import {
  clearSessionCookie,
  readSessionToken,
  revokeSession,
  setActiveStore,
  setSupportStore,
} from '@/core/auth/session';
import { auditOutsideTransaction } from '@/core/audit';
import { db } from '@/core/db';
import { BRANCH_COOKIE } from '@/core/auth/branch';

export async function signOutAction(): Promise<void> {
  const context = await getAuthContext();
  if (context) {
    await revokeSession(context.sessionId);
    await auditOutsideTransaction({
      storeId: context.store?.id ?? null,
      userId: context.user.id,
      action: 'auth.sign_out',
      entityType: 'session',
      entityId: context.sessionId,
      summary: 'تسجيل خروج من النظام',
    });
  }
  await clearSessionCookie();
  redirect('/login');
}

/** Switch the active branch. Members pinned to one branch cannot change it. */
export async function switchBranchAction(branchId: string): Promise<void> {
  const context = await requireAuth();
  if (!context.store) return;
  if (context.store.branchLocked) return;
  if (!context.store.branches.some((branch) => branch.id === branchId)) return;

  const cookieStore = await cookies();
  cookieStore.set(BRANCH_COOKIE, branchId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/', 'layout');
}

/** Switch which store the session is looking at. */
export async function switchStoreAction(storeId: string): Promise<void> {
  const context = await requireAuth();
  const allowed =
    context.memberships.some((membership) => membership.storeId === storeId) ||
    context.user.platformRole === 'SUPER_ADMIN';
  if (!allowed) return;

  await setActiveStore(context.sessionId, storeId);

  const cookieStore = await cookies();
  cookieStore.delete(BRANCH_COOKIE);

  revalidatePath('/', 'layout');
}

/** Leave support mode and return to the platform console. */
export async function exitSupportAction(): Promise<void> {
  const context = await requireAuth();
  if (!context.supportStoreId) redirect('/platform');

  await db.supportSession.updateMany({
    where: { storeId: context.supportStoreId, userId: context.user.id, endedAt: null },
    data: { endedAt: new Date() },
  });

  await auditOutsideTransaction({
    storeId: context.supportStoreId,
    userId: context.user.id,
    action: 'support.exit',
    entityType: 'store',
    entityId: context.supportStoreId,
    summary: 'إنهاء جلسة الدعم الفني',
    isSupport: true,
  });

  await setSupportStore(context.sessionId, null);
  await setActiveStore(context.sessionId, null);
  redirect('/platform/stores');
}

/** Keep `lastSeenAt` fresh so "آخر دخول" columns mean something. */
export async function touchSessionAction(): Promise<void> {
  const token = await readSessionToken();
  if (!token) return;
  const context = await getAuthContext();
  if (!context) return;

  await db.session.update({
    where: { id: context.sessionId },
    data: { lastSeenAt: new Date() },
  });
}
