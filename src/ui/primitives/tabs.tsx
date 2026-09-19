'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';

export interface TabItem {
  href: string;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  /** Match only the exact path rather than any descendant. */
  exact?: boolean;
}

/** Route-driven tabs — each tab is a real link, so back/forward work. */
export function LinkTabs({ items, className }: { items: TabItem[]; className?: string }) {
  const pathname = usePathname();

  return (
    <div
      role="tablist"
      className={cn(
        'no-scrollbar -mx-4 flex gap-1 overflow-x-auto border-b border-line-subtle px-4 sm:mx-0 sm:px-0',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            role="tab"
            aria-selected={active}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 pb-2.5 pt-2 text-[13.5px] font-semibold transition-colors',
              active ? 'text-primary' : 'text-secondary hover:text-primary',
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span className="num rounded-full bg-sunken px-1.5 py-0.5 text-[11px] text-secondary">
                {item.count}
              </span>
            )}
            {active && (
              <span
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent-strong"
                aria-hidden="true"
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

/**
 * A compact either/or switch. Used for view modes and short filter sets where
 * a dropdown would be one tap too many.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] border border-line-subtle bg-sunken p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-[var(--radius-xs)] font-semibold transition-all',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-9 px-3 text-[13px]',
              active
                ? 'bg-card text-primary shadow-xs'
                : 'text-secondary hover:text-primary',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Horizontally scrolling filter chips — the POS category row uses these. */
export function ChipBar<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: Array<{ value: T; label: string; color?: string | null; count?: number }>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('no-scrollbar flex gap-2 overflow-x-auto', className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
              active
                ? 'border-ink bg-ink text-on-inverse'
                : 'border-line bg-card text-secondary hover:border-line-strong hover:text-primary',
            )}
          >
            {option.color && !active && (
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: option.color }}
                aria-hidden="true"
              />
            )}
            {option.label}
            {option.count !== undefined && (
              <span className={cn('num text-[11px]', active ? 'opacity-70' : 'text-tertiary')}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
