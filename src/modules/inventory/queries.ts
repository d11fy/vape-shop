import 'server-only';

import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { fromDb, type Money } from '@/core/money';
import {
  costAmount,
  costFromDb,
  factorFromDb,
  lineAmount,
  qtyFromDb,
  type Qty,
} from '@/core/quantity';
import type { ParsedTableQuery } from '@/lib/table-query';
import type { DateRange } from '@/core/datetime';
import type { InventoryTxnType } from '@/generated/prisma/enums';

/**
 * Inventory queries.
 *
 * This view is variant-level rather than product-level: the shopkeeper counting
 * the shelf counts tins of 250g, not "معسل تفاحتين" in the abstract.
 */

export type StockState = 'ok' | 'low' | 'out';

export interface InventoryRow {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  categoryName: string | null;
  unitLabel: string;
  factor: number;
  quantity: Qty;
  saleUnits: number;
  minimumStock: Qty;
  avgCostPerBase: number;
  /** quantity × avgCost, in minor units. */
  stockValue: Money;
  sellingPrice: Money;
  /** What the stock would fetch at the current selling price. */
  retailValue: Money;
  state: StockState;
  lastCountedAt: Date | null;
  updatedAt: Date;
}

export interface InventoryResult {
  rows: InventoryRow[];
  total: number;
  summary: {
    totalValue: Money;
    retailValue: Money;
    lowCount: number;
    outCount: number;
    variantCount: number;
  };
}

export interface InventoryFilters {
  storeId: string;
  branchId: string;
  query: ParsedTableQuery;
  categoryId?: string;
  state?: StockState;
  productId?: string;
}

export async function listInventory(filters: InventoryFilters): Promise<InventoryResult> {
  const where: Prisma.ProductVariantWhereInput = {
    storeId: filters.storeId,
    deletedAt: null,
    product: {
      deletedAt: null,
      trackInventory: true,
      ...(filters.categoryId && filters.categoryId !== 'all'
        ? { categoryId: filters.categoryId }
        : {}),
      ...(filters.productId ? { id: filters.productId } : {}),
    },
  };

  const term = filters.query.search;
  if (term) {
    where.OR = [
      { sku: { contains: term, mode: 'insensitive' } },
      { barcode: { startsWith: term } },
      { name: { contains: term, mode: 'insensitive' } },
      { product: { name: { contains: term, mode: 'insensitive' } } },
    ];
  }

  const variants = await db.productVariant.findMany({
    where,
    orderBy: [{ product: { name: 'asc' } }, { sortOrder: 'asc' }],
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      unitLabel: true,
      displayFactor: true,
      minimumStock: true,
      avgCostPerBase: true,
      sellingPrice: true,
      updatedAt: true,
      product: {
        select: { id: true, name: true, category: { select: { name: true } } },
      },
      inventoryItems: {
        where: { branchId: filters.branchId },
        select: { quantity: true, minimumStock: true, lastCountedAt: true },
      },
    },
  });

  const all: InventoryRow[] = variants.map((variant) => {
    const item = variant.inventoryItems[0];
    const quantity = qtyFromDb(item?.quantity);
    const branchMinimum = qtyFromDb(item?.minimumStock);
    const minimumStock = branchMinimum > 0 ? branchMinimum : qtyFromDb(variant.minimumStock);
    const factor = factorFromDb(variant.displayFactor);
    const avgCostPerBase = costFromDb(variant.avgCostPerBase);
    const sellingPrice = fromDb(variant.sellingPrice);

    const state: StockState =
      quantity <= 0 ? 'out' : minimumStock > 0 && quantity <= minimumStock ? 'low' : 'ok';

    return {
      variantId: variant.id,
      productId: variant.product.id,
      productName: variant.product.name,
      variantName: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      categoryName: variant.product.category?.name ?? null,
      unitLabel: variant.unitLabel,
      factor,
      quantity,
      saleUnits: quantity / factor,
      minimumStock,
      avgCostPerBase,
      stockValue: costAmount(quantity, avgCostPerBase),
      sellingPrice,
      retailValue: lineAmount(sellingPrice, quantity, factor),
      state,
      lastCountedAt: item?.lastCountedAt ?? null,
      updatedAt: variant.updatedAt,
    };
  });

  const matching = filters.state ? all.filter((row) => row.state === filters.state) : all;

  // Sorting happens here because the interesting columns (value, state) are
  // computed, not stored. The result set is one store's catalogue, which stays
  // well within what a single query can hold.
  const sorted = sortInventory(matching, filters.query);
  const page = sorted.slice(filters.query.skip, filters.query.skip + filters.query.take);

  return {
    rows: page,
    total: matching.length,
    summary: {
      totalValue: all.reduce((sum, row) => sum + row.stockValue, 0),
      retailValue: all.reduce((sum, row) => sum + row.retailValue, 0),
      lowCount: all.filter((row) => row.state === 'low').length,
      outCount: all.filter((row) => row.state === 'out').length,
      variantCount: all.length,
    },
  };
}

function sortInventory(rows: InventoryRow[], query: ParsedTableQuery): InventoryRow[] {
  const direction = query.dir === 'asc' ? 1 : -1;
  const sorted = [...rows];

  switch (query.sort) {
    case 'quantity':
      sorted.sort((a, b) => (a.saleUnits - b.saleUnits) * direction);
      break;
    case 'value':
      sorted.sort((a, b) => (a.stockValue - b.stockValue) * direction);
      break;
    case 'name':
      sorted.sort((a, b) => a.productName.localeCompare(b.productName, 'ar') * direction);
      break;
    default:
      // Default view puts the problems first — that is what the page is for.
      sorted.sort((a, b) => {
        const rank = { out: 0, low: 1, ok: 2 };
        if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
        return a.productName.localeCompare(b.productName, 'ar');
      });
  }

  return sorted;
}

// ── Movements ledger ─────────────────────────────────────────────────────────

export interface MovementRow {
  id: string;
  type: InventoryTxnType;
  productName: string;
  variantName: string;
  unitLabel: string;
  factor: number;
  change: Qty;
  before: Qty;
  after: Qty;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  userName: string;
  branchName: string;
  occurredAt: Date;
}

export async function listMovements(input: {
  storeId: string;
  branchId: string | null;
  query: ParsedTableQuery;
  range?: DateRange;
  type?: string;
  variantId?: string;
  productId?: string;
}): Promise<{ rows: MovementRow[]; total: number }> {
  const where: Prisma.InventoryTransactionWhereInput = {
    storeId: input.storeId,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.variantId ? { variantId: input.variantId } : {}),
    ...(input.productId ? { variant: { productId: input.productId } } : {}),
    ...(input.type && input.type !== 'all' ? { type: input.type as InventoryTxnType } : {}),
    ...(input.range ? { occurredAt: { gte: input.range.from, lt: input.range.to } } : {}),
  };

  if (input.query.search) {
    where.variant = {
      ...(where.variant as object),
      OR: [
        { sku: { contains: input.query.search, mode: 'insensitive' } },
        { product: { name: { contains: input.query.search, mode: 'insensitive' } } },
      ],
    };
  }

  const [rows, total] = await Promise.all([
    db.inventoryTransaction.findMany({
      where,
      orderBy: { occurredAt: input.query.dir },
      skip: input.query.skip,
      take: input.query.take,
      select: {
        id: true,
        type: true,
        quantityChange: true,
        quantityBefore: true,
        quantityAfter: true,
        reason: true,
        referenceType: true,
        referenceId: true,
        occurredAt: true,
        userId: true,
        branch: { select: { name: true } },
        variant: {
          select: {
            name: true,
            unitLabel: true,
            displayFactor: true,
            product: { select: { name: true } },
          },
        },
      },
    }),
    db.inventoryTransaction.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((row) => row.userId).filter(Boolean))] as string[];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      type: row.type,
      productName: row.variant.product.name,
      variantName: row.variant.name,
      unitLabel: row.variant.unitLabel,
      factor: factorFromDb(row.variant.displayFactor),
      change: qtyFromDb(row.quantityChange),
      before: qtyFromDb(row.quantityBefore),
      after: qtyFromDb(row.quantityAfter),
      reason: row.reason,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      userName: row.userId ? (names.get(row.userId) ?? '—') : 'النظام',
      branchName: row.branch.name,
      occurredAt: row.occurredAt,
    })),
  };
}

/** Variants for the stock-count sheet, with their current system quantity. */
export async function getCountSheet(
  storeId: string,
  branchId: string,
  options: { categoryId?: string; search?: string; limit?: number } = {},
) {
  const variants = await db.productVariant.findMany({
    where: {
      storeId,
      deletedAt: null,
      isActive: true,
      product: {
        deletedAt: null,
        status: 'ACTIVE',
        trackInventory: true,
        ...(options.categoryId && options.categoryId !== 'all'
          ? { categoryId: options.categoryId }
          : {}),
      },
      ...(options.search
        ? {
            OR: [
              { sku: { contains: options.search, mode: 'insensitive' } },
              { product: { name: { contains: options.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ product: { name: 'asc' } }, { sortOrder: 'asc' }],
    take: options.limit ?? 300,
    select: {
      id: true,
      name: true,
      sku: true,
      unitLabel: true,
      displayFactor: true,
      avgCostPerBase: true,
      product: { select: { id: true, name: true } },
      inventoryItems: { where: { branchId }, select: { quantity: true } },
    },
  });

  return variants.map((variant) => ({
    variantId: variant.id,
    productId: variant.product.id,
    label:
      variant.name && variant.name !== 'افتراضي'
        ? `${variant.product.name} — ${variant.name}`
        : variant.product.name,
    sku: variant.sku,
    unitLabel: variant.unitLabel,
    factor: factorFromDb(variant.displayFactor),
    systemQuantity: qtyFromDb(variant.inventoryItems[0]?.quantity),
    costPerBase: costFromDb(variant.avgCostPerBase),
  }));
}

export async function listAdjustments(
  storeId: string,
  query: ParsedTableQuery,
  branchId?: string | null,
) {
  const where: Prisma.InventoryAdjustmentWhereInput = {
    storeId,
    deletedAt: null,
    ...(branchId ? { branchId } : {}),
    ...(query.search ? { number: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [rows, total] = await Promise.all([
    db.inventoryAdjustment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.take,
      select: {
        id: true,
        number: true,
        status: true,
        reason: true,
        note: true,
        appliedAt: true,
        createdAt: true,
        userId: true,
        branch: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.inventoryAdjustment.count({ where }),
  ]);

  const userIds = [...new Set(rows.map((row) => row.userId))];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      number: row.number,
      status: row.status,
      reason: row.reason,
      note: row.note,
      itemCount: row._count.items,
      branchName: row.branch.name,
      userName: names.get(row.userId) ?? '—',
      appliedAt: row.appliedAt,
      createdAt: row.createdAt,
    })),
  };
}

export interface AdjustmentDetail {
  id: string;
  number: string;
  status: 'DRAFT' | 'APPLIED' | 'CANCELED';
  reason: string;
  note: string | null;
  branchName: string;
  userName: string;
  appliedAt: Date | null;
  createdAt: Date;
  items: Array<{
    id: string;
    productId: string;
    name: string;
    sku: string;
    unitLabel: string;
    factor: number;
    systemQty: Qty;
    countedQty: Qty;
    difference: Qty;
    /** Money value of the difference at the cost recorded when it was applied. */
    valueImpact: Money;
    note: string | null;
  }>;
  totals: { increase: Money; decrease: Money; net: Money };
}

/** One stock-take, with the cost each difference was valued at when applied. */
export async function getAdjustment(
  storeId: string,
  adjustmentId: string,
): Promise<AdjustmentDetail | null> {
  const adjustment = await db.inventoryAdjustment.findFirst({
    where: { id: adjustmentId, storeId, deletedAt: null },
    select: {
      id: true,
      number: true,
      status: true,
      reason: true,
      note: true,
      appliedAt: true,
      createdAt: true,
      userId: true,
      branch: { select: { name: true } },
      items: {
        select: {
          id: true,
          systemQty: true,
          countedQty: true,
          difference: true,
          costPerBase: true,
          note: true,
          variant: {
            select: {
              name: true,
              sku: true,
              unitLabel: true,
              displayFactor: true,
              product: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!adjustment) return null;

  const user = await db.user.findUnique({
    where: { id: adjustment.userId },
    select: { name: true },
  });

  const items = adjustment.items.map((item) => {
    const difference = qtyFromDb(item.difference);
    return {
      id: item.id,
      productId: item.variant.product.id,
      name:
        item.variant.name && item.variant.name !== 'افتراضي'
          ? `${item.variant.product.name} — ${item.variant.name}`
          : item.variant.product.name,
      sku: item.variant.sku,
      unitLabel: item.variant.unitLabel,
      factor: factorFromDb(item.variant.displayFactor),
      systemQty: qtyFromDb(item.systemQty),
      countedQty: qtyFromDb(item.countedQty),
      difference,
      valueImpact: costAmount(difference, costFromDb(item.costPerBase)),
      note: item.note,
    };
  });

  const increase = items.reduce((sum, item) => sum + Math.max(item.valueImpact, 0), 0);
  const decrease = items.reduce((sum, item) => sum + Math.min(item.valueImpact, 0), 0);

  return {
    id: adjustment.id,
    number: adjustment.number,
    status: adjustment.status,
    reason: adjustment.reason,
    note: adjustment.note,
    branchName: adjustment.branch.name,
    userName: user?.name ?? '—',
    appliedAt: adjustment.appliedAt,
    createdAt: adjustment.createdAt,
    items,
    totals: { increase, decrease, net: increase + decrease },
  };
}
