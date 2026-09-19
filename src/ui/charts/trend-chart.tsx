'use client';

import { useId, useState } from 'react';

import { cn } from '@/lib/cn';
import {
  niceMax,
  smoothPath,
  ticksFor,
  useElementWidth,
  type ChartPoint,
} from './chart-utils';

export interface TrendChartProps {
  data: ChartPoint[];
  height?: number;
  /** Formats the y-axis ticks. */
  formatValue?: (value: number) => string;
  color?: string;
  compareColor?: string;
  compareLabel?: string;
  seriesLabel?: string;
  /** Draw as a flat line without the filled area. */
  line?: boolean;
  className?: string;
}

const PADDING = { top: 12, bottom: 26, axis: 54 };

/**
 * Area / line chart for time series.
 *
 * Mirrored for RTL: the earliest point sits on the RIGHT and time flows
 * leftward, matching the reading direction, with the value axis on the right
 * edge where the eye lands first.
 */
export function TrendChart({
  data,
  height = 220,
  formatValue = (value) => String(Math.round(value)),
  color = 'var(--chart-1)',
  compareColor = 'var(--chart-2)',
  compareLabel = 'الفترة السابقة',
  seriesLabel = 'القيمة',
  line = false,
  className,
}: TrendChartProps) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();

  const hasCompare = data.some((point) => point.compare !== undefined);
  const maxValue = niceMax(
    Math.max(
      1,
      ...data.map((point) => Math.max(point.value, point.compare ?? 0)),
    ),
  );

  if (width === 0) {
    return <div ref={containerRef} style={{ height }} className={cn('w-full', className)} />;
  }

  const plotWidth = Math.max(40, width - PADDING.axis);
  const plotHeight = height - PADDING.top - PADDING.bottom;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : 0;

  // RTL: index 0 is drawn at the far right.
  const xAt = (index: number) => plotWidth - index * step;
  const yAt = (value: number) => PADDING.top + plotHeight - (value / maxValue) * plotHeight;

  const points = data.map((point, index) => ({ x: xAt(index), y: yAt(point.value) }));
  const comparePoints = hasCompare
    ? data.map((point, index) => ({ x: xAt(index), y: yAt(point.compare ?? 0) }))
    : [];

  const linePath = smoothPath(points);
  const areaPath = `${linePath} L${xAt(data.length - 1)},${PADDING.top + plotHeight} L${xAt(0)},${
    PADDING.top + plotHeight
  } Z`;

  const active = hover !== null ? data[hover] : null;
  const activePoint = hover !== null ? points[hover] : null;

  // Show roughly six x labels so they never collide on a phone.
  const labelStride = Math.max(1, Math.ceil(data.length / 6));

  return (
    <div ref={containerRef} className={cn('w-full', className)}>
      <div className="relative">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${seriesLabel}: مخطط بياني لـ ${data.length} نقطة`}
          onMouseLeave={() => setHover(null)}
          className="overflow-visible"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Gridlines + value axis (right side for RTL) */}
          {ticksFor(maxValue).map((tick) => {
            const y = yAt(tick);
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

          {hasCompare && (
            <path
              d={smoothPath(comparePoints)}
              fill="none"
              stroke={compareColor}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              strokeLinecap="round"
              opacity={0.7}
            />
          )}

          {!line && <path d={areaPath} fill={`url(#${gradientId})`} />}

          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hover targets — one invisible column per point. */}
          {data.map((point, index) => (
            <rect
              key={point.label}
              x={xAt(index) - step / 2}
              y={0}
              width={Math.max(step, 12)}
              height={height - PADDING.bottom}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
              onFocus={() => setHover(index)}
              tabIndex={-1}
            />
          ))}

          {activePoint && (
            <g>
              <line
                x1={activePoint.x}
                x2={activePoint.x}
                y1={PADDING.top}
                y2={PADDING.top + plotHeight}
                stroke="var(--border-strong)"
                strokeWidth={1}
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={5}
                fill="var(--surface-card)"
                stroke={color}
                strokeWidth={2.5}
              />
            </g>
          )}

          {/* X labels */}
          {data.map((point, index) =>
            index % labelStride === 0 || index === data.length - 1 ? (
              <text
                key={`label-${point.label}`}
                x={xAt(index)}
                y={height - 8}
                textAnchor="middle"
                className="fill-[var(--text-tertiary)] text-[10.5px]"
              >
                {point.label}
              </text>
            ) : null,
          )}
        </svg>

        {active && activePoint && (
          <div
            className="pointer-events-none absolute z-10 min-w-[128px] -translate-x-1/2 rounded-[var(--radius-sm)] border border-line bg-raised px-2.5 py-2 shadow-lg"
            style={{
              left: activePoint.x,
              top: Math.max(0, activePoint.y - 64),
            }}
          >
            <p className="text-[11px] text-tertiary">{active.label}</p>
            <p className="num mt-0.5 text-[13px] font-bold text-primary">
              {active.display ?? formatValue(active.value)}
            </p>
            {active.compare !== undefined && (
              <p className="num mt-0.5 text-[11.5px] text-secondary">
                {compareLabel}: {active.compareDisplay ?? formatValue(active.compare)}
              </p>
            )}
          </div>
        )}
      </div>

      {hasCompare && (
        <div className="mt-2 flex items-center justify-center gap-4 text-[11.5px] text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: color }} />
            {seriesLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="h-0.5 w-4 rounded-full opacity-70"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, ${compareColor} 0 4px, transparent 4px 8px)`,
              }}
            />
            {compareLabel}
          </span>
        </div>
      )}
    </div>
  );
}
