import { cn } from '@/lib/cn';

export function Card({
  className,
  padded = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-md)] border border-line-subtle bg-card shadow-xs',
        padded && 'p-4 sm:p-5',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && (
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-sunken text-secondary">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-bold text-primary">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-secondary">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mt-4 flex items-center justify-end gap-2 border-t border-line-subtle pt-4',
        className,
      )}
      {...props}
    />
  );
}

/** A quiet divider used inside cards and list rows. */
export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-line-subtle', className)} />;
}
