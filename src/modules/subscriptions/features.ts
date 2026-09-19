/**
 * Plan feature keys.
 *
 * The keys are stored on the `plans` table, so a plan's contents can change
 * without a deploy. This map only translates them for display — code that
 * gates behaviour reads the key, never the label.
 */
export const PLAN_FEATURE_LABELS: Record<string, string> = {
  pos: 'شاشة نقطة بيع كاملة',
  inventory: 'إدارة المخزون والجرد',
  customers: 'ملفات العملاء',
  debts: 'إدارة الديون والتحصيل',
  expenses: 'تسجيل المصاريف',
  basic_reports: 'تقارير المبيعات الأساسية',
  profit_reports: 'تقارير الأرباح وتكلفة البضاعة',
  suppliers: 'إدارة الموردين',
  purchases: 'فواتير الشراء واستلام البضاعة',
  shifts: 'الورديات وتسوية الصندوق',
  custom_roles: 'أدوار وصلاحيات مخصصة',
  export: 'تصدير التقارير Excel و CSV',
  multi_branch: 'فروع متعددة',
  transfers: 'نقل المخزون بين الفروع',
  advanced_analytics: 'تحليلات متقدمة',
  priority_support: 'دعم فني ذو أولوية',
};

export function hasFeature(features: readonly string[], key: string): boolean {
  return features.includes(key);
}
