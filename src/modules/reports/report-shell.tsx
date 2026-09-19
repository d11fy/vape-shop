'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';

import { Button } from '@/ui/primitives/button';
import { Dropdown, MenuItem, MenuLabel } from '@/ui/overlays/dropdown';
import { useToast } from '@/ui/feedback/toast';

/**
 * Export button shared by every report.
 *
 * Downloads go through a route handler rather than a server action so the
 * browser handles the file save natively — and so the same URL can be pasted
 * into a scheduled job later.
 */
export function ExportButton({
  report,
  params,
}: {
  report: string;
  params: Record<string, string | undefined>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const download = async (format: 'csv' | 'xlsx') => {
    setBusy(true);
    try {
      const search = new URLSearchParams({ report, format });
      for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value);
      }

      const response = await fetch(`/api/reports/export?${search.toString()}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message ?? 'تعذر إنشاء الملف');
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const match = /filename\*=UTF-8''([^;]+)/.exec(disposition);
      const fileName = match?.[1]
        ? decodeURIComponent(match[1])
        : `report.${format}`;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success('تم تنزيل الملف', fileName);
    } catch (error) {
      toast.error('تعذر التصدير', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dropdown
      align="end"
      width="w-52"
      trigger={(props) => (
        <Button
          {...props}
          variant="outline"
          loading={busy}
          iconStart={!busy ? <Download className="size-4" /> : undefined}
        >
          تصدير
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>اختر صيغة الملف</MenuLabel>
          <MenuItem
            icon={<FileSpreadsheet className="size-4" />}
            onClick={() => {
              close();
              void download('xlsx');
            }}
          >
            ملف Excel
          </MenuItem>
          <MenuItem
            icon={<FileText className="size-4" />}
            onClick={() => {
              close();
              void download('csv');
            }}
          >
            ملف CSV
          </MenuItem>
          <MenuItem
            icon={<FileText className="size-4" />}
            onClick={() => {
              close();
              window.print();
            }}
          >
            طباعة / PDF
          </MenuItem>
        </>
      )}
    </Dropdown>
  );
}

/** A labelled figure used across report summaries. */
export function ReportMetric({
  label,
  value,
  hint,
  tone,
  size = 'md',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'success' | 'danger' | 'warning' | 'accent';
  size?: 'md' | 'lg';
}) {
  const color =
    tone === 'success'
      ? 'text-success'
      : tone === 'danger'
        ? 'text-danger'
        : tone === 'warning'
          ? 'text-warning'
          : tone === 'accent'
            ? 'text-accent-strong'
            : 'text-primary';

  return (
    <div>
      <p className="text-[12px] text-secondary">{label}</p>
      <p
        className={`num mt-1 font-bold ${color} ${size === 'lg' ? 'text-[22px]' : 'text-[17px]'}`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11.5px] text-tertiary">{hint}</p>}
    </div>
  );
}
