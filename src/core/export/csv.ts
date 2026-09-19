/**
 * CSV export.
 *
 * Two details matter for Arabic users on Windows: the UTF-8 BOM, without which
 * Excel renders Arabic as mojibake, and CRLF line endings, which older versions
 * of Excel expect. Both are cheap and save a support ticket every time.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines: string[] = [];
  lines.push(columns.map((column) => escapeCell(column.header)).join(','));

  for (const row of rows) {
    lines.push(columns.map((column) => escapeCell(column.value(row))).join(','));
  }

  // BOM + CRLF: Excel on Windows needs both to read this correctly.
  return `﻿${lines.join('\r\n')}`;
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);

  // Guard against CSV formula injection when the file is opened in a spreadsheet.
  const needsGuard = /^[=+\-@\t\r]/.test(text);
  const safe = needsGuard ? `'${text}` : text;

  if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`;
  return safe;
}

/**
 * Build the HTTP response headers for a file download.
 *
 * Two filenames are sent: an ASCII fallback for old clients — which still needs
 * the right extension or Windows opens it with the wrong app — and the RFC 5987
 * UTF-8 form that carries the real Arabic name.
 */
export function downloadHeaders(fileName: string, contentType: string): HeadersInit {
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1) : 'dat';
  const encoded = encodeURIComponent(fileName);

  return {
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="export.${extension}"; filename*=UTF-8''${encoded}`,
    'Cache-Control': 'no-store',
  };
}
