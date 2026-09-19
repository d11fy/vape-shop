'use client';

import { Package, Plus } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Badge } from '@/ui/primitives/badge';
import { ButtonLink } from '@/ui/primitives/button';
import { DataTable, type Column } from '@/ui/data/data-table';
import { EmptyState } from '@/ui/feedback/empty-state';
import { useFormat } from '@/ui/format';
import type { ProductListRow } from './queries';

export function ProductTable({
  rows,
  showCost,
  canCreate,
  searching,
}: {
  rows: ProductListRow[];
  showCost: boolean;
  canCreate: boolean;
  searching: boolean;
}) {
  const fmt = useFormat();

  const columns: Column<ProductListRow>[] = [
    {
      id: 'name',
      header: 'المنتج',
      sortKey: 'name',
      priority: 1,
      cell: (row) => (
        <span className="flex items-center gap-2.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: row.categoryColor ?? 'var(--border-strong)' }}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block truncate font-semibold text-primary">{row.name}</span>
            <span className="block truncate text-[11.5px] text-tertiary">
              {[row.brandName, row.categoryName].filter(Boolean).join(' · ') || 'بدون تصنيف'}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'variants',
      header: 'الأصناف',
      align: 'center',
      priority: 3,
      cell: (row) => <span className="num text-secondary">{row.variantCount}</span>,
    },
    {
      id: 'price',
      header: 'سعر البيع',
      align: 'end',
      priority: 2,
      cell: (row) => (
        <span className="num font-semibold text-primary">
          {row.priceFrom === row.priceTo
            ? fmt.money(row.priceFrom)
            : `${fmt.money(row.priceFrom)} – ${fmt.money(row.priceTo)}`}
        </span>
      ),
    },
    {
      id: 'stock',
      header: 'المخزون',
      align: 'end',
      priority: 2,
      cell: (row) => {
        if (!row.trackInventory) return <span className="text-tertiary">غير متتبَّع</span>;
        const units = row.stock / (row.factor || 1000);
        return (
          <span className="flex items-center justify-end gap-2">
            <span
              className={cn(
                'num font-semibold',
                row.outOfStock ? 'text-danger' : row.lowStock ? 'text-warning' : 'text-primary',
              )}
            >
              {units.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </span>
            <span className="text-[11.5px] text-tertiary">{row.unitLabel}</span>
          </span>
        );
      },
    },
    ...(showCost
      ? [
          {
            id: 'value',
            header: 'قيمة المخزون',
            align: 'end' as const,
            priority: 3 as const,
            cell: (row: ProductListRow) => (
              <span className="num text-secondary">{fmt.money(row.stockValue)}</span>
            ),
          },
        ]
      : []),
    {
      id: 'status',
      header: 'الحالة',
      align: 'center',
      priority: 2,
      cell: (row) => {
        if (row.status === 'ARCHIVED') {
          return (
            <Badge tone="neutral" size="sm">
              مؤرشف
            </Badge>
          );
        }
        if (!row.trackInventory) {
          return (
            <Badge tone="info" size="sm">
              خدمة
            </Badge>
          );
        }
        if (row.outOfStock) {
          return (
            <Badge tone="danger" size="sm" dot>
              نفد
            </Badge>
          );
        }
        if (row.lowStock) {
          return (
            <Badge tone="warning" size="sm" dot>
              منخفض
            </Badge>
          );
        }
        return (
          <Badge tone="success" size="sm" dot>
            متوفر
          </Badge>
        );
      },
    },
  ];

  return (
    <DataTable
      tableId="products"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      href={(row) => `/products/${row.id}`}
      empty={
        <EmptyState
          icon={<Package className="size-6" />}
          variant={searching ? 'search' : 'default'}
          title={searching ? 'لا توجد منتجات مطابقة' : 'لم تضف منتجات بعد'}
          description={
            searching
              ? 'جرّب اسماً أقصر أو أزل التصفية.'
              : 'أضف أول منتج لتبدأ البيع وتتبع المخزون. يمكنك إضافة عدة أحجام أو نكهات لنفس المنتج.'
          }
          action={
            canCreate && !searching ? (
              <ButtonLink href="/products/new" variant="accent" iconStart={<Plus className="size-4" />}>
                  إضافة منتج
                </ButtonLink>
            ) : undefined
          }
        />
      }
    />
  );
}
