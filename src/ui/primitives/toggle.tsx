'use client';

import { forwardRef, useId } from 'react';
import { Check, Minus } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, indeterminate, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <span className="relative mt-0.5 inline-flex size-[18px] shrink-0">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          className="peer size-[18px] cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-card transition-colors checked:border-accent-strong checked:bg-accent-strong indeterminate:border-accent-strong indeterminate:bg-accent-strong focus-visible:shadow-[var(--ring-accent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-sunken"
          {...props}
        />
        <span className="pointer-events-none absolute inset-0 hidden items-center justify-center text-white peer-checked:flex">
          {indeterminate ? <Minus className="size-3" /> : <Check className="size-3.5" strokeWidth={3} />}
        </span>
      </span>
      {(label || description) && (
        <label htmlFor={inputId} className="cursor-pointer select-none">
          {label && <span className="block text-[13.5px] font-medium text-primary">{label}</span>}
          {description && (
            <span className="mt-0.5 block text-[12px] leading-relaxed text-secondary">
              {description}
            </span>
          )}
        </label>
      )}
    </div>
  );
});

export interface SwitchProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4 select-none',
        props.disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[13.5px] font-medium text-primary">{label}</span>}
          {description && (
            <span className="mt-0.5 block text-[12px] leading-relaxed text-secondary">
              {description}
            </span>
          )}
        </span>
      )}
      <span className="relative inline-flex shrink-0">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          role="switch"
          className="peer h-6 w-11 cursor-pointer appearance-none rounded-full bg-line-strong transition-colors checked:bg-accent-strong focus-visible:shadow-[var(--ring-accent)] focus-visible:outline-none disabled:cursor-not-allowed"
          {...props}
        />
        {/* Knob travels toward the reading-end side, so it flips correctly in RTL. */}
        <span
          className="pointer-events-none absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-[inset-inline-start] duration-200 start-0.5 peer-checked:start-[22px]"
          aria-hidden="true"
        />
      </span>
    </label>
  );
});

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, description, className, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn('flex items-start gap-2.5', className)}>
      <input
        ref={ref}
        id={inputId}
        type="radio"
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer appearance-none rounded-full border border-line-strong bg-card transition-shadow checked:border-[5px] checked:border-accent-strong focus-visible:shadow-[var(--ring-accent)] focus-visible:outline-none"
        {...props}
      />
      {(label || description) && (
        <label htmlFor={inputId} className="cursor-pointer select-none">
          {label && <span className="block text-[13.5px] font-medium text-primary">{label}</span>}
          {description && (
            <span className="mt-0.5 block text-[12px] leading-relaxed text-secondary">
              {description}
            </span>
          )}
        </label>
      )}
    </div>
  );
});
