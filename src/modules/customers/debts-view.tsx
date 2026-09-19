'use client';

import { useState } from 'react';
import { HandCoins, PartyPopper, Phone } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Badge } from '@/ui/primitives/badge';
import { ButtonLink } from '@/ui/primitives/button';
import { DataTable, type Column } from '@/ui/data/data-table';
import { EmptyState } from '@/ui/feedback/empty-state';
import { useFormat } from '@/ui/format';
import { CollectDialog, type CollectTarget } from './collect-dialog';
import type { CustomerListRow } from './queries';

/**
 * The receivables list.
 *
 * Sorted by what needs chasing, with the ageing bucket visible on every row and
 * a one-tap collect button — because this screen exists to get money in, not to
 * be admired.
 */
export function DebtsTable({
  rows,
  paymentMethods,
  canCollect,
  overdueDays,
}: {
  rows: CustomerListRow[];
  paymentMethods: Array<{ id: string; name: string; affectsCashbox: boolean }>;
  canCollect: boolean;
  overdueDays: number;
}) {
  const fmt = useFormat();
  const [target, setTarget] = useState<CollectTarget | null>(null);

  const columns: Column<CustomerListRow>[] = [
    {
      id: 'name',
      header: 'العميل',
      sortKey: 'name',
      priority: 1,
      cell: (row) => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-primary">{row.name}</span>
          {row.phone && (
            <span className="num flex items-center gap-1 text-[11.5px] text-tertiary">
              <Phone className="size-3" aria-hidden="true" />
              {row.phone}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'balance',
      header: 'المبلغ المستحق',
      sortKey: 'balance',
      align: 'end',
      priority: 1,
      cell: (row) => <span className="num font-bold text-warning">{fmt.money(row.balance)}</span>,
    },
    {
      id: 'age',
      header: 'عمر الدين',
      align: 'center',
      priority: 2,
      cell: (row) => {
        if (row.debtAgeDays === 0) {
          // Everyone listed here owes something, so age 0 means "since today".
          return row.balance > 0 ? (
            <Badge tone="neutral" size="sm">
              اليوم
            </Badge>
          ) : (
            <span className="text-tertiary">—</span>
          );
        }
        const tone =
          row.debtAgeDays >= 90
            ? 'danger'
            : row.debtAgeDays >= overdueDays
              ? 'warning'
              : 'neutral';
        return (
          <Badge tone={tone} size="sm">
            {fmt.number(row.debtAgeDays)} يوم
          </Badge>
        );
      },
    },
    {
      id: 'limit',
      header: 'حد الدين',
      align: 'end',
      priority: 3,
      cell: (row) =>
        row.debtLimit > 0 ? (
          <span
            className={cn(
              'num',
              row.balance >= row.debtLimit ? 'font-bold text-danger' : 'text-secondary',
            )}
          >
            {fmt.money(row.debtLimit)}
          </span>
        ) : (
          <span className="text-tertiary">بدون حد</span>
        ),
    },
    {
      id: 'lastPayment',
      header: 'آخر دفعة',
      align: 'end',
      priority: 2,
      cell: (row) =>
        row.lastPaymentAt ? (
          <span className="num text-secondary">{fmt.date(row.lastPaymentAt)}</span>
        ) : (
          <span className="text-[12px] text-danger">لم يدفع بعد</span>
        ),
    },
    {
      id: 'purchases',
      header: 'إجمالي مشترياته',
      align: 'end',
      priority: 3,
      cell: (row) => <span className="num text-secondary">{fmt.money(row.totalPurchases)}</span>,
    },
  ];

  return (
    <>
      <DataTable
        tableId="debts"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        href={(row) => `/customers/${row.id}`}
        actions={
          canCollect
            ? (row) => (
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setTarget({ id: row.id, name: row.name, balance: row.balance });
                  }}
                  className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-xs)] bg-accent-soft px-2.5 text-[12px] font-bold text-accent-strong transition-colors hover:bg-accent-border"
                >
                  <HandCoins className="size-3.5" />
                  تحصيل
                </button>
              )
            : undefined
        }
        empty={
          <EmptyState
            icon={<PartyPopper className="size-6" />}
            title="لا توجد ديون مستحقة"
            description="كل العملاء سدّدوا ما عليهم — لا شيء يحتاج متابعة الآن."
            action={
              <ButtonLink href="/customers" variant="outline">عرض كل العملاء</ButtonLink>
            }
          />
        }
      />

      <CollectDialog
        open={target !== null}
        customer={target}
        paymentMethods={paymentMethods}
        onClose={() => setTarget(null)}
      />
    </>
  );
}

/** Ageing buckets — how stale the receivables are, at a glance. */
export function AgeingBuckets({
  rows,
  overdueDays,
}: {
  rows: CustomerListRow[];
  overdueDays: number;
}) {
  const fmt = useFormat();

  const buckets = [
    { label: 'حديث (أقل من 7 أيام)', min: 0, max: 7, tone: 'bg-[var(--chart-1)]' },
    { label: '7 – 30 يوم', min: 7, max: 30, tone: 'bg-[var(--chart-3)]' },
    { label: `31 – 90 يوم`, min: 30, max: 90, tone: 'bg-[var(--chart-5)]' },
    { label: 'أكثر من 90 يوم', min: 90, max: Infinity, tone: 'bg-[var(--status-danger)]' },
  ].map((bucket) => {
    const matching = rows.filter(
      (row) => row.balance > 0 && row.debtAgeDays >= bucket.min && row.debtAgeDays < bucket.max,
    );
    return {
      ...bucket,
      total: matching.reduce((sum, row) => sum + row.balance, 0),
      count: matching.length,
    };
  });

  const grandTotal = buckets.reduce((sum, bucket) => sum + bucket.total, 0);
  if (grandTotal === 0) return null;

  return (
    <div className="rounded-[var(--radius-md)] border border-line-subtle bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold text-primary">أعمار الديون</h2>
        <span className="text-[12px] text-tertiary">
          المتأخر يبدأ بعد {overdueDays} يوم حسب إعداداتك
        </span>
      </div>

      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-sunken">
        {buckets.map((bucket) => (
          <div
            key={bucket.label}
            className={bucket.tone}
            style={{ width: `${(bucket.total / grandTotal) * 100}%` }}
            title={bucket.label}
          />
        ))}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
        {buckets.map((bucket) => (
          <div key={bucket.label} className="flex items-start gap-2">
            <span
              className={cn('mt-1 size-2.5 shrink-0 rounded-sm', bucket.tone)}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <dt className="text-[11.5px] text-tertiary">{bucket.label}</dt>
              <dd className="num truncate text-[14px] font-bold text-primary">
                {fmt.money(bucket.total)}
              </dd>
              <dd className="text-[11px] text-tertiary">
                <span className="num">{bucket.count}</span> عميل
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
