import 'server-only';

import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { fromDb } from '@/core/money';
import { factorFromDb, qtyFromDb } from '@/core/quantity';
import type { UnitKind } from '@/generated/prisma/enums';

/**
 * Point-of-sale data.
 *
 * The catalogue is NOT shipped whole. A store on the Business plan may carry
 * ten thousand variants; sending them to a phone would cost seconds on the
 * first tap. Instead the screen opens with the items that actually sell — ranked
 * by the last 30 days — and every search after that is a server query against
 * an index.
 */

export interface PosProduct {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  label: string;
  sku: string;
  barcode: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  brandName: string | null;
  unitKind: UnitKind;
  unitLabel: string;
  factor: number;
  allowsFractional: boolean;
  sellingPrice: number;
  wholesalePrice: number;
  stock: number;
  trackInventory: boolean;
  imageUrl: string | null;
}

export interface PosCategory {
  id: string;
  name: string;
  color: string | null;
  count: number;
}

export interface PosPaymentMethod {
  id: string;
  name: string;
  type: string;
  affectsCashbox: boolean;
  isDefault: boolean;
}

export interface PosCustomerOption {
  id: string;
  name: string;
  phone: string | null;
  balance: number;
  debtLimit: number;
}

export interface PosBootstrap {
  products: PosProduct[];
  categories: PosCategory[];
  paymentMethods: PosPaymentMethod[];
  recentCustomers: PosCustomerOption[];
  openShift: { id: string; number: string; openedAt: Date } | null;
  settings: {
    taxEnabled: boolean;
    taxRateBps: number;
    taxInclusive: boolean;
    negativeStockAllowed: boolean;
    debtEnabled: boolean;
    ageVerificationEnabled: boolean;
    requireAgeCheckAtSale: boolean;
    ageNoticeAr: string;
    minimumCustomerAge: number;
  };
}

const INITIAL_PRODUCT_LIMIT = 80;
export const POS_SEARCH_LIMIT = 60;

export async function getPosBootstrap(
  storeId: string,
  branchId: string,
  userId: string,
): Promise<PosBootstrap> {
  const [products, categories, paymentMethods, recentCustomers, openShift, settings] =
    await Promise.all([
      loadPopularProducts(storeId, branchId),
      loadCategories(storeId),
      db.paymentMethod
        .findMany({
          where: { storeId, isActive: true },
          orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
          select: { id: true, name: true, type: true, affectsCashbox: true, isDefault: true },
        })
        .then((rows) => rows as PosPaymentMethod[]),
      db.customer
        .findMany({
          where: { storeId, deletedAt: null, isActive: true },
          orderBy: [{ balance: 'desc' }, { updatedAt: 'desc' }],
          take: 12,
          select: { id: true, name: true, phone: true, balance: true, debtLimit: true },
        })
        .then((rows) =>
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            phone: row.phone,
            balance: fromDb(row.balance),
            debtLimit: fromDb(row.debtLimit),
          })),
        ),
      db.shift.findFirst({
        where: { storeId, branchId, userId, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
        select: { id: true, number: true, openedAt: true },
      }),
      db.storeSettings.findUniqueOrThrow({
        where: { storeId },
        select: {
          taxEnabled: true,
          taxRateBps: true,
          taxInclusive: true,
          negativeStockAllowed: true,
          debtEnabled: true,
          ageVerificationEnabled: true,
          requireAgeCheckAtSale: true,
          ageNoticeAr: true,
          minimumCustomerAge: true,
        },
      }),
    ]);

  return { products, categories, paymentMethods, recentCustomers, openShift, settings };
}

/**
 * Opening set: whatever moved in the last 30 days, best sellers first, topped
 * up with the rest of the catalogue so a brand-new store is not empty.
 */
async function loadPopularProducts(storeId: string, branchId: string): Promise<PosProduct[]> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const ranked = await db.saleItem.groupBy({
    by: ['variantId'],
    where: {
      storeId,
      sale: { branchId, deletedAt: null, status: { not: 'CANCELED' }, soldAt: { gte: since } },
    },
    _sum: { quantityBase: true },
    orderBy: { _sum: { quantityBase: 'desc' } },
    take: INITIAL_PRODUCT_LIMIT,
  });

  const rankIndex = new Map(ranked.map((row, index) => [row.variantId, index]));
  const rows = await queryVariants(storeId, branchId, {
    take: INITIAL_PRODUCT_LIMIT,
    preferIds: [...rankIndex.keys()],
  });

  return rows.sort((a, b) => {
    const rankA = rankIndex.get(a.variantId) ?? Number.MAX_SAFE_INTEGER;
    const rankB = rankIndex.get(b.variantId) ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return a.productName.localeCompare(b.productName, 'ar');
  });
}

async function loadCategories(storeId: string): Promise<PosCategory[]> {
  const rows = await db.category.findMany({
    where: { storeId, isActive: true, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { products: { where: { deletedAt: null, status: 'ACTIVE' } } } },
    },
  });

  return rows
    .map((row) => ({ id: row.id, name: row.name, color: row.color, count: row._count.products }))
    .filter((row) => row.count > 0);
}

/** Server-side catalogue search: name, SKU, or an exact barcode scan. */
export async function searchPosProducts(
  storeId: string,
  branchId: string,
  options: { query?: string; categoryId?: string; limit?: number },
): Promise<PosProduct[]> {
  return queryVariants(storeId, branchId, {
    take: options.limit ?? POS_SEARCH_LIMIT,
    query: options.query,
    categoryId: options.categoryId,
  });
}

/** Exact barcode lookup — what the scanner wedge produces. */
export async function findByBarcode(
  storeId: string,
  branchId: string,
  barcode: string,
): Promise<PosProduct | null> {
  const rows = await queryVariants(storeId, branchId, { take: 1, barcode });
  return rows[0] ?? null;
}

interface VariantQueryOptions {
  take: number;
  query?: string;
  categoryId?: string;
  barcode?: string;
  preferIds?: string[];
}

async function queryVariants(
  storeId: string,
  branchId: string,
  options: VariantQueryOptions,
): Promise<PosProduct[]> {
  const where: Prisma.ProductVariantWhereInput = {
    storeId,
    isActive: true,
    deletedAt: null,
    product: { deletedAt: null, status: 'ACTIVE' },
  };

  if (options.barcode) {
    where.barcode = options.barcode;
  } else if (options.query) {
    const term = options.query.trim();
    where.OR = [
      { product: { name: { contains: term, mode: 'insensitive' }, deletedAt: null, status: 'ACTIVE' } },
      { name: { contains: term, mode: 'insensitive' } },
      { sku: { contains: term, mode: 'insensitive' } },
      { barcode: { startsWith: term } },
    ];
  }

  if (options.categoryId) {
    where.product = { ...(where.product as object), categoryId: options.categoryId };
  }

  if (options.preferIds && options.preferIds.length > 0) {
    // Union of "sells well" and the rest, capped — one query, no N+1.
    delete where.OR;
  }

  const rows = await db.productVariant.findMany({
    where,
    take: options.take,
    orderBy: [{ product: { name: 'asc' } }, { sortOrder: 'asc' }],
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      unitLabel: true,
      displayFactor: true,
      allowsFractional: true,
      sellingPrice: true,
      wholesalePrice: true,
      product: {
        select: {
          id: true,
          name: true,
          unitKind: true,
          trackInventory: true,
          imageUrl: true,
          category: { select: { id: true, name: true, color: true } },
          brand: { select: { name: true } },
        },
      },
      inventoryItems: {
        where: { branchId },
        select: { quantity: true },
      },
    },
  });

  return rows.map((row) => ({
    variantId: row.id,
    productId: row.product.id,
    productName: row.product.name,
    variantName: row.name,
    label:
      row.name && row.name !== 'افتراضي' ? `${row.product.name} — ${row.name}` : row.product.name,
    sku: row.sku,
    barcode: row.barcode,
    categoryId: row.product.category?.id ?? null,
    categoryName: row.product.category?.name ?? null,
    categoryColor: row.product.category?.color ?? null,
    brandName: row.product.brand?.name ?? null,
    unitKind: row.product.unitKind,
    unitLabel: row.unitLabel,
    factor: factorFromDb(row.displayFactor),
    allowsFractional: row.allowsFractional,
    sellingPrice: fromDb(row.sellingPrice),
    wholesalePrice: fromDb(row.wholesalePrice),
    stock: qtyFromDb(row.inventoryItems[0]?.quantity),
    trackInventory: row.product.trackInventory,
    imageUrl: row.product.imageUrl,
  }));
}

/** Customer picker inside the POS, searched by name or phone. */
export async function searchPosCustomers(
  storeId: string,
  query: string,
): Promise<PosCustomerOption[]> {
  const term = query.trim();
  const rows = await db.customer.findMany({
    where: {
      storeId,
      deletedAt: null,
      isActive: true,
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term } },
            ],
          }
        : {}),
    },
    orderBy: { name: 'asc' },
    take: 20,
    select: { id: true, name: true, phone: true, balance: true, debtLimit: true },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phone,
    balance: fromDb(row.balance),
    debtLimit: fromDb(row.debtLimit),
  }));
}
