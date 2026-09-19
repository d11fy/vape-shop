'use client';

import { Phone, Plus, Users } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Badge } from '@/ui/primitives/badge';
import { ButtonLink } from '@/ui/primitives/button';
import { DataTable, type Column } from '@/ui/data/data-table';
import { EmptyState } from '@/ui/feedback/empty-state';
import { useFormat } from '@/ui/format';
import type { CustomerListRow } from './queries';

export function CustomerTable({
  rows,
  canCreate,
  searching,
  showDebtAge,
}: {
  rows: CustomerListRow[];
  canCreate: boolean;
  searching: boolean;
  showDebtAge?: boolean;
}) {
  const fmt = useFormat();

  const columns: Column<CustomerListRow>[] = [
    {
      id: 'name',
      header: 'العميل',
      sortKey: 'name',
      priority: 1,
      cell: (row) => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-primary">{row.name}</span>
          {row.phone && (
            <span className="num flex items-center gap-1 text-[11.5px] text-tertiary">
              <Phone className="size-3" aria-hidden="true" />
              {row.phone}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'balance',
      header: 'الرصيد',
      sortKey: 'balance',
      align: 'end',
      priority: 1,
      cell: (row) => {
        if (row.balance === 0) return <span className="text-tertiary">—</span>;
        const owes = row.balance > 0;
        return (
          <span className="flex flex-col items-end">
            <span className={cn('num font-bold', owes ? 'text-warning' : 'text-success')}>
              {fmt.money(Math.abs(row.balance))}
            </span>
            <span className="text-[11px] text-tertiary">{owes ? 'عليه' : 'له'}</span>
          </span>
        );
      },
    },
    ...(showDebtAge
      ? [
          {
            id: 'age',
            header: 'عمر الدين',
            align: 'center' as const,
            priority: 2 as const,
            cell: (row: CustomerListRow) => {
              if (row.balance <= 0 || row.debtAgeDays === 0) {
                return <span className="text-tertiary">—</span>;
              }
              const tone =
                row.debtAgeDays >= 60 ? 'danger' : row.debtAgeDays >= 30 ? 'warning' : 'neutral';
              return (
                <Badge tone={tone} size="sm">
                  {fmt.number(row.debtAgeDays)} يوم
                </Badge>
              );
            },
          },
        ]
      : []),
    {
      id: 'purchases',
      header: 'إجمالي المشتريات',
      align: 'end',
      priority: 2,
      cell: (row) => <span className="num text-secondary">{fmt.money(row.totalPurchases)}</span>,
    },
    {
      id: 'invoices',
      header: 'الفواتير',
      align: 'center',
      priority: 3,
      cell: (row) => <span className="num text-secondary">{row.invoiceCount}</span>,
    },
    {
      id: 'lastPurchase',
      header: 'آخر شراء',
      align: 'end',
      priority: 3,
      cell: (row) =>
        row.lastPurchaseAt ? (
          <span className="num text-secondary">{fmt.date(row.lastPurchaseAt)}</span>
        ) : (
          <span className="text-tertiary">لم يشترِ بعد</span>
        ),
    },
    {
      id: 'lastPayment',
      header: 'آخر دفعة',
      align: 'end',
      priority: 3,
      cell: (row) =>
        row.lastPaymentAt ? (
          <span className="num text-secondary">{fmt.date(row.lastPaymentAt)}</span>
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
  ];

  return (
    <DataTable
      tableId="customers"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      href={(row) => `/customers/${row.id}`}
      empty={
        <EmptyState
          icon={<Users className="size-6" />}
          variant={searching ? 'search' : 'default'}
          title={searching ? 'لا يوجد عملاء مطابقون' : 'لم تضف عملاء بعد'}
          description={
            searching
              ? 'جرّب اسماً أقصر أو ابحث برقم الهاتف.'
              : 'سجّل عملاءك لتتابع مشترياتهم وديونهم، ويمكنك إضافتهم مباشرة من شاشة البيع.'
          }
          action={
            canCreate && !searching ? (
              <ButtonLink href="/customers/new" variant="accent" iconStart={<Plus className="size-4" />}>
                  إضافة عميل
                </ButtonLink>
            ) : undefined
          }
        />
      }
    />
  );
}
