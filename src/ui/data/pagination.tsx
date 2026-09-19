'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/cn';
import { PER_PAGE_OPTIONS, useTableParams } from './use-table-params';

export interface PaginationProps {
  total: number;
  page: number;
  perPage: number;
  /** Singular noun for the counter — "فاتورة", "منتج". */
  unit?: string;
  className?: string;
  showPerPage?: boolean;
}

/**
 * Page navigation. Note the chevrons: in RTL, "next" points LEFT, so the icons
 * are intentionally swapped relative to an English UI.
 */
export function Pagination({
  total,
  page,
  perPage,
  unit = 'سجل',
  className,
  showPerPage = true,
}: PaginationProps) {
  const { setPage, setParams } = useTableParams();
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  if (total === 0) return null;

  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <p className="text-[12.5px] text-secondary">
        عرض <span className="num font-semibold text-primary">{from}</span>–
        <span className="num font-semibold text-primary">{to}</span> من{' '}
        <span className="num font-semibold text-primary">{total}</span> {unit}
      </p>

      <div className="flex items-center gap-2">
        {showPerPage && (
          <label className="hidden items-center gap-1.5 text-[12.5px] text-secondary sm:flex">
            لكل صفحة
            <select
              value={perPage}
              onChange={(event) => setParams({ per: event.target.value, page: null })}
              className="h-8 cursor-pointer rounded-[var(--radius-xs)] border border-line-strong bg-card px-2 text-[12.5px] text-primary focus:border-accent-strong focus:outline-none"
            >
              {PER_PAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        )}

        <nav className="flex items-center gap-1" aria-label="التنقل بين الصفحات">
          <PageButton
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            label="الصفحة السابقة"
          >
            <ChevronRight className="size-4" />
          </PageButton>

          {buildPageList(page, pageCount).map((entry, index) =>
            entry === 'gap' ? (
              <span key={`gap-${index}`} className="px-1 text-tertiary">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => setPage(entry)}
                aria-current={entry === page ? 'page' : undefined}
                className={cn(
                  'num h-8 min-w-8 rounded-[var(--radius-xs)] px-2 text-[12.5px] font-semibold transition-colors',
                  entry === page
                    ? 'bg-ink text-on-inverse'
                    : 'text-secondary hover:bg-sunken hover:text-primary',
                )}
              >
                {entry}
              </button>
            ),
          )}

          <PageButton
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
            label="الصفحة التالية"
          >
            <ChevronLeft className="size-4" />
          </PageButton>
        </nav>
      </div>
    </div>
  );
}

function PageButton({
  disabled,
  onClick,
  label,
  children,
}: {
  disabled: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-[var(--radius-xs)] text-secondary transition-colors hover:bg-sunken hover:text-primary disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** First, last, and a window around the current page, with ellipses between. */
function buildPageList(current: number, count: number): Array<number | 'gap'> {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1);

  const pages = new Set<number>([1, count, current]);
  for (let offset = 1; offset <= 1; offset += 1) {
    if (current - offset > 1) pages.add(current - offset);
    if (current + offset < count) pages.add(current + offset);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: Array<number | 'gap'> = [];
  let previous = 0;

  for (const page of sorted) {
    if (previous && page - previous > 1) result.push('gap');
    result.push(page);
    previous = page;
  }
  return result;
}
