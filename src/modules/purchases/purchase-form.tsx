'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, Truck } from 'lucide-react';

import { cn } from '@/lib/cn';
import { allocateByWeight } from '@/core/money';
import { lineAmount, qtyFromSaleUnits, qtyToInputValue } from '@/core/quantity';
import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { Card, CardHeader } from '@/ui/primitives/card';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input, Select, Textarea } from '@/ui/primitives/input';
import { MoneyInput, QuantityInput } from '@/ui/forms/money-input';
import { Switch } from '@/ui/primitives/toggle';
import { VariantPicker } from '@/ui/forms/variant-picker';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { newIdempotencyKey } from '@/modules/pos/types';
import { createPurchaseAction } from '@/modules/suppliers/actions';
import type { PosProduct } from '@/modules/pos/queries';

interface PurchaseLine {
  key: string;
  variantId: string;
  label: string;
  sku: string;
  unitLabel: string;
  factor: number;
  quantity: number;
  unitCost: number;
  discount: number;
  currentStock: number;
}

export interface PurchaseFormProps {
  suppliers: Array<{ id: string; name: string; balance: number }>;
  paymentMethods: Array<{ id: string; name: string; affectsCashbox: boolean }>;
  canReceive: boolean;
  branchName: string;
}

/**
 * Purchase invoice entry.
 *
 * The important detail is the landed-cost preview: shipping and customs typed
 * into "مصاريف إضافية" are spread across the lines by value, and the table
 * shows the resulting per-unit cost live. That number is what the profit report
 * will use for months, so the buyer gets to see it before saving.
 */
export function PurchaseForm({
  suppliers,
  paymentMethods,
  canReceive,
  branchName,
}: PurchaseFormProps) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();

  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);
  const [extraCosts, setExtraCosts] = useState(0);
  const [note, setNote] = useState('');
  const [purchasedAt, setPurchasedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiveNow, setReceiveNow] = useState(canReceive);
  const [paidAmount, setPaidAmount] = useState(0);
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? '');
  const [saving, startSave] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());

  const totals = useMemo(() => {
    const gross = lines.map((line) => lineAmount(line.unitCost, line.quantity, line.factor));
    const lineDiscounts = lines.map((line, index) =>
      Math.min(line.discount, gross[index] ?? 0),
    );
    const nets = gross.map((value, index) => value - (lineDiscounts[index] ?? 0));

    const subtotal = gross.reduce((sum, value) => sum + value, 0);
    const netBefore = nets.reduce((sum, value) => sum + value, 0);
    const cappedInvoiceDiscount = Math.min(invoiceDiscount, netBefore);
    const spread = allocateByWeight(cappedInvoiceDiscount, nets);
    const afterDiscount = nets.map((value, index) => Math.max(0, value - (spread[index] ?? 0)));
    const extraShares = allocateByWeight(extraCosts, afterDiscount);

    const landed = lines.map((line, index) => {
      const total = (afterDiscount[index] ?? 0) + (extraShares[index] ?? 0);
      // Cost per SALE unit, which is what a buyer can sanity-check.
      const perUnit = line.quantity > 0 ? lineAmount(total, line.factor, line.quantity) : 0;
      return { total, perUnit };
    });

    const total = subtotal - lineDiscounts.reduce((sum, value) => sum + value, 0) -
      cappedInvoiceDiscount + extraCosts;

    return {
      gross,
      nets: afterDiscount,
      landed,
      subtotal,
      discountTotal: lineDiscounts.reduce((sum, value) => sum + value, 0) + cappedInvoiceDiscount,
      total,
    };
  }, [lines, invoiceDiscount, extraCosts]);

  const addLine = (product: PosProduct) => {
    setLines((current) => [
      ...current,
      {
        key: `${product.variantId}-${Math.random().toString(36).slice(2, 7)}`,
        variantId: product.variantId,
        label: product.label,
        sku: product.sku,
        unitLabel: product.unitLabel,
        factor: product.factor,
        quantity: product.factor,
        // Pre-fill from the last purchase price where we have one.
        unitCost: 0,
        discount: 0,
        currentStock: product.stock,
      },
    ]);
  };

  const updateLine = (key: string, patch: Partial<PurchaseLine>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  const removeLine = (key: string) =>
    setLines((current) => current.filter((line) => line.key !== key));

  const submit = () => {
    if (!supplierId) {
      toast.warning('اختر المورد أولاً');
      return;
    }
    if (lines.length === 0) {
      toast.warning('أضف صنفاً واحداً على الأقل');
      return;
    }
    if (lines.some((line) => line.quantity <= 0)) {
      toast.warning('أدخل كميات صحيحة لكل الأصناف');
      return;
    }

    startSave(async () => {
      const response = await createPurchaseAction({
        idempotencyKey,
        supplierId,
        reference: reference.trim() || null,
        lines: lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitCost: line.unitCost,
          discount: line.discount,
        })),
        invoiceDiscount,
        extraCosts,
        note: note.trim() || null,
        purchasedAt,
        receiveNow,
        payment:
          receiveNow && paidAmount > 0 ? { methodId, amount: paidAmount } : null,
      });

      if (!response.ok) {
        toast.error('تعذر حفظ فاتورة الشراء', response.error.message);
        return;
      }

      toast.success(
        receiveNow ? 'تم استلام البضاعة' : 'حُفظت المسودة',
        `${response.data.number} — ${fmt.money(response.data.total)}`,
      );
      setIdempotencyKey(newIdempotencyKey());
      router.push(`/purchases/${response.data.purchaseId}`);
      router.refresh();
    });
  };

  const selectedSupplier = suppliers.find((supplier) => supplier.id === supplierId);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader title="بيانات الفاتورة" icon={<Truck className="size-4" />} />
        <div className="mt-4 space-y-4">
          <FieldRow>
            <FormField label="المورد" required>
              <Select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                <option value="">اختر المورد…</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </Select>
              {selectedSupplier && selectedSupplier.balance > 0 && (
                <p className="mt-1.5 text-[12px] text-warning">
                  الرصيد المستحق لهذا المورد حالياً{' '}
                  <span className="num font-bold">{fmt.money(selectedSupplier.balance)}</span>
                </p>
              )}
            </FormField>

            <FormField label="رقم فاتورة المورد" hint="كما هو مكتوب على فاتورته">
              <Input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="اختياري"
              />
            </FormField>
          </FieldRow>

          <FieldRow>
            <FormField label="تاريخ الفاتورة">
              <Input
                type="date"
                numeric
                value={purchasedAt}
                onChange={(event) => setPurchasedAt(event.target.value)}
              />
            </FormField>

            <FormField label="الفرع المستلم">
              <Input value={branchName} disabled />
            </FormField>
          </FieldRow>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="الأصناف"
          subtitle="ابحث بالاسم أو الباركود لإضافة صنف للفاتورة"
        />

        <div className="mt-4">
          <VariantPicker
            onSelect={addLine}
            excludeIds={lines.map((line) => line.variantId)}
          />
        </div>

        {lines.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="bg-sunken/50 text-secondary">
                <tr>
                  <th className="px-3 py-2.5 text-start font-semibold">الصنف</th>
                  <th className="px-3 py-2.5 text-center font-semibold">الكمية</th>
                  <th className="px-3 py-2.5 text-center font-semibold">تكلفة الوحدة</th>
                  <th className="px-3 py-2.5 text-center font-semibold">خصم</th>
                  <th className="px-3 py-2.5 text-end font-semibold">الإجمالي</th>
                  <th className="px-3 py-2.5 text-end font-semibold">التكلفة النهائية</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.key} className="border-t border-line-subtle">
                    <td className="px-3 py-2.5">
                      <span className="block font-semibold text-primary">{line.label}</span>
                      <span className="num-mixed block text-[11.5px] text-tertiary">
                        {line.sku} · المتوفر{' '}
                        {qtyToInputValue(line.currentStock, line.factor)} {line.unitLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <QuantityInput
                        size="sm"
                        value={line.quantity}
                        onValueChange={(value) => updateLine(line.key, { quantity: value })}
                        factor={line.factor}
                        unitLabel={line.unitLabel}
                        className="w-32"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <MoneyInput
                        size="sm"
                        showCurrency={false}
                        value={line.unitCost}
                        onValueChange={(value) => updateLine(line.key, { unitCost: value })}
                        className="w-28"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <MoneyInput
                        size="sm"
                        showCurrency={false}
                        value={line.discount}
                        onValueChange={(value) => updateLine(line.key, { discount: value })}
                        className="w-24"
                      />
                    </td>
                    <td className="num px-3 py-2.5 text-end font-semibold text-primary">
                      {fmt.money(totals.nets[index] ?? 0)}
                    </td>
                    <td className="num-mixed px-3 py-2.5 text-end">
                      <span className="font-bold text-accent-strong">
                        {fmt.money(totals.landed[index]?.perUnit ?? 0)}
                      </span>
                      <span className="block text-[11px] text-tertiary">
                        لكل {line.unitLabel}
                      </span>
                    </td>
                    <td className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        aria-label={`حذف ${line.label}`}
                        className="rounded-[var(--radius-xs)] p-1.5 text-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {lines.length === 0 && (
          <p className="mt-6 text-center text-[13px] text-tertiary">
            لم تُضَف أصناف بعد — ابحث بالأعلى لإضافة أول صنف.
          </p>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader title="الخصومات والمصاريف" />
          <div className="mt-4 space-y-4">
            <FormField label="خصم على الفاتورة" hint="يوزَّع على الأصناف بالتناسب">
              <MoneyInput value={invoiceDiscount} onValueChange={setInvoiceDiscount} />
            </FormField>

            <FormField
              label="مصاريف إضافية"
              hint="شحن، جمارك، تحميل — تُضاف لتكلفة الأصناف بالتناسب"
            >
              <MoneyInput value={extraCosts} onValueChange={setExtraCosts} />
            </FormField>

            <FormField label="ملاحظات">
              <Textarea
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="اختياري"
              />
            </FormField>
          </div>
        </Card>

        <Card>
          <CardHeader title="الإجمالي والسداد" />
          <dl className="mt-4 space-y-2 text-[13px]">
            <Row label="المجموع" value={fmt.money(totals.subtotal)} />
            {totals.discountTotal > 0 && (
              <Row label="الخصم" value={`− ${fmt.money(totals.discountTotal)}`} tone="accent" />
            )}
            {extraCosts > 0 && <Row label="مصاريف إضافية" value={fmt.money(extraCosts)} />}
            <div className="flex items-baseline justify-between border-t border-line pt-2">
              <dt className="font-bold text-primary">الإجمالي</dt>
              <dd className="num text-[20px] font-bold text-primary">{fmt.money(totals.total)}</dd>
            </div>
          </dl>

          <div className="mt-4 space-y-4 border-t border-line-subtle pt-4">
            <Switch
              checked={receiveNow}
              onChange={(event) => setReceiveNow(event.target.checked)}
              disabled={!canReceive}
              label="استلام البضاعة الآن"
              description={
                canReceive
                  ? 'يضيف الكميات للمخزون ويحدّث متوسط التكلفة فوراً'
                  : 'ليس لديك صلاحية الاستلام — ستُحفظ كمسودة'
              }
            />

            {receiveNow && (
              <>
                <FormField label="المدفوع الآن" hint="اتركه صفراً للشراء الآجل بالكامل">
                  <MoneyInput value={paidAmount} onValueChange={setPaidAmount} />
                  <span className="flex gap-1.5 pt-1.5">
                    <button
                      type="button"
                      onClick={() => setPaidAmount(totals.total)}
                      className="rounded-full border border-line-strong px-2.5 py-1 text-[11.5px] font-semibold text-secondary transition-colors hover:border-accent-border hover:text-accent-strong"
                    >
                      سداد كامل
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaidAmount(0)}
                      className="rounded-full border border-line-strong px-2.5 py-1 text-[11.5px] font-semibold text-secondary transition-colors hover:border-accent-border hover:text-accent-strong"
                    >
                      آجل بالكامل
                    </button>
                  </span>
                </FormField>

                {paidAmount > 0 && (
                  <FormField label="طريقة الدفع">
                    <Select value={methodId} onChange={(event) => setMethodId(event.target.value)}>
                      {paymentMethods.map((method) => (
                        <option key={method.id} value={method.id}>
                          {method.name}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                )}

                {totals.total - paidAmount > 0 && (
                  <Alert tone="warning" compact>
                    سيُسجَّل مبلغ{' '}
                    <span className="num font-bold">{fmt.money(totals.total - paidAmount)}</span> على
                    حساب المورد.
                  </Alert>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      <div className="safe-bottom sticky bottom-[calc(var(--bottom-nav-height)+8px)] z-10 flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-line-subtle bg-card/95 p-3 shadow-md backdrop-blur lg:bottom-4">
        <span className="num text-[14px] font-bold text-primary">{fmt.money(totals.total)}</span>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.back()} disabled={saving}>
            إلغاء
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={lines.length === 0 || !supplierId}
            onClick={submit}
          >
            {receiveNow ? 'حفظ واستلام' : 'حفظ كمسودة'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'accent';
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-secondary">{label}</dt>
      <dd className={cn('num font-semibold', tone === 'accent' ? 'text-accent-strong' : 'text-primary')}>
        {value}
      </dd>
    </div>
  );
}
