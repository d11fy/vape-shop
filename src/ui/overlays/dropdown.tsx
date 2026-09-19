'use client';

import { useCallback, useId, useRef, useState } from 'react';

import { cn } from '@/lib/cn';
import { useClickOutside, useEscapeKey } from './use-overlay';

export interface DropdownProps {
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    'aria-expanded': boolean;
    'aria-haspopup': 'menu';
    id: string;
  }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  /** Which edge of the trigger the menu aligns to, in reading order. */
  align?: 'start' | 'end';
  width?: string;
  className?: string;
}

export function Dropdown({ trigger, children, align = 'end', width = 'w-56', className }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(open, [triggerRef, menuRef], close);
  useEscapeKey(open, () => {
    close();
    triggerRef.current?.focus();
  });

  return (
    <div className={cn('relative', className)}>
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen((value) => !value),
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        id,
      })}

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-labelledby={id}
          className={cn(
            'animate-pop-in absolute top-[calc(100%+6px)] z-50 overflow-hidden rounded-[var(--radius-md)]',
            'border border-line bg-raised p-1.5 shadow-lg',
            align === 'end' ? 'end-0' : 'start-0',
            width,
          )}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  tone = 'default',
  disabled,
  shortcut,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  shortcut?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[var(--radius-xs)] px-2.5 py-2 text-[13px] font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'danger'
          ? 'text-danger hover:bg-danger-soft'
          : 'text-primary hover:bg-sunken',
      )}
    >
      {icon && <span className="shrink-0 text-tertiary">{icon}</span>}
      <span className="min-w-0 flex-1 truncate text-start">{children}</span>
      {shortcut && <kbd className="num shrink-0 text-[11px] text-tertiary">{shortcut}</kbd>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1.5 h-px bg-line-subtle" role="separator" />;
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-tertiary">
      {children}
    </p>
  );
}
