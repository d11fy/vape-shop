'use client';

import { useState } from 'react';

import { cn } from '@/lib/cn';
import { chartColor } from './chart-utils';

export interface DonutSlice {
  id: string;
  label: string;
  value: number;
  display: string;
  color?: string;
}

export interface DonutChartProps {
  slices: DonutSlice[];
  size?: number;
  thickness?: number;
  /** Big number in the middle — usually the total. */
  centerValue?: string;
  centerLabel?: string;
  emptyLabel?: string;
  className?: string;
}

/**
 * Donut with a legend. Used for payment-method mix and expense breakdowns,
 * where the point is "what share of the whole" rather than a precise value.
 */
export function DonutChart({
  slices,
  size = 168,
  thickness = 26,
  centerValue,
  centerLabel,
  emptyLabel = 'لا توجد بيانات',
  className,
}: DonutChartProps) {
  const [hover, setHover] = useState<string | null>(null);

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0) {
    return (
      <div className={cn('flex items-center justify-center py-10', className)}>
        <p className="text-[13px] text-tertiary">{emptyLabel}</p>
      </div>
    );
  }

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className={cn('flex flex-col items-center gap-5 sm:flex-row sm:items-center', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label="مخطط دائري">
          {/* Negative rotation + RTL means slices run clockwise from the top. */}
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {slices.map((slice, index) => {
              const fraction = slice.value / total;
              const length = fraction * circumference;
              const dash = `${length} ${circumference - length}`;
              const element = (
                <circle
                  key={slice.id}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={slice.color ?? chartColor(index)}
                  strokeWidth={hover === slice.id ? thickness + 4 : thickness}
                  strokeDasharray={dash}
                  strokeDashoffset={-offset}
                  opacity={hover === null || hover === slice.id ? 1 : 0.35}
                  className="cursor-pointer transition-[stroke-width,opacity]"
                  onMouseEnter={() => setHover(slice.id)}
                  onMouseLeave={() => setHover(null)}
                />
              );
              offset += length;
              return element;
            })}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {hover ? (
            <>
              <p className="num text-[16px] font-bold text-primary">
                {slices.find((slice) => slice.id === hover)?.display}
              </p>
              <p className="max-w-[80%] truncate text-[11px] text-secondary">
                {slices.find((slice) => slice.id === hover)?.label}
              </p>
            </>
          ) : (
            <>
              {centerValue && (
                <p className="num text-[17px] font-bold text-primary">{centerValue}</p>
              )}
              {centerLabel && <p className="text-[11px] text-tertiary">{centerLabel}</p>}
            </>
          )}
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2">
        {slices.map((slice, index) => {
          const share = Math.round((slice.value / total) * 1000) / 10;
          return (
            <li
              key={slice.id}
              onMouseEnter={() => setHover(slice.id)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                'flex items-center gap-2.5 rounded-[var(--radius-xs)] px-1.5 py-1 transition-colors',
                hover === slice.id && 'bg-sunken',
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: slice.color ?? chartColor(index) }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-secondary">
                {slice.label}
              </span>
              <span className="num shrink-0 text-[12.5px] font-semibold text-primary">
                {slice.display}
              </span>
              <span className="num w-11 shrink-0 text-end text-[11.5px] text-tertiary">
                {share}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
