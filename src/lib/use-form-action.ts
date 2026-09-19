'use client';

import { useCallback, useState, useTransition } from 'react';

import type { ActionResult } from '@/core/result';
import type { FieldErrors } from '@/core/errors';
import { useToast } from '@/ui/feedback/toast';

export interface FormActionOptions<T> {
  onSuccess?: (data: T) => void | Promise<void>;
  onError?: (error: { code: string; message: string }) => void;
  successMessage?: string;
  /** Show the error as a toast as well as inline. Defaults to true. */
  toastOnError?: boolean;
  /** Clear field errors as soon as the user edits. Defaults to true. */
  resetOnChange?: boolean;
}

export interface FormActionState<T> {
  pending: boolean;
  fieldErrors: FieldErrors;
  formError: string | null;
  /** Bind to `<form onSubmit={...}>`. */
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  /** Call with a ready-made FormData — for non-form triggers. */
  submit: (formData: FormData) => void;
  /** Bind to any input's `onChange` to clear its error. */
  clearError: (field: string) => void;
  reset: () => void;
  result: T | null;
}

/**
 * Wires a server action to a form: pending state, inline field errors, a toast
 * for anything the form cannot show in place, and success handling.
 *
 * Keeping this in one hook is what makes every form in the app behave the same
 * way — including the ones a cashier uses fifty times a day.
 */
export function useFormAction<T>(
  action: (formData: FormData) => Promise<ActionResult<T>>,
  options: FormActionOptions<T> = {},
): FormActionState<T> {
  const { toastOnError = true, resetOnChange = true } = options;
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<T | null>(null);

  const submit = useCallback(
    (formData: FormData) => {
      setFieldErrors({});
      setFormError(null);

      startTransition(async () => {
        const response = await action(formData);

        if (response.ok) {
          setResult(response.data);
          if (options.successMessage) toast.success(options.successMessage);
          await options.onSuccess?.(response.data);
          return;
        }

        const { error } = response;
        if (error.fieldErrors) setFieldErrors(error.fieldErrors);

        // Only surface the top-level message when no field owns it.
        const hasFieldMessage = Object.values(error.fieldErrors ?? {}).some((messages) =>
          messages?.some((message) => message.trim() !== ''),
        );
        if (!hasFieldMessage) setFormError(error.message);

        if (toastOnError && !hasFieldMessage) toast.error(error.message);
        options.onError?.(error);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action, toastOnError],
  );

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submit(new FormData(event.currentTarget));
    },
    [submit],
  );

  const clearError = useCallback(
    (field: string) => {
      if (!resetOnChange) return;
      setFieldErrors((current) => {
        if (!current[field]) return current;
        const next = { ...current };
        delete next[field];
        return next;
      });
      setFormError(null);
    },
    [resetOnChange],
  );

  const reset = useCallback(() => {
    setFieldErrors({});
    setFormError(null);
    setResult(null);
  }, []);

  return { pending, fieldErrors, formError, onSubmit, submit, clearError, reset, result };
}
