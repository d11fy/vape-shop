'use client';

import { createContext, useContext, useId } from 'react';
import { AlertCircle } from 'lucide-react';

import { cn } from '@/lib/cn';

interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

export interface FormFieldProps {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | string[] | null;
  required?: boolean;
  /** Extra control rendered on the far side of the label row. */
  labelAction?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label + control + hint + error, wired together with the right ARIA
 * attributes. Every form in the app uses this so validation always looks and
 * behaves the same way.
 */
export function FormField({
  label,
  hint,
  error,
  required,
  labelAction,
  className,
  children,
}: FormFieldProps) {
  const id = useId();
  const messages = Array.isArray(error) ? error.filter(Boolean) : error ? [error] : [];
  const invalid = messages.length > 0;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = invalid ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid }}>
      <div className={cn('space-y-1.5', className)}>
        {(label || labelAction) && (
          <div className="flex items-baseline justify-between gap-2">
            {label && (
              <label htmlFor={id} className="text-[13px] font-semibold text-primary">
                {label}
                {required && (
                  <span className="text-danger" aria-hidden="true">
                    {' '}
                    *
                  </span>
                )}
              </label>
            )}
            {labelAction}
          </div>
        )}

        {children}

        {invalid ? (
          <p
            id={errorId}
            className="flex items-start gap-1.5 text-[12px] font-medium text-danger"
            role="alert"
          >
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{messages.join(' · ')}</span>
          </p>
        ) : (
          hint && (
            <p id={hintId} className="text-[12px] leading-relaxed text-secondary">
              {hint}
            </p>
          )
        )}
      </div>
    </FieldContext.Provider>
  );
}

/**
 * Wiring for the control inside a `FormField`: the generated id the label's
 * `htmlFor` points at, the hint/error ids for `aria-describedby`, and whether
 * the field is showing an error. Every input primitive reads this, so a label
 * is always announced with its field and an error always turns the border red —
 * without any prop drilling. Outside a `FormField` it is empty.
 */
export function useFieldControl(): { id?: string; describedBy?: string; invalid: boolean } {
  const context = useContext(FieldContext);
  if (!context) return { invalid: false };
  return { id: context.id, describedBy: context.describedBy, invalid: context.invalid };
}

/** Groups related fields under a quiet heading inside long settings forms. */
export function FieldSet({
  legend,
  description,
  children,
  className,
}: {
  legend: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn('space-y-4', className)}>
      <div>
        <legend className="text-[13.5px] font-bold text-primary">{legend}</legend>
        {description && <p className="mt-1 text-[12.5px] text-secondary">{description}</p>}
      </div>
      {children}
    </fieldset>
  );
}

/** Two-column on desktop, stacked on mobile — the default form rhythm. */
export function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('grid gap-4 sm:grid-cols-2', className)}>{children}</div>;
}
