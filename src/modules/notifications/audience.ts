import type { NotificationKind } from '@/generated/prisma/enums';
import type { Permission } from '@/core/rbac/permissions';

/**
 * Who may see each kind of store-wide notification.
 *
 * A notification's text carries the data it is about — a cash shortfall, a
 * supplier balance — so it follows the same permissions as the screen it links
 * to. A cashier does not learn about a till discrepancy from the bell icon
 * that they could not see on the cash page. `null` means everyone in the store.
 *
 * Isomorphic: no server-only imports.
 */
export const NOTIFICATION_AUDIENCE: Record<NotificationKind, readonly Permission[] | null> = {
  LOW_STOCK: ['inventory.view', 'products.view', 'purchases.create'],
  OUT_OF_STOCK: ['inventory.view', 'products.view', 'purchases.create'],
  // Not `cashbox.view`: a cashier sees their own drawer, not colleagues' shortfalls.
  CASH_MISMATCH: ['cashbox.manage', 'shifts.view_all'],
  OVERDUE_DEBT: ['debts.view'],
  SUPPLIER_DUE: ['suppliers.view', 'suppliers.pay'],
  SUBSCRIPTION_EXPIRING: ['settings.manage'],
  SUBSCRIPTION_EXPIRED: ['settings.manage'],
  PLATFORM_ANNOUNCEMENT: null,
  SYSTEM: null,
};

export const NOTIFICATION_KINDS = Object.keys(NOTIFICATION_AUDIENCE) as NotificationKind[];

/** The kinds this member may see. Owners see everything. */
export function visibleNotificationKinds(
  permissions: ReadonlySet<string>,
  isOwner: boolean,
): NotificationKind[] {
  if (isOwner) return NOTIFICATION_KINDS;
  return NOTIFICATION_KINDS.filter((kind) => {
    const required = NOTIFICATION_AUDIENCE[kind];
    return required === null || required.some((permission) => permissions.has(permission));
  });
}

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  LOW_STOCK: 'مخزون منخفض',
  OUT_OF_STOCK: 'نفاد مخزون',
  CASH_MISMATCH: 'فرق صندوق',
  OVERDUE_DEBT: 'ديون متأخرة',
  SUPPLIER_DUE: 'مستحقات موردين',
  SUBSCRIPTION_EXPIRING: 'الاشتراك',
  SUBSCRIPTION_EXPIRED: 'الاشتراك',
  PLATFORM_ANNOUNCEMENT: 'إعلان',
  SYSTEM: 'النظام',
};
