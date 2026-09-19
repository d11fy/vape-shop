import type { Permission } from '@/core/rbac/permissions';

/**
 * The report catalogue.
 *
 * One definition per report, consumed by the report centre, the export
 * endpoint and the navigation. Adding a report means adding an entry here and
 * a page — nothing else needs to know about it.
 */

export interface ReportDefinition {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: string;
  group: 'sales' | 'money' | 'inventory' | 'people';
  permissions: Permission[];
  /** Available as a CSV/Excel download. */
  exportable?: boolean;
}

export const REPORT_GROUPS = [
  { key: 'sales', label: 'المبيعات', description: 'حركة البيع والفواتير' },
  { key: 'money', label: 'الأرباح والحسابات', description: 'الربحية والمصاريف والنقدية' },
  { key: 'inventory', label: 'المخزون والمنتجات', description: 'الأصناف والكميات والقيمة' },
  { key: 'people', label: 'العملاء والفريق', description: 'بيانات تشغيلية وصفية' },
] as const;

export const REPORTS: ReportDefinition[] = [
  {
    key: 'sales',
    title: 'تقرير المبيعات',
    description: 'المبيعات والفواتير ومتوسط الفاتورة والخصومات والمرتجعات',
    href: '/reports/sales',
    icon: 'ShoppingCart',
    group: 'sales',
    permissions: ['reports.view'],
    exportable: true,
  },
  {
    key: 'invoices',
    title: 'سجل الفواتير',
    description: 'كل الفواتير مع إمكانية التصفية والتصدير',
    href: '/invoices',
    icon: 'ReceiptText',
    group: 'sales',
    permissions: ['sales.view'],
  },
  {
    key: 'profit',
    title: 'الأرباح والخسائر',
    description: 'الإيرادات ناقص تكلفة البضاعة والمصاريف — صافي الربح الحقيقي',
    href: '/reports/profit',
    icon: 'BarChart3',
    group: 'money',
    permissions: ['reports.profit'],
    exportable: true,
  },
  {
    key: 'expenses',
    title: 'تقرير المصاريف',
    description: 'المصاريف حسب الفئة والموظف والشهر، ومقارنتها بالمبيعات',
    href: '/reports/expenses',
    icon: 'Receipt',
    group: 'money',
    permissions: ['expenses.view', 'reports.view'],
    exportable: true,
  },
  {
    key: 'cashflow',
    title: 'التدفق النقدي',
    description: 'الوارد والصادر من الصندوق ورصيده خلال الفترة',
    href: '/reports/cashflow',
    icon: 'Wallet',
    group: 'money',
    permissions: ['cashbox.view', 'reports.view'],
    exportable: true,
  },
  {
    key: 'debts',
    title: 'ديون العملاء',
    description: 'المستحقات وأعمارها وحالة التحصيل',
    href: '/debts',
    icon: 'HandCoins',
    group: 'money',
    permissions: ['debts.view'],
  },
  {
    key: 'products',
    title: 'تقرير المنتجات',
    description: 'الأكثر مبيعاً والأكثر ربحاً والمخزون الراكد',
    href: '/reports/products',
    icon: 'Package',
    group: 'inventory',
    permissions: ['reports.view', 'products.view'],
    exportable: true,
  },
  {
    key: 'inventory',
    title: 'قيمة المخزون',
    description: 'قيمة البضاعة بالتكلفة وبسعر البيع حسب التصنيف',
    href: '/reports/inventory',
    icon: 'Boxes',
    group: 'inventory',
    permissions: ['inventory.view_value', 'reports.view'],
    exportable: true,
  },
  {
    key: 'movements',
    title: 'حركات المخزون',
    description: 'سجل كامل لكل تغيير على الكميات ومصدره',
    href: '/inventory/movements',
    icon: 'History',
    group: 'inventory',
    permissions: ['inventory.view'],
  },
  {
    key: 'customers',
    title: 'تقرير العملاء',
    description: 'أكثر العملاء شراءً ومتوسط قيمة العميل',
    href: '/reports/customers',
    icon: 'Users',
    group: 'people',
    permissions: ['customers.view', 'reports.view'],
    exportable: true,
  },
  {
    key: 'employees',
    title: 'نشاط الموظفين',
    description: 'بيانات تشغيلية عما سُجِّل في النظام لكل موظف',
    href: '/employees/activity',
    icon: 'UserCog',
    group: 'people',
    permissions: ['reports.employees'],
  },
  {
    key: 'suppliers',
    title: 'مستحقات الموردين',
    description: 'أرصدة الموردين وفواتير الشراء غير المسددة',
    href: '/suppliers?debt=yes',
    icon: 'Truck',
    group: 'people',
    permissions: ['suppliers.view'],
  },
];

export function visibleReports(
  permissions: ReadonlySet<string>,
  isOwner: boolean,
): ReportDefinition[] {
  return REPORTS.filter(
    (report) =>
      isOwner || report.permissions.some((permission) => permissions.has(permission)),
  );
}
