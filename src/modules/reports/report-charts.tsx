'use client';

import { BarChart, RankingBars } from '@/ui/charts/bar-chart';
import { DonutChart } from '@/ui/charts/donut-chart';
import { TrendChart } from '@/ui/charts/trend-chart';
import { useFormat } from '@/ui/format';

/**
 * Client chart wrappers for the reports. Each formats its own labels with the
 * store's currency so the surrounding pages can stay server components.
 */

export function DailySalesChart({
  data,
}: {
  data: Array<{ date: string; sales: number; invoices: number; profit: number }>;
}) {
  const fmt = useFormat();

  return (
    <TrendChart
      data={data.map((point) => ({
        label: point.date.slice(5).replace('-', '/'),
        value: point.sales,
        display: `${fmt.money(point.sales)} · ${point.invoices} فاتورة`,
      }))}
      height={260}
      seriesLabel="المبيعات"
      formatValue={(value) => fmt.short(value)}
    />
  );
}

export function HourlySalesChart({
  data,
}: {
  data: Array<{ hour: number; sales: number; invoices: number }>;
}) {
  const fmt = useFormat();

  // Fill the full trading day so gaps are visible rather than collapsed.
  const filled = Array.from({ length: 24 }, (_, hour) => {
    const match = data.find((point) => point.hour === hour);
    return {
      label: `${hour}`,
      value: match?.sales ?? 0,
      display: match ? `${fmt.money(match.sales)} · ${match.invoices} فاتورة` : 'لا مبيعات',
    };
  }).filter((point, index) => {
    // Trim empty hours at both ends; keep everything between.
    const firstActive = data.length > 0 ? Math.min(...data.map((p) => p.hour)) : 0;
    const lastActive = data.length > 0 ? Math.max(...data.map((p) => p.hour)) : 23;
    return index >= firstActive && index <= lastActive;
  });

  return (
    <BarChart data={filled} height={200} formatValue={(value) => fmt.short(value)} />
  );
}

export function PaymentMixDonut({
  slices,
}: {
  slices: Array<{ id: string; name: string; amount: number; count: number }>;
}) {
  const fmt = useFormat();
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);

  return (
    <DonutChart
      slices={slices.map((slice) => ({
        id: slice.id,
        label: slice.name,
        value: slice.amount,
        display: fmt.money(slice.amount),
      }))}
      centerValue={fmt.short(total)}
      centerLabel="إجمالي المقبوضات"
      emptyLabel="لا توجد مقبوضات في هذه الفترة"
    />
  );
}

export function CategoryDonut({
  slices,
  centerLabel,
}: {
  slices: Array<{ id: string; name: string; amount: number; color?: string | null }>;
  centerLabel: string;
}) {
  const fmt = useFormat();
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);

  return (
    <DonutChart
      slices={slices.map((slice) => ({
        id: slice.id,
        label: slice.name,
        value: slice.amount,
        display: fmt.money(slice.amount),
        color: slice.color ?? undefined,
      }))}
      centerValue={fmt.short(total)}
      centerLabel={centerLabel}
    />
  );
}

export function TopList({
  items,
  color,
  emptyLabel,
}: {
  items: Array<{ id: string; label: string; sublabel?: string; value: number }>;
  color?: string;
  emptyLabel?: string;
}) {
  const fmt = useFormat();

  return (
    <RankingBars
      items={items.map((item) => ({
        id: item.id,
        label: item.label,
        sublabel: item.sublabel,
        value: item.value,
        display: fmt.money(item.value),
      }))}
      color={color}
      emptyLabel={emptyLabel}
    />
  );
}

export function CashFlowChart({
  data,
}: {
  data: Array<{ date: string; inflow: number; outflow: number; net: number }>;
}) {
  const fmt = useFormat();

  return (
    <TrendChart
      data={data.map((point) => ({
        label: point.date.slice(5).replace('-', '/'),
        value: point.inflow,
        compare: point.outflow,
        display: fmt.money(point.inflow),
        compareDisplay: fmt.money(point.outflow),
      }))}
      height={240}
      seriesLabel="الوارد"
      compareLabel="الصادر"
      compareColor="var(--status-danger)"
      formatValue={(value) => fmt.short(value)}
    />
  );
}
