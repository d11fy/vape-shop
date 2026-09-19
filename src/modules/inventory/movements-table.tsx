'use client';

import Link from 'next/link';
import { History } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Badge } from '@/ui/primitives/badge';
import { DataTable, type Column } from '@/ui/data/data-table';
import { EmptyState } from '@/ui/feedback/empty-state';
import { useFormat } from '@/ui/format';
import { MOVEMENT_LABEL } from './labels';
import type { MovementRow } from './queries';

const TONE_BADGE = {
  in: 'success' as const,
  out: 'danger' as const,
  neutral: 'neutral' as const,
};

/** Where a movement came from, as a link the user can actually follow. */
function referenceHref(row: MovementRow): string | null {
  if (!row.referenceId) return null;
  switch (row.referenceType) {
    case 'sale':
    case 'sale_cancel':
      return `/invoices/${row.referenceId}`;
    case 'purchase':
      return `/purchases/${row.referenceId}`;
    case 'adjustment':
      return `/inventory/adjustments/${row.referenceId}`;
    // Opening stock entered with a new product, or during store setup.
    case 'product':
    case 'onboarding':
      return `/products/${row.referenceId}`;
    default:
      return null;
  }
}

export function MovementsTable({ rows }: { rows: MovementRow[] }) {
  const fmt = useFormat();

  const columns: Column<MovementRow>[] = [
    {
      id: 'product',
      header: 'الصنف',
      priority: 1,
      cell: (row) => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-primary">{row.productName}</span>
          {row.variantName !== 'افتراضي' && (
            <span className="block truncate text-[11.5px] text-tertiary">{row.variantName}</span>
          )}
        </span>
      ),
    },
    {
      id: 'type',
      header: 'نوع الحركة',
      priority: 2,
      cell: (row) => {
        const meta = MOVEMENT_LABEL[row.type];
        return (
          <Badge tone={TONE_BADGE[meta?.tone ?? 'neutral']} size="sm">
            {meta?.label ?? row.type}
          </Badge>
        );
      },
    },
    {
      id: 'change',
      header: 'التغيير',
      align: 'end',
      priority: 1,
      cell: (row) => {
        const units = row.change / (row.factor || 1000);
        return (
          <span className={cn('num font-bold', row.change >= 0 ? 'text-success' : 'text-danger')}>
            {row.change > 0 ? '+' : ''}
            {units.toLocaleString('en-US', { maximumFractionDigits: 3 })}
            <span className="ms-1 text-[11px] font-normal text-tertiary">{row.unitLabel}</span>
          </span>
        );
      },
    },
    {
      id: 'after',
      header: 'الرصيد بعدها',
      align: 'end',
      priority: 2,
      cell: (row) => (
        <span className="num text-secondary">
          {(row.after / (row.factor || 1000)).toLocaleString('en-US', {
            maximumFractionDigits: 3,
          })}
        </span>
      ),
    },
    {
      id: 'reference',
      header: 'المرجع',
      priority: 3,
      cell: (row) => {
        const href = referenceHref(row);
        if (href) {
          return (
            <Link
              href={href}
              onClick={(event) => event.stopPropagation()}
              className="text-[12.5px] font-semibold text-accent-strong hover:underline"
            >
              عرض المستند
            </Link>
          );
        }
        return <span className="truncate text-[12.5px] text-tertiary">{row.reason ?? '—'}</span>;
      },
    },
    {
      id: 'user',
      header: 'المستخدم',
      priority: 3,
      cell: (row) => <span className="text-secondary">{row.userName}</span>,
    },
    {
      id: 'date',
      header: 'التاريخ',
      sortKey: 'occurredAt',
      align: 'end',
      priority: 2,
      cell: (row) => <span className="num text-secondary">{fmt.dateTime(row.occurredAt)}</span>,
    },
  ];

  return (
    <DataTable
      tableId="movements"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      density="compact"
      empty={
        <EmptyState
          icon={<History className="size-6" />}
          title="لا توجد حركات في هذه الفترة"
          description="تظهر هنا كل عمليات الشراء والبيع والمرتجعات والتسويات."
        />
      }
    />
  );
}
