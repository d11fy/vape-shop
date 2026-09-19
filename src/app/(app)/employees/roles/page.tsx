import type { Metadata } from 'next';

import { can, requirePermission } from '@/core/auth/context';
import { ALL_PERMISSIONS } from '@/core/rbac/permissions';
import { listRoles } from '@/modules/employees/queries';
import { RoleList } from '@/modules/employees/employee-view';
import { Alert } from '@/ui/feedback/alert';
import { LinkTabs } from '@/ui/primitives/tabs';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'الأدوار والصلاحيات' };

export default async function RolesPage() {
  const { store } = await requirePermission('employees.view', 'roles.manage');

  const roles = await listRoles(store.id);
  const canManage = can(store, 'roles.manage') && !store.subscription.isReadOnly;
  const grantable = store.isOwner ? [...ALL_PERMISSIONS] : [...store.permissions];

  return (
    <>
      <PageHeader
        title="الأدوار والصلاحيات"
        description="حدد بدقة ما يستطيع كل دور فعله داخل النظام"
        backHref="/employees"
      />

      <LinkTabs
        className="mb-4"
        items={[
          { href: '/employees', label: 'الفريق', exact: true },
          { href: '/employees/roles', label: 'الأدوار والصلاحيات' },
          { href: '/employees/activity', label: 'النشاط' },
        ]}
      />

      <Alert tone="info" className="mb-4" title="كيف تعمل الصلاحيات">
        الصلاحيات تُفحص على الخادم أولاً، لا بإخفاء الأزرار فقط. يمكنك أيضاً منح أو منع صلاحية
        لموظف بعينه من صفحته دون تغيير دوره.
      </Alert>

      <RoleList roles={roles} canManage={canManage} grantable={grantable} />
    </>
  );
}
