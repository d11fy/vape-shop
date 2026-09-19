import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Ban, CreditCard, RotateCcw, User } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { db } from '@/core/db';
import { buildFormatter } from '@/lib/formatter';
import { getInvoice } from '@/modules/invoices/queries';
import { InvoiceActions, InvoiceStatusChip } from '@/modules/invoices/invoice-actions';
import { Alert } from '@/ui/feedback/alert';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'تفاصيل الفاتورة' };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requirePermission('sales.view');
  const { store, user } = context;
  const { id } = await params;

  const invoice = await getInvoice(store.id, id);
  if (!invoice) notFound();

  // Staff without `sales.view_all` may only open their own invoices.
  if (!can(store, 'sales.view_all') && invoice.cashier.id !== user.id) notFound();

  const showProfit = can(store, 'reports.profit');

  const paymentMethods = await db.paymentMethod.findMany({
    where: { storeId: store.id, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    select: { id: true, name: true, affectsCashbox: true },
  });

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  return (
    <>
      <PageHeader
        title={invoice.number}
        description={`${fmt.dateTime(invoice.soldAt)} · ${invoice.cashier.name} · ${invoice.branch.name}`}
        backHref="/invoices"
        breadcrumbs={[{ label: 'الفواتير', href: '/invoices' }, { label: invoice.number }]}
        actions={
          <InvoiceActions
            invoice={invoice}
            paymentMethods={paymentMethods}
            canReturn={can(store, 'sales.return')}
            canCancel={can(store, 'sales.cancel')}
            readOnly={store.subscription.isReadOnly}
          />
        }
      />

      {invoice.status === 'CANCELED' && (
        <Alert tone="danger" className="mb-4" title="هذه الفاتورة ملغاة">
          {invoice.cancelReason ?? 'تم إلغاء الفاتورة وإرجاع أثرها على المخزون والحسابات.'}
          {invoice.canceledAt && (
            <span className="num block mt-1 text-tertiary">{fmt.dateTime(invoice.canceledAt)}</span>
          )}
        </Alert>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {/* Items */}
          <Card padded={false}>
            <div className="border-b border-line-subtle px-4 py-3 sm:px-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold text-primary">الأصناف</h2>
                <InvoiceStatusChip status={invoice.status} />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-sunken/50 text-secondary">
                  <tr>
                    <th className="px-4 py-2.5 text-start font-semibold">الصنف</th>
                    <th className="px-4 py-2.5 text-center font-semibold">الكمية</th>
                    <th className="px-4 py-2.5 text-end font-semibold">السعر</th>
                    <th className="px-4 py-2.5 text-end font-semibold">الخصم</th>
                    <th className="px-4 py-2.5 text-end font-semibold">الإجمالي</th>
                    {showProfit && (
                      <th className="px-4 py-2.5 text-end font-semibold">الربح</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-t border-line-subtle">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-primary">{item.productName}</p>
                        <p className="num-mixed text-[11.5px] text-tertiary">
                          {item.sku}
                          {item.variantName !== 'افتراضي' && ` · ${item.variantName}`}
                        </p>
                        {item.returnedQuantity > 0 && (
                          <p className="num-mixed mt-1 text-[11.5px] font-semibold text-warning">
                            مرتجع{' '}
                            {item.returnedUnits.toLocaleString('en-US', {
                              maximumFractionDigits: 3,
                            })}{' '}
                            {item.unitLabel}
                          </p>
                        )}
                      </td>
                      <td className="num-mixed px-4 py-3 text-center text-secondary">
                        {item.saleUnits.toLocaleString('en-US', { maximumFractionDigits: 3 })}{' '}
                        <span className="text-tertiary">{item.unitLabel}</span>
                      </td>
                      <td className="num px-4 py-3 text-end text-secondary">
                        {fmt.money(item.unitPrice)}
                      </td>
                      <td className="num px-4 py-3 text-end">
                        {item.discount > 0 ? (
                          <span className="text-accent-strong">− {fmt.money(item.discount)}</span>
                        ) : (
                          <span className="text-tertiary">—</span>
                        )}
                      </td>
                      <td className="num px-4 py-3 text-end font-bold text-primary">
                        {fmt.money(item.lineTotal)}
                      </td>
                      {showProfit && (
                        <td className="num px-4 py-3 text-end text-success">
                          {fmt.money(item.lineTotal - item.taxAmount - item.cogs)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="border-t border-line-subtle bg-sunken/40 px-4 py-4 sm:px-5">
              <dl className="ms-auto max-w-xs space-y-2 text-[13px]">
                <TotalRow label="المجموع" value={fmt.money(invoice.subtotal)} />
                {invoice.discountTotal > 0 && (
                  <TotalRow
                    label="الخصم"
                    value={`− ${fmt.money(invoice.discountTotal)}`}
                    tone="accent"
                  />
                )}
                {invoice.taxTotal > 0 && (
                  <TotalRow
                    label={store.settings.taxInclusive ? 'الضريبة (مشمولة)' : 'الضريبة'}
                    value={fmt.money(invoice.taxTotal)}
                  />
                )}
                <div className="flex items-baseline justify-between border-t border-line pt-2">
                  <dt className="font-bold text-primary">الإجمالي</dt>
                  <dd className="num text-[18px] font-bold text-primary">
                    {fmt.money(invoice.total)}
                  </dd>
                </div>
                <TotalRow label="المدفوع" value={fmt.money(invoice.paidTotal)} />
                {invoice.dueTotal > 0 && (
                  <TotalRow
                    label="المتبقي"
                    value={fmt.money(invoice.dueTotal)}
                    tone="warning"
                    bold
                  />
                )}
                {showProfit && (
                  <div className="flex items-baseline justify-between border-t border-line pt-2">
                    <dt className="text-secondary">مجمل الربح</dt>
                    <dd className="num font-bold text-success">{fmt.money(invoice.profitTotal)}</dd>
                  </div>
                )}
              </dl>
            </div>
          </Card>

          {invoice.note && (
            <Card>
              <CardHeader title="ملاحظة" />
              <p className="mt-2 text-[13px] leading-relaxed text-secondary">{invoice.note}</p>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <Card>
            <CardHeader title="العميل" icon={<User className="size-4" />} />
            {invoice.customer ? (
              <div className="mt-3">
                <Link
                  href={`/customers/${invoice.customer.id}`}
                  className="text-[14px] font-bold text-primary hover:text-accent-strong"
                >
                  {invoice.customer.name}
                </Link>
                {invoice.customer.phone && (
                  <p className="num mt-0.5 text-[12.5px] text-tertiary">{invoice.customer.phone}</p>
                )}
                {invoice.customer.balance > 0 && (
                  <p className="mt-2 rounded-[var(--radius-sm)] bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning">
                    الرصيد الحالي{' '}
                    <span className="num font-bold">{fmt.money(invoice.customer.balance)}</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-tertiary">عميل نقدي — بدون حساب</p>
            )}
          </Card>

          <Card>
            <CardHeader title="المدفوعات" icon={<CreditCard className="size-4" />} />
            {invoice.payments.length === 0 ? (
              <p className="mt-3 text-[13px] text-tertiary">لم تُسجَّل أي مدفوعات</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {invoice.payments.map((payment) => (
                  <li key={payment.id} className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-primary">
                        {payment.methodName}
                      </span>
                      <span className="num block text-[11.5px] text-tertiary">
                        {fmt.dateTime(payment.paidAt)}
                        {payment.reference && ` · ${payment.reference}`}
                      </span>
                    </span>
                    <span
                      className={`num shrink-0 text-[13px] font-bold ${
                        payment.direction === 'IN' ? 'text-primary' : 'text-danger'
                      }`}
                    >
                      {payment.direction === 'IN' ? '' : '− '}
                      {fmt.money(payment.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {invoice.returns.length > 0 && (
            <Card>
              <CardHeader title="المرتجعات" icon={<RotateCcw className="size-4" />} />
              <ul className="mt-3 space-y-2.5">
                {invoice.returns.map((entry) => (
                  <li key={entry.id} className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="num block text-[13px] font-bold text-primary">
                        {entry.number}
                      </span>
                      <span className="block truncate text-[11.5px] text-tertiary">
                        {entry.reason}
                      </span>
                      <span className="num block text-[11.5px] text-tertiary">
                        {fmt.dateTime(entry.returnedAt)}
                      </span>
                    </span>
                    <span className="num shrink-0 text-[13px] font-bold text-warning">
                      {fmt.money(entry.total)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {invoice.shift && (
            <Card>
              <CardHeader title="الوردية" icon={<Ban className="size-4 rotate-45" />} />
              <Link
                href={`/cashbox/shifts/${invoice.shift.id}`}
                className="num mt-2 block text-[13px] font-bold text-accent-strong hover:underline"
              >
                {invoice.shift.number}
              </Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function TotalRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: 'accent' | 'warning';
  bold?: boolean;
}) {
  const color =
    tone === 'accent' ? 'text-accent-strong' : tone === 'warning' ? 'text-warning' : 'text-primary';

  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-secondary">{label}</dt>
      <dd className={`num ${bold ? 'font-bold' : 'font-semibold'} ${color}`}>{value}</dd>
    </div>
  );
}
