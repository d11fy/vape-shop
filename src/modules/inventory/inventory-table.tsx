'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, SlidersHorizontal } from 'lucide-react';

import { cn } from '@/lib/cn';
import { costAmount } from '@/core/quantity';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { DataTable, type Column } from '@/ui/data/data-table';
import { EmptyState } from '@/ui/feedback/empty-state';
import { Modal } from '@/ui/overlays/modal';
import { QuantityInput } from '@/ui/forms/money-input';
import { Select, Textarea } from '@/ui/primitives/input';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { quickAdjustAction } from './actions';
import { ADJUSTMENT_REASONS } from './labels';
import type { InventoryRow } from './queries';

const STATE_BADGE = {
  ok: { label: 'متوفر', tone: 'success' as const },
  low: { label: 'منخفض', tone: 'warning' as const },
  out: { label: 'نفد', tone: 'danger' as const },
};

export function InventoryTable({
  rows,
  showValue,
  canAdjust,
}: {
  rows: InventoryRow[];
  showValue: boolean;
  canAdjust: boolean;
}) {
  const fmt = useFormat();
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);

  const columns: Column<InventoryRow>[] = [
    {
      id: 'product',
      header: 'الصنف',
      sortKey: 'name',
      priority: 1,
      cell: (row) => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-primary">{row.productName}</span>
          <span className="num-mixed block truncate text-[11.5px] text-tertiary">
            {row.variantName !== 'افتراضي' ? `${row.variantName} · ` : ''}
            {row.sku}
          </span>
        </span>
      ),
    },
    {
      id: 'category',
      header: 'التصنيف',
      priority: 3,
      cell: (row) => <span className="text-secondary">{row.categoryName ?? '—'}</span>,
    },
    {
      id: 'quantity',
      header: 'المتوفر',
      sortKey: 'quantity',
      align: 'end',
      priority: 1,
      cell: (row) => (
        <span
          className={cn(
            'num-mixed font-bold',
            row.state === 'out'
              ? 'text-danger'
              : row.state === 'low'
                ? 'text-warning'
                : 'text-primary',
          )}
        >
          {row.saleUnits.toLocaleString('en-US', { maximumFractionDigits: 3 })}
          <span className="ms-1 text-[11.5px] font-normal text-tertiary">{row.unitLabel}</span>
        </span>
      ),
    },
    {
      id: 'minimum',
      header: 'حد التنبيه',
      align: 'end',
      priority: 3,
      cell: (row) =>
        row.minimumStock > 0 ? (
          <span className="num text-secondary">
            {(row.minimumStock / row.factor).toLocaleString('en-US', { maximumFractionDigits: 3 })}
          </span>
        ) : (
          <span className="text-tertiary">—</span>
        ),
    },
    ...(showValue
      ? [
          {
            id: 'cost',
            header: 'قيمة التكلفة',
            sortKey: 'value',
            align: 'end' as const,
            priority: 2 as const,
            cell: (row: InventoryRow) => (
              <span className="num text-secondary">{fmt.money(row.stockValue)}</span>
            ),
          },
          {
            id: 'retail',
            header: 'قيمة البيع',
            align: 'end' as const,
            priority: 3 as const,
            cell: (row: InventoryRow) => (
              <span className="num text-secondary">{fmt.money(row.retailValue)}</span>
            ),
          },
        ]
      : []),
    {
      id: 'state',
      header: 'الحالة',
      align: 'center',
      priority: 2,
      cell: (row) => (
        <Badge tone={STATE_BADGE[row.state].tone} size="sm" dot>
          {STATE_BADGE[row.state].label}
        </Badge>
      ),
    },
  ];

  return (
    <>
      <DataTable
        tableId="inventory"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.variantId}
        href={(row) => `/products/${row.productId}`}
        actions={
          canAdjust
            ? (row) => (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setAdjusting(row);
                  }}
                  aria-label={`تعديل كمية ${row.productName}`}
                  className="inline-flex size-8 items-center justify-center rounded-[var(--radius-xs)] text-tertiary transition-colors hover:bg-sunken hover:text-primary"
                >
                  <SlidersHorizontal className="size-4" />
                </button>
              )
            : undefined
        }
        empty={
          <EmptyState
            icon={<Boxes className="size-6" />}
            title="لا توجد أصناف"
            description="أضف منتجات تتبّع مخزونها لتظهر هنا مع كمياتها وقيمتها."
          />
        }
      />

      <QuickAdjustDialog row={adjusting} onClose={() => setAdjusting(null)} />
    </>
  );
}

function QuickAdjustDialog({
  row,
  onClose,
}: {
  row: InventoryRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();
  const [counted, setCounted] = useState(0);
  const [reason, setReason] = useState<string>(ADJUSTMENT_REASONS[0]);
  const [note, setNote] = useState('');
  const [saving, startSave] = useTransition();
  const [seededId, setSeededId] = useState<string | null>(null);

  if (row && seededId !== row.variantId) {
    setSeededId(row.variantId);
    setCounted(row.quantity);
    setNote('');
  }

  if (!row) return null;

  const difference = counted - row.quantity;
  const valueImpact = costAmount(difference, row.avgCostPerBase);

  const submit = () => {
    if (difference === 0) {
      toast.info('لا يوجد فرق', 'الكمية المدخلة مطابقة للنظام.');
      return;
    }

    startSave(async () => {
      const response = await quickAdjustAction({
        variantId: row.variantId,
        countedQuantity: counted,
        reason,
        note: note.trim() || null,
      });

      if (!response.ok) {
        toast.error('تعذر تعديل الكمية', response.error.message);
        return;
      }

      toast.success('تم تعديل الكمية', `${row.productName} — الفرق ${difference / row.factor}`);
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="تسوية كمية صنف"
      description={`${row.productName}${row.variantName !== 'افتراضي' ? ` — ${row.variantName}` : ''}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            حفظ التسوية
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-[var(--radius-sm)] bg-sunken px-3 py-2.5">
            <p className="text-[11.5px] text-secondary">الكمية في النظام</p>
            <p className="num-mixed mt-0.5 text-[17px] font-bold text-primary">
              {(row.quantity / row.factor).toLocaleString('en-US', { maximumFractionDigits: 3 })}
              <span className="ms-1 text-[12px] font-normal text-tertiary">{row.unitLabel}</span>
            </p>
          </div>
          <div
            className={cn(
              'rounded-[var(--radius-sm)] px-3 py-2.5',
              difference === 0
                ? 'bg-sunken'
                : difference > 0
                  ? 'bg-success-soft'
                  : 'bg-danger-soft',
            )}
          >
            <p className="text-[11.5px] text-secondary">الفرق</p>
            <p
              className={cn(
                'num mt-0.5 text-[17px] font-bold',
                difference === 0 ? 'text-primary' : difference > 0 ? 'text-success' : 'text-danger',
              )}
            >
              {difference > 0 ? '+' : ''}
              {(difference / row.factor).toLocaleString('en-US', { maximumFractionDigits: 3 })}
            </p>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">الكمية الفعلية بعد الجرد</span>
          <QuantityInput
            size="lg"
            value={counted}
            onValueChange={setCounted}
            factor={row.factor}
            unitLabel={row.unitLabel}
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">سبب التسوية</span>
          <Select value={reason} onChange={(event) => setReason(event.target.value)}>
            {ADJUSTMENT_REASONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">ملاحظة</span>
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="اختياري — تُحفظ في سجل النشاط"
          />
        </label>

        {difference !== 0 && (
          <p className="rounded-[var(--radius-sm)] bg-sunken px-3 py-2 text-[12.5px] text-secondary">
            أثر التسوية على قيمة المخزون:{' '}
            <span
              className={cn('num font-bold', valueImpact >= 0 ? 'text-success' : 'text-danger')}
            >
              {fmt.money(valueImpact, { signed: true })}
            </span>
          </p>
        )}
      </div>
    </Modal>
  );
}
