'use client';

import { ConfirmProvider } from '@/ui/feedback/confirm';
import { FormatProvider } from '@/ui/format';
import type { FormatSettings } from '@/lib/formatter';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { MobileNav } from './mobile-nav';
import { SupportBanner, SubscriptionBanner } from './banners';
import type { NavSection, QuickAction } from './navigation';

export interface AppShellProps {
  sections: NavSection[];
  quickActions: QuickAction[];
  user: { name: string; email: string | null; avatarUrl: string | null };
  store: {
    name: string;
    roleName: string;
    planName: string;
    branches: Array<{ id: string; name: string; code: string }>;
    activeBranchId: string;
    branchLocked: boolean;
  };
  memberships: Array<{ storeId: string; storeName: string }>;
  unreadCount: number;
  format: FormatSettings;
  subscription: {
    status: string;
    daysRemaining: number;
    isReadOnly: boolean;
  };
  support: { active: boolean; storeName: string } | null;
  actions: {
    signOut: () => Promise<void>;
    switchBranch: (branchId: string) => Promise<void>;
    switchStore: (storeId: string) => Promise<void>;
    exitSupport: () => Promise<void>;
  };
  children: React.ReactNode;
}

/**
 * The frame every in-store screen renders inside: rail on the right for
 * desktop, bottom bar for phones, and a single content column that never needs
 * a horizontal scrollbar.
 */
export function AppShell({
  sections,
  quickActions,
  user,
  store,
  memberships,
  unreadCount,
  format,
  subscription,
  support,
  actions,
  children,
}: AppShellProps) {
  return (
    <FormatProvider settings={format}>
      <ConfirmProvider>
        <Sidebar sections={sections} storeName={store.name} planName={store.planName} />

        <div className="lg:pe-[var(--sidebar-width)] print:!pe-0">
          <Topbar
            user={user}
            storeName={store.name}
            roleName={store.roleName}
            branches={store.branches}
            activeBranchId={store.activeBranchId}
            branchLocked={store.branchLocked}
            memberships={memberships}
            unreadCount={unreadCount}
            onSwitchBranch={actions.switchBranch}
            onSwitchStore={actions.switchStore}
            onSignOut={actions.signOut}
          />

          {support?.active && (
            <SupportBanner storeName={support.storeName} onExit={actions.exitSupport} />
          )}

          {!support?.active && (
            <SubscriptionBanner
              status={subscription.status}
              daysRemaining={subscription.daysRemaining}
              isReadOnly={subscription.isReadOnly}
            />
          )}

          <main
            id="main"
            className="print-area mx-auto w-full max-w-[1400px] px-3 pb-[calc(var(--bottom-nav-height)+24px)] pt-4 sm:px-5 sm:pt-5 lg:pb-8"
          >
            {children}
          </main>
        </div>

        <MobileNav
          sections={sections}
          quickActions={quickActions}
          user={user}
          roleName={store.roleName}
          storeName={store.name}
          onSignOut={actions.signOut}
        />
      </ConfirmProvider>
    </FormatProvider>
  );
}
