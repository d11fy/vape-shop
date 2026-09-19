import { cn } from '@/lib/cn';

/**
 * The ڤيب شوب mark.
 *
 * A rounded ink tile holding a single rising wisp. It reads as a business mark,
 * not a vape-shop sign: the product being sold is store management, and the
 * logo sits next to accounting numbers all day.
 */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      className={cn('shrink-0', className)}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" fill="var(--brand-ink-strong)" />
      <path
        d="M14 28.5c0-4 5.2-4.4 5.2-8.1 0-2.2-1.9-3-1.9-5.1 0-1.9 1.5-3.4 3.6-3.4"
        stroke="var(--brand-accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M22.6 28.5c0-3.1 3.6-3.6 3.6-6.4"
        stroke="var(--brand-accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      <circle cx="26.4" cy="15.2" r="2" fill="var(--brand-accent)" />
    </svg>
  );
}

export function Wordmark({
  size = 'md',
  showLatin = true,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  showLatin?: boolean;
  className?: string;
}) {
  const logoSize = size === 'lg' ? 48 : size === 'md' ? 38 : 30;
  const titleClass =
    size === 'lg' ? 'text-[26px]' : size === 'md' ? 'text-[20px]' : 'text-[16px]';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Logo size={logoSize} />
      <div className="leading-none">
        <p className={cn('font-bold tracking-tight text-primary', titleClass)}>ڤيب شوب</p>
        {showLatin && (
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-tertiary">
            Vape Shop
          </p>
        )}
      </div>
    </div>
  );
}
