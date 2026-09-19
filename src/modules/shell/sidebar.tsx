'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Logo } from '@/ui/brand/logo';
import { isActivePath, type NavSection } from './navigation';
import { NavIcon } from './nav-icon';

export interface SidebarProps {
  sections: NavSection[];
  storeName: string;
  planName: string;
  footer?: React.ReactNode;
}

const COLLAPSE_KEY = 'vs-sidebar-collapsed';

/**
 * Desktop navigation rail. Sits on the right because the interface is RTL —
 * the reading-start edge is where the eye expects the primary structure.
 */
export function Sidebar({ sections, storeName, planName, footer }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // No storage — stay expanded.
    }
  }, []);

  const toggle = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Ignore.
      }
      return next;
    });
  };

  return (
    <aside
      className={cn(
        'fixed inset-y-0 end-0 z-30 hidden flex-col border-s border-line-subtle bg-card lg:flex',
        'transition-[width] duration-200',
      )}
      style={{ width: collapsed ? 'var(--sidebar-width-collapsed)' : 'var(--sidebar-width)' }}
    >
      <div
        className={cn(
          'flex h-[var(--header-height)] shrink-0 items-center border-b border-line-subtle',
          collapsed ? 'justify-center px-2' : 'justify-between px-4',
        )}
      >
        <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
          <Logo size={collapsed ? 30 : 28} />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold leading-tight text-primary">
                ڤيب شوب
              </span>
              <span className="block truncate text-[11px] leading-tight text-tertiary">
                {storeName}
              </span>
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            type="button"
            onClick={toggle}
            aria-label="طي القائمة"
            className="-me-1.5 rounded-[var(--radius-xs)] p-1.5 text-tertiary transition-colors hover:bg-sunken hover:text-primary"
          >
            <PanelRightClose className="size-[18px]" />
          </button>
        )}
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-2.5 py-3" aria-label="القائمة الرئيسية">
        {collapsed && (
          <button
            type="button"
            onClick={toggle}
            aria-label="توسيع القائمة"
            className="mb-2 flex w-full items-center justify-center rounded-[var(--radius-sm)] p-2 text-tertiary transition-colors hover:bg-sunken hover:text-primary"
          >
            <PanelRightOpen className="size-[18px]" />
          </button>
        )}

        {sections.map((section) => (
          <div key={section.key} className="mb-1">
            {section.label && !collapsed && (
              <p className="px-2.5 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-wider text-tertiary">
                {section.label}
              </p>
            )}
            {section.label && collapsed && <div className="my-2 h-px bg-line-subtle" />}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActivePath(pathname, item);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex items-center rounded-[var(--radius-sm)] text-[13.5px] font-medium transition-colors',
                        collapsed ? 'justify-center p-2.5' : 'gap-3 px-2.5 py-2.5',
                        active
                          ? 'bg-ink text-on-inverse'
                          : 'text-secondary hover:bg-sunken hover:text-primary',
                      )}
                    >
                      <NavIcon
                        name={item.icon}
                        className={cn('size-[18px] shrink-0', active && 'text-accent')}
                      />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('shrink-0 border-t border-line-subtle', collapsed ? 'p-2' : 'p-3')}>
        {!collapsed && (
          <div className="mb-2 rounded-[var(--radius-sm)] bg-sunken px-3 py-2">
            <p className="text-[10.5px] text-tertiary">خطة الاشتراك</p>
            <p className="truncate text-[12.5px] font-bold text-primary">{planName}</p>
          </div>
        )}
        {footer}
      </div>
    </aside>
  );
}
