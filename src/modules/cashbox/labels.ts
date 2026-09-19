import type { CashboxTxnType } from '@/generated/prisma/enums';

/**
 * Arabic labels for cash drawer movement types.
 *
 * Kept out of `queries.ts` (server-only) because the cash drawer view renders
 * them in the browser too. This file must never import server-only code.
 */
export const CASH_TYPE_LABEL: Record<CashboxTxnType, string> = {
  OPENING: 'رصيد افتتاحي',
  SALE: 'مبيعات',
  SALE_REFUND: 'إعادة مبلغ لعميل',
  EXPENSE: 'مصروف',
  DEBT_COLLECTION: 'تحصيل دين',
  SUPPLIER_PAYMENT: 'سداد لمورد',
  PURCHASE: 'شراء بضاعة',
  PURCHASE_REFUND: 'مرتجع من مورد',
  CASH_IN: 'إيداع نقدي',
  CASH_OUT: 'سحب نقدي',
  SHIFT_SETTLEMENT: 'تسوية وردية',
  ADJUSTMENT: 'تسوية',
};
