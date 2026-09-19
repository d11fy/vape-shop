'use client';

import { forwardRef, useEffect, useState } from 'react';

import { cn } from '@/lib/cn';
import { getCurrency } from '@/core/currency';
import { parseMoneyInput, toMajor } from '@/core/money';
import { qtyFromSaleUnits, qtyToInputValue, type Factor } from '@/core/quantity';
import { useFormat } from '@/ui/format';
import { useFieldControl } from '@/ui/forms/form-field';
import { NUMERIC_ALIGN } from '@/ui/primitives/input';

/**
 * Money and quantity inputs.
 *
 * Both keep a free-text draft in state while the user types — so a half-typed
 * "12." is not destroyed by re-formatting — and emit the canonical integer
 * (minor units, or thousandths of a base unit) on every valid keystroke. Arabic
 * and Persian digits are accepted; the value stored is always exact.
 */

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  /** Minor units. */
  value: number;
  onValueChange: (value: number) => void;
  invalid?: boolean;
  size?: 'sm' | 'md' | 'lg';
  /** Show the currency symbol inside the field. */
  showCurrency?: boolean;
}

const SIZES = {
  sm: 'h-9 text-[13px]',
  md: 'h-11 text-[14px]',
  lg: 'h-12 text-[16px]',
} as const;

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onValueChange, invalid, size = 'md', showCurrency = true, className, ...props },
  ref,
) {
  const fmt = useFormat();
  const control = useFieldControl();
  const isInvalid = invalid ?? control.invalid;
  const symbol = getCurrency(fmt.currency).symbol;
  const [draft, setDraft] = useState(() => formatDraft(value, fmt.decimals));

  // Re-sync when the value changes from outside (a reset, a preset button).
  useEffect(() => {
    const parsed = parseMoneyInput(draft, fmt.decimals);
    if (parsed !== value) setDraft(formatDraft(value, fmt.decimals));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, fmt.decimals]);

  return (
    <div className="relative">
      <input
        ref={ref}
        inputMode="decimal"
        value={draft}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const parsed = parseMoneyInput(next, fmt.decimals);
          onValueChange(parsed ?? 0);
        }}
        onBlur={(event) => {
          // Normalise on blur so the field always ends up well-formed.
          setDraft(formatDraft(value, fmt.decimals));
          props.onBlur?.(event);
        }}
        id={control.id}
        aria-describedby={control.describedBy}
        aria-invalid={isInvalid || undefined}
        className={cn(
          NUMERIC_ALIGN,
          'w-full rounded-[var(--radius-sm)] border bg-card px-3 text-primary transition-[border-color,box-shadow]',
          'placeholder:text-tertiary focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none',
          'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-tertiary',
          SIZES[size],
          // The symbol sits at the page's reading end — see NUMERIC_ALIGN.
          showCurrency && 'rtl:pl-12 ltr:pr-12',
          isInvalid
            ? 'border-danger focus:border-danger focus:shadow-[var(--ring-danger)]'
            : 'border-line-strong',
          className,
        )}
        {...props}
      />
      {showCurrency && (
        <span className="pointer-events-none absolute inset-y-0 end-0 flex w-11 items-center justify-center text-[12px] font-semibold text-tertiary">
          {symbol}
        </span>
      )}
    </div>
  );
});

function formatDraft(value: number, decimals: number): string {
  if (value === 0) return '';
  const major = toMajor(value, decimals);
  return Number.isInteger(major) ? String(major) : major.toFixed(decimals);
}

// ── Quantity ─────────────────────────────────────────────────────────────────

export interface QuantityInputProps {
  /** Base units, ×1000. */
  value: number;
  onValueChange: (value: number) => void;
  /** Base units per sale unit, ×1000. */
  factor: Factor;
  unitLabel: string;
  allowFractional?: boolean;
  invalid?: boolean;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function QuantityInput({
  value,
  onValueChange,
  factor,
  unitLabel,
  allowFractional = true,
  invalid,
  size = 'md',
  disabled,
  className,
  placeholder = '0',
}: QuantityInputProps) {
  const control = useFieldControl();
  const isInvalid = invalid ?? control.invalid;
  const [draft, setDraft] = useState(() => (value === 0 ? '' : qtyToInputValue(value, factor)));

  useEffect(() => {
    const parsed = qtyFromSaleUnits(draft || '0', factor);
    if (parsed !== value) setDraft(value === 0 ? '' : qtyToInputValue(value, factor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, factor]);

  return (
    <div className={cn('relative', className)}>
      <input
        inputMode={allowFractional ? 'decimal' : 'numeric'}
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const parsed = qtyFromSaleUnits(next === '' ? '0' : next, factor);
          onValueChange(parsed ?? 0);
        }}
        onBlur={() => setDraft(value === 0 ? '' : qtyToInputValue(value, factor))}
        id={control.id}
        aria-describedby={control.describedBy}
        aria-invalid={isInvalid || undefined}
        className={cn(
          NUMERIC_ALIGN,
          'w-full rounded-[var(--radius-sm)] border bg-card px-3 text-primary transition-[border-color,box-shadow]',
          'placeholder:text-tertiary focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none',
          'disabled:cursor-not-allowed disabled:bg-sunken disabled:text-tertiary',
          SIZES[size],
          'rtl:pl-16 ltr:pr-16',
          isInvalid
            ? 'border-danger focus:border-danger focus:shadow-[var(--ring-danger)]'
            : 'border-line-strong',
        )}
      />
      <span className="pointer-events-none absolute inset-y-0 end-0 flex max-w-16 items-center justify-center truncate px-2 text-[11.5px] font-semibold text-tertiary">
        {unitLabel}
      </span>
    </div>
  );
}
