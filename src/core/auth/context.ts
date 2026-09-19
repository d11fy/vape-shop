import 'server-only';

import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { db } from '@/core/db';
import { BRANCH_COOKIE } from './branch';
import { forbidden, readOnly, unauthenticated, notFound } from '@/core/errors';
import type { Permission } from '@/core/rbac/permissions';
import { OWNER_ROLE_KEY } from '@/core/rbac/roles';
import { hashToken, readSessionToken } from './session';

/**
 * Request-scoped authentication & authorisation context.
 *
 * Every server action and every page starts here. It answers, in one round
 * trip: who is this, which store are they in, what may they do, and is the
 * store currently writable.
 *
 * `cache()` memoises per React request, so a page that calls `requireStore()`
 * in five places still issues a single query.
 */

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  platformRole: 'SUPER_ADMIN' | 'SUPPORT' | null;
  /** Signed in with a password someone else chose; must replace it first. */
  mustChangePassword: boolean;
}

/** Where a user holding a temporary password is sent until they replace it. */
export const CHANGE_PASSWORD_PATH = '/change-password';

export interface ActiveBranch {
  id: string;
  name: string;
  code: string;
}

export interface SubscriptionState {
  planCode: string;
  planName: string;
  status: 'TRIALING' | 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'CANCELED';
  endsAt: Date;
  graceEndsAt: Date | null;
  daysRemaining: number;
  /** Writes are refused: grace period, or a suspended store. */
  isReadOnly: boolean;
  /** No access at all — the app redirects to the subscription notice. */
  isBlocked: boolean;
  limits: {
    maxEmployees: number | null;
    maxBranches: number | null;
    maxProducts: number | null;
    maxMonthlyInvoices: number | null;
  };
  features: string[];
}

export interface StoreContext {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  onboarded: boolean;
  settings: StoreSettingsView;
  membershipId: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  isOwner: boolean;
  permissions: ReadonlySet<string>;
  branch: ActiveBranch;
  branches: ActiveBranch[];
  /** True when the member is pinned to one branch and cannot switch. */
  branchLocked: boolean;
  subscription: SubscriptionState;
}

export interface StoreSettingsView {
  currency: string;
  currencyDecimals: number;
  timezone: string;
  locale: string;
  taxEnabled: boolean;
  taxRateBps: number;
  taxInclusive: boolean;
  taxNumber: string | null;
  invoicePrefix: string;
  invoicePadding: number;
  receiptWidthMm: number;
  receiptFooterAr: string;
  showLogoOnReceipt: boolean;
  lowStockAlerts: boolean;
  negativeStockAllowed: boolean;
  debtEnabled: boolean;
  defaultDebtLimit: number;
  debtOverdueDays: number;
  ageVerificationEnabled: boolean;
  minimumCustomerAge: number;
  ageNoticeAr: string;
  requireAgeCheckAtSale: boolean;
}

export interface MembershipSummary {
  storeId: string;
  storeName: string;
  storeSlug: string;
  logoUrl: string | null;
  roleName: string;
  status: string;
}

export interface AuthContext {
  sessionId: string;
  user: SessionUser;
  isPlatformAdmin: boolean;
  /** A platform admin is currently viewing a tenant for support. */
  supportStoreId: string | null;
  memberships: MembershipSummary[];
  store: StoreContext | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Resolve the context, or `null` when there is no valid session. */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const token = await readSessionToken();
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      userId: true,
      activeStoreId: true,
      supportStoreId: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatarUrl: true,
          platformRole: true,
          status: true,
          mustChangePassword: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== 'ACTIVE') return null;

  const memberships = await db.storeUser.findMany({
    where: { userId: session.userId, status: 'ACTIVE' },
    select: {
      storeId: true,
      role: { select: { nameAr: true } },
      status: true,
      store: { select: { name: true, slug: true, logoUrl: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const membershipSummaries: MembershipSummary[] = memberships.map((membership) => ({
    storeId: membership.storeId,
    storeName: membership.store.name,
    storeSlug: membership.store.slug,
    logoUrl: membership.store.logoUrl,
    roleName: membership.role.nameAr,
    status: membership.status,
  }));

  const isPlatformAdmin = session.user.platformRole !== null;

  // Which store are we looking at? The session's pinned store, otherwise the
  // only membership the user has.
  const targetStoreId =
    session.activeStoreId ??
    (membershipSummaries.length === 1 ? membershipSummaries[0]!.storeId : null);

  const store = targetStoreId
    ? await loadStoreContext(targetStoreId, session.userId, {
        isPlatformAdmin,
        isSupport: session.supportStoreId === targetStoreId,
      })
    : null;

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      phone: session.user.phone,
      avatarUrl: session.user.avatarUrl,
      platformRole: session.user.platformRole,
      mustChangePassword: session.user.mustChangePassword,
    },
    isPlatformAdmin,
    supportStoreId: session.supportStoreId,
    memberships: membershipSummaries,
    store,
  };
});

async function loadStoreContext(
  storeId: string,
  userId: string,
  options: { isPlatformAdmin: boolean; isSupport: boolean },
): Promise<StoreContext | null> {
  const store = await db.store.findUnique({
    where: { id: storeId },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      status: true,
      onboardedAt: true,
      settings: true,
      subscription: {
        select: {
          status: true,
          endsAt: true,
          graceEndsAt: true,
          plan: {
            select: {
              code: true,
              nameAr: true,
              maxEmployees: true,
              maxBranches: true,
              maxProducts: true,
              maxMonthlyInvoices: true,
              features: true,
            },
          },
        },
      },
      branches: {
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true, code: true, isDefault: true },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      },
    },
  });

  if (!store || !store.settings) return null;

  const membership = await db.storeUser.findUnique({
    where: { storeId_userId: { storeId, userId } },
    select: {
      id: true,
      status: true,
      branchId: true,
      extraPermissions: true,
      deniedPermissions: true,
      role: { select: { id: true, key: true, nameAr: true, permissions: true } },
    },
  });

  // A support session grants read access without a membership row, and the
  // banner in the shell makes that state impossible to miss.
  if (!membership && !options.isSupport) return null;
  if (membership && membership.status !== 'ACTIVE') return null;

  const isOwner = membership?.role.key === OWNER_ROLE_KEY;
  const permissions = new Set<string>();

  if (membership) {
    for (const permission of membership.role.permissions) permissions.add(permission);
    for (const permission of membership.extraPermissions) permissions.add(permission);
    for (const permission of membership.deniedPermissions) permissions.delete(permission);
  } else if (options.isSupport) {
    // Support mode is deliberately read-only: view screens, never write money.
    for (const permission of SUPPORT_MODE_PERMISSIONS) permissions.add(permission);
  }

  const branches: ActiveBranch[] = store.branches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    code: branch.code,
  }));

  // A member pinned to one branch always sees that branch. Everyone else may
  // switch, and their choice rides along in a cookie.
  const pinnedBranch = membership?.branchId
    ? branches.find((branch) => branch.id === membership.branchId)
    : undefined;

  let chosenBranch: ActiveBranch | undefined;
  if (!pinnedBranch) {
    const cookieStore = await cookies();
    const preferred = cookieStore.get(BRANCH_COOKIE)?.value;
    if (preferred) chosenBranch = branches.find((branch) => branch.id === preferred);
  }

  const activeBranch = pinnedBranch ?? chosenBranch ?? branches[0];

  if (!activeBranch) return null;

  const subscription = describeSubscription(store.status, store.subscription, options.isSupport);

  return {
    id: store.id,
    name: store.name,
    slug: store.slug,
    logoUrl: store.logoUrl,
    status: store.status,
    onboarded: store.onboardedAt !== null,
    settings: {
      currency: store.settings.currency,
      currencyDecimals: store.settings.currencyDecimals,
      timezone: store.settings.timezone,
      locale: store.settings.locale,
      taxEnabled: store.settings.taxEnabled,
      taxRateBps: store.settings.taxRateBps,
      taxInclusive: store.settings.taxInclusive,
      taxNumber: store.settings.taxNumber,
      invoicePrefix: store.settings.invoicePrefix,
      invoicePadding: store.settings.invoicePadding,
      receiptWidthMm: store.settings.receiptWidthMm,
      receiptFooterAr: store.settings.receiptFooterAr,
      showLogoOnReceipt: store.settings.showLogoOnReceipt,
      lowStockAlerts: store.settings.lowStockAlerts,
      negativeStockAllowed: store.settings.negativeStockAllowed,
      debtEnabled: store.settings.debtEnabled,
      defaultDebtLimit: Number(store.settings.defaultDebtLimit),
      debtOverdueDays: store.settings.debtOverdueDays,
      ageVerificationEnabled: store.settings.ageVerificationEnabled,
      minimumCustomerAge: store.settings.minimumCustomerAge,
      ageNoticeAr: store.settings.ageNoticeAr,
      requireAgeCheckAtSale: store.settings.requireAgeCheckAtSale,
    },
    membershipId: membership?.id ?? 'support',
    roleId: membership?.role.id ?? 'support',
    roleKey: membership?.role.key ?? 'support',
    roleName: membership?.role.nameAr ?? 'وضع الدعم الفني',
    isOwner,
    permissions,
    branch: activeBranch,
    branches,
    branchLocked: Boolean(pinnedBranch),
    subscription,
  };
}

/** What a platform admin may see while impersonating a tenant: read-only screens. */
const SUPPORT_MODE_PERMISSIONS: string[] = [
  'dashboard.view',
  'sales.view',
  'sales.view_all',
  'products.view',
  'inventory.view',
  'customers.view',
  'debts.view',
  'suppliers.view',
  'purchases.view',
  'expenses.view',
  'cashbox.view',
  'shifts.view_all',
  'employees.view',
  'reports.view',
  'settings.view',
  'audit.view',
];

type SubscriptionRow = {
  status: 'TRIALING' | 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'CANCELED';
  endsAt: Date;
  graceEndsAt: Date | null;
  plan: {
    code: string;
    nameAr: string;
    maxEmployees: number | null;
    maxBranches: number | null;
    maxProducts: number | null;
    maxMonthlyInvoices: number | null;
    features: string[];
  };
} | null;

function describeSubscription(
  storeStatus: 'PENDING' | 'ACTIVE' | 'SUSPENDED',
  subscription: SubscriptionRow,
  isSupport: boolean,
): SubscriptionState {
  const now = Date.now();

  if (!subscription) {
    return {
      planCode: 'none',
      planName: 'بدون اشتراك',
      status: 'EXPIRED',
      endsAt: new Date(now),
      graceEndsAt: null,
      daysRemaining: 0,
      isReadOnly: true,
      isBlocked: storeStatus !== 'ACTIVE',
      limits: {
        maxEmployees: null,
        maxBranches: null,
        maxProducts: null,
        maxMonthlyInvoices: null,
      },
      features: [],
    };
  }

  const endsAt = subscription.endsAt;
  const graceEndsAt = subscription.graceEndsAt;
  const daysRemaining = Math.ceil((endsAt.getTime() - now) / DAY_MS);

  // Derive the effective status from the clock rather than trusting a stale
  // column: a nightly job may not have run yet.
  let status = subscription.status;
  if (status === 'ACTIVE' || status === 'TRIALING') {
    if (endsAt.getTime() < now) {
      status = graceEndsAt && graceEndsAt.getTime() > now ? 'GRACE' : 'EXPIRED';
    }
  } else if (status === 'GRACE' && graceEndsAt && graceEndsAt.getTime() < now) {
    status = 'EXPIRED';
  }

  const suspended = storeStatus === 'SUSPENDED';
  const isBlocked = suspended || status === 'EXPIRED' || status === 'CANCELED';
  const isReadOnly = isSupport || isBlocked || status === 'GRACE';

  return {
    planCode: subscription.plan.code,
    planName: subscription.plan.nameAr,
    status,
    endsAt,
    graceEndsAt,
    daysRemaining,
    isReadOnly,
    isBlocked,
    limits: {
      maxEmployees: subscription.plan.maxEmployees,
      maxBranches: subscription.plan.maxBranches,
      maxProducts: subscription.plan.maxProducts,
      maxMonthlyInvoices: subscription.plan.maxMonthlyInvoices,
    },
    features: subscription.plan.features,
  };
}

// ── Guards ───────────────────────────────────────────────────────────────────

export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) throw unauthenticated();
  return context;
}

export interface StoreSession extends AuthContext {
  store: StoreContext;
}

/**
 * Require an authenticated user inside a store.
 *
 * A user still holding a temporary password is sent to replace it — enforced
 * here, not only in the layout, so no store page, query or action works with
 * a password that someone else knows. `redirect()` passes through `runAction`
 * untouched, so actions navigate the browser instead of failing.
 */
export async function requireStore(): Promise<StoreSession> {
  const context = await requireAuth();
  if (context.user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  if (!context.store) throw notFound('المتجر');
  return context as StoreSession;
}

/**
 * For route handlers: the store session, or `null` when there is none — which
 * includes a user who must still replace a temporary password. Handlers answer
 * with JSON, so they get a `null` to turn into a 401 instead of a redirect.
 */
export async function getApiStoreContext(): Promise<StoreSession | null> {
  const context = await getAuthContext();
  if (!context?.store || context.user.mustChangePassword) return null;
  return context as StoreSession;
}

/**
 * Require a permission. Owners implicitly hold every permission so a newly
 * released feature is never locked away from the person who pays for it.
 */
export async function requirePermission(...required: Permission[]): Promise<StoreSession> {
  const context = await requireStore();
  if (context.store.isOwner) return context;
  const granted = required.some((permission) => context.store.permissions.has(permission));
  if (!granted) throw forbidden();
  return context;
}

/** Require a permission AND that the store is currently writable. */
export async function requireWritePermission(...required: Permission[]): Promise<StoreSession> {
  const context = await requirePermission(...required);
  if (context.store.subscription.isReadOnly) throw readOnly();
  return context;
}

export async function requirePlatformAdmin(): Promise<AuthContext> {
  const context = await requireAuth();
  if (context.user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  if (context.user.platformRole !== 'SUPER_ADMIN') throw forbidden();
  return context;
}

/** Non-throwing check, for conditional rendering inside server components. */
export function can(store: StoreContext | null, ...required: Permission[]): boolean {
  if (!store) return false;
  if (store.isOwner) return true;
  return required.some((permission) => store.permissions.has(permission));
}
