'use client';

import { forwardRef } from 'react';

import { cn } from '@/lib/cn';
import { useFieldControl } from '@/ui/forms/form-field';

const FIELD_BASE =
  'w-full rounded-[var(--radius-sm)] border bg-card text-primary transition-[border-color,box-shadow] ' +
  'placeholder:text-tertiary disabled:cursor-not-allowed disabled:bg-sunken disabled:text-tertiary ' +
  'focus:outline-none focus:border-accent-strong focus:shadow-[var(--ring-accent)]';

export const FIELD_SIZES = {
  sm: 'h-9 px-3 text-[13px]',
  md: 'h-11 px-3.5 text-[14px]',
  lg: 'h-12 px-4 text-[15px]',
} as const;

export type FieldSize = keyof typeof FIELD_SIZES;

/**
 * Numeric fields render left-to-right (`.num`) so "+971", "12.5" and "-3" read
 * correctly, but they sit inside a right-to-left page. Logical utilities
 * (`ps-*`, `text-start`) would then resolve against the input's own LTR
 * direction and put the padding on the opposite side from the adornment. The
 * `rtl:`/`ltr:` variants follow the document's `dir` instead, so padding lands
 * where the icon or unit actually is and the number aligns like every other
 * field.
 */
export const NUMERIC_ALIGN = 'num rtl:text-right ltr:text-left';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: FieldSize;
  invalid?: boolean;
  /** Rendered inside the field on the reading-start side. */
  iconStart?: React.ReactNode;
  /** Rendered inside the field on the reading-end side (units, clear button). */
  iconEnd?: React.ReactNode;
  /** Force LTR + tabular digits — for prices, quantities, phone numbers. */
  numeric?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid, iconStart, iconEnd, numeric, className, ...props },
  ref,
) {
  const control = useFieldControl();
  const isInvalid = invalid ?? control.invalid;

  const field = (
    <input
      ref={ref}
      id={control.id}
      aria-describedby={control.describedBy}
      aria-invalid={isInvalid || undefined}
      className={cn(
        FIELD_BASE,
        FIELD_SIZES[size],
        isInvalid
          ? 'border-danger focus:border-danger focus:shadow-[var(--ring-danger)]'
          : 'border-line-strong',
        numeric ? NUMERIC_ALIGN : null,
        iconStart && (numeric ? 'rtl:pr-10 ltr:pl-10' : 'ps-10'),
        iconEnd && (numeric ? 'rtl:pl-10 ltr:pr-10' : 'pe-10'),
        className,
      )}
      {...props}
    />
  );

  if (!iconStart && !iconEnd) return field;

  return (
    <div className="relative">
      {iconStart && (
        <span className="pointer-events-none absolute inset-y-0 start-0 flex w-10 items-center justify-center text-tertiary">
          {iconStart}
        </span>
      )}
      {field}
      {iconEnd && (
        <span className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-tertiary">
          {iconEnd}
        </span>
      )}
    </div>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, rows = 3, ...props },
  ref,
) {
  const control = useFieldControl();
  const isInvalid = invalid ?? control.invalid;

  return (
    <textarea
      ref={ref}
      rows={rows}
      id={control.id}
      aria-describedby={control.describedBy}
      aria-invalid={isInvalid || undefined}
      className={cn(
        FIELD_BASE,
        'resize-y px-3.5 py-2.5 text-[14px] leading-relaxed',
        isInvalid
          ? 'border-danger focus:border-danger focus:shadow-[var(--ring-danger)]'
          : 'border-line-strong',
        className,
      )}
      {...props}
    />
  );
});

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: FieldSize;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size = 'md', invalid, className, children, ...props },
  ref,
) {
  const control = useFieldControl();
  const isInvalid = invalid ?? control.invalid;

  return (
    <div className="relative">
      <select
        ref={ref}
        id={control.id}
        aria-describedby={control.describedBy}
        aria-invalid={isInvalid || undefined}
        className={cn(
          FIELD_BASE,
          FIELD_SIZES[size],
          'cursor-pointer appearance-none pe-9',
          isInvalid
            ? 'border-danger focus:border-danger focus:shadow-[var(--ring-danger)]'
            : 'border-line-strong',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-tertiary"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M4 6l4 4 4-4"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});
