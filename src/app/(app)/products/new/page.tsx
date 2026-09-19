import type { Metadata } from 'next';

import { requireWritePermission } from '@/core/auth/context';
import { listBrands, listCategories } from '@/modules/products/queries';
import { ProductForm } from '@/modules/products/product-form';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'منتج جديد' };

export default async function NewProductPage() {
  const { store } = await requireWritePermission('products.create');

  const [categories, brands] = await Promise.all([
    listCategories(store.id),
    listBrands(store.id),
  ]);

  return (
    <>
      <PageHeader
        title="منتج جديد"
        description="أضف المنتج وحدد أحجامه وأسعاره ورصيده الافتتاحي"
        backHref="/products"
        breadcrumbs={[{ label: 'المنتجات', href: '/products' }, { label: 'منتج جديد' }]}
      />

      <ProductForm
        categories={categories.filter((category) => category.isActive)}
        brands={brands.filter((brand) => brand.isActive)}
        allowOpeningStock
      />
    </>
  );
}
