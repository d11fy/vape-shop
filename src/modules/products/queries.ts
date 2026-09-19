import 'server-only';

import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { fromDb, type Money } from '@/core/money';
import { costAmount, costFromDb, factorFromDb, qtyFromDb, type Qty } from '@/core/quantity';
import type { ParsedTableQuery } from '@/lib/table-query';
import type { ProductStatus, UnitKind } from '@/generated/prisma/enums';

/**
 * Catalogue queries.
 *
 * The list is variant-aware: a product with three pack sizes shows once with
 * its price range and total stock, because that is how a shopkeeper thinks
 * about it — "do I have تفاحتين?" not "do I have the 250g SKU?".
 */

export interface ProductListRow {
  id: string;
  name: string;
  imageUrl: string | null;
  status: ProductStatus;
  unitKind: UnitKind;
  trackInventory: boolean;
  categoryName: string | null;
  categoryColor: string | null;
  brandName: string | null;
  variantCount: number;
  /** Lowest and highest selling price across variants. */
  priceFrom: Money;
  priceTo: Money;
  /** Total on-hand across the branch, in base units. */
  stock: Qty;
  /** Stock value at weighted-average cost. */
  stockValue: Money;
  /** True when any variant sits at or below its threshold. */
  lowStock: boolean;
  outOfStock: boolean;
  unitLabel: string;
  factor: number;
  updatedAt: Date;
}

export interface ProductListResult {
  rows: ProductListRow[];
  total: number;
}

export interface ProductFilters {
  storeId: string;
  branchId: string;
  query: ParsedTableQuery;
  categoryId?: string;
  brandId?: string;
  status?: string;
  stockState?: 'low' | 'out' | 'ok';
}

export async function listProducts(filters: ProductFilters): Promise<ProductListResult> {
  const where: Prisma.ProductWhereInput = {
    storeId: filters.storeId,
    deletedAt: null,
    ...(filters.categoryId && filters.categoryId !== 'all'
      ? { categoryId: filters.categoryId }
      : {}),
    ...(filters.brandId && filters.brandId !== 'all' ? { brandId: filters.brandId } : {}),
    ...(filters.status && filters.status !== 'all'
      ? { status: filters.status as ProductStatus }
      : { status: 'ACTIVE' as ProductStatus }),
  };

  const term = filters.query.search;
  if (term) {
    where.OR = [
      { name: { contains: term, mode: 'insensitive' } },
      { variants: { some: { sku: { contains: term, mode: 'insensitive' } } } },
      { variants: { some: { barcode: { startsWith: term } } } },
      { variants: { some: { name: { contains: term, mode: 'insensitive' } } } },
    ];
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    filters.query.sort === 'name'
      ? { name: filters.query.dir }
      : filters.query.sort === 'updatedAt'
        ? { updatedAt: filters.query.dir }
        : { name: 'asc' };

  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      orderBy,
      skip: filters.query.skip,
      take: filters.query.take,
      select: {
        id: true,
        name: true,
        imageUrl: true,
        status: true,
        unitKind: true,
        trackInventory: true,
        updatedAt: true,
        category: { select: { name: true, color: true } },
        brand: { select: { name: true } },
        variants: {
          where: { deletedAt: null },
          select: {
            id: true,
            sellingPrice: true,
            avgCostPerBase: true,
            minimumStock: true,
            unitLabel: true,
            displayFactor: true,
            inventoryItems: {
              where: { branchId: filters.branchId },
              select: { quantity: true, minimumStock: true },
            },
          },
        },
      },
    }),
    db.product.count({ where }),
  ]);

  const rows = products.map((product) => {
    const prices = product.variants.map((variant) => fromDb(variant.sellingPrice));
    let stock = 0;
    let stockValue = 0;
    let lowStock = false;
    let outOfStock = false;

    for (const variant of product.variants) {
      const quantity = qtyFromDb(variant.inventoryItems[0]?.quantity);
      const branchMinimum = qtyFromDb(variant.inventoryItems[0]?.minimumStock);
      const threshold = branchMinimum > 0 ? branchMinimum : qtyFromDb(variant.minimumStock);

      stock += quantity;
      stockValue += costAmount(quantity, costFromDb(variant.avgCostPerBase));

      if (product.trackInventory) {
        if (quantity <= 0) outOfStock = true;
        else if (threshold > 0 && quantity <= threshold) lowStock = true;
      }
    }

    const first = product.variants[0];

    return {
      id: product.id,
      name: product.name,
      imageUrl: product.imageUrl,
      status: product.status,
      unitKind: product.unitKind,
      trackInventory: product.trackInventory,
      categoryName: product.category?.name ?? null,
      categoryColor: product.category?.color ?? null,
      brandName: product.brand?.name ?? null,
      variantCount: product.variants.length,
      priceFrom: prices.length ? Math.min(...prices) : 0,
      priceTo: prices.length ? Math.max(...prices) : 0,
      stock,
      stockValue,
      lowStock,
      outOfStock,
      unitLabel: first?.unitLabel ?? 'قطعة',
      factor: first ? factorFromDb(first.displayFactor) : 1000,
      updatedAt: product.updatedAt,
    } satisfies ProductListRow;
  });

  // Stock filters need the computed values, so they run after the map. The page
  // size is bounded, so this stays cheap.
  const filtered =
    filters.stockState === 'low'
      ? rows.filter((row) => row.lowStock || row.outOfStock)
      : filters.stockState === 'out'
        ? rows.filter((row) => row.outOfStock)
        : filters.stockState === 'ok'
          ? rows.filter((row) => !row.lowStock && !row.outOfStock)
          : rows;

  return { rows: filtered, total };
}

// ── Detail ───────────────────────────────────────────────────────────────────

export interface ProductVariantDetail {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  unitLabel: string;
  factor: number;
  allowsFractional: boolean;
  sellingPrice: Money;
  wholesalePrice: Money;
  purchasePrice: Money;
  avgCostPerBase: number;
  /** Weighted-average cost expressed per sale unit, for display. */
  avgCostPerUnit: Money;
  minimumStock: Qty;
  stock: Qty;
  isActive: boolean;
  isDefault: boolean;
}

export interface ProductDetail {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  status: ProductStatus;
  unitKind: UnitKind;
  trackInventory: boolean;
  hasVariants: boolean;
  isAgeRestricted: boolean;
  categoryId: string | null;
  categoryName: string | null;
  brandId: string | null;
  brandName: string | null;
  createdAt: Date;
  updatedAt: Date;
  variants: ProductVariantDetail[];
}

export async function getProduct(
  storeId: string,
  branchId: string,
  productId: string,
): Promise<ProductDetail | null> {
  const product = await db.product.findFirst({
    where: { id: productId, storeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      imageUrl: true,
      status: true,
      unitKind: true,
      trackInventory: true,
      hasVariants: true,
      isAgeRestricted: true,
      categoryId: true,
      brandId: true,
      createdAt: true,
      updatedAt: true,
      category: { select: { name: true } },
      brand: { select: { name: true } },
      variants: {
        where: { deletedAt: null },
        orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
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
          purchasePrice: true,
          avgCostPerBase: true,
          minimumStock: true,
          isActive: true,
          isDefault: true,
          inventoryItems: {
            where: { branchId },
            select: { quantity: true },
          },
        },
      },
    },
  });

  if (!product) return null;

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    status: product.status,
    unitKind: product.unitKind,
    trackInventory: product.trackInventory,
    hasVariants: product.hasVariants,
    isAgeRestricted: product.isAgeRestricted,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    brandId: product.brandId,
    brandName: product.brand?.name ?? null,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    variants: product.variants.map((variant) => {
      const factor = factorFromDb(variant.displayFactor);
      const costPerBase = costFromDb(variant.avgCostPerBase);
      return {
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        barcode: variant.barcode,
        unitLabel: variant.unitLabel,
        factor,
        allowsFractional: variant.allowsFractional,
        sellingPrice: fromDb(variant.sellingPrice),
        wholesalePrice: fromDb(variant.wholesalePrice),
        purchasePrice: fromDb(variant.purchasePrice),
        avgCostPerBase: costPerBase,
        // The cost of one sale unit is the cost of `factor` base units.
        avgCostPerUnit: costAmount(factor, costPerBase),
        minimumStock: qtyFromDb(variant.minimumStock),
        stock: qtyFromDb(variant.inventoryItems[0]?.quantity),
        isActive: variant.isActive,
        isDefault: variant.isDefault,
      };
    }),
  };
}

/** Recent stock movements for a product, across its variants. */
export async function getProductMovements(storeId: string, productId: string, take = 20) {
  const movements = await db.inventoryTransaction.findMany({
    where: { storeId, variant: { productId } },
    orderBy: { occurredAt: 'desc' },
    take,
    select: {
      id: true,
      type: true,
      quantityChange: true,
      quantityAfter: true,
      referenceType: true,
      referenceId: true,
      reason: true,
      occurredAt: true,
      userId: true,
      variant: { select: { name: true, unitLabel: true, displayFactor: true } },
      branch: { select: { name: true } },
    },
  });

  const userIds = [...new Set(movements.map((movement) => movement.userId).filter(Boolean))] as string[];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return movements.map((movement) => ({
    id: movement.id,
    type: movement.type,
    change: qtyFromDb(movement.quantityChange),
    after: qtyFromDb(movement.quantityAfter),
    factor: factorFromDb(movement.variant.displayFactor),
    unitLabel: movement.variant.unitLabel,
    variantName: movement.variant.name,
    branchName: movement.branch.name,
    referenceType: movement.referenceType,
    referenceId: movement.referenceId,
    reason: movement.reason,
    occurredAt: movement.occurredAt,
    userName: movement.userId ? (names.get(movement.userId) ?? '—') : 'النظام',
  }));
}

/** Sales performance for a single product, used on its detail page. */
export async function getProductPerformance(
  storeId: string,
  productId: string,
  since: Date,
) {
  const aggregate = await db.saleItem.aggregate({
    where: {
      storeId,
      variant: { productId },
      sale: { deletedAt: null, status: { not: 'CANCELED' }, soldAt: { gte: since } },
    },
    _sum: { quantityBase: true, lineTotal: true, cogs: true, taxAmount: true },
    _count: true,
  });

  const revenue = fromDb(aggregate._sum.lineTotal);
  const tax = fromDb(aggregate._sum.taxAmount);
  const cogs = fromDb(aggregate._sum.cogs);

  return {
    lineCount: aggregate._count,
    quantity: qtyFromDb(aggregate._sum.quantityBase),
    revenue,
    profit: revenue - tax - cogs,
  };
}

export async function listCategories(storeId: string) {
  return db.category.findMany({
    where: { storeId, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      name: true,
      color: true,
      isActive: true,
      sortOrder: true,
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });
}

export async function listBrands(storeId: string) {
  return db.brand.findMany({
    where: { storeId, deletedAt: null },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      isActive: true,
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });
}

/** Count active products — used to enforce the plan's product limit. */
export async function countProducts(storeId: string): Promise<number> {
  return db.product.count({ where: { storeId, deletedAt: null } });
}
