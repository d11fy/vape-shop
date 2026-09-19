'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Search, CornerDownLeft } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Modal } from '@/ui/overlays/modal';
import { NavIcon } from './nav-icon';

export interface SearchHit {
  id: string;
  type: 'product' | 'invoice' | 'customer' | 'supplier' | 'employee' | 'page';
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
}

const TYPE_META: Record<SearchHit['type'], { label: string; icon: string }> = {
  product: { label: 'منتجات', icon: 'Package' },
  invoice: { label: 'فواتير', icon: 'ReceiptText' },
  customer: { label: 'عملاء', icon: 'Users' },
  supplier: { label: 'موردون', icon: 'Truck' },
  employee: { label: 'موظفون', icon: 'UserCog' },
  page: { label: 'الصفحات', icon: 'LayoutDashboard' },
};

/**
 * Command palette. Ctrl/Cmd+K anywhere, or the search field in the header.
 *
 * Every query hits the server, because the point is to find a specific invoice
 * among a hundred thousand — client-side filtering could never do that.
 */
export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Global shortcut.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setHits([]);
      setCursor(0);
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('search failed');
        const payload = (await response.json()) as { hits: SearchHit[] };
        setHits(payload.hits);
        setCursor(0);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setHits([]);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => clearTimeout(timer);
  }, [query]);

  const grouped = useMemo(() => {
    const groups = new Map<SearchHit['type'], SearchHit[]>();
    for (const hit of hits) {
      const bucket = groups.get(hit.type) ?? [];
      bucket.push(hit);
      groups.set(hit.type, bucket);
    }
    return [...groups.entries()];
  }, [hits]);

  const flat = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);

  const go = useCallback(
    (hit: SearchHit) => {
      onOpenChange(false);
      router.push(hit.href);
    },
    [onOpenChange, router],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((value) => Math.min(value + 1, flat.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((value) => Math.max(value - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = flat[cursor];
      if (hit) go(hit);
    }
  };

  let runningIndex = -1;

  return (
    <Modal open={open} onClose={() => onOpenChange(false)} title="بحث شامل" size="lg">
      <div className="space-y-3">
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 start-0 flex w-10 items-center justify-center text-tertiary">
            {loading ? <Loader2 className="size-4 animate-spin-slow" /> : <Search className="size-4" />}
          </span>
          <input
            data-autofocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="ابحث عن منتج، رقم فاتورة، عميل، مورد…"
            className="h-12 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card ps-10 pe-3 text-[15px] text-primary placeholder:text-tertiary focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
          />
        </div>

        <div className="max-h-[52vh] min-h-[180px] overflow-y-auto">
          {query.trim().length < 2 ? (
            <div className="px-2 py-10 text-center">
              <p className="text-[13px] text-tertiary">اكتب حرفين على الأقل لبدء البحث</p>
              <p className="mt-1 text-[12px] text-tertiary">
                يمكنك البحث بالاسم، الباركود، رقم الفاتورة أو رقم الهاتف
              </p>
            </div>
          ) : flat.length === 0 && !loading ? (
            <div className="px-2 py-10 text-center">
              <p className="text-[13px] font-semibold text-primary">لا توجد نتائج</p>
              <p className="mt-1 text-[12px] text-tertiary">
                تأكد من الإملاء أو جرّب كلمة بحث أقصر
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(([type, items]) => (
                <div key={type}>
                  <p className="px-1 pb-1.5 text-[11px] font-bold uppercase tracking-wide text-tertiary">
                    {TYPE_META[type].label}
                  </p>
                  <ul className="space-y-0.5">
                    {items.map((hit) => {
                      runningIndex += 1;
                      const active = runningIndex === cursor;
                      const index = runningIndex;
                      return (
                        <li key={`${hit.type}-${hit.id}`}>
                          <button
                            type="button"
                            onMouseEnter={() => setCursor(index)}
                            onClick={() => go(hit)}
                            className={cn(
                              'flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2.5 text-start transition-colors',
                              active ? 'bg-sunken' : 'hover:bg-sunken/60',
                            )}
                          >
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-xs)] bg-sunken text-secondary">
                              <NavIcon name={TYPE_META[hit.type].icon} className="size-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13.5px] font-semibold text-primary">
                                {hit.title}
                              </span>
                              {hit.subtitle && (
                                <span className="block truncate text-[12px] text-tertiary">
                                  {hit.subtitle}
                                </span>
                              )}
                            </span>
                            {hit.badge && (
                              <span className="num shrink-0 text-[12px] font-semibold text-secondary">
                                {hit.badge}
                              </span>
                            )}
                            {active && (
                              <CornerDownLeft className="size-3.5 shrink-0 text-tertiary" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
