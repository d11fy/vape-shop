'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';

import { cn } from '@/lib/cn';
import { applyTheme, readThemeCookie, resolvedTheme, type Theme } from '@/ui/theme';

/**
 * Theme switch.
 *
 * The server already rendered the right colours from the cookie; this only
 * handles changing them. Reading the cookie happens in an effect so the markup
 * matches what the server sent and hydration stays quiet.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>('system');

  useEffect(() => {
    setTheme(readThemeCookie());
  }, []);

  const update = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
  };

  const options: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
    { value: 'light', label: 'فاتح', icon: Sun },
    { value: 'dark', label: 'داكن', icon: Moon },
    { value: 'system', label: 'النظام', icon: Monitor },
  ];

  if (compact) {
    const showing = resolvedTheme(theme);
    const next: Theme = showing === 'dark' ? 'light' : 'dark';
    const Icon = showing === 'dark' ? Sun : Moon;
    return (
      <button
        type="button"
        onClick={() => update(next)}
        aria-label={showing === 'dark' ? 'التبديل للوضع الفاتح' : 'التبديل للوضع الداكن'}
        className="flex size-9 items-center justify-center rounded-[var(--radius-sm)] text-secondary transition-colors hover:bg-sunken hover:text-primary"
      >
        <Icon className="size-[18px]" />
      </button>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="مظهر النظام"
      className="inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] border border-line-subtle bg-sunken p-0.5"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => update(option.value)}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded-[var(--radius-xs)] px-2.5 text-[12px] font-semibold transition-all',
              active ? 'bg-card text-primary shadow-xs' : 'text-secondary hover:text-primary',
            )}
          >
            <Icon className="size-3.5" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
