import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Barcode, History, Pencil, TrendingUp } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { costAmount } from '@/core/quantity';
import { buildFormatter } from '@/lib/formatter';
import {
  getProduct,
  getProductMovements,
  getProductPerformance,
} from '@/modules/products/queries';
import { MOVEMENT_LABEL } from '@/modules/inventory/labels';
import { Badge } from '@/ui/primitives/badge';
import { ButtonLink } from '@/ui/primitives/button';
import { Card, CardHeader } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { PageHeader } from '@/ui/layout/page-header';
import { StatCard } from '@/ui/data/stat-card';

export const metadata: Metadata = { title: 'تفاصيل المنتج' };

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { store } = await requirePermission('products.view');
  const { id } = await params;

  const product = await getProduct(store.id, store.branch.id, id);
  if (!product) notFound();

  const showCost = can(store, 'products.view_cost');
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [movements, performance] = await Promise.all([
    can(store, 'inventory.view') ? getProductMovements(store.id, product.id) : Promise.resolve([]),
    can(store, 'reports.view')
      ? getProductPerformance(store.id, product.id, since)
      : Promise.resolve(null),
  ]);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const totalStock = product.variants.reduce((sum, variant) => sum + variant.stock, 0);
  const stockValue = product.variants.reduce(
    (sum, variant) => sum + costAmount(variant.stock, variant.avgCostPerBase),
    0,
  );

  return (
    <>
      <PageHeader
        title={product.name}
        description={[product.brandName, product.categoryName].filter(Boolean).join(' · ') || undefined}
        backHref="/products"
        breadcrumbs={[{ label: 'المنتجات', href: '/products' }, { label: product.name }]}
        actions={
          can(store, 'products.edit') && !store.subscription.isReadOnly ? (
            <ButtonLink
              href={`/products/${product.id}/edit`}
              variant="primary"
              iconStart={<Pencil className="size-4" />}
            >
              تعديل
            </ButtonLink>
          ) : undefined
        }
      />

      {product.status === 'ARCHIVED' && (
        <div className="mb-4 rounded-[var(--radius-md)] border border-line bg-sunken px-4 py-3 text-[13px] text-secondary">
          هذا المنتج مؤرشف ولا يظهر في شاشة البيع. سجلّه وفواتيره السابقة محفوظة كما هي.
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="الأصناف"
          value={fmt.number(product.variants.length)}
          hint={product.variants.length > 1 ? 'أحجام وأسعار مختلفة' : 'صنف واحد'}
        />
        <StatCard
          label="إجمالي المخزون"
          value={
            product.trackInventory
              ? fmt.number(totalStock / 1000, 3)
              : '—'
          }
          hint={product.trackInventory ? `بالوحدة الأساسية` : 'غير متتبَّع'}
          tone={totalStock <= 0 && product.trackInventory ? 'danger' : 'default'}
        />
        {showCost && (
          <StatCard
            label="قيمة المخزون"
            value={fmt.money(stockValue)}
            hint="بمتوسط التكلفة"
          />
        )}
        {performance && (
          <StatCard
            label="مبيعات 30 يوم"
            value={fmt.money(performance.revenue)}
            hint={`${fmt.number(performance.lineCount)} عملية بيع`}
            icon={<TrendingUp className="size-[18px]" />}
            tone="accent"
          />
        )}
      </div>

      {/* Variants */}
      <Card className="mt-3" padded={false}>
        <div className="border-b border-line-subtle px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-bold text-primary">الأصناف والأسعار</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-sunken/50 text-secondary">
              <tr>
                <th className="px-4 py-2.5 text-start font-semibold">الصنف</th>
                <th className="px-4 py-2.5 text-start font-semibold">الباركود</th>
                <th className="px-4 py-2.5 text-end font-semibold">سعر البيع</th>
                {showCost && (
                  <th className="px-4 py-2.5 text-end font-semibold">متوسط التكلفة</th>
                )}
                {showCost && <th className="px-4 py-2.5 text-end font-semibold">الهامش</th>}
                <th className="px-4 py-2.5 text-end font-semibold">المتوفر</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => {
                const units = variant.stock / (variant.factor || 1000);
                const low = variant.minimumStock > 0 && variant.stock <= variant.minimumStock;
                const margin =
                  variant.sellingPrice > 0 && variant.avgCostPerUnit > 0
                    ? Math.round(
                        ((variant.sellingPrice - variant.avgCostPerUnit) / variant.sellingPrice) *
                          1000,
                      ) / 10
                    : null;

                return (
                  <tr key={variant.id} className="border-t border-line-subtle">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="font-semibold text-primary">{variant.name}</span>
                        {!variant.isActive && (
                          <Badge tone="neutral" size="sm">
                            موقوف
                          </Badge>
                        )}
                      </span>
                      <span className="num-mixed block text-[11.5px] text-tertiary">
                        {variant.sku} · {variant.unitLabel}
                        {variant.allowsFractional && ' · يقبل الكسور'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {variant.barcode ? (
                        <span className="num flex items-center gap-1.5 text-secondary">
                          <Barcode className="size-3.5 text-tertiary" />
                          {variant.barcode}
                        </span>
                      ) : (
                        <span className="text-tertiary">—</span>
                      )}
                    </td>
                    <td className="num px-4 py-3 text-end font-bold text-primary">
                      {fmt.money(variant.sellingPrice)}
                    </td>
                    {showCost && (
                      <td className="num px-4 py-3 text-end text-secondary">
                        {variant.avgCostPerUnit > 0 ? fmt.money(variant.avgCostPerUnit) : '—'}
                      </td>
                    )}
                    {showCost && (
                      <td className="num px-4 py-3 text-end">
                        {margin !== null ? (
                          <span className={margin >= 0 ? 'text-success' : 'text-danger'}>
                            {fmt.percent(margin)}
                          </span>
                        ) : (
                          <span className="text-tertiary">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-end">
                      {product.trackInventory ? (
                        <span
                          className={`num font-semibold ${
                            variant.stock <= 0
                              ? 'text-danger'
                              : low
                                ? 'text-warning'
                                : 'text-primary'
                          }`}
                        >
                          {units.toLocaleString('en-US', { maximumFractionDigits: 3 })}{' '}
                          <span className="text-[11.5px] font-normal text-tertiary">
                            {variant.unitLabel}
                          </span>
                        </span>
                      ) : (
                        <span className="text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {product.description && (
        <Card className="mt-3">
          <CardHeader title="الوصف" />
          <p className="mt-2 text-[13px] leading-relaxed text-secondary">{product.description}</p>
        </Card>
      )}

      {/* Movements */}
      {movements.length > 0 && (
        <Card className="mt-3">
          <CardHeader
            title="آخر حركات المخزون"
            subtitle="كل تغيير على الكمية وسببه"
            icon={<History className="size-4" />}
            action={
              <Link
                href={`/inventory?product=${product.id}`}
                className="text-[12.5px] font-semibold text-accent-strong hover:underline"
              >
                عرض الكل
              </Link>
            }
          />

          <ul className="mt-3 divide-y divide-line-subtle">
            {movements.map((movement) => {
              const meta = MOVEMENT_LABEL[movement.type];
              const units = movement.change / (movement.factor || 1000);

              return (
                <li key={movement.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      movement.change >= 0
                        ? 'bg-success-soft text-success'
                        : 'bg-danger-soft text-danger'
                    }`}
                  >
                    {movement.change >= 0 ? '+' : '−'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-primary">
                      {meta?.label ?? movement.type}
                      {movement.variantName !== 'افتراضي' && (
                        <span className="font-normal text-tertiary"> · {movement.variantName}</span>
                      )}
                    </span>
                    <span className="block truncate text-[11.5px] text-tertiary">
                      {movement.userName}
                      {movement.reason && ` · ${movement.reason}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="num block text-[13px] font-bold text-primary">
                      {units > 0 ? '+' : ''}
                      {units.toLocaleString('en-US', { maximumFractionDigits: 3 })}{' '}
                      <span className="text-[11px] font-normal text-tertiary">
                        {movement.unitLabel}
                      </span>
                    </span>
                    <span className="num block text-[11px] text-tertiary">
                      {fmt.dateTime(movement.occurredAt)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {movements.length === 0 && can(store, 'inventory.view') && (
        <Card className="mt-3">
          <EmptyState
            variant="compact"
            icon={<History className="size-6" />}
            title="لا توجد حركات مخزون"
            description="ستظهر هنا كل عمليات الشراء والبيع والتسوية لهذا المنتج."
          />
        </Card>
      )}
    </>
  );
}
