import { cn } from '@/lib/cn';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'solid';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-sunken text-secondary border-line',
  accent: 'bg-accent-soft text-accent-strong border-accent-border',
  success: 'bg-success-soft text-success border-success-border',
  warning: 'bg-warning-soft text-warning border-warning-border',
  danger: 'bg-danger-soft text-danger border-danger-border',
  info: 'bg-info-soft text-info border-info-border',
  solid: 'bg-ink text-on-inverse border-transparent',
};

export function Badge({
  tone = 'neutral',
  size = 'md',
  dot = false,
  className,
  children,
}: {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]',
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** A small count pill used on nav items and tabs. */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'num inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-bold text-white',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
