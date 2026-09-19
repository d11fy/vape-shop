import { randomBytes } from 'node:crypto';

import { db, type Tx } from '@/core/db';
import { createPurchase } from '@/modules/purchases/service';
import { provisionStore } from '@/modules/store/provisioning';

/**
 * Database scenarios run inside ONE transaction that is always rolled back:
 * they exercise the real services, SQL and constraints against the configured
 * database, and leave nothing behind — safe to run against a development
 * database somebody is using.
 */

class Rollback extends Error {
  constructor() {
    super('rollback');
  }
}

export const hasDatabase = Boolean(process.env.DATABASE_URL);

export async function inRollback(scenario: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.$transaction(
      async (tx) => {
        await scenario(tx);
        throw new Rollback();
      },
      { timeout: 120_000, maxWait: 20_000 },
    );
  } catch (error) {
    if (!(error instanceof Rollback)) throw error;
  }
}

export interface Shop {
  storeId: string;
  branchId: string;
  ownerId: string;
  cashMethodId: string;
  cardMethodId: string;
  expenseCategoryId: string;
  customerId: string;
  supplierId: string;
  /** Counted item: 1 sale unit = 1 base unit. Bought at 30.00, sells at 45.00. */
  packId: string;
  /** Weighed item sold per 250 g pack: bought at 30.00, sells at 45.00. */
  tobaccoId: string;
}

const PACK = 1000; // base units ×1000 in one counted sale unit
export const TOBACCO_PACK = 250_000; // 250 g

/**
 * A complete little shop: owner, branch, cashbox, payment methods, a customer
 * with a 500.00 debt limit, a supplier, and stock received through a real
 * purchase — so every product already has a weighted-average cost.
 */
export async function buildShop(tx: Tx): Promise<Shop> {
  const tag = randomBytes(4).toString('hex');

  const plan =
    (await tx.plan.findFirst({ where: { isActive: true, isPublic: true }, select: { code: true } })) ??
    (await tx.plan.create({
      data: {
        code: `test-${tag}`,
        nameAr: 'خطة اختبار',
        nameEn: 'Test plan',
        monthlyPrice: 0n,
        yearlyPrice: 0n,
      },
      select: { code: true },
    }));

  const owner = await tx.user.create({
    data: {
      name: 'مالك الاختبار',
      email: `owner-${tag}@vapeshop.test`,
      passwordHash: 'not-a-real-hash',
      status: 'ACTIVE',
    },
    select: { id: true },
  });

  const { store, branchId } = await provisionStore(tx, {
    name: `محل الاختبار ${tag}`,
    ownerId: owner.id,
    country: 'SA',
    planCode: plan.code,
  });

  await tx.storeSettings.update({
    where: { storeId: store.id },
    data: { debtEnabled: true, taxEnabled: false },
  });

  const [cash, card, category] = await Promise.all([
    tx.paymentMethod.findFirstOrThrow({ where: { storeId: store.id, type: 'CASH' }, select: { id: true } }),
    tx.paymentMethod.findFirstOrThrow({
      where: { storeId: store.id, affectsCashbox: false },
      select: { id: true },
    }),
    tx.expenseCategory.findFirstOrThrow({ where: { storeId: store.id }, select: { id: true } }),
  ]);

  const customer = await tx.customer.create({
    data: { storeId: store.id, name: 'عميل آجل', debtLimit: 50_000n, ageVerified: true },
    select: { id: true },
  });
  const supplier = await tx.supplier.create({
    data: { storeId: store.id, name: 'مورد الاختبار' },
    select: { id: true },
  });

  const packId = await makeVariant(tx, store.id, {
    name: 'فحم جوز الهند',
    unitKind: 'COUNT',
    unitLabel: 'علبة',
    factor: PACK,
    fractional: false,
    sellingPrice: 4500,
  });
  const tobaccoId = await makeVariant(tx, store.id, {
    name: 'معسل تفاحتين',
    unitKind: 'WEIGHT',
    unitLabel: '250 جرام',
    factor: TOBACCO_PACK,
    fractional: true,
    sellingPrice: 4500,
  });

  // Stock arrives the way it does in the shop: a received purchase.
  await createPurchase(tx, {
    storeId: store.id,
    branchId,
    userId: owner.id,
    supplierId: supplier.id,
    receiveNow: true,
    lines: [
      { variantId: packId, quantity: 20 * PACK, unitCost: 3000 },
      { variantId: tobaccoId, quantity: 20 * TOBACCO_PACK, unitCost: 3000 },
    ],
    payments: [],
  });

  return {
    storeId: store.id,
    branchId,
    ownerId: owner.id,
    cashMethodId: cash.id,
    cardMethodId: card.id,
    expenseCategoryId: category.id,
    customerId: customer.id,
    supplierId: supplier.id,
    packId,
    tobaccoId,
  };
}

async function makeVariant(
  tx: Tx,
  storeId: string,
  spec: {
    name: string;
    unitKind: 'COUNT' | 'WEIGHT';
    unitLabel: string;
    factor: number;
    fractional: boolean;
    sellingPrice: number;
  },
): Promise<string> {
  const product = await tx.product.create({
    data: { storeId, name: spec.name, unitKind: spec.unitKind, trackInventory: true, status: 'ACTIVE' },
    select: { id: true },
  });
  const variant = await tx.productVariant.create({
    data: {
      storeId,
      productId: product.id,
      name: 'افتراضي',
      sku: `T-${randomBytes(3).toString('hex')}`,
      isDefault: true,
      unitLabel: spec.unitLabel,
      displayFactor: (spec.factor / 1000).toFixed(3),
      allowsFractional: spec.fractional,
      sellingPrice: BigInt(spec.sellingPrice),
    },
    select: { id: true },
  });
  return variant.id;
}

export const OWNER_PERMISSIONS = { canDiscount: true, canEditPrice: true, canSellOnCredit: true };
export const CASHIER_PERMISSIONS = { canDiscount: false, canEditPrice: false, canSellOnCredit: true };
