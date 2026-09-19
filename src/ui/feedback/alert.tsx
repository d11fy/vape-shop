import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

import { cn } from '@/lib/cn';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<AlertTone, { wrapper: string; icon: typeof Info; iconColor: string }> = {
  info: {
    wrapper: 'bg-info-soft border-info-border',
    icon: Info,
    iconColor: 'text-info',
  },
  success: {
    wrapper: 'bg-success-soft border-success-border',
    icon: CheckCircle2,
    iconColor: 'text-success',
  },
  warning: {
    wrapper: 'bg-warning-soft border-warning-border',
    icon: AlertTriangle,
    iconColor: 'text-warning',
  },
  danger: {
    wrapper: 'bg-danger-soft border-danger-border',
    icon: XCircle,
    iconColor: 'text-danger',
  },
};

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  compact = false,
  className,
}: {
  tone?: AlertTone;
  title?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  const { wrapper, icon: Icon, iconColor } = TONES[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-md)] border',
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5',
        wrapper,
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-[18px] shrink-0', iconColor)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="text-[13.5px] font-bold text-primary">{title}</p>}
        {children && (
          <div className={cn('text-[12.5px] leading-relaxed text-secondary', title && 'mt-1')}>
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
