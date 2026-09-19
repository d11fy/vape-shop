/**
 * Currencies offered during onboarding.
 *
 * `decimals` drives how many minor units make one major unit — it is stored per
 * store and threaded through every money conversion, so a Kuwaiti store (3
 * decimals) and a Japanese one (0) both stay exact.
 */

export interface CurrencyOption {
  code: string;
  nameAr: string;
  symbol: string;
  decimals: number;
}

export const CURRENCIES: CurrencyOption[] = [
  { code: 'SAR', nameAr: 'ريال سعودي', symbol: 'ر.س', decimals: 2 },
  { code: 'AED', nameAr: 'درهم إماراتي', symbol: 'د.إ', decimals: 2 },
  { code: 'QAR', nameAr: 'ريال قطري', symbol: 'ر.ق', decimals: 2 },
  { code: 'KWD', nameAr: 'دينار كويتي', symbol: 'د.ك', decimals: 3 },
  { code: 'BHD', nameAr: 'دينار بحريني', symbol: 'د.ب', decimals: 3 },
  { code: 'OMR', nameAr: 'ريال عماني', symbol: 'ر.ع', decimals: 3 },
  { code: 'JOD', nameAr: 'دينار أردني', symbol: 'د.أ', decimals: 3 },
  { code: 'ILS', nameAr: 'شيكل', symbol: '₪', decimals: 2 },
  { code: 'EGP', nameAr: 'جنيه مصري', symbol: 'ج.م', decimals: 2 },
  { code: 'IQD', nameAr: 'دينار عراقي', symbol: 'د.ع', decimals: 3 },
  { code: 'LBP', nameAr: 'ليرة لبنانية', symbol: 'ل.ل', decimals: 2 },
  { code: 'SYP', nameAr: 'ليرة سورية', symbol: 'ل.س', decimals: 2 },
  { code: 'YER', nameAr: 'ريال يمني', symbol: 'ر.ي', decimals: 2 },
  { code: 'SDG', nameAr: 'جنيه سوداني', symbol: 'ج.س', decimals: 2 },
  { code: 'LYD', nameAr: 'دينار ليبي', symbol: 'د.ل', decimals: 3 },
  { code: 'TND', nameAr: 'دينار تونسي', symbol: 'د.ت', decimals: 3 },
  { code: 'DZD', nameAr: 'دينار جزائري', symbol: 'د.ج', decimals: 2 },
  { code: 'MAD', nameAr: 'درهم مغربي', symbol: 'د.م', decimals: 2 },
  { code: 'TRY', nameAr: 'ليرة تركية', symbol: '₺', decimals: 2 },
  { code: 'USD', nameAr: 'دولار أمريكي', symbol: '$', decimals: 2 },
  { code: 'EUR', nameAr: 'يورو', symbol: '€', decimals: 2 },
];

const INDEX = new Map(CURRENCIES.map((currency) => [currency.code, currency]));

export function getCurrency(code: string): CurrencyOption {
  return INDEX.get(code) ?? { code, nameAr: code, symbol: code, decimals: 2 };
}

export function currencyDecimals(code: string): number {
  return getCurrency(code).decimals;
}

/** The quick-cash buttons offered on the payment screen, scaled to the currency. */
export function quickCashAmounts(decimals: number): number[] {
  const unit = 10 ** decimals;
  return [5, 10, 20, 50, 100, 200, 500].map((value) => value * unit);
}

/**
 * `vatBps` is the country's standard VAT rate in basis points, used only as the
 * suggested value when a new store turns tax on. Tax stays disabled until the
 * owner enables it, and they can always change the rate — tobacco is often
 * taxed differently, so the owner's accountant has the final word.
 */
export const COUNTRIES = [
  { code: 'SA', nameAr: 'السعودية', currency: 'SAR', timezone: 'Asia/Riyadh', vatBps: 1500 },
  { code: 'AE', nameAr: 'الإمارات', currency: 'AED', timezone: 'Asia/Dubai', vatBps: 500 },
  { code: 'QA', nameAr: 'قطر', currency: 'QAR', timezone: 'Asia/Qatar', vatBps: 0 },
  { code: 'KW', nameAr: 'الكويت', currency: 'KWD', timezone: 'Asia/Kuwait', vatBps: 0 },
  { code: 'BH', nameAr: 'البحرين', currency: 'BHD', timezone: 'Asia/Bahrain', vatBps: 1000 },
  { code: 'OM', nameAr: 'عُمان', currency: 'OMR', timezone: 'Asia/Muscat', vatBps: 500 },
  { code: 'JO', nameAr: 'الأردن', currency: 'JOD', timezone: 'Asia/Amman', vatBps: 1600 },
  { code: 'PS', nameAr: 'فلسطين', currency: 'ILS', timezone: 'Asia/Hebron', vatBps: 1600 },
  { code: 'LB', nameAr: 'لبنان', currency: 'LBP', timezone: 'Asia/Beirut', vatBps: 1100 },
  { code: 'IQ', nameAr: 'العراق', currency: 'IQD', timezone: 'Asia/Baghdad', vatBps: 0 },
  { code: 'EG', nameAr: 'مصر', currency: 'EGP', timezone: 'Africa/Cairo', vatBps: 1400 },
  { code: 'SD', nameAr: 'السودان', currency: 'SDG', timezone: 'Africa/Khartoum', vatBps: 1700 },
  { code: 'LY', nameAr: 'ليبيا', currency: 'LYD', timezone: 'Africa/Tripoli', vatBps: 0 },
  { code: 'TN', nameAr: 'تونس', currency: 'TND', timezone: 'Africa/Tunis', vatBps: 1900 },
  { code: 'DZ', nameAr: 'الجزائر', currency: 'DZD', timezone: 'Africa/Algiers', vatBps: 1900 },
  { code: 'MA', nameAr: 'المغرب', currency: 'MAD', timezone: 'Africa/Casablanca', vatBps: 2000 },
  { code: 'TR', nameAr: 'تركيا', currency: 'TRY', timezone: 'Europe/Istanbul', vatBps: 2000 },
] as const;
