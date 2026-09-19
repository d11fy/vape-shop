import 'server-only';

import type { Tx } from '@/core/db';
import { COUNTRIES, currencyDecimals } from '@/core/currency';
import { SYSTEM_ROLES, OWNER_ROLE_KEY, resolveTemplatePermissions } from '@/core/rbac/roles';
import { businessRule } from '@/core/errors';

/**
 * Everything a brand-new tenant needs before its owner can ring up a sale:
 * settings, a trial subscription, a default branch with a cashbox, the system
 * roles, the standard payment methods and expense categories.
 *
 * Runs inside one transaction — a half-provisioned store is worse than none.
 */

export interface ProvisionStoreInput {
  name: string;
  ownerId: string;
  country?: string;
  phone?: string | null;
  email?: string | null;
  /** Plan to start on; defaults to the cheapest public plan. */
  planCode?: string;
  /** Skip the trial and start a paid period of this many days. */
  paidDays?: number;
}

export const DEFAULT_PAYMENT_METHODS = [
  { name: 'نقدي', type: 'CASH' as const, affectsCashbox: true, isDefault: true },
  { name: 'شبكة / بطاقة', type: 'CARD' as const, affectsCashbox: false, isDefault: false },
  { name: 'تحويل بنكي', type: 'TRANSFER' as const, affectsCashbox: false, isDefault: false },
  { name: 'محفظة إلكترونية', type: 'WALLET' as const, affectsCashbox: false, isDefault: false },
];

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'إيجار', color: '#8B5CF6', icon: 'Home' },
  { name: 'كهرباء ومياه', color: '#3B82F6', icon: 'Zap' },
  { name: 'رواتب', color: '#10B981', icon: 'Users' },
  { name: 'نقل وشحن', color: '#F59E0B', icon: 'Truck' },
  { name: 'صيانة', color: '#06B6D4', icon: 'Wrench' },
  { name: 'تسويق وإعلان', color: '#EC4899', icon: 'Megaphone' },
  { name: 'مستلزمات المحل', color: '#6366F1', icon: 'ShoppingBag' },
  { name: 'أخرى', color: '#6B7280', icon: 'MoreHorizontal' },
];

export async function provisionStore(tx: Tx, input: ProvisionStoreInput) {
  const country = COUNTRIES.find((entry) => entry.code === (input.country ?? 'SA')) ?? COUNTRIES[0];

  const plan = input.planCode
    ? await tx.plan.findUnique({ where: { code: input.planCode } })
    : await tx.plan.findFirst({
        where: { isActive: true, isPublic: true },
        orderBy: { sortOrder: 'asc' },
      });

  if (!plan) {
    throw businessRule('لا توجد خطة اشتراك متاحة. يرجى التواصل مع الدعم.');
  }

  const slug = await uniqueSlug(tx, input.name);

  const store = await tx.store.create({
    data: {
      name: input.name,
      slug,
      ownerId: input.ownerId,
      status: 'PENDING',
      country: country.code,
      phone: input.phone ?? null,
      email: input.email ?? null,
      settings: {
        create: {
          currency: country.currency,
          currencyDecimals: currencyDecimals(country.currency),
          timezone: country.timezone,
          taxEnabled: false,
          taxRateBps: country.vatBps,
        },
      },
    },
    select: { id: true, slug: true, name: true },
  });

  // ── Subscription ──────────────────────────────────────────────────────────
  const days = input.paidDays ?? plan.trialDays;
  const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const graceEndsAt = new Date(endsAt.getTime() + plan.graceDays * 24 * 60 * 60 * 1000);

  const subscription = await tx.subscription.create({
    data: {
      storeId: store.id,
      planId: plan.id,
      status: input.paidDays ? 'ACTIVE' : 'TRIALING',
      endsAt,
      graceEndsAt,
      amount: input.paidDays ? plan.monthlyPrice : 0n,
    },
    select: { id: true },
  });

  await tx.subscriptionEvent.create({
    data: {
      subscriptionId: subscription.id,
      type: 'created',
      toPlanId: plan.id,
      newEndsAt: endsAt,
      note: input.paidDays ? 'اشتراك مدفوع' : `فترة تجريبية ${plan.trialDays} يوم`,
    },
  });

  // ── Roles ─────────────────────────────────────────────────────────────────
  await tx.role.createMany({
    data: SYSTEM_ROLES.map((template) => ({
      storeId: store.id,
      key: template.key,
      nameAr: template.nameAr,
      nameEn: template.nameEn,
      description: template.description,
      isSystem: true,
      permissions: resolveTemplatePermissions(template),
    })),
  });

  const ownerRole = await tx.role.findUniqueOrThrow({
    where: { storeId_key: { storeId: store.id, key: OWNER_ROLE_KEY } },
    select: { id: true },
  });

  // ── Branch + cashbox ──────────────────────────────────────────────────────
  const branch = await tx.branch.create({
    data: {
      storeId: store.id,
      name: 'الفرع الرئيسي',
      code: 'MAIN',
      isDefault: true,
      phone: input.phone ?? null,
    },
    select: { id: true },
  });

  await tx.cashbox.create({
    data: { storeId: store.id, branchId: branch.id, name: 'الصندوق الرئيسي', isDefault: true },
  });

  // ── Owner membership ──────────────────────────────────────────────────────
  await tx.storeUser.create({
    data: {
      storeId: store.id,
      userId: input.ownerId,
      roleId: ownerRole.id,
      status: 'ACTIVE',
    },
  });

  // ── Reference data ────────────────────────────────────────────────────────
  await tx.paymentMethod.createMany({
    data: DEFAULT_PAYMENT_METHODS.map((method, index) => ({
      storeId: store.id,
      name: method.name,
      type: method.type,
      affectsCashbox: method.affectsCashbox,
      isDefault: method.isDefault,
      sortOrder: index,
    })),
  });

  await tx.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map((category, index) => ({
      storeId: store.id,
      name: category.name,
      color: category.color,
      icon: category.icon,
      isSystem: true,
      sortOrder: index,
    })),
  });

  return { store, branchId: branch.id, planId: plan.id };
}

/** Readable, unique, URL-safe store slug — Arabic names transliterate poorly, so fall back to a short id. */
async function uniqueSlug(tx: Tx, name: string): Promise<string> {
  const ascii = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/[^a-z0-9-]/g, '');

  const base = ascii.length >= 3 ? ascii.slice(0, 40) : 'store';

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${randomSuffix()}`;
    const existing = await tx.store.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }

  return `${base}-${Date.now().toString(36)}`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}
