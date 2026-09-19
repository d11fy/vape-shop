'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Printer, RotateCcw, Share2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { lineAmount, qtyFromSaleUnits, qtyToInputValue } from '@/core/quantity';
import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { Checkbox } from '@/ui/primitives/toggle';
import { Modal } from '@/ui/overlays/modal';
import { Select, Textarea } from '@/ui/primitives/input';
import { useConfirm } from '@/ui/feedback/confirm';
import { useToast } from '@/ui/feedback/toast';
import { useFormat } from '@/ui/format';
import { newIdempotencyKey } from '@/modules/pos/types';
import { cancelInvoiceAction, createReturnAction } from './actions';
import type { InvoiceDetail } from './queries';

/**
 * The actions available on a completed invoice: print, share, return, cancel.
 *
 * Returning and cancelling both change money and stock, so each one asks for a
 * reason and states plainly what will happen before it runs.
 */
export function InvoiceActions({
  invoice,
  paymentMethods,
  canReturn,
  canCancel,
  readOnly,
}: {
  invoice: InvoiceDetail;
  paymentMethods: Array<{ id: string; name: string; affectsCashbox: boolean }>;
  canReturn: boolean;
  canCancel: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const fmt = useFormat();
  const [returnOpen, setReturnOpen] = useState(false);
  const [canceling, startCancel] = useTransition();

  const returnable = invoice.items.some((item) => item.quantity - item.returnedQuantity > 0);
  const closed = invoice.status === 'CANCELED';

  const share = async () => {
    const url = `${window.location.origin}/invoices/${invoice.id}`;
    const text = `فاتورة ${invoice.number} — ${fmt.money(invoice.total)}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: text, url });
        return;
      } catch {
        // User dismissed the share sheet — fall through to copying.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success('تم نسخ رابط الفاتورة');
    } catch {
      toast.error('تعذر نسخ الرابط');
    }
  };

  const cancel = async () => {
    const approved = await confirm({
      title: `إلغاء الفاتورة ${invoice.number}؟`,
      tone: 'danger',
      message:
        'سيتم إرجاع الأصناف للمخزون، وعكس المبالغ المستلمة، وإلغاء أي دين نتج عن هذه الفاتورة. الفاتورة تبقى محفوظة في السجل بحالة «ملغاة».',
      details: (
        <span className="num-mixed">
          الإجمالي {fmt.money(invoice.total)} · {invoice.items.length} صنف
        </span>
      ),
      confirmLabel: 'تأكيد الإلغاء',
      confirmText: invoice.number,
    });

    if (!approved) return;

    startCancel(async () => {
      const reason = 'إلغاء بواسطة المستخدم';
      const response = await cancelInvoiceAction({
        saleId: invoice.id,
        reason,
        restock: true,
      });

      if (!response.ok) {
        toast.error('تعذر إلغاء الفاتورة', response.error.message);
        return;
      }
      toast.success('تم إلغاء الفاتورة', invoice.number);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          onClick={() => window.open(`/invoices/${invoice.id}/print`, '_blank', 'noopener')}
          iconStart={<Printer className="size-4" />}
        >
          طباعة
        </Button>

        <Button variant="ghost" onClick={share} iconStart={<Share2 className="size-4" />}>
          مشاركة
        </Button>

        {canReturn && !closed && returnable && !readOnly && (
          <Button
            variant="outline"
            onClick={() => setReturnOpen(true)}
            iconStart={<RotateCcw className="size-4" />}
          >
            تسجيل مرتجع
          </Button>
        )}

        {canCancel && invoice.status === 'COMPLETED' && !readOnly && (
          <Button
            variant="danger-ghost"
            loading={canceling}
            onClick={cancel}
            iconStart={<Ban className="size-4" />}
          >
            إلغاء الفاتورة
          </Button>
        )}
      </div>

      <ReturnDialog
        open={returnOpen}
        invoice={invoice}
        paymentMethods={paymentMethods}
        onClose={() => setReturnOpen(false)}
        onDone={() => {
          setReturnOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}

function ReturnDialog({
  open,
  invoice,
  paymentMethods,
  onClose,
  onDone,
}: {
  open: boolean;
  invoice: InvoiceDetail;
  paymentMethods: Array<{ id: string; name: string; affectsCashbox: boolean }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const fmt = useFormat();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState(true);
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? '');
  const [submitting, startSubmit] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());

  const lines = invoice.items
    .map((item) => ({ item, remaining: item.quantity - item.returnedQuantity }))
    .filter((line) => line.remaining > 0);

  const selected = useMemo(
    () =>
      lines
        .map((line) => {
          const raw = quantities[line.item.id];
          if (!raw || raw.trim() === '') return null;
          const quantity = qtyFromSaleUnits(raw, line.item.factor);
          if (quantity === null || quantity <= 0) return null;
          return {
            saleItemId: line.item.id,
            quantity: Math.min(quantity, line.remaining),
            item: line.item,
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null),
    [lines, quantities],
  );

  // Refund value at the price actually paid, discounts included — the same
  // exact half-up proportion the server applies, so the preview never drifts.
  const refundEstimate = selected.reduce(
    (sum, entry) => sum + lineAmount(entry.item.lineTotal, entry.quantity, entry.item.quantity),
    0,
  );

  const creditPortion = Math.min(refundEstimate, invoice.dueTotal);
  const cashPortion = refundEstimate - creditPortion;

  const submit = () => {
    if (selected.length === 0) {
      toast.warning('اختر الكميات المرتجعة أولاً');
      return;
    }
    if (reason.trim().length < 3) {
      toast.warning('اذكر سبب الإرجاع');
      return;
    }

    startSubmit(async () => {
      const response = await createReturnAction({
        idempotencyKey,
        saleId: invoice.id,
        items: selected.map((entry) => ({
          saleItemId: entry.saleItemId,
          quantity: entry.quantity,
        })),
        reason: reason.trim(),
        note: note.trim() || null,
        restock,
        refundMethodId: cashPortion > 0 ? methodId : null,
      });

      if (!response.ok) {
        toast.error('تعذر تسجيل المرتجع', response.error.message);
        return;
      }

      toast.success(
        'تم تسجيل المرتجع',
        `${response.data.number} — ${fmt.money(response.data.total)}`,
      );
      setIdempotencyKey(newIdempotencyKey());
      setQuantities({});
      setReason('');
      setNote('');
      onDone();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`مرتجع على الفاتورة ${invoice.number}`}
      description="حدّد الكميات المرتجعة — يمكن إرجاع جزء من الفاتورة"
      size="lg"
      dismissible={!submitting}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            إلغاء
          </Button>
          <Button variant="primary" loading={submitting} onClick={submit}>
            تسجيل المرتجع
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-line-subtle">
          <table className="w-full text-[13px]">
            <thead className="bg-sunken/60 text-secondary">
              <tr>
                <th className="px-3 py-2 text-start font-semibold">الصنف</th>
                <th className="px-3 py-2 text-center font-semibold">المتبقي</th>
                <th className="px-3 py-2 text-center font-semibold">الكمية المرتجعة</th>
              </tr>
            </thead>
            <tbody>
              {lines.map(({ item, remaining }) => (
                <tr key={item.id} className="border-t border-line-subtle">
                  <td className="px-3 py-2.5">
                    <p className="font-semibold text-primary">{item.productName}</p>
                    {item.variantName !== 'افتراضي' && (
                      <p className="text-[11.5px] text-tertiary">{item.variantName}</p>
                    )}
                  </td>
                  <td className="num-mixed px-3 py-2.5 text-center text-secondary">
                    {qtyToInputValue(remaining, item.factor)} {item.unitLabel}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <input
                        inputMode="decimal"
                        placeholder="0"
                        value={quantities[item.id] ?? ''}
                        onChange={(event) =>
                          setQuantities((current) => ({ ...current, [item.id]: event.target.value }))
                        }
                        className="num h-9 w-20 rounded-[var(--radius-xs)] border border-line-strong bg-card px-2 text-center focus:border-accent-strong focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setQuantities((current) => ({
                            ...current,
                            [item.id]: qtyToInputValue(remaining, item.factor),
                          }))
                        }
                        className="text-[11.5px] font-semibold text-accent-strong hover:underline"
                      >
                        الكل
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {refundEstimate > 0 && (
          <div className="rounded-[var(--radius-md)] border border-line-subtle bg-sunken/60 px-4 py-3">
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-secondary">قيمة المرتجع</dt>
                <dd className="num font-bold text-primary">{fmt.money(refundEstimate)}</dd>
              </div>
              {creditPortion > 0 && (
                <div className="flex justify-between">
                  <dt className="text-secondary">يُخصم من دين الفاتورة</dt>
                  <dd className="num font-bold text-warning">{fmt.money(creditPortion)}</dd>
                </div>
              )}
              {cashPortion > 0 && (
                <div className="flex justify-between">
                  <dt className="text-secondary">يُعاد للعميل</dt>
                  <dd className="num font-bold text-success">{fmt.money(cashPortion)}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {cashPortion > 0 && (
          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold text-primary">طريقة إعادة المبلغ</span>
            <Select value={methodId} onChange={(event) => setMethodId(event.target.value)}>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </Select>
          </label>
        )}

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">سبب الإرجاع</span>
          <Select value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="">اختر السبب…</option>
            <option value="الصنف معيب">الصنف معيب</option>
            <option value="لم يعجب العميل">لم يعجب العميل</option>
            <option value="صنف خاطئ">صنف خاطئ</option>
            <option value="خطأ في تسجيل الفاتورة">خطأ في تسجيل الفاتورة</option>
            <option value="سبب آخر">سبب آخر</option>
          </Select>
        </label>

        <Checkbox
          checked={restock}
          onChange={(event) => setRestock(event.target.checked)}
          label="إعادة الأصناف إلى المخزون"
          description="ألغِ التحديد إذا كانت البضاعة تالفة ولن تُباع مرة أخرى"
        />

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">ملاحظة</span>
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="اختياري"
          />
        </label>

        {invoice.dueTotal > 0 && (
          <Alert tone="info" compact>
            على هذه الفاتورة دين قدره{' '}
            <span className="num font-bold">{fmt.money(invoice.dueTotal)}</span> — سيُخصم المرتجع منه
            أولاً قبل إعادة أي مبلغ نقدي.
          </Alert>
        )}
      </div>
    </Modal>
  );
}

/** Status chip reused by the detail header. */
export function InvoiceStatusChip({ status }: { status: InvoiceDetail['status'] }) {
  const map = {
    COMPLETED: { label: 'مكتملة', className: 'bg-success-soft text-success border-success-border' },
    PARTIALLY_RETURNED: {
      label: 'مرتجع جزئي',
      className: 'bg-warning-soft text-warning border-warning-border',
    },
    RETURNED: { label: 'مرتجعة بالكامل', className: 'bg-warning-soft text-warning border-warning-border' },
    CANCELED: { label: 'ملغاة', className: 'bg-danger-soft text-danger border-danger-border' },
  } as const;

  const entry = map[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-bold',
        entry.className,
      )}
    >
      {entry.label}
    </span>
  );
}
