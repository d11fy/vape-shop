'use client';

import { forwardRef } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/cn';

export type ButtonVariant =
  | 'primary'
  | 'accent'
  | 'outline'
  | 'ghost'
  | 'soft'
  | 'danger'
  | 'danger-ghost'
  | 'link';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm' | 'icon-lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-on-inverse shadow-xs hover:bg-ink-strong active:bg-ink-strong ' +
    'disabled:bg-line-strong disabled:text-tertiary',
  accent:
    'bg-accent-strong text-white shadow-xs hover:bg-[color-mix(in_srgb,var(--brand-accent-strong)_88%,black)] ' +
    'active:bg-[color-mix(in_srgb,var(--brand-accent-strong)_80%,black)] disabled:bg-line-strong disabled:text-tertiary',
  outline:
    'border border-line-strong bg-card text-primary shadow-xs hover:bg-sunken hover:border-line-strong ' +
    'active:bg-sunken disabled:text-tertiary',
  ghost: 'text-secondary hover:bg-sunken hover:text-primary active:bg-sunken disabled:text-tertiary',
  soft: 'bg-accent-soft text-accent-strong border border-accent-border hover:bg-[color-mix(in_srgb,var(--brand-accent-soft)_80%,var(--brand-accent))]',
  danger:
    'bg-danger text-white shadow-xs hover:bg-[color-mix(in_srgb,var(--status-danger)_88%,black)] ' +
    'active:bg-[color-mix(in_srgb,var(--status-danger)_80%,black)] disabled:bg-line-strong disabled:text-tertiary',
  'danger-ghost': 'text-danger hover:bg-danger-soft active:bg-danger-soft',
  link: 'text-accent-strong underline-offset-4 hover:underline p-0 h-auto',
};

const SIZES: Record<ButtonSize, string> = {
  xs: 'h-8 px-2.5 text-[12px] gap-1.5 rounded-[var(--radius-xs)]',
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-[var(--radius-sm)]',
  md: 'h-11 px-4 text-[14px] gap-2 rounded-[var(--radius-sm)]',
  lg: 'h-13 px-6 text-[15px] gap-2.5 rounded-[var(--radius-md)]',
  icon: 'h-11 w-11 rounded-[var(--radius-sm)]',
  'icon-sm': 'h-9 w-9 rounded-[var(--radius-xs)]',
  'icon-lg': 'h-12 w-12 rounded-[var(--radius-md)]',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Stretch to the container width — the default on mobile forms. */
  block?: boolean;
  iconStart?: React.ReactNode;
  iconEnd?: React.ReactNode;
}

/** The button look, for elements that must not be a `<button>` (see ButtonLink). */
export function buttonClasses({
  variant = 'outline',
  size = 'md',
  block = false,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
}): string {
  return cn(
    'relative inline-flex select-none items-center justify-center font-semibold',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
    'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-60',
    'focus-visible:outline-none focus-visible:ring-0',
    'focus-visible:shadow-[var(--ring-accent)]',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
    className,
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'outline',
    size = 'md',
    loading = false,
    block = false,
    iconStart,
    iconEnd,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, block, className })}
      {...props}
    >
      {loading && (
        <Loader2 className="size-4 shrink-0 animate-spin-slow" aria-hidden="true" />
      )}
      {!loading && iconStart}
      {children}
      {!loading && iconEnd}
    </button>
  );
});

export interface ButtonLinkProps
  extends Omit<React.ComponentProps<typeof Link>, 'className' | 'children'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  iconStart?: React.ReactNode;
  iconEnd?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Navigation that looks like a button. A `<button>` nested in an `<a>` is
 * invalid HTML: keyboard users tab onto it twice and screen readers announce
 * two controls. This is one real link with the button's styling.
 */
export function ButtonLink({
  variant = 'outline',
  size = 'md',
  block = false,
  iconStart,
  iconEnd,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonClasses({ variant, size, block, className })} {...props}>
      {iconStart}
      {children}
      {iconEnd}
    </Link>
  );
}
