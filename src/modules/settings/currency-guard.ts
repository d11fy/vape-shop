import 'server-only';

import { currencyDecimals, getCurrency } from '@/core/currency';
import type { Tx } from '@/core/db';
import { businessRule } from '@/core/errors';

/**
 * The one rule for changing a store's currency, shared by onboarding and the
 * settings screen.
 *
 * Every amount is stored as integer minor units of the store currency, so a
 * currency change reinterprets every stored number:
 *
 *  - Once money has moved (a sale, purchase, expense, payment, cash movement
 *    or ledger entry) the books are denominated in the old currency and the
 *    change is refused outright.
 *  - Before that, a change between currencies with the same decimal places
 *    (SAR ↔ AED) keeps every typed price meaning what the owner typed. A
 *    change of decimal places (AED 2 → KWD 3) would silently turn 30.00 into
 *    3.000, so it is refused while any product carries a price or stock.
 */
type CountClient = Pick<
  Tx,
  | 'sale'
  | 'purchase'
  | 'expense'
  | 'payment'
  | 'cashboxTransaction'
  | 'customerLedgerEntry'
  | 'supplierLedgerEntry'
>;

/** True once any money has been recorded — the point after which the currency is fixed. */
export async function hasFinancialActivity(client: CountClient, storeId: string): Promise<boolean> {
  const where = { storeId };
  const counts = await Promise.all([
    client.sale.count({ where }),
    client.purchase.count({ where }),
    client.expense.count({ where }),
    client.payment.count({ where }),
    client.cashboxTransaction.count({ where }),
    client.customerLedgerEntry.count({ where }),
    client.supplierLedgerEntry.count({ where }),
  ]);
  return counts.some((count) => count > 0);
}

export async function assertCurrencyChangeAllowed(
  tx: Tx,
  storeId: string,
  from: string,
  to: string,
): Promise<void> {
  if (from === to) return;

  if (await hasFinancialActivity(tx, storeId)) {
    throw businessRule(
      'لا يمكن تغيير العملة بعد تسجيل عمليات مالية — كل المبالغ المحفوظة مرتبطة بالعملة الحالية.',
    );
  }

  if (currencyDecimals(from) === currencyDecimals(to)) return;

  const pricedVariants = await tx.productVariant.count({
    where: {
      storeId,
      OR: [{ sellingPrice: { gt: 0 } }, { purchasePrice: { gt: 0 } }, { avgCostPerBase: { gt: 0 } }],
    },
  });
  if (pricedVariants > 0) {
    const fromName = getCurrency(from).nameAr;
    const toName = getCurrency(to).nameAr;
    throw businessRule(
      `لا يمكن التحويل من ${fromName} إلى ${toName} بعد إدخال أسعار منتجات: عدد الخانات العشرية مختلف وستتغير قيمة كل سعر. اختر عملة بنفس عدد الخانات، أو تواصل مع الدعم.`,
    );
  }
}
