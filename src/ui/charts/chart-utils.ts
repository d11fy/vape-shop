'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Chart helpers.
 *
 * The charts are hand-built SVG rather than a charting library: it keeps the
 * bundle small, gives exact control over the design tokens, and — the part a
 * library would fight us on — lets the whole plot mirror for RTL so time reads
 * right-to-left like the rest of the interface.
 */

/** Measure the container so the SVG renders at true pixel size (crisp strokes). */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.getBoundingClientRect().width);

    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
] as const;

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]!;
}

/** Round an axis maximum up to a friendly number (10, 25, 50, 100, 250…). */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Evenly spaced gridline values from 0 to `max`. */
export function ticksFor(max: number, count = 4): number[] {
  return Array.from({ length: count + 1 }, (_, index) => (max / count) * index);
}

/**
 * Catmull-Rom → cubic Bézier. Gives the gentle curve of a modern finance chart
 * without the overshoot that a naive spline produces on spiky data.
 */
export function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length < 3) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
  }

  let path = `M${points[0]!.x},${points[0]!.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)]!;
    const p1 = points[index]!;
    const p2 = points[index + 1]!;
    const p3 = points[Math.min(points.length - 1, index + 2)]!;

    const tension = 6;
    const c1x = p1.x + (p2.x - p0.x) / tension;
    const c1y = p1.y + (p2.y - p0.y) / tension;
    const c2x = p2.x - (p3.x - p1.x) / tension;
    const c2y = p2.y - (p3.y - p1.y) / tension;

    path += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return path;
}

export interface ChartPoint {
  /** Axis label — a date, a product name … */
  label: string;
  value: number;
  /** Optional second series, drawn as a comparison line. */
  compare?: number;
  /** Pre-formatted string shown in the tooltip; falls back to the raw value. */
  display?: string;
  compareDisplay?: string;
}
