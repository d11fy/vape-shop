import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardList, MapPin, Pencil, Phone } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { db } from '@/core/db';
import { buildFormatter } from '@/lib/formatter';
import { getSupplier } from '@/modules/suppliers/queries';
import { SupplierActions } from '@/modules/suppliers/supplier-actions';
import { Badge } from '@/ui/primitives/badge';
import { ButtonLink } from '@/ui/primitives/button';
import { Card, CardHeader } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { PageHeader } from '@/ui/layout/page-header';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'ملف المورد' };

const LEDGER_LABEL: Record<string, string> = {
  OPENING_BALANCE: 'رصيد افتتاحي',
  INVOICE: 'فاتورة شراء',
  PAYMENT: 'سداد',
  RETURN: 'مرتجع',
  ADJUSTMENT: 'تسوية',
  WRITE_OFF: 'إعدام',
};

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { store } = await requirePermission('suppliers.view');
  const { id } = await params;

  const supplier = await getSupplier(store.id, id);
  if (!supplier) notFound();

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

  const readOnly = store.subscription.isReadOnly;

  return (
    <>
      <PageHeader
        title={supplier.name}
        description={[supplier.company, supplier.phone].filter(Boolean).join(' · ') || undefined}
        backHref="/suppliers"
        breadcrumbs={[{ label: 'الموردون', href: '/suppliers' }, { label: supplier.name }]}
        actions={
          <>
            <SupplierActions
              supplier={{ id: supplier.id, name: supplier.name, balance: supplier.balance }}
              paymentMethods={paymentMethods}
              canPay={can(store, 'suppliers.pay') && !readOnly}
            />
            {can(store, 'suppliers.edit') && !readOnly && (
              <ButtonLink
                href={`/suppliers/${supplier.id}/edit`}
                variant="ghost"
                iconStart={<Pencil className="size-4" />}
              >
                تعديل
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="المستحق للمورد"
          value={fmt.money(supplier.balance)}
          tone={supplier.balance > 0 ? 'warning' : 'success'}
          hint={supplier.balance > 0 ? 'رصيد مستحق عليك' : 'الحساب مسدد'}
        />
        <StatCard
          label="إجمالي المشتريات"
          value={fmt.money(supplier.stats.totalPurchases)}
          hint={`${fmt.number(supplier.stats.purchaseCount)} فاتورة`}
        />
        <StatCard label="إجمالي المدفوع" value={fmt.money(supplier.stats.totalPaid)} />
        <StatCard
          label="آخر شراء"
          value={supplier.stats.lastPurchaseAt ? fmt.date(supplier.stats.lastPurchaseAt) : '—'}
          hint={
            supplier.stats.lastPurchaseAt ? fmt.relative(supplier.stats.lastPurchaseAt) : undefined
          }
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          <Card>
            <CardHeader
              title="فواتير الشراء"
              icon={<ClipboardList className="size-4" />}
              action={
                <Link
                  href={`/purchases?supplier=${supplier.id}`}
                  className="text-[12.5px] font-semibold text-accent-strong hover:underline"
                >
                  عرض الكل
                </Link>
              }
            />

            {supplier.purchases.length === 0 ? (
              <EmptyState
                variant="compact"
                icon={<ClipboardList className="size-6" />}
                title="لا توجد فواتير"
                description="لم تُسجَّل مشتريات من هذا المورد بعد."
              />
            ) : (
              <ul className="mt-3 divide-y divide-line-subtle">
                {supplier.purchases.map((purchase) => (
                  <li key={purchase.id}>
                    <Link
                      href={`/purchases/${purchase.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-2.5 transition-colors hover:bg-sunken"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="num text-[13px] font-bold text-primary">
                            {purchase.number}
                          </span>
                          {purchase.status === 'DRAFT' && (
                            <Badge tone="neutral" size="sm">
                              مسودة
                            </Badge>
                          )}
                        </span>
                        <span className="num-mixed block text-[11.5px] text-tertiary">
                          {fmt.date(purchase.purchasedAt)} · {purchase.itemCount} صنف
                          {purchase.reference && ` · ${purchase.reference}`}
                        </span>
                      </span>
                      <span className="shrink-0 text-end">
                        <span className="num block text-[13.5px] font-bold text-primary">
                          {fmt.money(purchase.total)}
                        </span>
                        {purchase.dueTotal > 0 && (
                          <span className="num-mixed block text-[11.5px] text-warning">
                            متبقٍ {fmt.money(purchase.dueTotal)}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="كشف الحساب" subtitle="كل حركة على رصيد المورد" />
            {supplier.ledger.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-tertiary">لا توجد حركات بعد.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line-subtle">
                {supplier.ledger.map((entry) => {
                  const increases = entry.amount > 0;
                  return (
                    <li key={entry.id} className="flex items-start gap-3 py-3">
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                          increases ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success'
                        }`}
                        aria-hidden="true"
                      >
                        {increases ? '+' : '−'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-primary">
                          {LEDGER_LABEL[entry.type] ?? entry.type}
                        </span>
                        <span className="block truncate text-[11.5px] text-tertiary">
                          {entry.description ?? '—'} · {entry.userName}
                        </span>
                      </span>
                      <span className="shrink-0 text-end">
                        <span
                          className={`num block text-[13.5px] font-bold ${
                            increases ? 'text-warning' : 'text-success'
                          }`}
                        >
                          {fmt.money(Math.abs(entry.amount))}
                        </span>
                        <span className="num-mixed block text-[11px] text-tertiary">
                          الرصيد {fmt.money(entry.balanceAfter)}
                        </span>
                        <span className="num block text-[11px] text-tertiary">
                          {fmt.dateTime(entry.occurredAt)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <CardHeader title="بيانات التواصل" />
            <dl className="mt-3 space-y-2.5 text-[13px]">
              {supplier.phone && (
                <div className="flex items-start gap-2.5">
                  <Phone className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden="true" />
                  <a href={`tel:${supplier.phone}`} className="num text-primary hover:underline">
                    {supplier.phone}
                  </a>
                </div>
              )}
              {supplier.address && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden="true" />
                  <span className="text-secondary">{supplier.address}</span>
                </div>
              )}
              {!supplier.phone && !supplier.address && (
                <p className="text-tertiary">لم تُسجَّل بيانات تواصل</p>
              )}
            </dl>
          </Card>

          {supplier.note && (
            <Card>
              <CardHeader title="ملاحظات" />
              <p className="mt-2 text-[13px] leading-relaxed text-secondary">{supplier.note}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
