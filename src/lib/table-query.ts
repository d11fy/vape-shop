/**
 * Table query parsing.
 *
 * Isomorphic on purpose: pages read `searchParams` on the SERVER to build the
 * database query, while `useTableParams` writes the same keys on the CLIENT.
 * Keeping the shape in one non-client module is what stops the two sides from
 * drifting — and a `'use client'` module cannot be called from a server
 * component at all.
 */

export const DEFAULT_PER_PAGE = 25;
export const PER_PAGE_OPTIONS = [10, 25, 50, 100];

export interface ParsedTableQuery {
  page: number;
  perPage: number;
  /** Rows to skip — feeds Prisma's `skip`. */
  skip: number;
  /** Rows to take — feeds Prisma's `take`. */
  take: number;
  search: string;
  sort: string | null;
  dir: 'asc' | 'desc';
}

export interface ParseTableQueryOptions {
  defaultSort?: string;
  defaultPerPage?: number;
  maxPerPage?: number;
}

export function parseTableQuery(
  params: Record<string, string | string[] | undefined>,
  options: ParseTableQueryOptions = {},
): ParsedTableQuery {
  const page = Math.max(1, Number.parseInt(firstParam(params, 'page') ?? '1', 10) || 1);
  const requested = Number.parseInt(firstParam(params, 'per') ?? '', 10);
  const maxPerPage = options.maxPerPage ?? 100;

  const perPage = PER_PAGE_OPTIONS.includes(requested)
    ? Math.min(requested, maxPerPage)
    : (options.defaultPerPage ?? DEFAULT_PER_PAGE);

  return {
    page,
    perPage,
    skip: (page - 1) * perPage,
    take: perPage,
    // Cap the search term: an unbounded string would reach ILIKE.
    search: (firstParam(params, 'q') ?? '').trim().slice(0, 120),
    sort: firstParam(params, 'sort') ?? options.defaultSort ?? null,
    dir: firstParam(params, 'dir') === 'asc' ? 'asc' : 'desc',
  };
}

/** `searchParams` values can be repeated; take the first. */
export function firstParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}
