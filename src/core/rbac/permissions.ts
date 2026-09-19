/**
 * The permission catalogue.
 *
 * Every guarded capability in the product has exactly one key here. The role
 * editor renders straight from this list, so adding a permission makes it
 * available to store owners without touching any UI.
 *
 * Checks happen on the SERVER first (`requirePermission`) and in the UI second.
 * Hiding a button is a courtesy, never a security boundary.
 */

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
  /** Marks operations that move money or rewrite history. */
  sensitive?: boolean;
}

export interface PermissionGroup {
  key: string;
  label: string;
  icon: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS = [
  {
    key: 'dashboard',
    label: 'الرئيسية',
    icon: 'LayoutDashboard',
    permissions: [
      { key: 'dashboard.view', label: 'عرض لوحة التحكم', description: 'مشاهدة ملخص الأداء اليومي' },
      {
        key: 'dashboard.financials',
        label: 'عرض الأرقام المالية',
        description: 'الأرباح والصندوق والمستحقات في اللوحة الرئيسية',
        sensitive: true,
      },
    ],
  },
  {
    key: 'sales',
    label: 'المبيعات ونقطة البيع',
    icon: 'ShoppingCart',
    permissions: [
      { key: 'sales.view', label: 'عرض المبيعات', description: 'الاطلاع على الفواتير المسجلة' },
      { key: 'sales.view_all', label: 'عرض مبيعات كل الموظفين', description: 'بدونها يرى الموظف فواتيره فقط' },
      { key: 'sales.create', label: 'تسجيل عملية بيع', description: 'استخدام شاشة نقطة البيع' },
      { key: 'sales.edit', label: 'تعديل فاتورة', description: 'تعديل ملاحظات أو بيانات الفاتورة' },
      {
        key: 'sales.cancel',
        label: 'إلغاء فاتورة',
        description: 'إلغاء فاتورة مع إرجاع المخزون والحسابات',
        sensitive: true,
      },
      { key: 'sales.discount', label: 'تطبيق خصم', description: 'خصم على الصنف أو الفاتورة', sensitive: true },
      { key: 'sales.price_edit', label: 'تعديل السعر عند البيع', description: 'تجاوز سعر البيع المحدد', sensitive: true },
      { key: 'sales.credit', label: 'البيع الآجل', description: 'إتمام فاتورة بدون سداد كامل', sensitive: true },
      { key: 'sales.return', label: 'تسجيل مرتجع', description: 'إرجاع صنف أو فاتورة كاملة', sensitive: true },
    ],
  },
  {
    key: 'products',
    label: 'المنتجات',
    icon: 'Package',
    permissions: [
      { key: 'products.view', label: 'عرض المنتجات', description: 'قائمة المنتجات والأسعار' },
      { key: 'products.create', label: 'إضافة منتج', description: '' },
      { key: 'products.edit', label: 'تعديل منتج', description: 'يشمل تعديل أسعار البيع' },
      { key: 'products.delete', label: 'أرشفة منتج', description: '', sensitive: true },
      { key: 'products.view_cost', label: 'عرض سعر التكلفة', description: 'تكلفة الشراء وهامش الربح', sensitive: true },
      { key: 'catalog.manage', label: 'إدارة التصنيفات والماركات', description: '' },
    ],
  },
  {
    key: 'inventory',
    label: 'المخزون',
    icon: 'Boxes',
    permissions: [
      { key: 'inventory.view', label: 'عرض المخزون', description: 'الكميات المتوفرة وحالة النفاد' },
      { key: 'inventory.adjust', label: 'تسوية المخزون', description: 'تعديل الكميات بعد الجرد', sensitive: true },
      { key: 'inventory.transfer', label: 'نقل مخزون بين الفروع', description: '', sensitive: true },
      { key: 'inventory.view_value', label: 'عرض قيمة المخزون', description: 'القيمة المالية للبضاعة', sensitive: true },
    ],
  },
  {
    key: 'customers',
    label: 'العملاء',
    icon: 'Users',
    permissions: [
      { key: 'customers.view', label: 'عرض العملاء', description: '' },
      { key: 'customers.create', label: 'إضافة عميل', description: '' },
      { key: 'customers.edit', label: 'تعديل عميل', description: '' },
      { key: 'customers.delete', label: 'حذف عميل', description: '', sensitive: true },
    ],
  },
  {
    key: 'debts',
    label: 'الديون',
    icon: 'HandCoins',
    permissions: [
      { key: 'debts.view', label: 'عرض الديون', description: 'أرصدة العملاء والمستحقات' },
      { key: 'debts.collect', label: 'تسجيل دفعة دين', description: 'استلام دفعة من عميل', sensitive: true },
      { key: 'debts.adjust', label: 'تسوية رصيد عميل', description: 'إضافة أو خصم يدوي على الرصيد', sensitive: true },
    ],
  },
  {
    key: 'suppliers',
    label: 'الموردون',
    icon: 'Truck',
    permissions: [
      { key: 'suppliers.view', label: 'عرض الموردين', description: '' },
      { key: 'suppliers.create', label: 'إضافة مورد', description: '' },
      { key: 'suppliers.edit', label: 'تعديل مورد', description: '' },
      { key: 'suppliers.pay', label: 'تسجيل دفعة لمورد', description: '', sensitive: true },
    ],
  },
  {
    key: 'purchases',
    label: 'المشتريات',
    icon: 'ClipboardList',
    permissions: [
      { key: 'purchases.view', label: 'عرض المشتريات', description: '' },
      { key: 'purchases.create', label: 'إنشاء فاتورة شراء', description: '' },
      { key: 'purchases.edit', label: 'تعديل فاتورة شراء', description: 'قبل الاعتماد فقط' },
      { key: 'purchases.receive', label: 'اعتماد واستلام المشتريات', description: 'يضيف الكميات للمخزون', sensitive: true },
      { key: 'purchases.cancel', label: 'إلغاء فاتورة شراء', description: '', sensitive: true },
    ],
  },
  {
    key: 'expenses',
    label: 'المصاريف',
    icon: 'Receipt',
    permissions: [
      { key: 'expenses.view', label: 'عرض المصاريف', description: '' },
      { key: 'expenses.create', label: 'تسجيل مصروف', description: '' },
      { key: 'expenses.edit', label: 'تعديل مصروف', description: '', sensitive: true },
      { key: 'expenses.delete', label: 'حذف مصروف', description: '', sensitive: true },
      { key: 'expenses.manage_categories', label: 'إدارة فئات المصاريف', description: '' },
    ],
  },
  {
    key: 'cashbox',
    label: 'الصندوق والورديات',
    icon: 'Wallet',
    permissions: [
      { key: 'cashbox.view', label: 'عرض الصندوق', description: 'الرصيد والحركات' },
      { key: 'cashbox.manage', label: 'إيداع وسحب نقدي', description: 'إدخال وإخراج نقدية يدوياً', sensitive: true },
      { key: 'shifts.open', label: 'فتح وردية', description: '' },
      { key: 'shifts.close', label: 'إغلاق وردية', description: 'تسوية النقدية في نهاية الدوام' },
      { key: 'shifts.view_all', label: 'عرض ورديات الجميع', description: 'بدونها يرى الموظف ورديّاته فقط' },
    ],
  },
  {
    key: 'employees',
    label: 'الموظفون',
    icon: 'UserCog',
    permissions: [
      { key: 'employees.view', label: 'عرض الموظفين', description: '' },
      { key: 'employees.manage', label: 'إدارة الموظفين', description: 'إضافة وتعطيل وتغيير الأدوار', sensitive: true },
      { key: 'roles.manage', label: 'إدارة الأدوار والصلاحيات', description: '', sensitive: true },
    ],
  },
  {
    key: 'reports',
    label: 'التقارير',
    icon: 'BarChart3',
    permissions: [
      { key: 'reports.view', label: 'عرض التقارير', description: 'تقارير المبيعات والمنتجات' },
      { key: 'reports.profit', label: 'تقارير الأرباح', description: 'التكلفة وصافي الربح', sensitive: true },
      { key: 'reports.employees', label: 'تقارير أداء الموظفين', description: 'بيانات تشغيلية وصفية' },
      { key: 'reports.export', label: 'تصدير التقارير', description: 'PDF و Excel و CSV' },
    ],
  },
  {
    key: 'settings',
    label: 'الإعدادات',
    icon: 'Settings',
    permissions: [
      { key: 'settings.view', label: 'عرض الإعدادات', description: '' },
      { key: 'settings.manage', label: 'تعديل إعدادات المتجر', description: 'العملة والضريبة والطباعة', sensitive: true },
      { key: 'settings.branches', label: 'إدارة الفروع', description: '', sensitive: true },
      { key: 'settings.payment_methods', label: 'إدارة طرق الدفع', description: '' },
      { key: 'audit.view', label: 'عرض سجل النشاط', description: 'كل العمليات الحساسة', sensitive: true },
    ],
  },
] as const satisfies readonly PermissionGroup[];

type Groups = typeof PERMISSION_GROUPS;
type PermissionsOf<G> = G extends { permissions: readonly (infer P)[] }
  ? P extends { key: infer K }
    ? K
    : never
  : never;

/** Union of every valid permission key — typos become compile errors. */
export type Permission = PermissionsOf<Groups[number]>;

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.key as Permission),
);

const PERMISSION_INDEX = new Map<string, PermissionDefinition & { groupLabel: string }>(
  PERMISSION_GROUPS.flatMap((group) =>
    group.permissions.map(
      (permission) => [permission.key, { ...permission, groupLabel: group.label }] as const,
    ),
  ),
);

export function describePermission(key: string): string {
  return PERMISSION_INDEX.get(key)?.label ?? key;
}

export function isKnownPermission(key: string): key is Permission {
  return PERMISSION_INDEX.has(key);
}

/** Drop unknown keys — protects against stale data after a permission rename. */
export function sanitizePermissions(keys: readonly string[]): Permission[] {
  const seen = new Set<Permission>();
  for (const key of keys) {
    if (isKnownPermission(key)) seen.add(key);
  }
  return [...seen];
}
