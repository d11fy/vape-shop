import type { Metadata } from 'next';
import Link from 'next/link';
import { Store } from 'lucide-react';

import { requirePlatformAdmin } from '@/core/auth/context';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { buildFormatter } from '@/lib/formatter';
import { listPlans, listPlatformStores } from '@/modules/platform/queries';
import { CreateStoreButton } from '@/modules/platform/platform-actions';
import { StoreStatusBadge } from '@/modules/platform/store-status';
import { Badge } from '@/ui/primitives/badge';
import { Card } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { FilterBar } from '@/ui/filters/filter-bar';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';

export const metadata: Metadata = { title: 'المتاجر' };

export default async function PlatformStoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const query = parseTableQuery(params, { defaultPerPage: 25 });

  const [result, plans] = await Promise.all([
    listPlatformStores({
      query,
      status: firstParam(params, 'status'),
      planCode: firstParam(params, 'plan'),
    }),
    listPlans(),
  ]);

  const fmt = buildFormatter({
    currency: 'SAR',
    decimals: 2,
    timezone: 'Asia/Riyadh',
    locale: 'ar',
  });

  return (
    <>
      <PageHeader
        title="المتاجر"
        description={`${result.total} متجر مسجّل على المنصة`}
        actions={
          <CreateStoreButton
            plans={plans.map((plan) => ({ id: plan.id, code: plan.code, nameAr: plan.nameAr }))}
          />
        }
      />

      <FilterBar
        searchPlaceholder="اسم المتجر أو بريد المالك…"
        filters={[
          {
            key: 'status',
            label: 'الحالة',
            options: [
              { value: 'all', label: 'كل المتاجر' },
              { value: 'ACTIVE', label: 'نشطة' },
              { value: 'PENDING', label: 'قيد التهيئة' },
              { value: 'SUSPENDED', label: 'معلّقة' },
              { value: 'expiring', label: 'اشتراك ينتهي قريباً' },
            ],
          },
          {
            key: 'plan',
            label: 'الخطة',
            options: [
              { value: 'all', label: 'كل الخطط' },
              ...plans.map((plan) => ({ value: plan.code, label: plan.nameAr })),
            ],
          },
        ]}
      />

      {result.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Store className="size-6" />}
            title="لا توجد متاجر مطابقة"
            description="جرّب تغيير التصفية أو البحث باسم آخر."
          />
        </Card>
      ) : (
        <>
          <Card padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="bg-sunken/60 text-secondary">
                  <tr>
                    <th className="px-4 py-3 text-start font-semibold">المتجر</th>
                    <th className="px-4 py-3 text-start font-semibold">المالك</th>
                    <th className="px-4 py-3 text-start font-semibold">الخطة</th>
                    <th className="px-4 py-3 text-center font-semibold">الحالة</th>
                    <th className="px-4 py-3 text-center font-semibold">الموظفون</th>
                    <th className="px-4 py-3 text-center font-semibold">الفواتير</th>
                    <th className="px-4 py-3 text-end font-semibold">ينتهي في</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((store) => (
                    <tr
                      key={store.id}
                      className="border-t border-line-subtle transition-colors hover:bg-sunken/40"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/platform/stores/${store.id}`}
                          className="font-semibold text-primary hover:text-accent-strong"
                        >
                          {store.name}
                        </Link>
                        <span className="num block text-[11.5px] text-tertiary">{store.slug}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block text-secondary">{store.ownerName ?? '—'}</span>
                        <span className="num block text-[11.5px] text-tertiary">
                          {store.ownerEmail ?? ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-secondary">{store.planName}</td>
                      <td className="px-4 py-3 text-center">
                        <StoreStatusBadge status={store.status} />
                      </td>
                      <td className="num px-4 py-3 text-center text-secondary">
                        {store.employeeCount}
                      </td>
                      <td className="num px-4 py-3 text-center text-secondary">
                        {fmt.number(store.invoiceCount)}
                      </td>
                      <td className="px-4 py-3 text-end">
                        {store.endsAt ? (
                          <>
                            <Badge
                              tone={
                                store.daysLeft === null
                                  ? 'neutral'
                                  : store.daysLeft < 0
                                    ? 'danger'
                                    : store.daysLeft <= 7
                                      ? 'warning'
                                      : 'neutral'
                              }
                              size="sm"
                            >
                              {store.daysLeft === null
                                ? '—'
                                : store.daysLeft < 0
                                  ? `منتهٍ`
                                  : `${store.daysLeft} يوم`}
                            </Badge>
                            <span className="num mt-1 block text-[11px] text-tertiary">
                              {fmt.date(store.endsAt)}
                            </span>
                          </>
                        ) : (
                          <span className="text-tertiary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Pagination
            total={result.total}
            page={query.page}
            perPage={query.perPage}
            unit="متجر"
          />
        </>
      )}
    </>
  );
}
