import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface Breadcrumb {
  label: string;
  href?: string;
}

/**
 * The top of every screen: what you are looking at, where it sits, and the one
 * or two actions that belong to it. Actions wrap below the title on a phone so
 * a long Arabic heading never squeezes the button.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  backHref,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: Breadcrumb[];
  backHref?: string;
  className?: string;
}) {
  return (
    <div className={cn('mb-5', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="مسار التنقل" className="mb-2 flex flex-wrap items-center gap-1 text-[12px]">
          {breadcrumbs.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronLeft className="size-3 text-tertiary" aria-hidden="true" />}
              {crumb.href ? (
                <Link href={crumb.href} className="text-secondary transition-colors hover:text-primary">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-tertiary">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          {backHref && (
            <Link
              href={backHref}
              aria-label="رجوع"
              className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-line-subtle bg-card text-secondary transition-colors hover:text-primary"
            >
              <ChevronLeft className="size-4 rotate-180" />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold tracking-tight text-primary sm:text-[23px]">
              {title}
            </h1>
            {description && (
              <p className="mt-1 text-[13px] leading-relaxed text-secondary">{description}</p>
            )}
          </div>
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Groups a screen's sections with consistent vertical rhythm. */
export function PageSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('mb-6', className)}>
      {(title || action) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-bold text-primary">{title}</h2>}
            {description && <p className="mt-0.5 text-[12.5px] text-secondary">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
