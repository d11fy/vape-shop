'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, MoreHorizontal, Plus, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Modal } from '@/ui/overlays/modal';
import { Avatar } from '@/ui/primitives/avatar';
import { ThemeToggle } from './theme-toggle';
import { NavIcon } from './nav-icon';
import { isActivePath, type NavItem, type NavSection, type QuickAction } from './navigation';

export interface MobileNavProps {
  sections: NavSection[];
  quickActions: QuickAction[];
  user: { name: string; email: string | null; avatarUrl: string | null };
  roleName: string;
  storeName: string;
  onSignOut: () => Promise<void>;
}

/**
 * Phone navigation.
 *
 * Four destinations plus "المزيد", and a floating action button for the things
 * a shop owner actually does on their feet: ring up a sale, log an expense,
 * take a payment. Everything sits above the home-indicator safe area.
 */
export function MobileNav({
  sections,
  quickActions,
  user,
  roleName,
  storeName,
  onSignOut,
}: MobileNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const primary = sections
    .flatMap((section) => section.items)
    .filter((item) => item.mobile)
    .slice(0, 4);

  const onPos = pathname.startsWith('/pos');

  return (
    <>
      {/* Floating action button — hidden on the POS screen, which has its own CTA */}
      {quickActions.length > 0 && !onPos && (
        <button
          type="button"
          onClick={() => setActionsOpen(true)}
          aria-label="عملية جديدة"
          className={cn(
            'fixed z-40 flex size-14 items-center justify-center rounded-full bg-accent-strong text-white shadow-lg',
            'transition-transform active:scale-95 lg:hidden',
            'end-4 bottom-[calc(var(--bottom-nav-height)+16px+env(safe-area-inset-bottom,0px))]',
          )}
        >
          <Plus className="size-6" strokeWidth={2.5} />
        </button>
      )}

      <nav
        aria-label="التنقل السريع"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line-subtle bg-card/95 backdrop-blur-md lg:hidden"
      >
        <div className="flex h-[var(--bottom-nav-height)] items-stretch">
          {primary.map((item) => (
            <BottomLink key={item.href} item={item} active={isActivePath(pathname, item)} />
          ))}

          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center justify-center gap-1 text-tertiary transition-colors active:text-primary"
          >
            <MoreHorizontal className="size-[21px]" />
            <span className="text-[10.5px] font-semibold">المزيد</span>
          </button>
        </div>
      </nav>

      {/* Quick actions sheet */}
      <Modal
        open={actionsOpen}
        onClose={() => setActionsOpen(false)}
        title="عملية جديدة"
        description="اختر ما تريد تسجيله الآن"
        size="sm"
      >
        <ul className="space-y-2">
          {quickActions.map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                onClick={() => setActionsOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-[var(--radius-md)] border p-3.5 transition-colors',
                  action.tone === 'accent'
                    ? 'border-accent-border bg-accent-soft'
                    : 'border-line-subtle bg-card active:bg-sunken',
                )}
              >
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)]',
                    action.tone === 'accent'
                      ? 'bg-accent-strong text-white'
                      : 'bg-sunken text-secondary',
                  )}
                >
                  <NavIcon name={action.icon} className="size-5" />
                </span>
                <span className="text-[14px] font-semibold text-primary">{action.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Modal>

      {/* "More" sheet — the full navigation tree */}
      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="كل الأقسام"
        size="md"
        footer={
          <div className="flex w-full items-center justify-between">
            <ThemeToggle />
            <button
              type="button"
              onClick={async () => {
                setMoreOpen(false);
                await onSignOut();
              }}
              className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-2 text-[13px] font-semibold text-danger transition-colors active:bg-danger-soft"
            >
              <LogOut className="size-4" />
              خروج
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <Link
            href="/account"
            onClick={() => setMoreOpen(false)}
            className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line-subtle bg-sunken p-3"
          >
            <Avatar name={user.name} src={user.avatarUrl} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-primary">{user.name}</p>
              <p className="truncate text-[12px] text-tertiary">
                {roleName} · {storeName}
              </p>
            </div>
          </Link>

          {sections.map((section) => (
            <div key={section.key}>
              {section.label && (
                <p className="pb-2 text-[11px] font-bold uppercase tracking-wider text-tertiary">
                  {section.label}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded-[var(--radius-md)] border border-line-subtle p-3 transition-colors active:bg-sunken',
                      isActivePath(pathname, item) ? 'bg-accent-soft border-accent-border' : 'bg-card',
                    )}
                  >
                    <NavIcon name={item.icon} className="size-[18px] shrink-0 text-secondary" />
                    <span className="truncate text-[13px] font-semibold text-primary">
                      {item.label}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

function BottomLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex flex-1 flex-col items-center justify-center gap-1 transition-colors',
        active ? 'text-primary' : 'text-tertiary active:text-secondary',
      )}
    >
      {active && (
        <span
          className="absolute inset-x-5 top-0 h-[2.5px] rounded-full bg-accent-strong"
          aria-hidden="true"
        />
      )}
      <NavIcon name={item.icon} className="size-[21px]" />
      <span className="text-[10.5px] font-semibold">{item.label}</span>
    </Link>
  );
}

/** Small close button reused by sheets that render their own header. */
export function SheetCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="إغلاق"
      className="rounded-[var(--radius-sm)] p-2 text-tertiary transition-colors active:bg-sunken"
    >
      <X className="size-[18px]" />
    </button>
  );
}
