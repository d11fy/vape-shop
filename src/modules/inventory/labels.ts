import type { InventoryTxnType } from '@/generated/prisma/enums';

/**
 * Arabic labels for stock movement types.
 *
 * Kept in one place rather than inlined, because the same wording appears on
 * the product page, the inventory ledger, the audit log and the exported
 * reports — and "تسوية جرد" must mean exactly the same thing in all four.
 */
export const MOVEMENT_LABEL: Record<
  InventoryTxnType,
  { label: string; tone: 'in' | 'out' | 'neutral'; description: string }
> = {
  OPENING: {
    label: 'رصيد افتتاحي',
    tone: 'in',
    description: 'الكمية المسجلة عند إضافة المنتج لأول مرة',
  },
  PURCHASE: {
    label: 'شراء',
    tone: 'in',
    description: 'استلام بضاعة من مورد',
  },
  SALE: {
    label: 'بيع',
    tone: 'out',
    description: 'خروج بضاعة بفاتورة بيع',
  },
  SALE_RETURN: {
    label: 'مرتجع من عميل',
    tone: 'in',
    description: 'عودة بضاعة من العميل إلى المخزون',
  },
  PURCHASE_RETURN: {
    label: 'مرتجع لمورد',
    tone: 'out',
    description: 'إرجاع بضاعة إلى المورد',
  },
  ADJUSTMENT: {
    label: 'تسوية جرد',
    tone: 'neutral',
    description: 'تصحيح الكمية بعد الجرد الفعلي',
  },
  DAMAGE: {
    label: 'تلف',
    tone: 'out',
    description: 'بضاعة تالفة أو منتهية الصلاحية',
  },
  TRANSFER_IN: {
    label: 'وارد من فرع',
    tone: 'in',
    description: 'نقل مخزون من فرع آخر',
  },
  TRANSFER_OUT: {
    label: 'صادر لفرع',
    tone: 'out',
    description: 'نقل مخزون إلى فرع آخر',
  },
};

export const ADJUSTMENT_REASONS = [
  'جرد دوري',
  'تلف أو كسر',
  'انتهاء صلاحية',
  'فقد أو سرقة',
  'خطأ في التسجيل',
  'عينة أو استخدام داخلي',
  'سبب آخر',
] as const;
