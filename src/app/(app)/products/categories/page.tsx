import type { Metadata } from 'next';
import { FolderTree, Tags } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { NOUNS } from '@/lib/arabic-count';
import {
  deleteBrandAction,
  deleteCategoryAction,
  saveBrandAction,
  saveCategoryAction,
} from '@/modules/products/actions';
import { listBrands, listCategories } from '@/modules/products/queries';
import { NamedListManager } from '@/ui/forms/named-list-manager';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'التصنيفات والماركات' };

export default async function ProductCategoriesPage() {
  const { store } = await requirePermission('products.view');
  const canEdit = can(store, 'catalog.manage') && !store.subscription.isReadOnly;

  const [categories, brands] = await Promise.all([
    listCategories(store.id),
    listBrands(store.id),
  ]);

  return (
    <>
      <PageHeader
        title="التصنيفات والماركات"
        description="تنظيم المنتجات لتسهيل البحث في شاشة البيع والتقارير"
        backHref="/products"
        breadcrumbs={[{ label: 'المنتجات', href: '/products' }, { label: 'التصنيفات والماركات' }]}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <NamedListManager
          title="التصنيفات"
          subtitle="معسل، فيب، فحم، إكسسوارات…"
          icon={<FolderTree className="size-4" />}
          noun="تصنيف"
          usageNoun={NOUNS.product}
          withColor
          canEdit={canEdit}
          items={categories.map((category) => ({
            id: category.id,
            name: category.name,
            color: category.color,
            isActive: category.isActive,
            usage: category._count.products,
          }))}
          onSave={saveCategoryAction}
          onDelete={deleteCategoryAction}
          emptyText="لا توجد تصنيفات بعد"
        />

        <NamedListManager
          title="الماركات"
          subtitle="الفاخر، مزايا، نخلة…"
          icon={<Tags className="size-4" />}
          noun="ماركة"
          usageNoun={NOUNS.product}
          canEdit={canEdit}
          items={brands.map((brand) => ({
            id: brand.id,
            name: brand.name,
            isActive: brand.isActive,
            usage: brand._count.products,
          }))}
          onSave={saveBrandAction}
          onDelete={deleteBrandAction}
          emptyText="لا توجد ماركات بعد"
        />
      </div>
    </>
  );
}
