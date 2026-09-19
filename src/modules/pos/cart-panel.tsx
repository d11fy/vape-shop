'use client';

import { useState } from 'react';
import { Minus, Percent, Plus, ShoppingCart, Tag, Trash2, UserPlus, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { parseMoneyInput } from '@/core/money';
import { qtyFromSaleUnits, qtyToInputValue } from '@/core/quantity';
import { useFormat } from '@/ui/format';
import { Button } from '@/ui/primitives/button';
import { EmptyState } from '@/ui/feedback/empty-state';
import { Modal } from '@/ui/overlays/modal';
import type { PricedLine } from '@/modules/sales/pricing';
import type { CartLine, CartState } from './types';
import type { CartTotals } from './use-cart';

export interface CartPanelProps {
  cart: CartState;
  totals: CartTotals;
  lineTotals: Map<string, PricedLine>;
  taxEnabled: boolean;
  taxInclusive: boolean;
  canDiscount: boolean;
  canEditPrice: boolean;
  onQuantity: (key: string, quantity: number) => void;
  onIncrement: (key: string, steps: number) => void;
  onPrice: (key: string, price: number) => void;
  onDiscount: (key: string, discount: number) => void;
  onRemove: (key: string) => void;
  onInvoiceDiscount: (amount: number) => void;
  onPickCustomer: () => void;
  onClearCustomer: () => void;
  onClear: () => void;
  onCheckout: () => void;
  /** Rendered inside a sheet on phones, so the header is supplied by the sheet. */
  embedded?: boolean;
}

/**
 * The basket.
 *
 * Every row is editable in place — quantity, price and discount — because in a
 * real shop the negotiation happens at the counter, not in a settings screen.
 * Price and discount controls only appear for staff who hold the permission.
 */
export function CartPanel({
  cart,
  totals,
  lineTotals,
  taxEnabled,
  taxInclusive,
  canDiscount,
  canEditPrice,
  onQuantity,
  onIncrement,
  onPrice,
  onDiscount,
  onRemove,
  onInvoiceDiscount,
  onPickCustomer,
  onClearCustomer,
  onClear,
  onCheckout,
  embedded = false,
}: CartPanelProps) {
  const fmt = useFormat();
  const [editing, setEditing] = useState<CartLine | null>(null);
  const [discountOpen, setDiscountOpen] = useState(false);

  return (
    <div className={cn('flex h-full min-h-0 flex-col', !embedded && 'bg-card')}>
      {!embedded && (
        <div className="flex items-center justify-between gap-2 border-b border-line-subtle px-4 py-3">
          <h2 className="flex items-center gap-2 text-[14px] font-bold text-primary">
            <ShoppingCart className="size-4 text-tertiary" />
            السلة
            {totals.itemCount > 0 && (
              <span className="num rounded-full bg-ink px-1.5 py-0.5 text-[11px] text-on-inverse">
                {totals.itemCount}
              </span>
            )}
          </h2>
          {totals.itemCount > 0 && (
            <Button variant="ghost" size="xs" onClick={onClear} iconStart={<Trash2 className="size-3.5" />}>
              إفراغ
            </Button>
          )}
        </div>
      )}

      {/* Customer */}
      <div className="border-b border-line-subtle px-4 py-2.5">
        {cart.customerId ? (
          <div className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-accent-soft px-3 py-2">
            <span className="min-w-0 truncate text-[13px] font-semibold text-accent-strong">
              {cart.customerName}
            </span>
            <button
              type="button"
              onClick={onClearCustomer}
              aria-label="إزالة العميل"
              className="shrink-0 rounded-full p-1 text-accent-strong transition-colors hover:bg-white/40"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onPickCustomer}
            className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] border border-dashed border-line-strong px-3 py-2 text-[13px] text-secondary transition-colors hover:border-accent-border hover:text-primary"
          >
            <UserPlus className="size-4" />
            اختيار عميل <span className="text-tertiary">(اختياري)</span>
          </button>
        )}
      </div>

      {/* Lines */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {cart.lines.length === 0 ? (
          <EmptyState
            variant="compact"
            icon={<ShoppingCart className="size-6" />}
            title="السلة فارغة"
            description="اختر منتجاً من القائمة أو امسح الباركود لبدء الفاتورة."
            className="py-12"
          />
        ) : (
          <ul className="divide-y divide-line-subtle">
            {cart.lines.map((line) => {
              const priced = lineTotals.get(line.key);
              const overridden = line.unitPrice !== line.listPrice;
              const remaining = line.availableAtAdd - line.quantity;
              const short = line.trackInventory && remaining < 0;

              return (
                <li key={line.key} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(line)}
                      className="min-w-0 flex-1 text-start"
                    >
                      <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-primary">
                        {line.label}
                      </p>
                      <p className="num-mixed mt-0.5 text-[11.5px] text-tertiary">
                        {fmt.money(line.unitPrice)} / {line.unitLabel}
                        {overridden && (
                          <span className="ms-1.5 text-warning">· سعر معدّل</span>
                        )}
                        {line.discount > 0 && (
                          <span className="ms-1.5 text-accent-strong">
                            · خصم {fmt.money(line.discount)}
                          </span>
                        )}
                      </p>
                      {short && (
                        <p className="mt-1 text-[11px] font-semibold text-danger">
                          الكمية المتوفرة أقل من المطلوب
                        </p>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onRemove(line.key)}
                      aria-label={`حذف ${line.label}`}
                      className="-me-1 shrink-0 rounded-[var(--radius-xs)] p-1.5 text-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-line-subtle bg-sunken p-0.5">
                      <button
                        type="button"
                        onClick={() => onIncrement(line.key, -1)}
                        aria-label="إنقاص الكمية"
                        className="flex size-7 items-center justify-center rounded-[var(--radius-xs)] text-secondary transition-colors hover:bg-card hover:text-primary"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(line)}
                        className="num min-w-12 px-1 text-center text-[13px] font-bold text-primary"
                      >
                        {qtyToInputValue(line.quantity, line.factor)}
                      </button>
                      <button
                        type="button"
                        onClick={() => onIncrement(line.key, 1)}
                        aria-label="زيادة الكمية"
                        className="flex size-7 items-center justify-center rounded-[var(--radius-xs)] text-secondary transition-colors hover:bg-card hover:text-primary"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>

                    <span className="num text-[14px] font-bold text-primary">
                      {fmt.money(priced?.lineTotal ?? 0)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Totals */}
      <div className="safe-bottom border-t border-line-subtle bg-sunken/40 px-4 py-3">
        <dl className="space-y-1.5 text-[12.5px]">
          <Row label="الإجمالي قبل الخصم" value={fmt.money(totals.subtotal)} />
          {totals.discountTotal > 0 && (
            <Row label="الخصم" value={`− ${fmt.money(totals.discountTotal)}`} tone="accent" />
          )}
          {taxEnabled && (
            <Row
              label={taxInclusive ? 'الضريبة (مشمولة)' : 'الضريبة'}
              value={fmt.money(totals.taxTotal)}
            />
          )}
        </dl>

        {canDiscount && cart.lines.length > 0 && (
          <button
            type="button"
            onClick={() => setDiscountOpen(true)}
            className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-accent-strong transition-colors hover:underline"
          >
            <Tag className="size-3.5" />
            {cart.invoiceDiscount > 0 ? 'تعديل خصم الفاتورة' : 'إضافة خصم على الفاتورة'}
          </button>
        )}

        <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-[13px] font-semibold text-secondary">الإجمالي</span>
          <span className="num text-[22px] font-bold text-primary">{fmt.money(totals.total)}</span>
        </div>

        <Button
          variant="accent"
          size="lg"
          block
          className="mt-3"
          disabled={cart.lines.length === 0}
          onClick={onCheckout}
        >
          متابعة الدفع
          <kbd className="num ms-1 hidden rounded bg-white/20 px-1.5 py-0.5 text-[10px] lg:inline">
            F8
          </kbd>
        </Button>
      </div>

      <LineEditor
        line={editing}
        canEditPrice={canEditPrice}
        canDiscount={canDiscount}
        onClose={() => setEditing(null)}
        onQuantity={onQuantity}
        onPrice={onPrice}
        onDiscount={onDiscount}
      />

      <InvoiceDiscountDialog
        open={discountOpen}
        current={cart.invoiceDiscount}
        maximum={totals.subtotal}
        onClose={() => setDiscountOpen(false)}
        onApply={(amount) => {
          onInvoiceDiscount(amount);
          setDiscountOpen(false);
        }}
      />
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
    <div className="flex items-center justify-between">
      <dt className="text-secondary">{label}</dt>
      <dd className={cn('num font-semibold', tone === 'accent' ? 'text-accent-strong' : 'text-primary')}>
        {value}
      </dd>
    </div>
  );
}

/** Quantity, price and per-line discount in one focused sheet. */
function LineEditor({
  line,
  canEditPrice,
  canDiscount,
  onClose,
  onQuantity,
  onPrice,
  onDiscount,
}: {
  line: CartLine | null;
  canEditPrice: boolean;
  canDiscount: boolean;
  onClose: () => void;
  onQuantity: (key: string, quantity: number) => void;
  onPrice: (key: string, price: number) => void;
  onDiscount: (key: string, discount: number) => void;
}) {
  const fmt = useFormat();
  const [quantityText, setQuantityText] = useState('');
  const [priceText, setPriceText] = useState('');
  const [discountText, setDiscountText] = useState('');

  // Seed the inputs the first time the sheet opens for a given line.
  const [seededKey, setSeededKey] = useState<string | null>(null);
  if (line && seededKey !== line.key) {
    setSeededKey(line.key);
    setQuantityText(qtyToInputValue(line.quantity, line.factor));
    setPriceText(String(line.unitPrice / 10 ** fmt.decimals));
    setDiscountText(line.discount > 0 ? String(line.discount / 10 ** fmt.decimals) : '');
  }

  if (!line) return null;

  const apply = () => {
    const quantity = qtyFromSaleUnits(quantityText, line.factor);
    if (quantity !== null && quantity > 0) onQuantity(line.key, quantity);

    if (canEditPrice) {
      const price = parseMoneyInput(priceText, fmt.decimals);
      if (price !== null && price >= 0) onPrice(line.key, price);
    }

    if (canDiscount) {
      const discount = discountText.trim() === '' ? 0 : parseMoneyInput(discountText, fmt.decimals);
      if (discount !== null) onDiscount(line.key, discount);
    }

    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={line.label}
      description={`السعر المعتمد ${fmt.money(line.listPrice)} لكل ${line.unitLabel}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" onClick={apply}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">
            الكمية بـ{line.unitLabel}
            {line.allowsFractional && (
              <span className="ms-1 font-normal text-tertiary">— يمكن إدخال كسور</span>
            )}
          </span>
          <input
            data-autofocus
            inputMode="decimal"
            value={quantityText}
            onChange={(event) => setQuantityText(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && apply()}
            className="num h-12 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-center text-[17px] font-bold focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
          />
          {line.trackInventory && (
            <span className="block text-[11.5px] text-tertiary">
              المتوفر حالياً{' '}
              <span className="num">
                {(line.availableAtAdd / line.factor).toLocaleString('en-US', {
                  maximumFractionDigits: 3,
                })}
              </span>{' '}
              {line.unitLabel}
            </span>
          )}
        </label>

        {canEditPrice && (
          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold text-primary">السعر لكل {line.unitLabel}</span>
            <input
              inputMode="decimal"
              value={priceText}
              onChange={(event) => setPriceText(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && apply()}
              className="num h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-[15px] focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
            />
          </label>
        )}

        {canDiscount && (
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-primary">
              <Percent className="size-3.5 text-tertiary" />
              خصم على هذا الصنف
            </span>
            <input
              inputMode="decimal"
              placeholder="0"
              value={discountText}
              onChange={(event) => setDiscountText(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && apply()}
              className="num h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-[15px] focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
            />
          </label>
        )}
      </div>
    </Modal>
  );
}

function InvoiceDiscountDialog({
  open,
  current,
  maximum,
  onClose,
  onApply,
}: {
  open: boolean;
  current: number;
  maximum: number;
  onClose: () => void;
  onApply: (amount: number) => void;
}) {
  const fmt = useFormat();
  const [mode, setMode] = useState<'amount' | 'percent'>('amount');
  const [text, setText] = useState('');
  const [seeded, setSeeded] = useState(false);

  if (open && !seeded) {
    setSeeded(true);
    setText(current > 0 ? String(current / 10 ** fmt.decimals) : '');
  }
  if (!open && seeded) setSeeded(false);

  const apply = () => {
    if (text.trim() === '') {
      onApply(0);
      return;
    }
    if (mode === 'percent') {
      const percent = Number(text.replace(/[^\d.]/g, ''));
      if (!Number.isFinite(percent)) return;
      onApply(Math.round((maximum * Math.min(100, Math.max(0, percent))) / 100));
      return;
    }
    const amount = parseMoneyInput(text, fmt.decimals);
    if (amount !== null) onApply(Math.min(amount, maximum));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="خصم على الفاتورة"
      description="يوزَّع الخصم على الأصناف بالتناسب مع قيمة كل صنف"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onApply(0)}>
            إزالة الخصم
          </Button>
          <Button variant="primary" onClick={apply}>
            تطبيق
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="inline-flex rounded-[var(--radius-sm)] border border-line-subtle bg-sunken p-0.5">
          {(['amount', 'percent'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={cn(
                'h-8 rounded-[var(--radius-xs)] px-3 text-[12.5px] font-semibold transition-all',
                mode === option ? 'bg-card text-primary shadow-xs' : 'text-secondary',
              )}
            >
              {option === 'amount' ? 'مبلغ' : 'نسبة %'}
            </button>
          ))}
        </div>

        <input
          data-autofocus
          inputMode="decimal"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && apply()}
          placeholder={mode === 'percent' ? '10' : '0'}
          className="num h-12 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-center text-[18px] font-bold focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
        />

        <p className="text-[12px] text-tertiary">
          أقصى خصم ممكن <span className="num font-semibold">{fmt.money(maximum)}</span>
        </p>
      </div>
    </Modal>
  );
}
