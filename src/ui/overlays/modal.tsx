'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useEscapeKey, useFocusTrap, useLockBodyScroll } from './use-overlay';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const SIZES: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-[min(1100px,94vw)]',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  size?: ModalSize;
  /** Sticky action bar at the bottom of the panel. */
  footer?: React.ReactNode;
  /** Suppress closing on backdrop click — for forms with unsaved input. */
  dismissible?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * One overlay component, two shapes.
 *
 * On a phone it rises from the bottom as a sheet with a drag handle — the
 * gesture the OS has taught everyone. On a larger screen it becomes a centred
 * dialog. Same markup, same focus management, no duplicated state.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  dismissible = true,
  className,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useLockBodyScroll(open);
  useFocusTrap(open, panelRef);

  const handleClose = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  useEscapeKey(open, handleClose);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        className="animate-fade-in absolute inset-0 bg-ink-strong/45 backdrop-blur-[2px]"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-card shadow-pop',
          'animate-sheet-up rounded-t-[var(--radius-xl)] sm:animate-pop-in sm:rounded-[var(--radius-lg)]',
          'border border-line-subtle',
          SIZES[size],
          className,
        )}
      >
        {/* Drag affordance — phone only. */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>

        <header className="flex items-start justify-between gap-3 px-5 pb-3 pt-4 sm:pt-5">
          <div className="min-w-0">
            <h2 className="text-[16px] font-bold leading-snug text-primary">{title}</h2>
            {description && (
              <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="-me-1.5 -mt-1 shrink-0 rounded-[var(--radius-sm)] p-2 text-tertiary transition-colors hover:bg-sunken hover:text-primary"
          >
            <X className="size-[18px]" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {footer && (
          <footer className="safe-bottom flex items-center justify-end gap-2 border-t border-line-subtle bg-sunken/40 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A side panel. Used for filters and for the POS cart on tablets — anywhere the
 * page behind should stay visible.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  footer,
  width = 'md',
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useLockBodyScroll(open);
  useFocusTrap(open, panelRef);
  useEscapeKey(open, onClose);

  if (!mounted || !open) return null;

  const widths = { sm: 'sm:w-[340px]', md: 'sm:w-[420px]', lg: 'sm:w-[540px]' } as const;

  return createPortal(
    <div className="fixed inset-0 z-[80]" role="presentation">
      <div
        className="animate-fade-in absolute inset-0 bg-ink-strong/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'absolute inset-y-0 end-0 flex w-full flex-col border-s border-line bg-card shadow-pop',
          'animate-slide-up sm:animate-fade-in',
          widths[width],
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line-subtle px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15.5px] font-bold text-primary">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-secondary">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="-me-1.5 shrink-0 rounded-[var(--radius-sm)] p-2 text-tertiary transition-colors hover:bg-sunken hover:text-primary"
          >
            <X className="size-[18px]" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="safe-bottom flex items-center justify-end gap-2 border-t border-line-subtle bg-sunken/40 px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
