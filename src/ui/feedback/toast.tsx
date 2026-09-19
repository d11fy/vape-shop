'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

import { cn } from '@/lib/cn';

export type ToastTone = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss; `0` keeps it until dismissed. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastRecord extends ToastOptions {
  id: number;
  tone: ToastTone;
  duration: number;
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE_STYLE: Record<ToastTone, { icon: typeof Info; accent: string; ring: string }> = {
  success: { icon: CheckCircle2, accent: 'text-success', ring: 'bg-success' },
  error: { icon: XCircle, accent: 'text-danger', ring: 'bg-danger' },
  warning: { icon: AlertTriangle, accent: 'text-warning', ring: 'bg-warning' },
  info: { icon: Info, accent: 'text-info', ring: 'bg-info' },
};

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const [mounted, setMounted] = useState(false);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    setMounted(true);
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      const id = nextId++;
      const record: ToastRecord = {
        id,
        tone: options.tone ?? 'info',
        // Errors linger: the cashier may be looking at the customer, not the screen.
        duration: options.duration ?? (options.tone === 'error' ? 7000 : 4000),
        ...options,
      };
      // Never stack more than four — the fifth would cover the work area.
      setToasts((current) => [...current.slice(-3), record]);

      if (record.duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), record.duration),
        );
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (title, description) => show({ title, description, tone: 'success' }),
      error: (title, description) => show({ title, description, tone: 'error' }),
      warning: (title, description) => show({ title, description, tone: 'warning' }),
      info: (title, description) => show({ title, description, tone: 'info' }),
    }),
    [show, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            role="region"
            aria-label="التنبيهات"
            className={cn(
              'pointer-events-none fixed z-[90] flex flex-col gap-2',
              'inset-x-3 top-3 sm:inset-x-auto sm:bottom-5 sm:top-auto sm:end-5 sm:w-[364px]',
            )}
          >
            {toasts.map((toast) => (
              <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastRecord; onDismiss: () => void }) {
  const { icon: Icon, accent, ring } = TONE_STYLE[toast.tone];

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'animate-toast-in pointer-events-auto relative flex items-start gap-3 overflow-hidden',
        'rounded-[var(--radius-md)] border border-line bg-raised p-3.5 shadow-lg',
      )}
    >
      <span className={cn('absolute inset-y-0 start-0 w-1', ring)} aria-hidden="true" />
      <Icon className={cn('mt-0.5 size-[18px] shrink-0', accent)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold leading-snug text-primary">{toast.title}</p>
        {toast.description && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">{toast.description}</p>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss();
            }}
            className="mt-2 text-[12.5px] font-bold text-accent-strong underline-offset-4 hover:underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="إغلاق التنبيه"
        className="-m-1 shrink-0 rounded-[var(--radius-xs)] p-1 text-tertiary transition-colors hover:bg-sunken hover:text-primary"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
}
