import type { Permission } from '@/core/rbac/permissions';

/**
 * The single navigation map.
 *
 * Sidebar, mobile bottom bar, the "more" sheet and the command palette all read
 * from here, so a new screen appears everywhere at once — and its permission is
 * declared next to it rather than duplicated in four places.
 */

export interface NavItem {
  href: string;
  label: string;
  /** Lucide icon name, resolved in `nav-icon.tsx`. */
  icon: string;
  /** Any one of these permissions reveals the item. */
  permissions: Permission[];
  /** Highlight the item for any path beneath it. */
  matchPrefix?: boolean;
  /** Shown on the phone's bottom bar. Order matters. */
  mobile?: boolean;
  description?: string;
}

export interface NavSection {
  key: string;
  label: string | null;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'main',
    label: null,
    items: [
      {
        href: '/dashboard',
        label: 'الرئيسية',
        icon: 'LayoutDashboard',
        permissions: ['dashboard.view'],
        mobile: true,
        description: 'ملخص أداء المحل',
      },
      {
        href: '/pos',
        label: 'المبيعات',
        icon: 'ShoppingCart',
        permissions: ['sales.create'],
        mobile: true,
        description: 'شاشة نقطة البيع',
      },
      {
        href: '/invoices',
        label: 'الفواتير',
        icon: 'ReceiptText',
        permissions: ['sales.view'],
        matchPrefix: true,
        mobile: true,
        description: 'كل الفواتير والمرتجعات',
      },
    ],
  },
  {
    key: 'catalog',
    label: 'المخزون والمنتجات',
    items: [
      {
        href: '/products',
        label: 'المنتجات',
        icon: 'Package',
        permissions: ['products.view'],
        matchPrefix: true,
        description: 'الأصناف والأسعار والتصنيفات',
      },
      {
        href: '/inventory',
        label: 'المخزون',
        icon: 'Boxes',
        permissions: ['inventory.view'],
        matchPrefix: true,
        description: 'الكميات والجرد والتسويات',
      },
      {
        href: '/purchases',
        label: 'المشتريات',
        icon: 'ClipboardList',
        permissions: ['purchases.view'],
        matchPrefix: true,
        description: 'فواتير الشراء واستلام البضاعة',
      },
      {
        href: '/suppliers',
        label: 'الموردون',
        icon: 'Truck',
        permissions: ['suppliers.view'],
        matchPrefix: true,
        description: 'حسابات الموردين ومستحقاتهم',
      },
    ],
  },
  {
    key: 'people',
    label: 'العملاء والحسابات',
    items: [
      {
        href: '/customers',
        label: 'العملاء',
        icon: 'Users',
        permissions: ['customers.view'],
        matchPrefix: true,
        mobile: true,
        description: 'بيانات العملاء وسجل تعاملهم',
      },
      {
        href: '/debts',
        label: 'الديون',
        icon: 'HandCoins',
        permissions: ['debts.view'],
        matchPrefix: true,
        description: 'المبالغ المستحقة والتحصيل',
      },
      {
        href: '/expenses',
        label: 'المصاريف',
        icon: 'Receipt',
        permissions: ['expenses.view'],
        matchPrefix: true,
        description: 'مصاريف التشغيل اليومية',
      },
      {
        href: '/cashbox',
        label: 'الصندوق',
        icon: 'Wallet',
        permissions: ['cashbox.view'],
        matchPrefix: true,
        description: 'حركة النقدية والورديات',
      },
    ],
  },
  {
    key: 'manage',
    label: 'الإدارة',
    items: [
      {
        href: '/employees',
        label: 'الموظفون',
        icon: 'UserCog',
        permissions: ['employees.view'],
        matchPrefix: true,
        description: 'الفريق والأدوار والصلاحيات',
      },
      {
        href: '/reports',
        label: 'التقارير',
        icon: 'BarChart3',
        permissions: ['reports.view'],
        matchPrefix: true,
        description: 'مركز التقارير والتحليلات',
      },
      {
        href: '/settings',
        label: 'الإعدادات',
        icon: 'Settings',
        permissions: ['settings.view'],
        matchPrefix: true,
        description: 'إعدادات المحل والطباعة',
      },
    ],
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

/** Quick-create targets behind the floating action button. */
export interface QuickAction {
  href: string;
  label: string;
  icon: string;
  permissions: Permission[];
  tone: 'accent' | 'neutral';
}

export const QUICK_ACTIONS: QuickAction[] = [
  {
    href: '/pos',
    label: 'بيع جديد',
    icon: 'ShoppingCart',
    permissions: ['sales.create'],
    tone: 'accent',
  },
  {
    href: '/expenses?new=1',
    label: 'تسجيل مصروف',
    icon: 'Receipt',
    permissions: ['expenses.create'],
    tone: 'neutral',
  },
  {
    // Collection starts from the customer who owes — the debts list is sorted
    // by what needs chasing and has a collect button on every row.
    href: '/debts',
    label: 'تحصيل دفعة',
    icon: 'HandCoins',
    permissions: ['debts.collect'],
    tone: 'neutral',
  },
  {
    href: '/customers/new',
    label: 'عميل جديد',
    icon: 'UserPlus',
    permissions: ['customers.create'],
    tone: 'neutral',
  },
  {
    href: '/purchases/new',
    label: 'فاتورة شراء',
    icon: 'ClipboardList',
    permissions: ['purchases.create'],
    tone: 'neutral',
  },
  {
    href: '/products/new',
    label: 'منتج جديد',
    icon: 'Package',
    permissions: ['products.create'],
    tone: 'neutral',
  },
];

/** Filter a nav tree down to what this member may actually open. */
export function visibleSections(
  permissions: ReadonlySet<string>,
  isOwner: boolean,
): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => isOwner || item.permissions.some((permission) => permissions.has(permission)),
    ),
  })).filter((section) => section.items.length > 0);
}

export function visibleQuickActions(
  permissions: ReadonlySet<string>,
  isOwner: boolean,
): QuickAction[] {
  return QUICK_ACTIONS.filter(
    (action) => isOwner || action.permissions.some((permission) => permissions.has(permission)),
  );
}

export function isActivePath(pathname: string, item: NavItem): boolean {
  if (item.matchPrefix) return pathname === item.href || pathname.startsWith(`${item.href}/`);
  return pathname === item.href;
}
