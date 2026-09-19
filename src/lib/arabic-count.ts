/**
 * Grammatical Arabic counting — "منتج واحد", "منتجان", "٣ منتجات", "١١ منتجاً".
 *
 * Arabic picks a different noun form for 1, 2, 3–10, 11–99 and 100+, which
 * `Intl.PluralRules('ar')` classifies for us. Compact labels ("12 فاتورة") are
 * an accepted UI shorthand; use this where the text reads as a sentence.
 *
 * Isomorphic: safe in server and client components.
 */

export interface ArabicNoun {
  /** Complete phrase for exactly one: "منتج واحد". */
  one: string;
  /** Complete dual phrase: "منتجان". */
  two: string;
  /** Plural used after 3–10: "منتجات". */
  few: string;
  /** Accusative singular used after 11–99: "منتجاً". */
  many: string;
  /** Singular used after 0 and 100+: "منتج". */
  other: string;
}

const rules = new Intl.PluralRules('ar');

export function countAr(count: number, noun: ArabicNoun): string {
  const category = rules.select(count);
  const digits = count.toLocaleString('en-US');
  switch (category) {
    case 'one':
      return noun.one;
    case 'two':
      return noun.two;
    case 'few':
      return `${digits} ${noun.few}`;
    case 'many':
      return `${digits} ${noun.many}`;
    default:
      return `${digits} ${noun.other}`;
  }
}

export const NOUNS = {
  product: { one: 'منتج واحد', two: 'منتجان', few: 'منتجات', many: 'منتجاً', other: 'منتج' },
  category: { one: 'تصنيف واحد', two: 'تصنيفان', few: 'تصنيفات', many: 'تصنيفاً', other: 'تصنيف' },
  employee: { one: 'موظف واحد', two: 'موظفان', few: 'موظفين', many: 'موظفاً', other: 'موظف' },
  store: { one: 'متجر واحد', two: 'متجران', few: 'متاجر', many: 'متجراً', other: 'متجر' },
  customer: { one: 'عميل واحد', two: 'عميلان', few: 'عملاء', many: 'عميلاً', other: 'عميل' },
  invoice: { one: 'فاتورة واحدة', two: 'فاتورتان', few: 'فواتير', many: 'فاتورة', other: 'فاتورة' },
  expense: { one: 'مصروف واحد', two: 'مصروفان', few: 'مصاريف', many: 'مصروفاً', other: 'مصروف' },
  day: { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يوماً', other: 'يوم' },
  minute: { one: 'دقيقة واحدة', two: 'دقيقتان', few: 'دقائق', many: 'دقيقة', other: 'دقيقة' },
} as const satisfies Record<string, ArabicNoun>;
