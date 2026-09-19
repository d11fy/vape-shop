'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, FileText, Printer, Receipt } from 'lucide-react';

import { cn } from '@/lib/cn';

export type PrintFormat = 'thermal' | 'a4';

/**
 * Controls above a printable document. The toolbar itself carries `no-print`,
 * so what comes out of the printer is only the receipt.
 */
export function PrintToolbar({
  format,
  onFormat,
  backHref,
  backLabel,
  autoPrint,
}: {
  format: PrintFormat;
  onFormat: (format: PrintFormat) => void;
  backHref: string;
  backLabel: string;
  /** Open the print dialog as soon as the document is on screen. */
  autoPrint?: boolean;
}) {
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    if (!autoPrint || printed) return;
    // One frame for fonts and layout to settle, otherwise the preview can
    // capture the page mid-render.
    const timer = setTimeout(() => {
      setPrinted(true);
      window.print();
    }, 350);
    return () => clearTimeout(timer);
  }, [autoPrint, printed]);

  return (
    <div className="no-print sticky top-0 z-10 border-b border-line bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <a
          href={backHref}
          className="flex items-center gap-1.5 text-[13px] font-semibold text-secondary transition-colors hover:text-primary"
        >
          <ArrowRight className="size-4" />
          {backLabel}
        </a>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-[var(--radius-sm)] border border-line-subtle bg-sunken p-0.5">
            {(
              [
                { value: 'thermal' as const, label: 'حراري', icon: Receipt },
                { value: 'a4' as const, label: 'A4', icon: FileText },
              ]
            ).map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onFormat(option.value)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-[var(--radius-xs)] px-3 text-[12.5px] font-semibold transition-all',
                    format === option.value
                      ? 'bg-card text-primary shadow-xs'
                      : 'text-secondary hover:text-primary',
                  )}
                >
                  <Icon className="size-3.5" />
                  {option.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] bg-ink px-4 text-[13px] font-bold text-on-inverse"
          >
            <Printer className="size-4" />
            طباعة
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Wraps the document and keeps the chosen format in component state.
 *
 * Both layouts arrive already rendered by the server and are toggled with CSS.
 * A render prop would be a function crossing the server/client boundary, which
 * React cannot serialise — and rendering both is free here anyway, since it is
 * one small invoice either way.
 */
export function PrintShell({
  backHref,
  backLabel = 'رجوع للفاتورة',
  autoPrint,
  thermal,
  a4,
}: {
  backHref: string;
  backLabel?: string;
  autoPrint?: boolean;
  thermal: React.ReactNode;
  a4: React.ReactNode;
}) {
  const [format, setFormat] = useState<PrintFormat>('thermal');

  return (
    <>
      <PrintToolbar
        format={format}
        onFormat={setFormat}
        backHref={backHref}
        backLabel={backLabel}
        autoPrint={autoPrint}
      />

      <div className="print-area flex justify-center px-3 py-6 print:p-0">
        <div className="shadow-lg print:shadow-none">
          <div className={format === 'thermal' ? undefined : 'hidden'}>{thermal}</div>
          <div className={format === 'a4' ? undefined : 'hidden'}>{a4}</div>
        </div>
      </div>
    </>
  );
}
