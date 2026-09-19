import type { Metadata } from 'next';
import { FolderTree, Plus } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { listBrands, listCategories, listProducts } from '@/modules/products/queries';
import { ProductTable } from '@/modules/products/product-table';
import { ButtonLink } from '@/ui/primitives/button';
import { FilterBar } from '@/ui/filters/filter-bar';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';

export const metadata: Metadata = { title: 'المنتجات' };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('products.view');
  const params = await searchParams;
  const query = parseTableQuery(params, { defaultSort: 'name' });

  const stockRaw = firstParam(params, 'stock');
  const stockState =
    stockRaw === 'low' || stockRaw === 'out' || stockRaw === 'ok' ? stockRaw : undefined;

  const [result, categories, brands] = await Promise.all([
    listProducts({
      storeId: store.id,
      branchId: store.branch.id,
      query,
      categoryId: firstParam(params, 'category'),
      brandId: firstParam(params, 'brand'),
      status: firstParam(params, 'status'),
      stockState,
    }),
    listCategories(store.id),
    listBrands(store.id),
  ]);

  const canCreate = can(store, 'products.create');

  return (
    <>
      <PageHeader
        title="المنتجات"
        description={`${result.total} منتج · ${store.branch.name}`}
        actions={
          <>
            {can(store, 'catalog.manage') && (
              <ButtonLink href="/products/categories" variant="outline" iconStart={<FolderTree className="size-4" />}>
                  التصنيفات
                </ButtonLink>
            )}
            {canCreate && (
              <ButtonLink href="/products/new" variant="accent" iconStart={<Plus className="size-4" />}>
                  منتج جديد
                </ButtonLink>
            )}
          </>
        }
      />

      <FilterBar
        searchPlaceholder="اسم المنتج أو الباركود أو الكود…"
        filters={[
          {
            key: 'category',
            label: 'التصنيف',
            options: [
              { value: 'all', label: 'كل التصنيفات' },
              ...categories.map((category) => ({ value: category.id, label: category.name })),
            ],
          },
          {
            key: 'brand',
            label: 'الماركة',
            options: [
              { value: 'all', label: 'كل الماركات' },
              ...brands.map((brand) => ({ value: brand.id, label: brand.name })),
            ],
          },
          {
            key: 'stock',
            label: 'حالة المخزون',
            options: [
              { value: 'all', label: 'كل الحالات' },
              { value: 'ok', label: 'متوفر' },
              { value: 'low', label: 'منخفض أو نافد' },
              { value: 'out', label: 'نافد فقط' },
            ],
          },
          {
            key: 'status',
            label: 'الحالة',
            options: [
              { value: 'ACTIVE', label: 'المتاحة للبيع' },
              { value: 'ARCHIVED', label: 'المؤرشفة' },
              { value: 'all', label: 'الكل' },
            ],
          },
        ]}
      />

      <ProductTable
        rows={result.rows}
        showCost={can(store, 'products.view_cost')}
        canCreate={canCreate}
        searching={query.search !== '' || Boolean(firstParam(params, 'category'))}
      />

      <Pagination total={result.total} page={query.page} perPage={query.perPage} unit="منتج" />
    </>
  );
}
