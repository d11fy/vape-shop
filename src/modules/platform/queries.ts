import 'server-only';

import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { fromDb, type Money } from '@/core/money';
import { daysBetween } from '@/core/datetime';
import type { ParsedTableQuery } from '@/lib/table-query';
import type { StoreStatus, SubscriptionStatus } from '@/generated/prisma/enums';

/**
 * Platform console queries.
 *
 * These run WITHOUT a tenant filter, which is exactly why every entry point
 * that reaches them is behind `requirePlatformAdmin`. Nothing here returns a
 * tenant's transactional detail — only the operational facts the platform owner
 * needs to run the service.
 */

export interface PlatformOverview {
  stores: { total: number; active: number; pending: number; suspended: number; newThisMonth: number };
  subscriptions: {
    trialing: number;
    active: number;
    grace: number;
    expired: number;
    expiringSoon: number;
  };
  /** Monthly recurring revenue, normalised from yearly plans. */
  mrr: Money;
  users: number;
  totalInvoices: number;
  invoicesThisMonth: number;
  planDistribution: Array<{ code: string; name: string; count: number; mrr: Money }>;
  recentStores: Array<{
    id: string;
    name: string;
    ownerName: string | null;
    planName: string;
    status: StoreStatus;
    createdAt: Date;
  }>;
  expiringSoon: Array<{
    id: string;
    name: string;
    planName: string;
    endsAt: Date;
    daysLeft: number;
    status: SubscriptionStatus;
  }>;
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const soon = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  const [
    storeCounts,
    newStores,
    subscriptionCounts,
    expiringCount,
    users,
    invoices,
    invoicesMonth,
    subscriptions,
    recentStores,
    expiring,
  ] = await Promise.all([
    db.store.groupBy({ by: ['status'], _count: true }),
    db.store.count({ where: { createdAt: { gte: monthStart } } }),
    db.subscription.groupBy({ by: ['status'], _count: true }),
    db.subscription.count({
      where: { status: { in: ['ACTIVE', 'TRIALING'] }, endsAt: { lte: soon, gte: now } },
    }),
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.sale.count({ where: { deletedAt: null } }),
    db.sale.count({ where: { deletedAt: null, soldAt: { gte: monthStart } } }),
    db.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'TRIALING'] } },
      select: {
        billingCycle: true,
        plan: { select: { code: true, nameAr: true, monthlyPrice: true, yearlyPrice: true } },
      },
    }),
    db.store.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        owner: { select: { name: true } },
        subscription: { select: { plan: { select: { nameAr: true } } } },
      },
    }),
    db.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'TRIALING', 'GRACE'] }, endsAt: { lte: soon } },
      orderBy: { endsAt: 'asc' },
      take: 10,
      select: {
        status: true,
        endsAt: true,
        store: { select: { id: true, name: true } },
        plan: { select: { nameAr: true } },
      },
    }),
  ]);

  const countBy = <T extends string>(rows: Array<{ _count: number } & Record<string, unknown>>, key: string) =>
    (value: T) => rows.find((row) => row[key] === value)?._count ?? 0;

  const storeStatus = countBy<StoreStatus>(storeCounts, 'status');
  const subStatus = countBy<SubscriptionStatus>(subscriptionCounts, 'status');

  // A yearly plan contributes 1/12 of its price each month.
  const planTotals = new Map<string, { name: string; count: number; mrr: Money }>();
  let mrr = 0;

  for (const subscription of subscriptions) {
    const monthly =
      subscription.billingCycle === 'yearly'
        ? Math.round(fromDb(subscription.plan.yearlyPrice) / 12)
        : fromDb(subscription.plan.monthlyPrice);

    mrr += monthly;

    const entry = planTotals.get(subscription.plan.code) ?? {
      name: subscription.plan.nameAr,
      count: 0,
      mrr: 0,
    };
    entry.count += 1;
    entry.mrr += monthly;
    planTotals.set(subscription.plan.code, entry);
  }

  return {
    stores: {
      total: storeCounts.reduce((sum, row) => sum + row._count, 0),
      active: storeStatus('ACTIVE'),
      pending: storeStatus('PENDING'),
      suspended: storeStatus('SUSPENDED'),
      newThisMonth: newStores,
    },
    subscriptions: {
      trialing: subStatus('TRIALING'),
      active: subStatus('ACTIVE'),
      grace: subStatus('GRACE'),
      expired: subStatus('EXPIRED') + subStatus('CANCELED'),
      expiringSoon: expiringCount,
    },
    mrr,
    users,
    totalInvoices: invoices,
    invoicesThisMonth: invoicesMonth,
    planDistribution: [...planTotals.entries()].map(([code, value]) => ({ code, ...value })),
    recentStores: recentStores.map((store) => ({
      id: store.id,
      name: store.name,
      ownerName: store.owner?.name ?? null,
      planName: store.subscription?.plan.nameAr ?? '—',
      status: store.status,
      createdAt: store.createdAt,
    })),
    expiringSoon: expiring.map((subscription) => ({
      id: subscription.store.id,
      name: subscription.store.name,
      planName: subscription.plan.nameAr,
      endsAt: subscription.endsAt,
      daysLeft: daysBetween(now, subscription.endsAt),
      status: subscription.status,
    })),
  };
}

// ── Store directory ──────────────────────────────────────────────────────────

export interface PlatformStoreRow {
  id: string;
  name: string;
  slug: string;
  ownerName: string | null;
  ownerEmail: string | null;
  planName: string;
  status: StoreStatus;
  subscriptionStatus: SubscriptionStatus | null;
  endsAt: Date | null;
  daysLeft: number | null;
  employeeCount: number;
  invoiceCount: number;
  lastActivityAt: Date | null;
  createdAt: Date;
}

export async function listPlatformStores(input: {
  query: ParsedTableQuery;
  status?: string;
  planCode?: string;
}): Promise<{ rows: PlatformStoreRow[]; total: number }> {
  const where: Prisma.StoreWhereInput = {
    ...(input.status && input.status !== 'all'
      ? input.status === 'expiring'
        ? {
            subscription: {
              status: { in: ['ACTIVE', 'TRIALING'] },
              endsAt: { lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) },
            },
          }
        : { status: input.status as StoreStatus }
      : {}),
    ...(input.planCode && input.planCode !== 'all'
      ? { subscription: { plan: { code: input.planCode } } }
      : {}),
  };

  if (input.query.search) {
    where.OR = [
      { name: { contains: input.query.search, mode: 'insensitive' } },
      { slug: { contains: input.query.search, mode: 'insensitive' } },
      { owner: { email: { contains: input.query.search, mode: 'insensitive' } } },
      { owner: { name: { contains: input.query.search, mode: 'insensitive' } } },
    ];
  }

  const [stores, total] = await Promise.all([
    db.store.findMany({
      where,
      orderBy: { createdAt: input.query.dir },
      skip: input.query.skip,
      take: input.query.take,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        owner: { select: { name: true, email: true, lastLoginAt: true } },
        subscription: {
          select: { status: true, endsAt: true, plan: { select: { nameAr: true } } },
        },
        _count: {
          select: {
            members: { where: { status: 'ACTIVE' } },
            sales: { where: { deletedAt: null } },
          },
        },
      },
    }),
    db.store.count({ where }),
  ]);

  const now = new Date();

  return {
    total,
    rows: stores.map((store) => ({
      id: store.id,
      name: store.name,
      slug: store.slug,
      ownerName: store.owner?.name ?? null,
      ownerEmail: store.owner?.email ?? null,
      planName: store.subscription?.plan.nameAr ?? '—',
      status: store.status,
      subscriptionStatus: store.subscription?.status ?? null,
      endsAt: store.subscription?.endsAt ?? null,
      daysLeft: store.subscription ? daysBetween(now, store.subscription.endsAt) : null,
      employeeCount: store._count.members,
      invoiceCount: store._count.sales,
      lastActivityAt: store.owner?.lastLoginAt ?? null,
      createdAt: store.createdAt,
    })),
  };
}

export async function getPlatformStore(storeId: string) {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      phone: true,
      email: true,
      address: true,
      city: true,
      country: true,
      notes: true,
      suspendReason: true,
      suspendedAt: true,
      onboardedAt: true,
      createdAt: true,
      owner: { select: { id: true, name: true, email: true, phone: true, lastLoginAt: true } },
      settings: { select: { currency: true, timezone: true } },
      subscription: {
        select: {
          id: true,
          status: true,
          startsAt: true,
          endsAt: true,
          graceEndsAt: true,
          billingCycle: true,
          amount: true,
          plan: { select: { id: true, code: true, nameAr: true } },
          events: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true,
              type: true,
              note: true,
              amount: true,
              newEndsAt: true,
              createdAt: true,
            },
          },
        },
      },
      _count: {
        select: {
          members: true,
          products: { where: { deletedAt: null } },
          customers: { where: { deletedAt: null } },
          sales: { where: { deletedAt: null } },
          branches: { where: { deletedAt: null } },
        },
      },
    },
  });

  if (!store) return null;

  const [salesTotal, lastSale, supportSessions] = await Promise.all([
    db.sale.aggregate({
      where: { storeId, deletedAt: null, status: { not: 'CANCELED' } },
      _sum: { total: true },
    }),
    db.sale.findFirst({
      where: { storeId, deletedAt: null },
      orderBy: { soldAt: 'desc' },
      select: { soldAt: true },
    }),
    db.supportSession.findMany({
      where: { storeId },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        reason: true,
        startedAt: true,
        endedAt: true,
        user: { select: { name: true } },
      },
    }),
  ]);

  return {
    ...store,
    salesTotal: fromDb(salesTotal._sum.total),
    lastSaleAt: lastSale?.soldAt ?? null,
    supportSessions,
  };
}

export async function listPlans() {
  return db.plan.findMany({
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      code: true,
      nameAr: true,
      nameEn: true,
      descriptionAr: true,
      monthlyPrice: true,
      yearlyPrice: true,
      currency: true,
      trialDays: true,
      graceDays: true,
      maxEmployees: true,
      maxBranches: true,
      maxProducts: true,
      maxMonthlyInvoices: true,
      features: true,
      isPublic: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { subscriptions: true } },
    },
  });
}
