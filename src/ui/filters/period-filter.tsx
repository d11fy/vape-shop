'use client';

import { useState } from 'react';
import { CalendarRange, Check } from 'lucide-react';

import { cn } from '@/lib/cn';
import { PERIOD_LABELS, type PeriodPreset } from '@/core/datetime';
import { Button } from '@/ui/primitives/button';
import { Modal } from '@/ui/overlays/modal';
import { Dropdown } from '@/ui/overlays/dropdown';
import { useTableParams } from '@/ui/data/use-table-params';

const QUICK: PeriodPreset[] = ['today', 'yesterday', 'this_week', 'this_month'];
const ALL: PeriodPreset[] = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'last_7_days',
  'last_30_days',
  'this_year',
];

/**
 * Period selector shared by the dashboard and every report.
 *
 * The choice lives in the URL (`?period=` plus `?from=&to=` for a custom
 * range), so a filtered report is a link you can send to your accountant.
 */
export function PeriodFilter({
  value,
  from,
  to,
  className,
  compact = false,
}: {
  value: PeriodPreset;
  from?: string;
  to?: string;
  className?: string;
  compact?: boolean;
}) {
  const { setParams } = useTableParams();
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from ?? '');
  const [draftTo, setDraftTo] = useState(to ?? '');

  const label =
    value === 'custom' && from && to
      ? `${from} ← ${to}`
      : PERIOD_LABELS[value];

  const select = (preset: PeriodPreset) => {
    if (preset === 'custom') {
      setCustomOpen(true);
      return;
    }
    setParams({ period: preset, from: null, to: null });
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {!compact && (
        <div className="hidden items-center gap-1 rounded-[var(--radius-sm)] border border-line-subtle bg-sunken p-0.5 md:flex">
          {QUICK.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => select(preset)}
              className={cn(
                'h-8 rounded-[var(--radius-xs)] px-2.5 text-[12.5px] font-semibold transition-all',
                value === preset
                  ? 'bg-card text-primary shadow-xs'
                  : 'text-secondary hover:text-primary',
              )}
            >
              {PERIOD_LABELS[preset]}
            </button>
          ))}
        </div>
      )}

      <Dropdown
        align="end"
        width="w-52"
        trigger={(props) => (
          <button
            {...props}
            className="flex h-9 items-center gap-1.5 rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-[12.5px] font-semibold text-primary transition-colors hover:bg-sunken"
          >
            <CalendarRange className="size-4 text-tertiary" />
            <span className="max-w-40 truncate">{label}</span>
          </button>
        )}
      >
        {(close) => (
          <>
            {ALL.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  close();
                  select(preset);
                }}
                className="flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-2 text-[13px] text-primary transition-colors hover:bg-sunken"
              >
                {PERIOD_LABELS[preset]}
                {value === preset && <Check className="size-3.5 text-accent-strong" />}
              </button>
            ))}
            <div className="my-1.5 h-px bg-line-subtle" />
            <button
              type="button"
              onClick={() => {
                close();
                select('custom');
              }}
              className="flex w-full items-center justify-between rounded-[var(--radius-xs)] px-2.5 py-2 text-[13px] text-primary transition-colors hover:bg-sunken"
            >
              فترة مخصصة
              {value === 'custom' && <Check className="size-3.5 text-accent-strong" />}
            </button>
          </>
        )}
      </Dropdown>

      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        title="فترة مخصصة"
        description="اختر تاريخ البداية والنهاية"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCustomOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              disabled={!draftFrom || !draftTo || draftFrom > draftTo}
              onClick={() => {
                setCustomOpen(false);
                setParams({ period: 'custom', from: draftFrom, to: draftTo });
              }}
            >
              تطبيق
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-[13px] font-semibold text-primary">من تاريخ</span>
            <input
              type="date"
              value={draftFrom}
              onChange={(event) => setDraftFrom(event.target.value)}
              className="num h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-[14px] focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[13px] font-semibold text-primary">إلى تاريخ</span>
            <input
              type="date"
              value={draftTo}
              onChange={(event) => setDraftTo(event.target.value)}
              className="num h-11 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-[14px] focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
            />
          </label>
        </div>
        {draftFrom && draftTo && draftFrom > draftTo && (
          <p className="mt-3 text-[12.5px] font-medium text-danger">
            تاريخ البداية يجب أن يكون قبل تاريخ النهاية
          </p>
        )}
      </Modal>
    </div>
  );
}
