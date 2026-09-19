'use client';

import { useState } from 'react';
import { Banknote, Phone, Plus, Truck } from 'lucide-react';

import { ButtonLink } from '@/ui/primitives/button';
import { DataTable, type Column } from '@/ui/data/data-table';
import { EmptyState } from '@/ui/feedback/empty-state';
import { useFormat } from '@/ui/format';
import { PaySupplierDialog } from './pay-dialog';
import type { SupplierListRow } from './queries';

export function SupplierTable({
  rows,
  canCreate,
  canPay,
}: {
  rows: SupplierListRow[];
  canCreate: boolean;
  canPay: boolean;
}) {
  const fmt = useFormat();
  const [target, setTarget] = useState<{ id: string; name: string; balance: number } | null>(null);

  const columns: Column<SupplierListRow>[] = [
    {
      id: 'name',
      header: 'المورد',
      sortKey: 'name',
      priority: 1,
      cell: (row) => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-primary">{row.name}</span>
          <span className="flex items-center gap-2 text-[11.5px] text-tertiary">
            {row.company && <span className="truncate">{row.company}</span>}
            {row.phone && (
              <span className="num flex items-center gap-1">
                <Phone className="size-3" aria-hidden="true" />
                {row.phone}
              </span>
            )}
          </span>
        </span>
      ),
    },
    {
      id: 'balance',
      header: 'المستحق له',
      sortKey: 'balance',
      align: 'end',
      priority: 1,
      cell: (row) =>
        row.balance > 0 ? (
          <span className="num font-bold text-warning">{fmt.money(row.balance)}</span>
        ) : (
          <span className="text-[12px] text-success">مسدد</span>
        ),
    },
    {
      id: 'purchases',
      header: 'إجمالي المشتريات',
      align: 'end',
      priority: 2,
      cell: (row) => <span className="num text-secondary">{fmt.money(row.totalPurchases)}</span>,
    },
    {
      id: 'paid',
      header: 'إجمالي المدفوع',
      align: 'end',
      priority: 3,
      cell: (row) => <span className="num text-secondary">{fmt.money(row.totalPaid)}</span>,
    },
    {
      id: 'count',
      header: 'الفواتير',
      align: 'center',
      priority: 3,
      cell: (row) => <span className="num text-secondary">{row.purchaseCount}</span>,
    },
    {
      id: 'last',
      header: 'آخر شراء',
      align: 'end',
      priority: 2,
      cell: (row) =>
        row.lastPurchaseAt ? (
          <span className="num text-secondary">{fmt.date(row.lastPurchaseAt)}</span>
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
  ];

  return (
    <>
      <DataTable
        tableId="suppliers"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        href={(row) => `/suppliers/${row.id}`}
        actions={
          canPay
            ? (row) =>
                row.balance > 0 ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setTarget({ id: row.id, name: row.name, balance: row.balance });
                    }}
                    className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-xs)] bg-accent-soft px-2.5 text-[12px] font-bold text-accent-strong transition-colors hover:bg-accent-border"
                  >
                    <Banknote className="size-3.5" />
                    سداد
                  </button>
                ) : null
            : undefined
        }
        empty={
          <EmptyState
            icon={<Truck className="size-6" />}
            title="لم تضف موردين بعد"
            description="سجّل موردينك لتتابع مشترياتك منهم والمبالغ المستحقة لهم."
            action={
              canCreate ? (
                <ButtonLink href="/suppliers/new" variant="accent" iconStart={<Plus className="size-4" />}>
                    إضافة مورد
                  </ButtonLink>
              ) : undefined
            }
          />
        }
      />

      <PaySupplierDialog
        open={target !== null}
        supplier={target}
        onClose={() => setTarget(null)}
      />
    </>
  );
}
