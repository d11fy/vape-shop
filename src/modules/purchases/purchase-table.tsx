'use client';

import { ClipboardList, Plus } from 'lucide-react';

import { Badge } from '@/ui/primitives/badge';
import { ButtonLink } from '@/ui/primitives/button';
import { DataTable, type Column } from '@/ui/data/data-table';
import { EmptyState } from '@/ui/feedback/empty-state';
import { useFormat } from '@/ui/format';
import type { PurchaseListRow } from '@/modules/suppliers/queries';

const STATUS = {
  DRAFT: { label: 'مسودة', tone: 'neutral' as const },
  RECEIVED: { label: 'مستلمة', tone: 'success' as const },
  PARTIALLY_RETURNED: { label: 'مرتجع جزئي', tone: 'warning' as const },
  RETURNED: { label: 'مرتجعة', tone: 'warning' as const },
  CANCELED: { label: 'ملغاة', tone: 'danger' as const },
};

export function PurchaseTable({
  rows,
  canCreate,
}: {
  rows: PurchaseListRow[];
  canCreate: boolean;
}) {
  const fmt = useFormat();

  const columns: Column<PurchaseListRow>[] = [
    {
      id: 'number',
      header: 'رقم الفاتورة',
      priority: 1,
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span className="num whitespace-nowrap font-bold">{row.number}</span>
          <Badge tone={STATUS[row.status]?.tone ?? 'neutral'} size="sm">
            {STATUS[row.status]?.label ?? row.status}
          </Badge>
        </span>
      ),
    },
    {
      id: 'supplier',
      header: 'المورد',
      priority: 1,
      cell: (row) => <span className="truncate text-primary">{row.supplierName}</span>,
    },
    {
      id: 'reference',
      header: 'مرجع المورد',
      priority: 3,
      cell: (row) =>
        row.reference ? (
          <span className="num text-secondary">{row.reference}</span>
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
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
      cell: (row) => <span className="num font-bold text-primary">{fmt.money(row.total)}</span>,
    },
    {
      id: 'due',
      header: 'المتبقي',
      align: 'end',
      priority: 2,
      cell: (row) =>
        row.dueTotal > 0 ? (
          <span className="num font-bold text-warning">{fmt.money(row.dueTotal)}</span>
        ) : (
          <span className="text-[12px] text-success">مسددة</span>
        ),
    },
    {
      id: 'date',
      header: 'التاريخ',
      sortKey: 'purchasedAt',
      align: 'end',
      priority: 2,
      cell: (row) => <span className="num text-secondary">{fmt.date(row.purchasedAt)}</span>,
    },
  ];

  return (
    <DataTable
      tableId="purchases"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      href={(row) => `/purchases/${row.id}`}
      empty={
        <EmptyState
          icon={<ClipboardList className="size-6" />}
          title="لا توجد فواتير شراء"
          description="سجّل مشترياتك من الموردين ليُحتسب متوسط التكلفة تلقائياً وتظهر أرباحك الحقيقية."
          action={
            canCreate ? (
              <ButtonLink href="/purchases/new" variant="accent" iconStart={<Plus className="size-4" />}>
                  فاتورة شراء جديدة
                </ButtonLink>
            ) : undefined
          }
        />
      }
    />
  );
}
