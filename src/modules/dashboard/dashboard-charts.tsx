'use client';

import { DonutChart } from '@/ui/charts/donut-chart';
import { TrendChart } from '@/ui/charts/trend-chart';
import { RankingBars } from '@/ui/charts/bar-chart';
import { useFormat } from '@/ui/format';

/**
 * Thin client wrappers around the chart primitives. They exist so the charts
 * can format their own labels with the store's currency and locale while the
 * surrounding dashboard stays a server component.
 */

export function SalesTrend({
  data,
}: {
  data: Array<{ label: string; value: number }>;
}) {
  const fmt = useFormat();

  return (
    <TrendChart
      data={data.map((point) => ({
        ...point,
        display: fmt.money(point.value),
      }))}
      height={240}
      seriesLabel="المبيعات"
      formatValue={(value) => fmt.short(value)}
    />
  );
}

export function PaymentMixChart({
  slices,
}: {
  slices: Array<{ id: string; label: string; value: number }>;
}) {
  const fmt = useFormat();
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <DonutChart
      slices={slices.map((slice) => ({ ...slice, display: fmt.money(slice.value) }))}
      centerValue={fmt.short(total)}
      centerLabel="إجمالي المقبوضات"
      emptyLabel="لا توجد مقبوضات في هذه الفترة"
    />
  );
}

export function TopProductsChart({
  items,
}: {
  items: Array<{
    id: string;
    name: string;
    variantName: string;
    quantityLabel: string;
    revenue: number;
  }>;
}) {
  const fmt = useFormat();

  return (
    <RankingBars
      items={items.map((item) => ({
        id: `${item.id}-${item.variantName}`,
        label: item.name,
        sublabel: item.quantityLabel,
        value: item.revenue,
        display: fmt.money(item.revenue),
      }))}
      emptyLabel="لم تُسجَّل مبيعات في هذه الفترة"
    />
  );
}

export function StaffBars({
  items,
}: {
  items: Array<{ userId: string; name: string; invoiceCount: number; salesTotal: number }>;
}) {
  const fmt = useFormat();

  return (
    <RankingBars
      items={items.map((item) => ({
        id: item.userId,
        label: item.name,
        sublabel: `${fmt.number(item.invoiceCount)} فاتورة`,
        value: item.salesTotal,
        display: fmt.money(item.salesTotal),
      }))}
      color="var(--chart-2)"
      emptyLabel="لا توجد بيانات تشغيلية لهذه الفترة"
    />
  );
}

/** Money formatted with the store's settings, used inside server-rendered lists. */
export function MoneyText({
  value,
  className,
  signed,
}: {
  value: number;
  className?: string;
  signed?: boolean;
}) {
  const fmt = useFormat();
  return <span className={`num ${className ?? ''}`}>{fmt.money(value, { signed })}</span>;
}

export function DateText({ value, relative }: { value: string | Date; relative?: boolean }) {
  const fmt = useFormat();
  return <span className="num">{relative ? fmt.relative(value) : fmt.dateTime(value)}</span>;
}
