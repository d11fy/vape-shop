import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  /** `search` softens the copy for "no results" as opposed to "nothing yet". */
  variant?: 'default' | 'search' | 'compact';
  className?: string;
}

/**
 * Empty states carry real weight in a product like this: a new store sees them
 * before it sees anything else. Each one names the thing that is missing and
 * offers the single next step.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = 'default',
  className,
}: EmptyStateProps) {
  const compact = variant === 'compact';

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 px-6 py-14',
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            'relative flex items-center justify-center rounded-full',
            compact ? 'size-12' : 'size-16',
            variant === 'search' ? 'bg-sunken text-tertiary' : 'bg-accent-soft text-accent-strong',
          )}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      <div className="max-w-sm space-y-1.5">
        <h3 className={cn('font-bold text-primary text-balance', compact ? 'text-[14px]' : 'text-[15.5px]')}>
          {title}
        </h3>
        {description && (
          <p className="text-[13px] leading-relaxed text-secondary text-balance">{description}</p>
        )}
      </div>

      {(action || secondaryAction) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
