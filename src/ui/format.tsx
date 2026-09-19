'use client';

import { createContext, useContext, useMemo } from 'react';

import { buildFormatter, DEFAULT_FORMAT, type FormatSettings, type Formatter } from '@/lib/formatter';

export type { FormatSettings, Formatter };

/**
 * Makes the store's currency, decimals and timezone available to every client
 * component, so a call site is just `fmt.money(value)` instead of threading
 * four settings through the tree.
 *
 * The formatter itself lives in `@/lib/formatter`, which is deliberately not a
 * client module — server components build the same object and produce
 * byte-identical output.
 */
const FormatContext = createContext<Formatter | null>(null);

export function FormatProvider({
  settings,
  children,
}: {
  settings: FormatSettings;
  children: React.ReactNode;
}) {
  const value = useMemo(() => buildFormatter(settings), [settings]);
  return <FormatContext.Provider value={value}>{children}</FormatContext.Provider>;
}

const fallback = buildFormatter(DEFAULT_FORMAT);

export function useFormat(): Formatter {
  // Falling back keeps isolated components renderable outside the app shell.
  return useContext(FormatContext) ?? fallback;
}

/** Wrap a number so it renders LTR with tabular digits inside RTL text. */
export function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={`num ${className ?? ''}`}>{children}</span>;
}
