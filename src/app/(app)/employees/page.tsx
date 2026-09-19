import type { Metadata } from 'next';

import { can, requirePermission } from '@/core/auth/context';
import { ALL_PERMISSIONS } from '@/core/rbac/permissions';
import { buildFormatter } from '@/lib/formatter';
import { firstParam } from '@/lib/table-query';
import {
  countActiveEmployees,
  listBranchOptions,
  listEmployees,
  listRoles,
} from '@/modules/employees/queries';
import { EmployeeList } from '@/modules/employees/employee-view';
import { Alert } from '@/ui/feedback/alert';
import { LinkTabs } from '@/ui/primitives/tabs';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'الموظفون' };

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('employees.view');
  const params = await searchParams;

  const [employees, roles, branches, activeCount] = await Promise.all([
    listEmployees(store.id),
    listRoles(store.id),
    listBranchOptions(store.id),
    countActiveEmployees(store.id),
  ]);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  const limit = store.subscription.limits.maxEmployees;
  const canManage = can(store, 'employees.manage') && !store.subscription.isReadOnly;

  // An owner can delegate anything; anyone else only what they hold themselves.
  const grantable = store.isOwner ? [...ALL_PERMISSIONS] : [...store.permissions];

  return (
    <>
      <PageHeader
        title="الموظفون"
        description={
          limit === null
            ? `${activeCount} موظف نشط`
            : `${activeCount} من ${limit} موظف في خطة ${store.subscription.planName}`
        }
      />

      <LinkTabs
        className="mb-4"
        items={[
          { href: '/employees', label: 'الفريق', exact: true },
          { href: '/employees/roles', label: 'الأدوار والصلاحيات' },
          { href: '/employees/activity', label: 'النشاط' },
        ]}
      />

      {limit !== null && activeCount >= limit && (
        <Alert tone="warning" className="mb-4" title="وصلت للحد الأقصى من الموظفين">
          خطتك الحالية ({store.subscription.planName}) تسمح بـ{' '}
          <span className="num font-bold">{fmt.number(limit)}</span> موظف. قم بترقية الاشتراك
          لإضافة المزيد.
        </Alert>
      )}

      <EmployeeList
        employees={employees}
        roles={roles}
        branches={branches}
        canManage={canManage}
        canCreate={canManage && (limit === null || activeCount < limit)}
        grantable={grantable}
        focusId={firstParam(params, 'member')}
      />
    </>
  );
}
