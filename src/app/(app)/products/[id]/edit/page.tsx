import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { requireWritePermission } from '@/core/auth/context';
import { getProduct, listBrands, listCategories } from '@/modules/products/queries';
import { ProductForm } from '@/modules/products/product-form';
import { PageHeader } from '@/ui/layout/page-header';
import type { ProductInput } from '@/modules/products/validation';

export const metadata: Metadata = { title: 'تعديل المنتج' };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { store } = await requireWritePermission('products.edit');
  const { id } = await params;

  const [product, categories, brands] = await Promise.all([
    getProduct(store.id, store.branch.id, id),
    listCategories(store.id),
    listBrands(store.id),
  ]);

  if (!product) notFound();

  const initial: ProductInput & { id: string } = {
    id: product.id,
    name: product.name,
    description: product.description ?? '',
    categoryId: product.categoryId,
    brandId: product.brandId,
    unitKind: product.unitKind,
    trackInventory: product.trackInventory,
    isAgeRestricted: product.isAgeRestricted,
    status: product.status,
    imageUrl: product.imageUrl ?? '',
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      barcode: variant.barcode ?? '',
      unitLabel: variant.unitLabel,
      displayFactor: variant.factor,
      allowsFractional: variant.allowsFractional,
      sellingPrice: variant.sellingPrice,
      wholesalePrice: variant.wholesalePrice,
      purchasePrice: variant.purchasePrice,
      minimumStock: variant.minimumStock,
      // Quantities are never edited here — that is what stock adjustments are
      // for, and they leave an audit trail.
      openingStock: 0,
      isActive: variant.isActive,
    })),
  };

  return (
    <>
      <PageHeader
        title={`تعديل ${product.name}`}
        description="تغيير السعر يُسجَّل في سجل النشاط مع القيمة السابقة"
        backHref={`/products/${product.id}`}
        breadcrumbs={[
          { label: 'المنتجات', href: '/products' },
          { label: product.name, href: `/products/${product.id}` },
          { label: 'تعديل' },
        ]}
      />

      <ProductForm
        product={initial}
        categories={categories.filter((category) => category.isActive)}
        brands={brands.filter((brand) => brand.isActive)}
        allowOpeningStock={false}
      />
    </>
  );
}
