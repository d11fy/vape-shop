import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface StatCardProps {
  label: string;
  value: string;
  /** Small caption under the value — "12 فاتورة", "آخر تحديث الآن". */
  hint?: string;
  icon?: React.ReactNode;
  /** Percentage change vs. the comparison period; `null` hides the chip. */
  delta?: number | null;
  /** For costs, a rise is bad — flips the delta colours. */
  invertDelta?: boolean;
  deltaLabel?: string;
  tone?: 'default' | 'accent' | 'danger' | 'warning' | 'success';
  href?: string;
  className?: string;
  children?: React.ReactNode;
}

const TONE_ICON: Record<NonNullable<StatCardProps['tone']>, string> = {
  default: 'bg-sunken text-secondary',
  accent: 'bg-accent-soft text-accent-strong',
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  success: 'bg-success-soft text-success',
};

/**
 * The dashboard's atom: one number, its label, and how it compares to the
 * previous period. Deliberately restrained — colour is reserved for the delta
 * chip so a wall of tiles still reads as one calm surface.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  delta,
  invertDelta = false,
  deltaLabel,
  tone = 'default',
  href,
  className,
  children,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] font-medium text-secondary">{label}</p>
        {icon && (
          <span
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)]',
              TONE_ICON[tone],
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        )}
      </div>

      <p className="num mt-2.5 text-[22px] font-bold leading-none tracking-tight text-primary sm:text-[25px]">
        {value}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta !== null && delta !== undefined && <DeltaChip value={delta} invert={invertDelta} />}
        {(deltaLabel || hint) && (
          <span className="text-[11.5px] text-tertiary">{deltaLabel ?? hint}</span>
        )}
      </div>

      {children && <div className="mt-3">{children}</div>}
    </>
  );

  const classes = cn(
    'group rounded-[var(--radius-md)] border border-line-subtle bg-card p-4 shadow-xs transition-shadow',
    href && 'hover:border-line hover:shadow-sm',
    className,
  );

  if (href) {
    return (
      <Link href={href} className={cn(classes, 'block')}>
        {body}
      </Link>
    );
  }

  return <div className={classes}>{body}</div>;
}

export function DeltaChip({ value, invert = false }: { value: number; invert?: boolean }) {
  const rounded = Math.round(value * 10) / 10;
  const neutral = Math.abs(rounded) < 0.1;
  const positive = rounded > 0;
  const good = invert ? !positive : positive;

  const Icon = neutral ? Minus : positive ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'num inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11.5px] font-bold',
        neutral
          ? 'bg-sunken text-secondary'
          : good
            ? 'bg-success-soft text-success'
            : 'bg-danger-soft text-danger',
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {neutral ? '0%' : `${Math.abs(rounded)}%`}
    </span>
  );
}

/** Percentage change, guarding the divide-by-zero case sensibly. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
