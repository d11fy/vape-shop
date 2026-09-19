import type { Metadata } from 'next';

import { can, requirePermission } from '@/core/auth/context';
import { db } from '@/core/db';
import { BranchesView } from '@/modules/settings/branches-view';
import { SettingsTabs } from '@/modules/settings/settings-tabs';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'الفروع' };

export default async function BranchesPage() {
  const { store } = await requirePermission('settings.view');

  const branches = await db.branch.findMany({
    where: { storeId: store.id, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      code: true,
      phone: true,
      address: true,
      isDefault: true,
      isActive: true,
      cashboxes: { select: { balance: true } },
      _count: {
        select: {
          members: true,
          sales: { where: { deletedAt: null } },
        },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="الفروع"
        description="كل فرع له مخزونه وصندوقه وموظفوه"
      />

      <SettingsTabs />

      <BranchesView
        branches={branches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          code: branch.code,
          phone: branch.phone,
          address: branch.address,
          isDefault: branch.isDefault,
          isActive: branch.isActive,
          cashboxBalance: branch.cashboxes.reduce(
            (sum, cashbox) => sum + Number(cashbox.balance),
            0,
          ),
          employeeCount: branch._count.members,
          salesCount: branch._count.sales,
        }))}
        canManage={can(store, 'settings.branches') && !store.subscription.isReadOnly}
        limit={store.subscription.limits.maxBranches}
        planName={store.subscription.planName}
      />
    </>
  );
}
