'use client';

import { useCallback, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS } from '@/lib/table-query';

// Re-exported so client components can keep importing from one place.
export { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS };
export type { ParsedTableQuery } from '@/lib/table-query';

/**
 * Table state lives in the URL.
 *
 * That makes every filtered view shareable, survivable across a refresh, and —
 * because the server reads the same query string — it means sorting and paging
 * happen in PostgreSQL rather than in the browser. A store with 100,000
 * invoices never ships 100,000 rows to a phone.
 */
export interface TableParams {
  page: number;
  perPage: number;
  search: string;
  sort: string | null;
  dir: 'asc' | 'desc';
  get: (key: string) => string | null;
  getAll: (key: string) => string[];
  isPending: boolean;
  setParam: (key: string, value: string | null) => void;
  setParams: (values: Record<string, string | null>) => void;
  setPage: (page: number) => void;
  setSearch: (value: string) => void;
  toggleSort: (key: string) => void;
  reset: () => void;
  /** Build a href with the given overrides — used by pagination links. */
  buildHref: (values: Record<string, string | null>) => string;
}

/** Keys that should NOT reset the page number when they change. */
const NON_RESETTING = new Set(['page', 'sort', 'dir']);

export function useTableParams(): TableParams {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const page = Math.max(1, Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const perPageRaw = Number.parseInt(searchParams.get('per') ?? '', 10);
  const perPage = PER_PAGE_OPTIONS.includes(perPageRaw) ? perPageRaw : DEFAULT_PER_PAGE;
  const search = searchParams.get('q') ?? '';
  const sort = searchParams.get('sort');
  const dir = searchParams.get('dir') === 'asc' ? 'asc' : 'desc';

  const buildHref = useCallback(
    (values: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      let shouldResetPage = false;

      for (const [key, value] of Object.entries(values)) {
        if (value === null || value === '') next.delete(key);
        else next.set(key, value);
        if (!NON_RESETTING.has(key)) shouldResetPage = true;
      }

      if (shouldResetPage && !('page' in values)) next.delete('page');

      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams],
  );

  const setParams = useCallback(
    (values: Record<string, string | null>) => {
      const href = buildHref(values);
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [buildHref, router],
  );

  const setParam = useCallback(
    (key: string, value: string | null) => setParams({ [key]: value }),
    [setParams],
  );

  const toggleSort = useCallback(
    (key: string) => {
      if (sort === key) {
        setParams({ sort: key, dir: dir === 'asc' ? 'desc' : 'asc' });
      } else {
        setParams({ sort: key, dir: 'desc' });
      }
    },
    [sort, dir, setParams],
  );

  const reset = useCallback(() => {
    startTransition(() => router.replace(pathname, { scroll: false }));
  }, [pathname, router]);

  return {
    page,
    perPage,
    search,
    sort,
    dir,
    isPending,
    get: (key) => searchParams.get(key),
    getAll: (key) => searchParams.getAll(key),
    setParam,
    setParams,
    setPage: (value) => setParams({ page: value <= 1 ? null : String(value) }),
    setSearch: (value) => setParams({ q: value || null }),
    toggleSort,
    reset,
    buildHref,
  };
}

// `parseTableQuery` lives in `@/lib/table-query` because server components call
// it, and a `'use client'` module cannot be invoked from the server.
