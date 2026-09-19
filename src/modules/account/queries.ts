import 'server-only';

import { requireAuth } from '@/core/auth/context';
import { db } from '@/core/db';
import { describeUserAgent, type DeviceKind } from '@/lib/user-agent';

/**
 * The signed-in person's own account: profile, where they are signed in, and
 * which stores they belong to. Everything here is scoped to the user, never to
 * a store — it is the one screen that is about "me", not "the shop".
 */

export interface AccountSession {
  id: string;
  current: boolean;
  device: string;
  deviceKind: DeviceKind;
  ipAddress: string | null;
  lastSeenAt: Date;
  createdAt: Date;
}

export interface AccountOverview {
  user: {
    name: string;
    email: string | null;
    phone: string | null;
    createdAt: Date;
    lastLoginAt: Date | null;
  };
  sessions: AccountSession[];
  memberships: Array<{ storeId: string; storeName: string; roleName: string; current: boolean }>;
}

export async function getAccountOverview(): Promise<AccountOverview> {
  const context = await requireAuth();

  const [user, sessions] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: context.user.id },
      select: { name: true, email: true, phone: true, createdAt: true, lastLoginAt: true },
    }),
    db.session.findMany({
      where: { userId: context.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, ipAddress: true, lastSeenAt: true, createdAt: true },
      orderBy: { lastSeenAt: 'desc' },
      take: 20,
    }),
  ]);

  return {
    user,
    sessions: sessions
      .map((session) => {
        const device = describeUserAgent(session.userAgent);
        return {
          id: session.id,
          current: session.id === context.sessionId,
          device: device.label,
          deviceKind: device.kind,
          ipAddress: session.ipAddress,
          lastSeenAt: session.lastSeenAt,
          createdAt: session.createdAt,
        };
      })
      // This device first, then most recently active.
      .sort((a, b) => Number(b.current) - Number(a.current)),
    memberships: context.memberships.map((membership) => ({
      storeId: membership.storeId,
      storeName: membership.storeName,
      roleName: membership.roleName,
      current: membership.storeId === context.store?.id,
    })),
  };
}
