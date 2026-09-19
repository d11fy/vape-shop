/**
 * Arabic names for fields that appear in audit before/after snapshots.
 *
 * Shared by the server (which writes the one-line summary) and the activity
 * log (which renders the expanded diff), so a field is called the same thing
 * in both places. Isomorphic — never import server-only code here.
 */
export const AUDIT_FIELD_LABEL: Record<string, string> = {
  name: 'الاسم',
  names: 'الأسماء',
  status: 'الحالة',
  total: 'الإجمالي',
  amount: 'المبلغ',
  balance: 'الرصيد',
  quantity: 'الكمية',
  price: 'السعر',
  prices: 'الأسعار',
  purchasePrice: 'سعر الشراء',
  sellingPrice: 'سعر البيع',
  openingStock: 'الرصيد الافتتاحي',
  unitLabel: 'وحدة البيع',
  role: 'الدور',
  reason: 'السبب',
  currency: 'العملة',
  taxRateBps: 'نسبة الضريبة',
  taxEnabled: 'تفعيل الضريبة',
  taxInclusive: 'الأسعار شاملة الضريبة',
  invoicePrefix: 'بادئة الفاتورة',
  timezone: 'المنطقة الزمنية',
  permissions: 'عدد الصلاحيات',
  debtLimit: 'حد الدين',
  phone: 'الهاتف',
  email: 'البريد',
  address: 'العنوان',
  city: 'المدينة',
  isActive: 'نشط',
  active: 'المفعّلة',
  default: 'الافتراضية',
  number: 'الرقم',
  expectedCash: 'النقدية المتوقعة',
  actualCash: 'النقدية الفعلية',
  difference: 'الفرق',
  balanceBefore: 'الرصيد قبل',
  balanceAfter: 'الرصيد بعد',
  invoices: 'الفواتير',
  customer: 'العميل',
  supplier: 'المورد',
  description: 'الوصف',
  category: 'التصنيف',
  method: 'طريقة الدفع',
  invoiceCount: 'عدد الفواتير',
  paidTotal: 'المدفوع',
  dueTotal: 'المتبقي',
  paid: 'المدفوع',
  due: 'المتبقي',
  items: 'عدد الأصناف',
  defaultDebtLimit: 'حد الدين الافتراضي',
  passwordReset: 'إعادة تعيين كلمة المرور',
  extraPermissions: 'صلاحيات إضافية',
  deniedPermissions: 'صلاحيات محجوبة',
};

export function auditFieldLabel(field: string): string {
  return AUDIT_FIELD_LABEL[field] ?? field;
}

/**
 * Fields stored as integer minor units. Snapshots keep the raw integer (exact,
 * currency-independent); the log formats it for reading.
 */
const MONEY_FIELDS = new Set([
  'amount',
  'total',
  'balance',
  'balanceBefore',
  'balanceAfter',
  'price',
  'purchasePrice',
  'sellingPrice',
  'debtLimit',
  'defaultDebtLimit',
  'expectedCash',
  'actualCash',
  'difference',
  'paidTotal',
  'dueTotal',
  'paid',
  'due',
]);

export interface AuditValue {
  text: string;
  /** Render left-to-right with tabular digits. */
  numeric: boolean;
}

export function formatAuditValue(
  field: string,
  value: unknown,
  money: (minorUnits: number) => string,
): AuditValue {
  if (value === null || value === undefined || value === '') return { text: '—', numeric: false };
  if (typeof value === 'boolean') return { text: value ? 'نعم' : 'لا', numeric: false };
  if (typeof value === 'number') {
    if (MONEY_FIELDS.has(field)) return { text: money(value), numeric: true };
    if (field === 'taxRateBps') return { text: `${value / 100}%`, numeric: true };
    return { text: value.toLocaleString('en-US'), numeric: true };
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return { text: '—', numeric: false };
    const text = value
      .map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item)))
      .join('، ')
      .slice(0, 200);
    return { text, numeric: false };
  }
  if (typeof value === 'object') return { text: JSON.stringify(value).slice(0, 200), numeric: false };
  return { text: String(value), numeric: /^[\d\s.,:+\-/%]+$/.test(String(value)) };
}

/** "العملة، نسبة الضريبة" — for the one-line summary of a settings change. */
export function describeChangedFields(fields: ReadonlyArray<string | number | symbol>): string {
  return fields.map((field) => auditFieldLabel(String(field))).join('، ');
}
