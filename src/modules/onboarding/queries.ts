import 'server-only';

import { requireStore } from '@/core/auth/context';
import { db } from '@/core/db';
import { OWNER_ROLE_KEY } from '@/core/rbac/roles';

/**
 * Everything the wizard needs in one round trip, plus which steps are already
 * satisfied. The wizard is resumable, so "done" is derived from the data — not
 * from a counter we would have to keep in sync.
 */

export interface OnboardingSnapshot {
  store: {
    id: string;
    name: string;
    phone: string | null;
    address: string | null;
    city: string | null;
    country: string;
    onboarded: boolean;
  };
  settings: {
    currency: string;
    timezone: string;
    taxEnabled: boolean;
    taxRateBps: number;
    taxInclusive: boolean;
  };
  roles: Array<{ id: string; key: string; nameAr: string; description: string | null }>;
  categories: Array<{ id: string; name: string }>;
  paymentMethods: Array<{
    id: string;
    name: string;
    type: string;
    affectsCashbox: boolean;
    isActive: boolean;
    isDefault: boolean;
  }>;
  counts: {
    products: number;
    /** Staff other than the owner. */
    employees: number;
  };
  ownerName: string;
}

export async function getOnboardingSnapshot(): Promise<OnboardingSnapshot> {
  const { store, user } = await requireStore();

  const [record, settings, roles, categories, paymentMethods, products, employees] =
    await Promise.all([
      db.store.findUniqueOrThrow({
        where: { id: store.id },
        select: { phone: true, address: true, city: true, country: true },
      }),
      db.storeSettings.findUniqueOrThrow({
        where: { storeId: store.id },
        select: {
          currency: true,
          timezone: true,
          taxEnabled: true,
          taxRateBps: true,
          taxInclusive: true,
        },
      }),
      db.role.findMany({
        where: { storeId: store.id, key: { not: OWNER_ROLE_KEY } },
        select: { id: true, key: true, nameAr: true, description: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.category.findMany({
        where: { storeId: store.id, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { sortOrder: 'asc' },
      }),
      db.paymentMethod.findMany({
        where: { storeId: store.id },
        select: {
          id: true,
          name: true,
          type: true,
          affectsCashbox: true,
          isActive: true,
          isDefault: true,
        },
        orderBy: { sortOrder: 'asc' },
      }),
      db.product.count({ where: { storeId: store.id, deletedAt: null } }),
      db.storeUser.count({ where: { storeId: store.id, userId: { not: user.id } } }),
    ]);

  return {
    store: {
      id: store.id,
      name: store.name,
      onboarded: store.onboarded,
      ...record,
    },
    settings,
    roles,
    categories,
    paymentMethods,
    counts: { products, employees },
    ownerName: user.name,
  };
}
