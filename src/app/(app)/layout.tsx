import { redirect } from 'next/navigation';

import { CHANGE_PASSWORD_PATH, getAuthContext } from '@/core/auth/context';
import { ensureDailyNotices } from '@/modules/notifications/daily';
import { countUnreadNotifications } from '@/modules/notifications/queries';
import { AppShell } from '@/modules/shell/app-shell';
import {
  exitSupportAction,
  signOutAction,
  switchBranchAction,
  switchStoreAction,
} from '@/modules/shell/actions';
import { visibleQuickActions, visibleSections } from '@/modules/shell/navigation';

/**
 * Gate for every in-store screen.
 *
 * The routing decisions live here rather than in middleware because they need
 * the full context — membership, onboarding state and subscription status — and
 * resolving that once per request keeps the pages underneath simple.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const context = await getAuthContext();

  if (!context) redirect('/login');
  if (context.user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);

  if (!context.store) {
    // A platform admin with no tenant selected belongs in the console.
    if (context.memberships.length === 0 && context.isPlatformAdmin) redirect('/platform');
    if (context.memberships.length === 0) redirect('/no-access');
    redirect('/select-store');
  }

  const { store } = context;

  if (!store.onboarded && store.isOwner) redirect('/onboarding');
  if (store.subscription.isBlocked) redirect('/subscription');

  // Once per store per day; a no-op on every other request.
  await ensureDailyNotices(store);
  const unreadCount = await countUnreadNotifications({ ...context, store });

  const sections = visibleSections(store.permissions, store.isOwner);
  const quickActions = store.subscription.isReadOnly
    ? []
    : visibleQuickActions(store.permissions, store.isOwner);

  return (
    <AppShell
      sections={sections}
      quickActions={quickActions}
      user={{ name: context.user.name, email: context.user.email, avatarUrl: context.user.avatarUrl }}
      store={{
        name: store.name,
        roleName: store.roleName,
        planName: store.subscription.planName,
        branches: store.branches,
        activeBranchId: store.branch.id,
        branchLocked: store.branchLocked,
      }}
      memberships={context.memberships.map((membership) => ({
        storeId: membership.storeId,
        storeName: membership.storeName,
      }))}
      unreadCount={unreadCount}
      format={{
        currency: store.settings.currency,
        decimals: store.settings.currencyDecimals,
        timezone: store.settings.timezone,
        locale: store.settings.locale,
      }}
      subscription={{
        status: store.subscription.status,
        daysRemaining: store.subscription.daysRemaining,
        isReadOnly: store.subscription.isReadOnly,
      }}
      support={
        context.supportStoreId === store.id ? { active: true, storeName: store.name } : null
      }
      actions={{
        signOut: signOutAction,
        switchBranch: switchBranchAction,
        switchStore: switchStoreAction,
        exitSupport: exitSupportAction,
      }}
    >
      {children}
    </AppShell>
  );
}
