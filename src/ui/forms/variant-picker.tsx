'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Package, Search } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useFormat } from '@/ui/format';
import type { PosProduct } from '@/modules/pos/queries';

/**
 * Inline product search used by the purchase form and anywhere else that needs
 * to add catalogue lines. Hits the same server endpoint as the till, so a store
 * with thousands of variants stays responsive.
 */
export function VariantPicker({
  onSelect,
  placeholder = 'ابحث عن صنف لإضافته…',
  excludeIds = [],
  autoFocus,
  className,
}: {
  onSelect: (product: PosProduct) => void;
  placeholder?: string;
  excludeIds?: string[];
  autoFocus?: boolean;
  className?: string;
}) {
  const fmt = useFormat();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (term: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const response = await fetch(`/api/pos/products?q=${encodeURIComponent(term)}`, {
        signal: controller.signal,
      });
      const payload = (await response.json()) as { products: PosProduct[] };
      setResults(payload.products);
      setCursor(0);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => void search(term), 220);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    const handler = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  const available = results.filter((product) => !excludeIds.includes(product.variantId));

  const pick = (product: PosProduct) => {
    onSelect(product);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <span className="pointer-events-none absolute inset-y-0 start-0 flex w-10 items-center justify-center text-tertiary">
        {loading ? <Loader2 className="size-4 animate-spin-slow" /> : <Search className="size-4" />}
      </span>

      <input
        value={query}
        autoFocus={autoFocus}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setCursor((value) => Math.min(value + 1, available.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setCursor((value) => Math.max(value - 1, 0));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            const product = available[cursor];
            if (product) pick(product);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className="h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card ps-10 pe-3 text-[14px] text-primary placeholder:text-tertiary focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
      />

      {open && query.trim().length >= 2 && (
        <div className="animate-pop-in absolute inset-x-0 top-[calc(100%+4px)] z-30 max-h-72 overflow-y-auto rounded-[var(--radius-md)] border border-line bg-raised p-1.5 shadow-lg">
          {available.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-tertiary">
              {loading ? 'جارٍ البحث…' : 'لا توجد أصناف مطابقة'}
            </p>
          ) : (
            <ul>
              {available.map((product, index) => (
                <li key={product.variantId}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => pick(product)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2.5 text-start transition-colors',
                      index === cursor ? 'bg-sunken' : 'hover:bg-sunken/60',
                    )}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-sunken text-secondary">
                      <Package className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-primary">
                        {product.label}
                      </span>
                      <span className="num-mixed block truncate text-[11.5px] text-tertiary">
                        {product.sku} · المتوفر{' '}
                        {(product.stock / product.factor).toLocaleString('en-US', {
                          maximumFractionDigits: 2,
                        })}{' '}
                        {product.unitLabel}
                      </span>
                    </span>
                    <span className="num shrink-0 text-[12.5px] font-semibold text-secondary">
                      {fmt.money(product.sellingPrice)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
