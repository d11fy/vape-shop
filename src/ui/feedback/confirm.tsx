'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Info, Trash2 } from 'lucide-react';

import { Button } from '@/ui/primitives/button';
import { Modal } from '@/ui/overlays/modal';
import { cn } from '@/lib/cn';

export interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'neutral';
  /** Extra detail shown in a quiet box — e.g. what exactly will change. */
  details?: React.ReactNode;
  /** Require typing this exact text before the confirm button unlocks. */
  confirmText?: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

const TONE_STYLE = {
  danger: { icon: Trash2, chip: 'bg-danger-soft text-danger', variant: 'danger' as const },
  warning: { icon: AlertTriangle, chip: 'bg-warning-soft text-warning', variant: 'primary' as const },
  neutral: { icon: Info, chip: 'bg-info-soft text-info', variant: 'primary' as const },
};

/**
 * Confirmation dialogs as a promise.
 *
 *   if (await confirm({ title: 'إلغاء الفاتورة؟', ... })) { … }
 *
 * Every destructive action in the app routes through here, so the wording and
 * the visual weight of "are you sure" are consistent everywhere.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [typed, setTyped] = useState('');
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setOptions(next);
    setTyped('');
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
    setTyped('');
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  const tone = TONE_STYLE[options?.tone ?? 'neutral'];
  const Icon = tone.icon;
  const locked = Boolean(options?.confirmText) && typed.trim() !== options?.confirmText;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false)}>
              {options?.cancelLabel ?? 'إلغاء'}
            </Button>
            <Button variant={tone.variant} onClick={() => settle(true)} disabled={locked}>
              {options?.confirmLabel ?? 'تأكيد'}
            </Button>
          </>
        }
      >
        <div className="flex gap-3.5">
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-full',
              tone.chip,
            )}
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1 space-y-3">
            <div className="text-[13.5px] leading-relaxed text-secondary">{options?.message}</div>

            {options?.details && (
              <div className="rounded-[var(--radius-sm)] border border-line-subtle bg-sunken px-3 py-2.5 text-[12.5px] text-secondary">
                {options.details}
              </div>
            )}

            {options?.confirmText && (
              <label className="block space-y-1.5">
                <span className="text-[12.5px] text-secondary">
                  اكتب <span className="font-bold text-primary">{options.confirmText}</span> للتأكيد
                </span>
                <input
                  value={typed}
                  onChange={(event) => setTyped(event.target.value)}
                  data-autofocus
                  className="h-10 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-[14px] focus:border-danger focus:shadow-[var(--ring-danger)] focus:outline-none"
                />
              </label>
            )}
          </div>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return context;
}
