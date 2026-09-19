import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarClock, MapPin, Phone, Receipt, ShieldCheck } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { db } from '@/core/db';
import { buildFormatter } from '@/lib/formatter';
import { getCustomer, getOpenInvoices } from '@/modules/customers/queries';
import { CustomerActions, LedgerTimeline } from '@/modules/customers/customer-detail';
import { Badge } from '@/ui/primitives/badge';
import { Card, CardHeader } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { PageHeader } from '@/ui/layout/page-header';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'ملف العميل' };

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { store } = await requirePermission('customers.view');
  const { id } = await params;

  const customer = await getCustomer(store.id, id);
  if (!customer) notFound();

  const showDebt = can(store, 'debts.view');
  const readOnly = store.subscription.isReadOnly;

  const [openInvoices, paymentMethods] = await Promise.all([
    showDebt ? getOpenInvoices(store.id, customer.id) : Promise.resolve([]),
    db.paymentMethod.findMany({
      where: { storeId: store.id, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
      select: { id: true, name: true, affectsCashbox: true },
    }),
  ]);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const effectiveLimit =
    customer.debtLimit > 0 ? customer.debtLimit : store.settings.defaultDebtLimit;

  return (
    <>
      <PageHeader
        title={customer.name}
        description={
          [
            customer.phone,
            `عميل منذ ${fmt.date(customer.createdAt)}`,
          ]
            .filter(Boolean)
            .join(' · ')
        }
        backHref="/customers"
        breadcrumbs={[{ label: 'العملاء', href: '/customers' }, { label: customer.name }]}
        actions={
          <CustomerActions
            customer={{ id: customer.id, name: customer.name, balance: customer.balance }}
            paymentMethods={paymentMethods}
            openInvoices={openInvoices}
            canCollect={can(store, 'debts.collect') && !readOnly}
            canAdjust={can(store, 'debts.adjust') && !readOnly}
            canEdit={can(store, 'customers.edit') && !readOnly}
          />
        }
      />

      {!customer.isActive && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-line bg-sunken px-4 py-3 text-[13px] text-secondary">
          هذا العميل موقوف — لا يمكن تسجيل مبيعات جديدة له، وسجلّه محفوظ كما هو.
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {showDebt && (
          <StatCard
            label="الرصيد الحالي"
            value={fmt.money(Math.abs(customer.balance))}
            hint={
              customer.balance > 0
                ? effectiveLimit > 0
                  ? `الحد المسموح ${fmt.money(effectiveLimit)}`
                  : 'عليه للمحل'
                : customer.balance < 0
                  ? 'له عند المحل'
                  : 'لا يوجد رصيد'
            }
            tone={customer.balance > 0 ? 'warning' : customer.balance < 0 ? 'success' : 'default'}
          />
        )}
        <StatCard
          label="إجمالي المشتريات"
          value={fmt.money(customer.stats.totalPurchases)}
          hint={`${fmt.number(customer.stats.invoiceCount)} فاتورة`}
        />
        <StatCard
          label="متوسط الفاتورة"
          value={fmt.money(customer.stats.averageInvoice)}
        />
        <StatCard
          label="آخر عملية شراء"
          value={
            customer.stats.lastPurchaseAt ? fmt.date(customer.stats.lastPurchaseAt) : '—'
          }
          hint={
            customer.stats.lastPurchaseAt
              ? fmt.relative(customer.stats.lastPurchaseAt)
              : 'لم يشترِ بعد'
          }
          icon={<CalendarClock className="size-[18px]" />}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {/* Open invoices */}
          {showDebt && openInvoices.length > 0 && (
            <Card>
              <CardHeader
                title="فواتير عليها متبقٍ"
                subtitle="تُسدَّد من الأقدم إلى الأحدث"
                icon={<Receipt className="size-4" />}
              />
              <ul className="mt-3 divide-y divide-line-subtle">
                {openInvoices.map((invoice) => (
                  <li key={invoice.id}>
                    <Link
                      href={`/invoices/${invoice.id}`}
                      className="-mx-2 flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2 py-2.5 transition-colors hover:bg-sunken"
                    >
                      <span className="min-w-0">
                        <span className="num block text-[13px] font-bold text-primary">
                          {invoice.number}
                        </span>
                        <span className="num-mixed block text-[11.5px] text-tertiary">
                          {fmt.date(invoice.soldAt)} · منذ {invoice.ageDays} يوم
                        </span>
                      </span>
                      <span className="shrink-0 text-end">
                        <span className="num block text-[13.5px] font-bold text-warning">
                          {fmt.money(invoice.dueTotal)}
                        </span>
                        <span className="num-mixed block text-[11px] text-tertiary">
                          من {fmt.money(invoice.total)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* Ledger */}
          {showDebt && (
            <Card>
              <CardHeader title="كشف الحساب" subtitle="كل حركة على رصيد العميل" />
              <LedgerTimeline entries={customer.ledger} />
            </Card>
          )}

          {/* Recent sales */}
          <Card>
            <CardHeader
              title="آخر الفواتير"
              action={
                <Link
                  href={`/invoices?q=${encodeURIComponent(customer.name)}`}
                  className="text-[12.5px] font-semibold text-accent-strong hover:underline"
                >
                  عرض الكل
                </Link>
              }
            />
            {customer.recentSales.length === 0 ? (
              <EmptyState
                variant="compact"
                icon={<Receipt className="size-6" />}
                title="لا توجد فواتير"
                description="لم يُسجَّل أي بيع لهذا العميل بعد."
              />
            ) : (
              <ul className="mt-3 divide-y divide-line-subtle">
                {customer.recentSales.map((sale) => (
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
                          {fmt.dateTime(sale.soldAt)}
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
        </div>

        {/* Sidebar */}
        <div className="space-y-3">
          <Card>
            <CardHeader title="بيانات التواصل" />
            <dl className="mt-3 space-y-2.5 text-[13px]">
              {customer.phone && (
                <div className="flex items-start gap-2.5">
                  <Phone className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden="true" />
                  <a href={`tel:${customer.phone}`} className="num text-primary hover:underline">
                    {customer.phone}
                  </a>
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-tertiary" aria-hidden="true" />
                  <span className="text-secondary">{customer.address}</span>
                </div>
              )}
              {!customer.phone && !customer.address && (
                <p className="text-tertiary">لم تُسجَّل بيانات تواصل</p>
              )}
            </dl>
          </Card>

          {store.settings.ageVerificationEnabled && (
            <Card>
              <CardHeader title="التحقق من العمر" icon={<ShieldCheck className="size-4" />} />
              <div className="mt-3">
                {customer.ageVerified ? (
                  <>
                    <Badge tone="success" size="sm" dot>
                      تم التحقق
                    </Badge>
                    {customer.ageVerifiedAt && (
                      <p className="num-mixed mt-2 text-[12px] text-tertiary">
                        بتاريخ {fmt.date(customer.ageVerifiedAt)}
                      </p>
                    )}
                  </>
                ) : (
                  <Badge tone="warning" size="sm" dot>
                    لم يتم التحقق
                  </Badge>
                )}
                <p className="mt-2 text-[12px] leading-relaxed text-tertiary">
                  {store.settings.ageNoticeAr}
                </p>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="ملخص الحساب" />
            <dl className="mt-3 space-y-2 text-[13px]">
              <Row label="إجمالي المدفوع" value={fmt.money(customer.stats.totalPaid)} />
              <Row label="إجمالي المرتجعات" value={fmt.money(customer.stats.totalReturned)} />
              {customer.stats.firstPurchaseAt && (
                <Row label="أول عملية شراء" value={fmt.date(customer.stats.firstPurchaseAt)} />
              )}
            </dl>
          </Card>

          {customer.note && (
            <Card>
              <CardHeader title="ملاحظات" />
              <p className="mt-2 text-[13px] leading-relaxed text-secondary">{customer.note}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-secondary">{label}</dt>
      <dd className="num font-semibold text-primary">{value}</dd>
    </div>
  );
}
