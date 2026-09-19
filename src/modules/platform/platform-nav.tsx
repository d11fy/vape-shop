'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import { NavIcon } from '@/modules/shell/nav-icon';

export function PlatformNav({
  items,
}: {
  items: Array<{ href: string; label: string; icon: string; exact?: boolean }>;
}) {
  const pathname = usePathname();

  return (
    <nav className="no-scrollbar flex items-center gap-1 overflow-x-auto" aria-label="أقسام المنصة">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-3 py-1.5 text-[13px] font-semibold transition-colors',
              active ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white',
            )}
          >
            <NavIcon name={item.icon} className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
