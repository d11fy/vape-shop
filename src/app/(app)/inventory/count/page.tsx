import type { Metadata } from 'next';

import { requireWritePermission } from '@/core/auth/context';
import { firstParam } from '@/lib/table-query';
import { getCountSheet } from '@/modules/inventory/queries';
import { listCategories } from '@/modules/products/queries';
import { CountSheet } from '@/modules/inventory/count-sheet';
import { Alert } from '@/ui/feedback/alert';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'جرد وتسوية المخزون' };

export default async function StockCountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requireWritePermission('inventory.adjust');
  const params = await searchParams;

  const [rows, categories] = await Promise.all([
    getCountSheet(store.id, store.branch.id, {
      categoryId: firstParam(params, 'category'),
      limit: 400,
    }),
    listCategories(store.id),
  ]);

  return (
    <>
      <PageHeader
        title="جرد وتسوية المخزون"
        description={`${store.branch.name} — أدخل الكميات الفعلية على الرف`}
        backHref="/inventory"
        breadcrumbs={[{ label: 'المخزون', href: '/inventory' }, { label: 'جرد وتسوية' }]}
      />

      <Alert tone="info" className="mb-4" title="كيف يعمل الجرد">
        اترك خانة أي صنف فارغة إذا لم تجرده — لن يتأثر. الأصناف التي تدخل لها كمية مختلفة عن النظام
        فقط هي التي ستُعدَّل، وسيُسجَّل الفرق وسببك واسمك في سجل النشاط.
      </Alert>

      <CountSheet
        rows={rows}
        categories={categories.filter((category) => category.isActive)}
      />
    </>
  );
}
