import { ALL_PERMISSIONS, type Permission } from './permissions';

/**
 * System role templates, seeded into every new store.
 *
 * They are a starting point, not a cage: the owner can edit any of them except
 * `owner`, and can create unlimited custom roles.
 */

export interface SystemRoleTemplate {
  key: string;
  nameAr: string;
  nameEn: string;
  description: string;
  /** `'*'` means "every permission, including ones added in future versions". */
  permissions: Permission[] | '*';
  /** Owner role cannot be edited or deleted. */
  locked?: boolean;
}

export const OWNER_ROLE_KEY = 'owner';

export const SYSTEM_ROLES: SystemRoleTemplate[] = [
  {
    key: OWNER_ROLE_KEY,
    nameAr: 'صاحب المحل',
    nameEn: 'Owner',
    description: 'صلاحية كاملة على كل أجزاء النظام',
    permissions: '*',
    locked: true,
  },
  {
    key: 'manager',
    nameAr: 'مدير',
    nameEn: 'Manager',
    description: 'إدارة التشغيل اليومي عدا إعدادات المتجر الحساسة',
    permissions: [
      'dashboard.view',
      'dashboard.financials',
      'sales.view',
      'sales.view_all',
      'sales.create',
      'sales.edit',
      'sales.cancel',
      'sales.discount',
      'sales.price_edit',
      'sales.credit',
      'sales.return',
      'products.view',
      'products.create',
      'products.edit',
      'products.delete',
      'products.view_cost',
      'catalog.manage',
      'inventory.view',
      'inventory.adjust',
      'inventory.transfer',
      'inventory.view_value',
      'customers.view',
      'customers.create',
      'customers.edit',
      'debts.view',
      'debts.collect',
      'suppliers.view',
      'suppliers.create',
      'suppliers.edit',
      'suppliers.pay',
      'purchases.view',
      'purchases.create',
      'purchases.edit',
      'purchases.receive',
      'expenses.view',
      'expenses.create',
      'expenses.edit',
      'expenses.manage_categories',
      'cashbox.view',
      'cashbox.manage',
      'shifts.open',
      'shifts.close',
      'shifts.view_all',
      'employees.view',
      'reports.view',
      'reports.profit',
      'reports.employees',
      'reports.export',
      'settings.view',
      'audit.view',
    ],
  },
  {
    key: 'cashier',
    nameAr: 'كاشير',
    nameEn: 'Cashier',
    description: 'تسجيل المبيعات واستلام المدفوعات',
    permissions: [
      'dashboard.view',
      'sales.view',
      'sales.create',
      'sales.credit',
      'products.view',
      'inventory.view',
      'customers.view',
      'customers.create',
      'debts.view',
      'debts.collect',
      'shifts.open',
      'shifts.close',
      'cashbox.view',
    ],
  },
  {
    key: 'accountant',
    nameAr: 'محاسب',
    nameEn: 'Accountant',
    description: 'الحسابات والمصاريف والديون والتقارير',
    permissions: [
      'dashboard.view',
      'dashboard.financials',
      'sales.view',
      'sales.view_all',
      'customers.view',
      'debts.view',
      'debts.collect',
      'debts.adjust',
      'suppliers.view',
      'suppliers.pay',
      'purchases.view',
      'expenses.view',
      'expenses.create',
      'expenses.edit',
      'expenses.delete',
      'expenses.manage_categories',
      'cashbox.view',
      'cashbox.manage',
      'shifts.view_all',
      'reports.view',
      'reports.profit',
      'reports.employees',
      'reports.export',
      'products.view',
      'products.view_cost',
      'inventory.view',
      'inventory.view_value',
      'audit.view',
    ],
  },
  {
    key: 'inventory',
    nameAr: 'مسؤول المخزون',
    nameEn: 'Inventory Manager',
    description: 'المنتجات والمخزون والمشتريات والموردون',
    permissions: [
      'dashboard.view',
      'products.view',
      'products.create',
      'products.edit',
      'products.delete',
      'products.view_cost',
      'catalog.manage',
      'inventory.view',
      'inventory.adjust',
      'inventory.transfer',
      'inventory.view_value',
      'suppliers.view',
      'suppliers.create',
      'suppliers.edit',
      'purchases.view',
      'purchases.create',
      'purchases.edit',
      'purchases.receive',
      'reports.view',
    ],
  },
];

export function resolveTemplatePermissions(template: SystemRoleTemplate): Permission[] {
  return template.permissions === '*' ? [...ALL_PERMISSIONS] : template.permissions;
}
