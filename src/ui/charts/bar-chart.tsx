'use client';

import { useState } from 'react';

import { cn } from '@/lib/cn';
import { niceMax, ticksFor, useElementWidth, type ChartPoint } from './chart-utils';

export interface BarChartProps {
  data: ChartPoint[];
  height?: number;
  formatValue?: (value: number) => string;
  color?: string;
  className?: string;
}

const PADDING = { top: 12, bottom: 28, axis: 54 };

/** Vertical bars, mirrored for RTL like the trend chart. */
export function BarChart({
  data,
  height = 220,
  formatValue = (value) => String(Math.round(value)),
  color = 'var(--chart-1)',
  className,
}: BarChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const maxValue = niceMax(Math.max(1, ...data.map((point) => point.value)));

  if (width === 0) {
    return <div ref={containerRef} style={{ height }} className={cn('w-full', className)} />;
  }

  const plotWidth = Math.max(40, width - PADDING.axis);
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const slot = plotWidth / Math.max(1, data.length);
  const barWidth = Math.min(38, Math.max(6, slot * 0.58));

  const labelStride = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div ref={containerRef} className={cn('w-full', className)}>
      <div className="relative">
        <svg width={width} height={height} role="img" aria-label="مخطط أعمدة" className="overflow-visible">
          {ticksFor(maxValue).map((tick) => {
            const y = PADDING.top + plotHeight - (tick / maxValue) * plotHeight;
            return (
              <g key={tick}>
                <line
                  x1={0}
                  x2={plotWidth}
                  y1={y}
                  y2={y}
                  stroke="var(--chart-grid)"
                  strokeWidth={1}
                  strokeDasharray={tick === 0 ? undefined : '3 4'}
                />
                <text
                  x={plotWidth + 8}
                  y={y + 4}
                  className="num fill-[var(--text-tertiary)] text-[10.5px]"
                  textAnchor="start"
                >
                  {formatValue(tick)}
                </text>
              </g>
            );
          })}

          {data.map((point, index) => {
            // RTL: first bar on the right.
            const center = plotWidth - (index + 0.5) * slot;
            const barHeight = Math.max(2, (point.value / maxValue) * plotHeight);
            const y = PADDING.top + plotHeight - barHeight;
            const active = hover === index;

            return (
              <g
                key={point.label}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
              >
                <rect
                  x={center - slot / 2}
                  y={0}
                  width={slot}
                  height={height - PADDING.bottom}
                  fill="transparent"
                />
                <rect
                  x={center - barWidth / 2}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={Math.min(5, barWidth / 2.5)}
                  fill={color}
                  opacity={hover === null || active ? 1 : 0.42}
                  className="transition-opacity"
                />
                {(index % labelStride === 0 || active) && (
                  <text
                    x={center}
                    y={height - 9}
                    textAnchor="middle"
                    className={cn(
                      'text-[10.5px]',
                      active ? 'fill-[var(--text-primary)] font-bold' : 'fill-[var(--text-tertiary)]',
                    )}
                  >
                    {point.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hover !== null && data[hover] && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-[var(--radius-sm)] border border-line bg-raised px-2.5 py-1.5 shadow-lg"
            style={{
              left: plotWidth - (hover + 0.5) * slot,
              top: Math.max(
                0,
                PADDING.top + plotHeight - (data[hover]!.value / maxValue) * plotHeight - 46,
              ),
            }}
          >
            <p className="text-[11px] text-tertiary">{data[hover]!.label}</p>
            <p className="num text-[13px] font-bold text-primary">
              {data[hover]!.display ?? formatValue(data[hover]!.value)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export interface RankingBarsProps {
  items: Array<{
    id: string;
    label: string;
    sublabel?: string;
    value: number;
    display: string;
  }>;
  color?: string;
  emptyLabel?: string;
  className?: string;
}

/**
 * Horizontal ranking bars — "top products", "expenses by category".
 * Horizontal beats vertical here because the labels are Arabic product names
 * that would never fit under a vertical bar.
 */
export function RankingBars({
  items,
  color = 'var(--chart-1)',
  emptyLabel = 'لا توجد بيانات لهذه الفترة',
  className,
}: RankingBarsProps) {
  if (items.length === 0) {
    return <p className="py-8 text-center text-[13px] text-tertiary">{emptyLabel}</p>;
  }

  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <ul className={cn('space-y-3', className)}>
      {items.map((item, index) => (
        <li key={item.id}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="num w-4 shrink-0 text-[11px] font-bold text-tertiary">
                {index + 1}
              </span>
              <span className="truncate text-[13px] font-medium text-primary">{item.label}</span>
              {item.sublabel && (
                <span className="shrink-0 text-[11.5px] text-tertiary">{item.sublabel}</span>
              )}
            </span>
            <span className="num shrink-0 text-[13px] font-bold text-primary">{item.display}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${Math.max(2, (item.value / max) * 100)}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Tiny inline trend, for stat cards and table rows. */
export function Sparkline({
  values,
  color = 'var(--chart-1)',
  width = 84,
  height = 26,
  className,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  // RTL: newest value ends on the left.
  const path = values
    .map((value, index) => {
      const x = width - index * step;
      const y = height - 2 - ((value - min) / span) * (height - 4);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className={className} aria-hidden="true">
      <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
