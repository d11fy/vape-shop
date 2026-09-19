'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Building2,
  ChevronDown,
  LifeBuoy,
  LogOut,
  Search,
  Store,
  User as UserIcon,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import { Avatar } from '@/ui/primitives/avatar';
import { CountBadge } from '@/ui/primitives/badge';
import { Dropdown, MenuItem, MenuLabel, MenuSeparator } from '@/ui/overlays/dropdown';
import { Logo } from '@/ui/brand/logo';
import { ThemeToggle } from './theme-toggle';
import { GlobalSearch } from './global-search';

export interface TopbarProps {
  user: { name: string; email: string | null; avatarUrl: string | null };
  storeName: string;
  roleName: string;
  branches: Array<{ id: string; name: string; code: string }>;
  activeBranchId: string;
  branchLocked: boolean;
  memberships: Array<{ storeId: string; storeName: string }>;
  unreadCount: number;
  onSwitchBranch: (branchId: string) => Promise<void>;
  onSwitchStore: (storeId: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export function Topbar({
  user,
  storeName,
  roleName,
  branches,
  activeBranchId,
  branchLocked,
  memberships,
  unreadCount,
  onSwitchBranch,
  onSwitchStore,
  onSignOut,
}: TopbarProps) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const activeBranch = branches.find((branch) => branch.id === activeBranchId);

  return (
    <>
      <header className="app-header sticky top-0 z-20 flex h-[var(--header-height)] items-center gap-2 border-b border-line-subtle bg-card/85 px-3 backdrop-blur-md sm:px-5">
        {/* Brand on phones, where the sidebar is hidden */}
        <Link href="/dashboard" className="flex items-center gap-2 lg:hidden">
          <Logo size={30} />
        </Link>

        <div className="hidden min-w-0 items-center gap-2 lg:flex">
          <Store className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
          <span className="truncate text-[14px] font-bold text-primary">{storeName}</span>
        </div>

        {branches.length > 1 && !branchLocked ? (
          <Dropdown
            align="start"
            width="w-60"
            trigger={(props) => (
              <button
                {...props}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] border border-line-subtle bg-sunken px-2.5 text-[12.5px] font-semibold text-secondary transition-colors hover:text-primary"
              >
                <Building2 className="size-3.5" />
                <span className="max-w-24 truncate">{activeBranch?.name ?? 'الفرع'}</span>
                <ChevronDown className="size-3.5 opacity-60" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>اختر الفرع</MenuLabel>
                {branches.map((branch) => (
                  <MenuItem
                    key={branch.id}
                    icon={<Building2 className="size-4" />}
                    onClick={async () => {
                      close();
                      await onSwitchBranch(branch.id);
                      router.refresh();
                    }}
                  >
                    <span className={cn(branch.id === activeBranchId && 'font-bold text-accent-strong')}>
                      {branch.name}
                    </span>
                  </MenuItem>
                ))}
              </>
            )}
          </Dropdown>
        ) : (
          activeBranch &&
          branches.length > 1 && (
            <span className="hidden shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] bg-sunken px-2.5 py-1.5 text-[12px] font-semibold text-secondary sm:flex">
              <Building2 className="size-3.5" />
              {activeBranch.name}
            </span>
          )
        )}

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="hidden h-9 w-64 items-center gap-2 rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-[13px] text-tertiary transition-colors hover:border-line-strong hover:text-secondary md:flex xl:w-80"
        >
          <Search className="size-4" />
          <span className="flex-1 text-start">بحث عن منتج، فاتورة، عميل…</span>
          <kbd className="num rounded border border-line bg-sunken px-1.5 py-0.5 text-[10px] font-semibold">
            Ctrl K
          </kbd>
        </button>

        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="بحث"
          className="flex size-9 items-center justify-center rounded-[var(--radius-sm)] text-secondary transition-colors hover:bg-sunken hover:text-primary md:hidden"
        >
          <Search className="size-[18px]" />
        </button>

        <ThemeToggle compact />

        <Link
          href="/notifications"
          aria-label={`الإشعارات${unreadCount > 0 ? ` (${unreadCount} غير مقروء)` : ''}`}
          className="relative flex size-9 items-center justify-center rounded-[var(--radius-sm)] text-secondary transition-colors hover:bg-sunken hover:text-primary"
        >
          <Bell className="size-[18px]" />
          {unreadCount > 0 && (
            <span className="absolute -end-0.5 -top-0.5">
              <CountBadge count={unreadCount} />
            </span>
          )}
        </Link>

        <Dropdown
          align="start"
          width="w-64"
          trigger={(props) => (
            <button
              {...props}
              className="flex items-center gap-2 rounded-[var(--radius-sm)] p-0.5 transition-colors hover:bg-sunken"
              aria-label="حساب المستخدم"
            >
              <Avatar name={user.name} src={user.avatarUrl} size="md" />
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <Avatar name={user.name} src={user.avatarUrl} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-primary">{user.name}</p>
                  <p className="truncate text-[11.5px] text-tertiary">{roleName}</p>
                </div>
              </div>
              <MenuSeparator />

              {memberships.length > 1 && (
                <>
                  <MenuLabel>المتاجر</MenuLabel>
                  {memberships.map((membership) => (
                    <MenuItem
                      key={membership.storeId}
                      icon={<Store className="size-4" />}
                      onClick={async () => {
                        close();
                        await onSwitchStore(membership.storeId);
                        router.refresh();
                      }}
                    >
                      {membership.storeName}
                    </MenuItem>
                  ))}
                  <MenuSeparator />
                </>
              )}

              <MenuItem
                icon={<UserIcon className="size-4" />}
                onClick={() => {
                  close();
                  router.push('/account');
                }}
              >
                حسابي
              </MenuItem>
              <MenuItem
                icon={<LifeBuoy className="size-4" />}
                onClick={() => {
                  close();
                  router.push('/help');
                }}
              >
                المساعدة
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<LogOut className="size-4" />}
                tone="danger"
                onClick={async () => {
                  close();
                  await onSignOut();
                }}
              >
                تسجيل الخروج
              </MenuItem>
            </>
          )}
        </Dropdown>
      </header>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
