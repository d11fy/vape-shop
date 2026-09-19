import type { Metadata } from 'next';
import { FolderTree } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { NOUNS } from '@/lib/arabic-count';
import { deleteExpenseCategoryAction, saveExpenseCategoryAction } from '@/modules/expenses/actions';
import { listExpenseCategories } from '@/modules/expenses/queries';
import { NamedListManager } from '@/ui/forms/named-list-manager';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'فئات المصاريف' };

export default async function ExpenseCategoriesPage() {
  const { store } = await requirePermission('expenses.view');
  const canEdit = can(store, 'expenses.manage_categories') && !store.subscription.isReadOnly;
  const categories = await listExpenseCategories(store.id);

  return (
    <>
      <PageHeader
        title="فئات المصاريف"
        description="تجميع المصاريف لتظهر مفصّلة في تقرير المصاريف وصافي الربح"
        backHref="/expenses"
        breadcrumbs={[{ label: 'المصاريف', href: '/expenses' }, { label: 'الفئات' }]}
      />

      <div className="max-w-2xl">
        <NamedListManager
          title="الفئات"
          subtitle="الإيجار، الرواتب، الكهرباء، النقل…"
          icon={<FolderTree className="size-4" />}
          noun="فئة"
          usageNoun={NOUNS.expense}
          withColor
          canEdit={canEdit}
          items={categories.map((category) => ({
            id: category.id,
            name: category.name,
            color: category.color,
            isActive: category.isActive,
            usage: category._count.expenses,
            isSystem: category.isSystem,
          }))}
          onSave={saveExpenseCategoryAction}
          onDelete={deleteExpenseCategoryAction}
          emptyText="لا توجد فئات بعد"
        />
      </div>
    </>
  );
}
