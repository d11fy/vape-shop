import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Receipt, Timer } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { buildFormatter } from '@/lib/formatter';
import { getShift } from '@/modules/cashbox/queries';
import { Alert } from '@/ui/feedback/alert';
import { Badge } from '@/ui/primitives/badge';
import { Card, CardHeader } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { PageHeader } from '@/ui/layout/page-header';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'تفاصيل الوردية' };

export default async function ShiftDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requirePermission('cashbox.view', 'shifts.open', 'shifts.close');
  const { store, user } = context;
  const { id } = await params;

  const shift = await getShift(store.id, id);
  if (!shift) notFound();

  // A cashier without `shifts.view_all` may only open their own.
  if (!can(store, 'shifts.view_all') && shift.userId !== user.id) notFound();

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const isOpen = shift.status === 'OPEN';

  return (
    <>
      <PageHeader
        title={`وردية ${shift.number}`}
        description={`${shift.userName} · ${shift.branchName} · ${fmt.dateTime(shift.openedAt)}`}
        backHref="/cashbox/shifts"
        breadcrumbs={[
          { label: 'الصندوق', href: '/cashbox' },
          { label: 'الورديات', href: '/cashbox/shifts' },
          { label: shift.number },
        ]}
        actions={
          <Badge tone={isOpen ? 'accent' : 'neutral'} dot={isOpen}>
            {isOpen ? 'مفتوحة الآن' : 'مغلقة'}
          </Badge>
        }
      />

      {!isOpen && shift.difference !== 0 && (
        <Alert
          tone={shift.difference > 0 ? 'info' : 'danger'}
          className="mb-4"
          title={
            shift.difference > 0
              ? `زيادة في النقدية ${fmt.money(shift.difference)}`
              : `عجز في النقدية ${fmt.money(Math.abs(shift.difference))}`
          }
        >
          {shift.differenceReason ?? 'لم يُذكر سبب للفرق.'}
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="عدد الفواتير"
          value={fmt.number(shift.invoiceCount)}
          icon={<Receipt className="size-[18px]" />}
        />
        <StatCard label="إجمالي المبيعات" value={fmt.money(shift.salesTotal)} tone="accent" />
        <StatCard label="مبيعات نقدية" value={fmt.money(shift.cashSalesTotal)} />
        <StatCard
          label={isOpen ? 'المتوقع في الدرج' : 'النقدية الفعلية'}
          value={fmt.money(isOpen ? shift.expectedCash : (shift.actualCash ?? 0))}
          icon={<Timer className="size-[18px]" />}
          tone={!isOpen && shift.difference !== 0 ? 'warning' : 'default'}
          hint={
            !isOpen && shift.difference !== 0
              ? `الفرق ${fmt.money(shift.difference, { signed: true })}`
              : undefined
          }
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader
            title="فواتير الوردية"
            subtitle={`${shift.invoiceCount} فاتورة`}
          />
          {shift.sales.length === 0 ? (
            <EmptyState
              variant="compact"
              icon={<Receipt className="size-6" />}
              title="لا توجد فواتير"
              description="لم تُسجَّل مبيعات في هذه الوردية بعد."
            />
          ) : (
            <ul className="mt-3 divide-y divide-line-subtle">
              {shift.sales.map((sale) => (
                <li key={sale.id}>
                  <Link
                    href={`/invoices/${sale.id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-2.5 transition-colors hover:bg-sunken"
                  >
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="num text-[13px] font-bold text-primary">
                          {sale.number}
                        </span>
                        {sale.status === 'CANCELED' && (
                          <Badge tone="danger" size="sm">
                            ملغاة
                          </Badge>
                        )}
                        {sale.dueTotal > 0 && sale.status !== 'CANCELED' && (
                          <Badge tone="warning" size="sm">
                            آجل
                          </Badge>
                        )}
                      </span>
                      <span className="num block text-[11.5px] text-tertiary">
                        {fmt.time(sale.soldAt)}
                      </span>
                    </span>
                    <span className="num shrink-0 text-[13.5px] font-bold text-primary">
                      {fmt.money(sale.total)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-3">
          <Card>
            <CardHeader title="تسوية النقدية" />
            <dl className="mt-3 space-y-2 text-[13px]">
              <Row label="النقدية الافتتاحية" value={fmt.money(shift.openingCash)} />
              <Row label="مبيعات نقدية" value={`+ ${fmt.money(shift.cashSalesTotal)}`} tone="success" />
              {shift.collectionsTotal > 0 && (
                <Row
                  label="تحصيل ديون"
                  value={`+ ${fmt.money(shift.collectionsTotal)}`}
                  tone="success"
                />
              )}
              {shift.expensesTotal > 0 && (
                <Row label="مصاريف" value={`− ${fmt.money(shift.expensesTotal)}`} tone="danger" />
              )}
              {shift.refundsTotal > 0 && (
                <Row label="مرتجعات" value={`− ${fmt.money(shift.refundsTotal)}`} tone="danger" />
              )}
              {shift.payoutsTotal > 0 && (
                <Row
                  label="مدفوعات أخرى"
                  value={`− ${fmt.money(shift.payoutsTotal)}`}
                  tone="danger"
                />
              )}

              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <dt className="font-semibold text-primary">المتوقع</dt>
                <dd className="num font-bold text-primary">{fmt.money(shift.expectedCash)}</dd>
              </div>

              {!isOpen && (
                <>
                  <Row label="الفعلي بعد العدّ" value={fmt.money(shift.actualCash ?? 0)} />
                  <div className="flex items-baseline justify-between border-t border-line pt-2">
                    <dt className="font-bold text-primary">الفرق</dt>
                    <dd
                      className={`num text-[16px] font-bold ${
                        shift.difference === 0
                          ? 'text-success'
                          : shift.difference > 0
                            ? 'text-info'
                            : 'text-danger'
                      }`}
                    >
                      {fmt.money(shift.difference, { signed: true })}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </Card>

          <Card>
            <CardHeader title="تفاصيل" />
            <dl className="mt-3 space-y-2 text-[13px]">
              <Row label="الموظف" value={shift.userName} />
              <Row label="الفرع" value={shift.branchName} />
              <Row label="الفتح" value={fmt.dateTime(shift.openedAt)} />
              {shift.closedAt && <Row label="الإغلاق" value={fmt.dateTime(shift.closedAt)} />}
            </dl>

            {(shift.openNote || shift.closeNote) && (
              <div className="mt-3 space-y-2 border-t border-line-subtle pt-3">
                {shift.openNote && (
                  <p className="text-[12.5px] text-secondary">
                    <span className="font-semibold text-primary">ملاحظة الفتح: </span>
                    {shift.openNote}
                  </p>
                )}
                {shift.closeNote && (
                  <p className="text-[12.5px] text-secondary">
                    <span className="font-semibold text-primary">ملاحظة الإغلاق: </span>
                    {shift.closeNote}
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-secondary">{label}</dt>
      <dd
        className={`num font-semibold ${
          tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-primary'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
