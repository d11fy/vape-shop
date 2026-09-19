'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Check } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button } from '@/ui/primitives/button';
import { Dropdown } from '@/ui/overlays/dropdown';
import { TableSkeleton } from '@/ui/primitives/skeleton';
import { useTableParams } from './use-table-params';

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Enables the sort control; the value goes into `?sort=`. */
  sortKey?: string;
  align?: 'start' | 'center' | 'end';
  width?: string;
  /**
   * 1 — the identity of the row: card title on mobile, always visible.
   * 2 — supporting detail: shown as a labelled line on the mobile card.
   * 3 — desktop only.
   */
  priority?: 1 | 2 | 3;
  /** Label used on the mobile card when it differs from the header. */
  mobileLabel?: string;
  className?: string;
  hideable?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Makes the whole row a link. Takes precedence over `onRowClick`. */
  href?: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Trailing per-row controls, pinned to the end of the row. */
  actions?: (row: T) => React.ReactNode;
  empty: React.ReactNode;
  loading?: boolean;
  /** Persist hidden columns under this key. Omit to disable the column menu. */
  tableId?: string;
  density?: 'comfortable' | 'compact';
  stickyHeader?: boolean;
  /** Extra row rendered under the body — totals, for example. */
  summary?: React.ReactNode;
  className?: string;
}

const ALIGN: Record<NonNullable<Column<unknown>['align']>, string> = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
};

/**
 * A table on the desktop, a list of cards on a phone.
 *
 * Rather than letting a wide table scroll sideways on a 375px screen — which
 * nobody can read — each row collapses into a card whose title is the
 * priority-1 column and whose body is a labelled list of the rest.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  href,
  onRowClick,
  actions,
  empty,
  loading = false,
  tableId,
  density = 'comfortable',
  stickyHeader = false,
  summary,
  className,
}: DataTableProps<T>) {
  const { sort, dir, toggleSort, isPending } = useTableParams();
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    if (!tableId) return;
    try {
      const stored = localStorage.getItem(`vs-cols-${tableId}`);
      if (stored) setHidden(JSON.parse(stored) as string[]);
    } catch {
      // Private mode or corrupted value — fall back to showing everything.
    }
  }, [tableId]);

  const toggleColumn = (id: string) => {
    setHidden((current) => {
      const next = current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id];
      if (tableId) {
        try {
          localStorage.setItem(`vs-cols-${tableId}`, JSON.stringify(next));
        } catch {
          // Ignore — hiding a column is a convenience, not state we must keep.
        }
      }
      return next;
    });
  };

  const visible = useMemo(
    () => columns.filter((column) => !hidden.includes(column.id)),
    [columns, hidden],
  );

  const cellPadding = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';
  const titleColumn = visible.find((column) => (column.priority ?? 3) === 1) ?? visible[0];
  const detailColumns = visible.filter(
    (column) => column !== titleColumn && (column.priority ?? 3) <= 2,
  );

  if (loading) return <TableSkeleton columns={Math.min(visible.length, 6)} />;

  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-line-subtle bg-card">{empty}</div>
    );
  }

  return (
    <div className={cn('relative', isPending && 'opacity-60 transition-opacity', className)}>
      {tableId && columns.some((column) => column.hideable !== false) && (
        <div className="mb-2 hidden justify-end sm:flex">
          <Dropdown
            align="end"
            width="w-56"
            trigger={(triggerProps) => (
              <Button
                {...triggerProps}
                variant="ghost"
                size="sm"
                iconStart={<Columns3 className="size-4" />}
              >
                الأعمدة
              </Button>
            )}
          >
            {() => (
              <div className="max-h-72 overflow-y-auto">
                {columns
                  .filter((column) => column.hideable !== false)
                  .map((column) => {
                    const isVisible = !hidden.includes(column.id);
                    return (
                      <button
                        key={column.id}
                        type="button"
                        onClick={() => toggleColumn(column.id)}
                        className="flex w-full items-center gap-2.5 rounded-[var(--radius-xs)] px-2.5 py-2 text-[13px] text-primary transition-colors hover:bg-sunken"
                      >
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded border',
                            isVisible
                              ? 'border-accent-strong bg-accent-strong text-white'
                              : 'border-line-strong',
                          )}
                        >
                          {isVisible && <Check className="size-3" strokeWidth={3} />}
                        </span>
                        <span className="truncate text-start">{column.header}</span>
                      </button>
                    );
                  })}
              </div>
            )}
          </Dropdown>
        </div>
      )}

      {/* ── Desktop table ─────────────────────────────────────────────── */}
      <div className="hidden overflow-hidden rounded-[var(--radius-md)] border border-line-subtle bg-card sm:block">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead
              className={cn(
                'bg-sunken/60 text-secondary',
                stickyHeader && 'sticky top-0 z-10 backdrop-blur',
              )}
            >
              <tr>
                {visible.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    className={cn(
                      'border-b border-line-subtle font-semibold',
                      cellPadding,
                      ALIGN[column.align ?? 'start'],
                      column.className,
                    )}
                  >
                    {column.sortKey ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.sortKey!)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-[var(--radius-xs)] transition-colors hover:text-primary',
                          sort === column.sortKey && 'text-primary',
                        )}
                      >
                        {column.header}
                        {sort === column.sortKey ? (
                          dir === 'asc' ? (
                            <ArrowUp className="size-3.5" />
                          ) : (
                            <ArrowDown className="size-3.5" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-40" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
                {actions && <th scope="col" className={cn('border-b border-line-subtle', cellPadding)} />}
              </tr>
            </thead>

            <tbody>
              {rows.map((row) => {
                const key = rowKey(row);
                const interactive = Boolean(href || onRowClick);
                return (
                  <tr
                    key={key}
                    onClick={onRowClick && !href ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-line-subtle last:border-b-0 transition-colors',
                      interactive && 'cursor-pointer hover:bg-sunken/50',
                    )}
                  >
                    {visible.map((column, index) => {
                      const content = column.cell(row);
                      return (
                        <td
                          key={column.id}
                          className={cn(
                            'align-middle text-primary',
                            cellPadding,
                            ALIGN[column.align ?? 'start'],
                            column.className,
                          )}
                        >
                          {href && index === 0 ? (
                            <Link href={href(row)} className="block hover:text-accent-strong">
                              {content}
                            </Link>
                          ) : href ? (
                            // Clickable for the mouse; only the first cell is a
                            // tab stop, so a keyboard user gets one per row.
                            <Link href={href(row)} className="block" tabIndex={-1}>
                              {content}
                            </Link>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                    {actions && (
                      <td className={cn('w-px whitespace-nowrap text-end', cellPadding)}>
                        {actions(row)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>

            {summary && (
              <tfoot className="bg-sunken/60 font-semibold text-primary">
                <tr>
                  <td colSpan={visible.length + (actions ? 1 : 0)} className={cellPadding}>
                    {summary}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ── Mobile cards ──────────────────────────────────────────────── */}
      <div className="space-y-2 sm:hidden">
        {rows.map((row) => {
          const key = rowKey(row);
          const body = (
            <>
              <div className="text-[14px] font-semibold text-primary">{titleColumn?.cell(row)}</div>

              {detailColumns.length > 0 && (
                <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line-subtle pt-2.5">
                  {detailColumns.map((column) => (
                    <div key={column.id} className="min-w-0">
                      <dt className="text-[11px] text-tertiary">
                        {column.mobileLabel ?? column.header}
                      </dt>
                      <dd className="mt-0.5 truncate text-[13px] text-primary">
                        {column.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          );

          // The row's own actions (print, collect…) sit BESIDE the link, never
          // inside it: a link or button nested in a link is invalid HTML, breaks
          // hydration, and makes one tap trigger two things.
          const main = href ? (
            <Link href={href(row)} className="block min-w-0 flex-1">
              {body}
            </Link>
          ) : onRowClick ? (
            <button
              type="button"
              onClick={() => onRowClick(row)}
              className="block min-w-0 flex-1 text-start"
            >
              {body}
            </button>
          ) : (
            <div className="min-w-0 flex-1">{body}</div>
          );

          return (
            <div
              key={key}
              className={cn(
                'flex items-start gap-3 rounded-[var(--radius-md)] border border-line-subtle bg-card p-3.5 shadow-xs',
                (href || onRowClick) && 'transition-colors active:bg-sunken',
              )}
            >
              {main}
              {actions && <div className="shrink-0">{actions(row)}</div>}
            </div>
          );
        })}

        {summary && (
          <div className="rounded-[var(--radius-md)] border border-line-subtle bg-sunken p-3.5 text-[13px] font-semibold text-primary">
            {summary}
          </div>
        )}
      </div>
    </div>
  );
}
