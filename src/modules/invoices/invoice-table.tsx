'use client';

import Link from 'next/link';
import { FileText, Receipt } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Badge } from '@/ui/primitives/badge';
import { ButtonLink } from '@/ui/primitives/button';
import { DataTable, type Column } from '@/ui/data/data-table';
import { EmptyState } from '@/ui/feedback/empty-state';
import { useFormat } from '@/ui/format';
import type { InvoiceListRow } from './queries';

const STATUS_LABEL: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  COMPLETED: { label: 'مكتملة', tone: 'success' },
  PARTIALLY_RETURNED: { label: 'مرتجع جزئي', tone: 'warning' },
  RETURNED: { label: 'مرتجعة', tone: 'warning' },
  CANCELED: { label: 'ملغاة', tone: 'danger' },
};

export function InvoiceTable({
  rows,
  showProfit,
  showCashier,
  canCreate,
}: {
  rows: InvoiceListRow[];
  showProfit: boolean;
  showCashier: boolean;
  canCreate: boolean;
}) {
  const fmt = useFormat();

  const columns: Column<InvoiceListRow>[] = [
    {
      id: 'number',
      header: 'رقم الفاتورة',
      sortKey: 'number',
      priority: 1,
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span className="num whitespace-nowrap font-bold">{row.number}</span>
          {row.status !== 'COMPLETED' && (
            <Badge tone={STATUS_LABEL[row.status]?.tone ?? 'neutral'} size="sm">
              {STATUS_LABEL[row.status]?.label ?? row.status}
            </Badge>
          )}
        </span>
      ),
    },
    {
      id: 'customer',
      header: 'العميل',
      priority: 2,
      cell: (row) =>
        row.customerName ? (
          <span className="truncate">{row.customerName}</span>
        ) : (
          <span className="text-tertiary">عميل نقدي</span>
        ),
    },
    {
      id: 'soldAt',
      header: 'التاريخ',
      sortKey: 'soldAt',
      priority: 2,
      cell: (row) => <span className="num text-secondary">{fmt.dateTime(row.soldAt)}</span>,
    },
    ...(showCashier
      ? [
          {
            id: 'cashier',
            header: 'الكاشير',
            priority: 3 as const,
            cell: (row: InvoiceListRow) => <span className="text-secondary">{row.cashierName}</span>,
          },
        ]
      : []),
    {
      id: 'items',
      header: 'الأصناف',
      align: 'center',
      priority: 3,
      cell: (row) => <span className="num text-secondary">{row.itemCount}</span>,
    },
    {
      id: 'total',
      header: 'الإجمالي',
      sortKey: 'total',
      align: 'end',
      priority: 1,
      cell: (row) => (
        <span className={cn('num font-bold', row.status === 'CANCELED' && 'text-tertiary line-through')}>
          {fmt.money(row.total)}
        </span>
      ),
    },
    {
      id: 'due',
      header: 'المتبقي',
      sortKey: 'dueTotal',
      align: 'end',
      priority: 2,
      mobileLabel: 'المتبقي',
      cell: (row) =>
        row.dueTotal > 0 ? (
          <span className="num font-bold text-warning">{fmt.money(row.dueTotal)}</span>
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    ...(showProfit
      ? [
          {
            id: 'profit',
            header: 'الربح',
            align: 'end' as const,
            priority: 3 as const,
            cell: (row: InvoiceListRow) => (
              <span
                className={cn('num font-semibold', row.profitTotal >= 0 ? 'text-success' : 'text-danger')}
              >
                {fmt.money(row.profitTotal)}
              </span>
            ),
          },
        ]
      : []),
  ];

  return (
    <DataTable
      tableId="invoices"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      href={(row) => `/invoices/${row.id}`}
      actions={(row) => (
        <Link
          href={`/invoices/${row.id}/print`}
          target="_blank"
          rel="noopener"
          onClick={(event) => event.stopPropagation()}
          aria-label={`طباعة الفاتورة ${row.number}`}
          className="inline-flex size-8 items-center justify-center rounded-[var(--radius-xs)] text-tertiary transition-colors hover:bg-sunken hover:text-primary"
        >
          <Receipt className="size-4" />
        </Link>
      )}
      empty={
        <EmptyState
          icon={<FileText className="size-6" />}
          title="لا توجد فواتير"
          description="ستظهر هنا كل الفواتير المسجلة مع إمكانية البحث والتصفية والطباعة."
          action={
            canCreate ? (
              <ButtonLink href="/pos" variant="accent">بدء عملية بيع</ButtonLink>
            ) : undefined
          }
        />
      }
    />
  );
}
