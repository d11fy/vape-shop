'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Search, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { costAmount, qtyFromSaleUnits } from '@/core/quantity';
import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { Card, CardHeader } from '@/ui/primitives/card';
import { Input, Select, Textarea } from '@/ui/primitives/input';
import { useConfirm } from '@/ui/feedback/confirm';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { newIdempotencyKey } from '@/modules/pos/types';
import { applyAdjustmentAction } from './actions';
import { ADJUSTMENT_REASONS } from './labels';

export interface CountRow {
  variantId: string;
  productId: string;
  label: string;
  sku: string;
  unitLabel: string;
  factor: number;
  systemQuantity: number;
  costPerBase: number;
}

/**
 * The stock-take sheet.
 *
 * Deliberately keyboard-first: the counter walks the shelf with a phone or a
 * laptop, types what is actually there, and only the rows that differ become
 * movements. Rows left blank are untouched — which is what makes a partial
 * count of one shelf safe.
 */
export function CountSheet({
  rows,
  categories,
}: {
  rows: CountRow[];
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const fmt = useFormat();

  const [counts, setCounts] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState('');
  const [category, setCategory] = useState('all');
  const [reason, setReason] = useState<string>(ADJUSTMENT_REASONS[0]);
  const [note, setNote] = useState('');
  const [saving, startSave] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return rows.filter((row) => {
      if (term && !row.label.toLowerCase().includes(term) && !row.sku.toLowerCase().includes(term)) {
        return false;
      }
      return true;
    });
  }, [rows, filter]);

  const changes = useMemo(() => {
    return rows
      .map((row) => {
        const raw = counts[row.variantId];
        if (raw === undefined || raw.trim() === '') return null;
        const counted = qtyFromSaleUnits(raw, row.factor);
        if (counted === null) return null;
        const difference = counted - row.systemQuantity;
        if (difference === 0) return null;
        return { row, counted, difference };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [rows, counts]);

  const valueImpact = changes.reduce(
    (sum, change) => sum + costAmount(change.difference, change.row.costPerBase),
    0,
  );

  const submit = async () => {
    if (changes.length === 0) {
      toast.info('لا توجد فروقات', 'أدخل الكميات الفعلية للأصناف التي تختلف عن النظام.');
      return;
    }

    const approved = await confirm({
      title: 'تطبيق التسوية؟',
      tone: 'warning',
      message: `سيتم تعديل كميات ${changes.length} صنف، وتسجيل الفروقات في سجل النشاط باسمك.`,
      details: (
        <span className="num-mixed">
          أثر التسوية على قيمة المخزون: {fmt.money(valueImpact, { signed: true })}
        </span>
      ),
      confirmLabel: 'تطبيق التسوية',
    });

    if (!approved) return;

    startSave(async () => {
      const response = await applyAdjustmentAction({
        idempotencyKey,
        reason,
        note: note.trim() || null,
        items: changes.map((change) => ({
          variantId: change.row.variantId,
          countedQuantity: change.counted,
        })),
      });

      if (!response.ok) {
        toast.error('تعذر تطبيق التسوية', response.error.message);
        return;
      }

      toast.success(
        'تمت التسوية',
        `${response.data.number} — ${response.data.changedCount} صنف`,
      );
      setIdempotencyKey(newIdempotencyKey());
      setCounts({});
      router.push('/inventory/adjustments');
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader title="بيانات الجرد" subtitle="تُحفظ مع كل صنف تم تعديله" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
              rows={1}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="اختياري"
            />
          </label>
        </div>
      </Card>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle p-3 sm:p-4">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="ابحث عن صنف…"
            iconStart={<Search className="size-4" />}
            className="min-w-0 flex-1 sm:max-w-xs"
            iconEnd={
              filter ? (
                <button
                  type="button"
                  onClick={() => setFilter('')}
                  aria-label="مسح"
                  className="pointer-events-auto text-tertiary hover:text-primary"
                >
                  <X className="size-4" />
                </button>
              ) : undefined
            }
          />

          {categories.length > 0 && (
            <Select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-auto min-w-40"
            >
              <option value="all">كل التصنيفات</option>
              {categories.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
          )}

          <span className="ms-auto text-[12.5px] text-secondary">
            <span className="num">{visible.length}</span> صنف ·{' '}
            <span className="num">{changes.length}</span> فرق
          </span>
        </div>

        <div className="max-h-[56vh] overflow-y-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-sunken/95 text-secondary backdrop-blur">
              <tr>
                <th className="px-4 py-2.5 text-start font-semibold">الصنف</th>
                <th className="px-4 py-2.5 text-end font-semibold">بالنظام</th>
                <th className="px-4 py-2.5 text-center font-semibold">العدّ الفعلي</th>
                <th className="px-4 py-2.5 text-end font-semibold">الفرق</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const raw = counts[row.variantId] ?? '';
                const counted = raw.trim() === '' ? null : qtyFromSaleUnits(raw, row.factor);
                const difference = counted === null ? null : counted - row.systemQuantity;

                return (
                  <tr
                    key={row.variantId}
                    className={cn(
                      'border-t border-line-subtle',
                      difference !== null && difference !== 0 && 'bg-warning-soft/40',
                    )}
                  >
                    <td className="px-4 py-2.5">
                      <span className="block font-semibold text-primary">{row.label}</span>
                      <span className="num block text-[11.5px] text-tertiary">{row.sku}</span>
                    </td>
                    <td className="px-4 py-2.5 text-end text-secondary">
                      <span className="num">
                        {(row.systemQuantity / row.factor).toLocaleString('en-US', {
                          maximumFractionDigits: 3,
                        })}
                      </span>
                      <span className="ms-1 text-[11px] text-tertiary">{row.unitLabel}</span>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <input
                        inputMode="decimal"
                        value={raw}
                        placeholder="—"
                        onChange={(event) =>
                          setCounts((current) => ({
                            ...current,
                            [row.variantId]: event.target.value,
                          }))
                        }
                        className="num h-9 w-24 rounded-[var(--radius-xs)] border border-line-strong bg-card px-2 text-center focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-end">
                      {difference === null ? (
                        <span className="text-tertiary">—</span>
                      ) : difference === 0 ? (
                        <span className="inline-flex items-center gap-1 text-[12px] text-success">
                          <CheckCircle2 className="size-3.5" />
                          مطابق
                        </span>
                      ) : (
                        <span
                          className={cn(
                            'num font-bold',
                            difference > 0 ? 'text-success' : 'text-danger',
                          )}
                        >
                          {difference > 0 ? '+' : ''}
                          {(difference / row.factor).toLocaleString('en-US', {
                            maximumFractionDigits: 3,
                          })}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {changes.length > 0 && (
        <Alert tone="warning" title={`${changes.length} صنف سيتم تعديله`}>
          أثر التسوية على قيمة المخزون{' '}
          <span className="num font-bold">{fmt.money(valueImpact, { signed: true })}</span>. لن تتأثر
          الأصناف التي تركت خانتها فارغة.
        </Alert>
      )}

      <div className="safe-bottom sticky bottom-[calc(var(--bottom-nav-height)+8px)] z-10 flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-line-subtle bg-card/95 p-3 shadow-md backdrop-blur lg:bottom-4">
        <span className="text-[13px] text-secondary">
          {changes.length > 0 ? (
            <>
              <span className="num">{changes.length}</span> فرق
            </>
          ) : (
            'لا توجد فروقات'
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.back()} disabled={saving}>
            إلغاء
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={changes.length === 0}
            onClick={submit}
          >
            تطبيق التسوية
          </Button>
        </div>
      </div>
    </div>
  );
}
