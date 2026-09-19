'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useTableParams } from '@/ui/data/use-table-params';

export interface SearchInputProps {
  placeholder?: string;
  /** Milliseconds to wait after typing stops before hitting the server. */
  debounce?: number;
  className?: string;
  autoFocus?: boolean;
  /** Controlled mode — omit to drive the `?q=` URL parameter instead. */
  value?: string;
  onValueChange?: (value: string) => void;
}

/**
 * Debounced search. In URL mode it writes `?q=` so the server does the
 * filtering; the spinner shows while that navigation is in flight, which is the
 * honest signal that results are still loading.
 */
export function SearchInput({
  placeholder = 'بحث…',
  debounce = 300,
  className,
  autoFocus,
  value,
  onValueChange,
}: SearchInputProps) {
  const table = useTableParams();
  const controlled = value !== undefined;
  const [draft, setDraft] = useState(controlled ? value : table.search);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipFirst = useRef(true);

  // Keep in sync when the URL changes from elsewhere (reset button, back).
  useEffect(() => {
    if (!controlled) setDraft(table.search);
  }, [controlled, table.search]);

  useEffect(() => {
    if (controlled) return;
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    if (draft === table.search) return;

    const timer = setTimeout(() => table.setSearch(draft), debounce);
    return () => clearTimeout(timer);
    // `table` is rebuilt each render; depending on it would restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, debounce, controlled]);

  const update = (next: string) => {
    setDraft(next);
    onValueChange?.(next);
  };

  const clear = () => {
    update('');
    if (!controlled) table.setSearch('');
    inputRef.current?.focus();
  };

  const busy = !controlled && table.isPending && draft !== '';

  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute inset-y-0 start-0 flex w-10 items-center justify-center text-tertiary">
        {busy ? (
          <Loader2 className="size-4 animate-spin-slow" />
        ) : (
          <Search className="size-4" />
        )}
      </span>

      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        autoFocus={autoFocus}
        value={controlled ? value : draft}
        onChange={(event) => update(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card ps-10 pe-9 text-[14px] text-primary transition-[border-color,box-shadow] placeholder:text-tertiary focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
      />

      {(controlled ? value : draft) !== '' && (
        <button
          type="button"
          onClick={clear}
          aria-label="مسح البحث"
          className="absolute inset-y-0 end-0 flex w-9 items-center justify-center text-tertiary transition-colors hover:text-primary"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
