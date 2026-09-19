import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CreditCard, Truck } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { buildFormatter } from '@/lib/formatter';
import { getPurchase } from '@/modules/suppliers/queries';
import { ReceivePurchaseButton } from '@/modules/purchases/receive-button';
import { Badge } from '@/ui/primitives/badge';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'فاتورة شراء' };

const STATUS = {
  DRAFT: { label: 'مسودة — لم تُستلم بعد', tone: 'neutral' as const },
  RECEIVED: { label: 'مستلمة', tone: 'success' as const },
  PARTIALLY_RETURNED: { label: 'مرتجع جزئي', tone: 'warning' as const },
  RETURNED: { label: 'مرتجعة', tone: 'warning' as const },
  CANCELED: { label: 'ملغاة', tone: 'danger' as const },
};

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { store } = await requirePermission('purchases.view');
  const { id } = await params;

  const purchase = await getPurchase(store.id, id);
  if (!purchase) notFound();

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const canReceive =
    can(store, 'purchases.receive') &&
    purchase.status === 'DRAFT' &&
    !store.subscription.isReadOnly;

  return (
    <>
      <PageHeader
        title={purchase.number}
        description={`${purchase.supplier.name} · ${fmt.date(purchase.purchasedAt)} · ${purchase.branch.name}`}
        backHref="/purchases"
        breadcrumbs={[{ label: 'المشتريات', href: '/purchases' }, { label: purchase.number }]}
        actions={canReceive ? <ReceivePurchaseButton purchaseId={purchase.id} /> : undefined}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <Card padded={false}>
            <div className="flex items-center justify-between gap-2 border-b border-line-subtle px-4 py-3 sm:px-5">
              <h2 className="text-[15px] font-bold text-primary">الأصناف</h2>
              <Badge tone={STATUS[purchase.status]?.tone ?? 'neutral'} size="sm">
                {STATUS[purchase.status]?.label ?? purchase.status}
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-sunken/50 text-secondary">
                  <tr>
                    <th className="px-4 py-2.5 text-start font-semibold">الصنف</th>
                    <th className="px-4 py-2.5 text-center font-semibold">الكمية</th>
                    <th className="px-4 py-2.5 text-end font-semibold">تكلفة الوحدة</th>
                    <th className="px-4 py-2.5 text-end font-semibold">الخصم</th>
                    <th className="px-4 py-2.5 text-end font-semibold">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.items.map((item) => (
                    <tr key={item.id} className="border-t border-line-subtle">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-primary">{item.productName}</p>
                        <p className="num text-[11.5px] text-tertiary">{item.sku}</p>
                      </td>
                      <td className="num-mixed px-4 py-3 text-center text-secondary">
                        {item.units.toLocaleString('en-US', { maximumFractionDigits: 3 })}{' '}
                        <span className="text-tertiary">{item.unitLabel}</span>
                      </td>
                      <td className="num px-4 py-3 text-end text-secondary">
                        {fmt.money(item.unitCost)}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-line-subtle bg-sunken/40 px-4 py-4 sm:px-5">
              <dl className="ms-auto max-w-xs space-y-2 text-[13px]">
                <Row label="المجموع" value={fmt.money(purchase.subtotal)} />
                {purchase.discountTotal > 0 && (
                  <Row label="الخصم" value={`− ${fmt.money(purchase.discountTotal)}`} />
                )}
                {purchase.extraCosts > 0 && (
                  <Row label="مصاريف إضافية" value={fmt.money(purchase.extraCosts)} />
                )}
                {purchase.taxTotal > 0 && (
                  <Row label="الضريبة" value={fmt.money(purchase.taxTotal)} />
                )}
                <div className="flex items-baseline justify-between border-t border-line pt-2">
                  <dt className="font-bold text-primary">الإجمالي</dt>
                  <dd className="num text-[18px] font-bold text-primary">
                    {fmt.money(purchase.total)}
                  </dd>
                </div>
                <Row label="المدفوع" value={fmt.money(purchase.paidTotal)} />
                {purchase.dueTotal > 0 && (
                  <Row label="المتبقي" value={fmt.money(purchase.dueTotal)} tone="warning" />
                )}
              </dl>
            </div>
          </Card>

          {purchase.note && (
            <Card>
              <CardHeader title="ملاحظات" />
              <p className="mt-2 text-[13px] leading-relaxed text-secondary">{purchase.note}</p>
            </Card>
          )}
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader title="المورد" icon={<Truck className="size-4" />} />
            <div className="mt-3">
              <Link
                href={`/suppliers/${purchase.supplier.id}`}
                className="text-[14px] font-bold text-primary hover:text-accent-strong"
              >
                {purchase.supplier.name}
              </Link>
              {purchase.supplier.phone && (
                <p className="num mt-0.5 text-[12.5px] text-tertiary">{purchase.supplier.phone}</p>
              )}
              {purchase.supplier.balance > 0 && (
                <p className="mt-2 rounded-[var(--radius-sm)] bg-warning-soft px-2.5 py-1.5 text-[12px] text-warning">
                  الرصيد المستحق{' '}
                  <span className="num font-bold">{fmt.money(purchase.supplier.balance)}</span>
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="المدفوعات" icon={<CreditCard className="size-4" />} />
            {purchase.payments.length === 0 ? (
              <p className="mt-3 text-[13px] text-tertiary">لم تُسجَّل أي مدفوعات</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {purchase.payments.map((payment) => (
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
                    <span className="num shrink-0 text-[13px] font-bold text-primary">
                      {fmt.money(payment.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="تفاصيل" />
            <dl className="mt-3 space-y-2 text-[13px]">
              {purchase.reference && <Row label="مرجع المورد" value={purchase.reference} />}
              <Row label="سجّلها" value={purchase.createdBy} />
              <Row label="تاريخ الفاتورة" value={fmt.date(purchase.purchasedAt)} />
              {purchase.receivedAt && (
                <Row label="تاريخ الاستلام" value={fmt.dateTime(purchase.receivedAt)} />
              )}
            </dl>
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
  tone?: 'warning';
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-secondary">{label}</dt>
      <dd className={`num font-semibold ${tone === 'warning' ? 'text-warning' : 'text-primary'}`}>
        {value}
      </dd>
    </div>
  );
}
