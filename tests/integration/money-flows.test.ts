import { describe, expect, it } from 'vitest';

import type { Tx } from '@/core/db';
import { fromDb } from '@/core/money';
import { costFromDb, qtyFromDb } from '@/core/quantity';
import { getBranchCashbox } from '@/modules/cashbox/service';
import { resolveDebtCustomer } from '@/modules/customers/service';
import { recordExpense } from '@/modules/expenses/service';
import { recordPayment } from '@/modules/payments/service';
import { createPurchase } from '@/modules/purchases/service';
import { createReturn } from '@/modules/returns/service';
import { cancelSale, createSale } from '@/modules/sales/service';
import { closeShift, computeShiftTotals, openShift } from '@/modules/shifts/service';
import {
  CASHIER_PERMISSIONS,
  OWNER_PERMISSIONS,
  TOBACCO_PACK,
  buildShop,
  hasDatabase,
  inRollback,
  type Shop,
} from '../support/db';

/**
 * The money paths of spec §71, end to end against the real schema: every
 * scenario runs in a transaction that is rolled back, so nothing persists.
 */

const PACK = 1000;

async function stockOf(tx: Tx, shop: Shop, variantId: string) {
  const item = await tx.inventoryItem.findUnique({
    where: { branchId_variantId: { branchId: shop.branchId, variantId } },
    select: { quantity: true },
  });
  return qtyFromDb(item?.quantity);
}

async function cashboxBalance(tx: Tx, shop: Shop) {
  const cashbox = await getBranchCashbox(tx, shop.storeId, shop.branchId);
  return cashbox.balance;
}

async function customerBalance(tx: Tx, shop: Shop) {
  const customer = await tx.customer.findUniqueOrThrow({
    where: { id: shop.customerId },
    select: { balance: true },
  });
  return fromDb(customer.balance);
}

function sell(tx: Tx, shop: Shop, overrides: Partial<Parameters<typeof createSale>[1]> = {}) {
  return createSale(tx, {
    storeId: shop.storeId,
    branchId: shop.branchId,
    userId: shop.ownerId,
    lines: [{ variantId: shop.packId, quantity: 2 * PACK }],
    tenders: [{ methodId: shop.cashMethodId, amount: 10_000 }],
    permissions: OWNER_PERMISSIONS,
    ...overrides,
  });
}

describe.skipIf(!hasDatabase)('money flows (rolled back)', () => {
  it('completes a cash sale: stock out, COGS recorded, cash in, change handed back', async () => {
    await inRollback(async (tx) => {
      const shop = await buildShop(tx);
      const cashBefore = await cashboxBalance(tx, shop);

      const sale = await sell(tx, shop);

      expect(sale.total).toBe(9000);
      expect(sale.paidTotal).toBe(9000);
      expect(sale.change).toBe(1000);
      expect(sale.dueTotal).toBe(0);
      // Revenue 90.00 minus two packs bought at 30.00 — profit is 30.00, not 90.00.
      expect(sale.profitTotal).toBe(3000);

      expect(await stockOf(tx, shop, shop.packId)).toBe(18 * PACK);
      // Only the 90.00 that belongs to the sale enters the drawer, not the 100.00 handed over.
      expect(await cashboxBalance(tx, shop)).toBe(cashBefore + 9000);

      const row = await tx.sale.findUniqueOrThrow({
        where: { id: sale.saleId },
        select: { cogsTotal: true, number: true },
      });
      expect(fromDb(row.cogsTotal)).toBe(6000);
      expect(row.number).toMatch(/^VS-\d{4}-\d+$/);
    });
  });

  it('sells tobacco by weight in fractions and costs it per gram', async () => {
    await inRollback(async (tx) => {
      const shop = await buildShop(tx);

      // Half a 250 g pack = 125 g at 45.00 per pack.
      const sale = await sell(tx, shop, {
        lines: [{ variantId: shop.tobaccoId, quantity: TOBACCO_PACK / 2 }],
        tenders: [{ methodId: shop.cashMethodId, amount: 2250 }],
      });

      expect(sale.total).toBe(2250);
      expect(sale.profitTotal).toBe(2250 - 1500);
      expect(await stockOf(tx, shop, shop.tobaccoId)).toBe(20 * TOBACCO_PACK - TOBACCO_PACK / 2);
    });
  });

  it('turns an unpaid balance into customer debt, within the limit only', async () => {
    await inRollback(async (tx) => {
      const shop = await buildShop(tx);

      const sale = await sell(tx, shop, {
        customerId: shop.customerId,
        tenders: [{ methodId: shop.cashMethodId, amount: 3000 }],
      });
      expect(sale.paidTotal).toBe(3000);
      expect(sale.dueTotal).toBe(6000);
      expect(await customerBalance(tx, shop)).toBe(6000);

      const ledger = await tx.customerLedgerEntry.findMany({
        where: { customerId: shop.customerId },
        select: { type: true, amount: true, balanceAfter: true },
      });
      expect(ledger).toHaveLength(1);
      expect(ledger[0]?.type).toBe('INVOICE');
      expect(fromDb(ledger[0]!.balanceAfter)).toBe(6000);

      // The limit is 500.00: another 9 packs on credit (405.00) would reach 465.00 — allowed;
      // 12 packs (540.00) would reach 600.00 — refused.
      await expect(
        sell(tx, shop, {
          customerId: shop.customerId,
          lines: [{ variantId: shop.packId, quantity: 12 * PACK }],
          tenders: [],
        }),
      ).rejects.toThrow('حد الدين');
    });
  });

  it('records a «دين» sale on the customer found — or created — by phone number', async () => {
    await inRollback(async (tx) => {
      const shop = await buildShop(tx);
      const resolve = (name: string, phone: string, canCreate = true) =>
        resolveDebtCustomer(tx, {
          storeId: shop.storeId,
          userId: shop.ownerId,
          name,
          phone,
          canCreate,
        });

      // A new number opens a new account, stored in one canonical form.
      const created = await resolve('أحمد العتيبي', '٠٥٥ ١٢٣ ٤٥٦٧');
      expect(created.created).toBe(true);
      const stored = await tx.customer.findUniqueOrThrow({
        where: { id: created.id },
        select: { phone: true, storeId: true },
      });
      expect(stored).toEqual({ phone: '0551234567', storeId: shop.storeId });

      const sale = await sell(tx, shop, { customerId: created.id, tenders: [] });
      expect(sale.dueTotal).toBe(9000);
      const account = await tx.customer.findUniqueOrThrow({
        where: { id: created.id },
        select: { balance: true },
      });
      expect(fromDb(account.balance)).toBe(9000);

      // The same number typed differently, under another name, is the same person.
      const again = await resolve('أبو فهد', '055-123-4567');
      expect(again).toEqual({ id: created.id, name: 'أحمد العتيبي', created: false });

      // No new accounts without the permission; no debt on a suspended one.
      await expect(resolve('زائر', '0509999999', false)).rejects.toThrow('صلاحية');
      await tx.customer.update({ where: { id: created.id }, data: { isActive: false } });
      await expect(resolve('أحمد العتيبي', '0551234567')).rejects.toThrow('موقوف');

      const audit = await tx.auditLog.count({
        where: { storeId: shop.storeId, action: 'customer.create', entityId: created.id },
      });
      expect(audit).toBe(1);
    });
  });

  it('collects a debt payment and brings the balance down through the ledger', async () => {
    await inRollback(async (tx) => {
      const shop = await buildShop(tx);
      await sell(tx, shop, { customerId: shop.customerId, tenders: [] });
      expect(await customerBalance(tx, shop)).toBe(9000);

      const cashBefore = await cashboxBalance(tx, shop);
      await recordPayment(tx, {
        storeId: shop.storeId,
        branchId: shop.branchId,
        userId: shop.ownerId,
        direction: 'IN',
        source: 'CUSTOMER_DEBT',
        amount: 4000,
        methodId: shop.cashMethodId,
        customerId: shop.customerId,
        postToLedger: true,
      });

      expect(await customerBalance(tx, shop)).toBe(5000);
      expect(await cashboxBalance(tx, shop)).toBe(cashBefore + 4000);
    });
  });

  it('refunds a partial return, restocks it, and reverses its cost', async () => {
    await inRollback(async (tx) => {
      const shop = await buildShop(tx);
      const sale = await sell(tx, shop);
      const item = await tx.saleItem.findFirstOrThrow({
        where: { saleId: sale.saleId },
        select: { id: true },
      });
      const cashBefore = await cashboxBalance(tx, shop);

      const result = await createReturn(tx, {
        storeId: shop.storeId,
        branchId: shop.branchId,
        userId: shop.ownerId,
        saleId: sale.saleId,
        items: [{ saleItemId: item.id, quantity: PACK }],
        reason: 'العميل غيّر رأيه',
        restock: true,
        refundMethodId: shop.cashMethodId,
      });

      expect(result.total).toBe(4500);
      expect(result.refundTotal).toBe(4500);
      expect(await stockOf(tx, shop, shop.packId)).toBe(19 * PACK);
      expect(await cashboxBalance(tx, shop)).toBe(cashBefore - 4500);

      const status = await tx.sale.findUniqueOrThrow({
        where: { id: sale.saleId },
        select: { status: true },
      });
      expect(status.status).toBe('PARTIALLY_RETURNED');

      // Returning more than was sold is refused.
      await expect(
        createReturn(tx, {
          storeId: shop.storeId,
          branchId: shop.branchId,
          userId: shop.ownerId,
          saleId: sale.saleId,
          items: [{ saleItemId: item.id, quantity: 2 * PACK }],
          reason: 'محاولة ثانية',
          restock: true,
          refundMethodId: shop.cashMethodId,
        }),
      ).rejects.toThrow();
    });
  });

  it('cancels an invoice without deleting it: stock back, cash out, marked CANCELED', async () => {
    await inRollback(async (tx) => {
      const shop = await buildShop(tx);
      const cashBefore = await cashboxBalance(tx, shop);
      const sale = await sell(tx, shop);

      await cancelSale(tx, {
        storeId: shop.storeId,
        userId: shop.ownerId,
        saleId: sale.saleId,
        reason: 'خطأ في التسجيل',
        restock: true,
      });

      const row = await tx.sale.findUniqueOrThrow({
        where: { id: sale.saleId },
        select: { status: true, deletedAt: true },
      });
      expect(row.status).toBe('CANCELED');
      expect(row.deletedAt).toBeNull();
      expect(await stockOf(tx, shop, shop.packId)).toBe(20 * PACK);
      expect(await cashboxBalance(tx, shop)).toBe(cashBefore);
    });
  });

  it('closes a shift against the expected cash, including expenses, and flags a shortfall', async () => {
    await inRollback(async (tx) => {
      const shop = await buildShop(tx);
      const shift = await openShift(tx, {
        storeId: shop.storeId,
        branchId: shop.branchId,
        userId: shop.ownerId,
        openingCash: 10_000,
      });

      await sell(tx, shop, { shiftId: shift.id });
      await recordExpense(tx, {
        storeId: shop.storeId,
        branchId: shop.branchId,
        userId: shop.ownerId,
        categoryId: shop.expenseCategoryId,
        method: { id: shop.cashMethodId, affectsCashbox: true },
        amount: 2000,
        description: 'ماء وقهوة',
        spentAt: new Date(),
      });

      const totals = await computeShiftTotals(tx, shift.id);
      expect(totals.cashSales).toBe(9000);
      expect(totals.expenses).toBe(2000);
      expect(totals.expectedCash).toBe(10_000 + 9000 - 2000);

      // A difference without a reason is refused.
      await expect(
        closeShift(tx, {
          storeId: shop.storeId,
          userId: shop.ownerId,
          shiftId: shift.id,
          actualCash: 16_500,
        }),
      ).rejects.toThrow('سبب');

      const closed = await closeShift(tx, {
        storeId: shop.storeId,
        userId: shop.ownerId,
        shiftId: shift.id,
        actualCash: 16_500,
        differenceReason: 'فكة ناقصة',
      });
      expect(closed.difference).toBe(-500);

      const notice = await tx.notification.findFirstOrThrow({
        where: { storeId: shop.storeId, kind: 'CASH_MISMATCH' },
        select: { severity: true, body: true },
      });
      expect(notice.severity).toBe('WARNING');
      // The amount is written as money, never as raw minor units.
      expect(notice.body).toContain('5.00');
      expect(notice.body).not.toContain('-500');
    });
  });

  it('enforces permissions and stock inside the service, not just in the UI', async () => {
    await inRollback(async (tx) => {
      const shop = await buildShop(tx);

      await expect(
        sell(tx, shop, { permissions: CASHIER_PERMISSIONS, invoiceDiscount: 500 }),
      ).rejects.toThrow('صلاحية');
      await expect(
        sell(tx, shop, {
          permissions: CASHIER_PERMISSIONS,
          lines: [{ variantId: shop.packId, quantity: PACK, unitPrice: 100 }],
        }),
      ).rejects.toThrow('صلاحية');
      await expect(
        sell(tx, shop, {
          lines: [{ variantId: shop.packId, quantity: 50 * PACK }],
          tenders: [{ methodId: shop.cashMethodId, amount: 500_000 }],
        }),
      ).rejects.toThrow('الكمية غير كافية');
      // Half a box of charcoal is not a thing.
      await expect(
        sell(tx, shop, { lines: [{ variantId: shop.packId, quantity: PACK / 2 }] }),
      ).rejects.toThrow('كسور');
      // A card cannot be over-tendered into "change".
      await expect(
        sell(tx, shop, { tenders: [{ methodId: shop.cardMethodId, amount: 20_000 }] }),
      ).rejects.toThrow();
    });
  });

  it('moves the weighted-average cost when stock is bought at a new price', async () => {
    await inRollback(async (tx) => {
      const shop = await buildShop(tx);
      // 20 on hand at 30.00; 20 more at 36.00 → average 33.00.
      await createPurchase(tx, {
        storeId: shop.storeId,
        branchId: shop.branchId,
        userId: shop.ownerId,
        supplierId: shop.supplierId,
        receiveNow: true,
        lines: [{ variantId: shop.packId, quantity: 20 * PACK, unitCost: 3600 }],
        payments: [],
      });

      const variant = await tx.productVariant.findUniqueOrThrow({
        where: { id: shop.packId },
        select: { avgCostPerBase: true },
      });
      expect(costFromDb(variant.avgCostPerBase)).toBe(3300 * 1_000_000);

      // The next sale is costed at the new average.
      const sale = await sell(tx, shop, { lines: [{ variantId: shop.packId, quantity: PACK }] });
      expect(sale.profitTotal).toBe(4500 - 3300);
    });
  });
});
