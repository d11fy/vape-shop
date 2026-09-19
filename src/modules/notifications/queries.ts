import 'server-only';

import type { StoreSession } from '@/core/auth/context';
import { db } from '@/core/db';
import type { Prisma } from '@/generated/prisma/client';
import type { NotificationKind, NotificationSeverity } from '@/generated/prisma/enums';
import { visibleNotificationKinds } from './audience';

/**
 * What one member sees in the notification centre: their store's store-wide
 * notices of the kinds their permissions allow, plus anything addressed to
 * them personally. Read state is theirs alone.
 */
export function notificationScope(context: StoreSession): Prisma.NotificationWhereInput {
  return {
    storeId: context.store.id,
    kind: { in: visibleNotificationKinds(context.store.permissions, context.store.isOwner) },
    OR: [{ userId: null }, { userId: context.user.id }],
  };
}

export async function countUnreadNotifications(context: StoreSession): Promise<number> {
  return db.notification.count({
    where: { ...notificationScope(context), reads: { none: { userId: context.user.id } } },
  });
}

export interface NotificationRow {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: Date;
}

export interface NotificationPage {
  rows: NotificationRow[];
  total: number;
  unread: number;
  page: number;
  pageSize: number;
}

export async function listNotifications(
  context: StoreSession,
  options: { unreadOnly: boolean; page: number; pageSize?: number },
): Promise<NotificationPage> {
  const pageSize = options.pageSize ?? 30;
  const page = Math.max(1, options.page);
  const scope = notificationScope(context);
  const unreadWhere = { ...scope, reads: { none: { userId: context.user.id } } };
  const where = options.unreadOnly ? unreadWhere : scope;

  const [records, total, unread] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        kind: true,
        severity: true,
        title: true,
        body: true,
        link: true,
        createdAt: true,
        reads: { where: { userId: context.user.id }, select: { readAt: true } },
      },
    }),
    db.notification.count({ where }),
    db.notification.count({ where: unreadWhere }),
  ]);

  return {
    rows: records.map(({ reads, ...record }) => ({ ...record, read: reads.length > 0 })),
    total,
    unread,
    page,
    pageSize,
  };
}
