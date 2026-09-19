import 'server-only';

import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { fromDb, type Money } from '@/core/money';
import { factorFromDb, qtyFromDb } from '@/core/quantity';
import type { ParsedTableQuery } from '@/lib/table-query';
import type { PartyLedgerType, PurchaseStatus } from '@/generated/prisma/enums';

/**
 * Supplier and purchasing queries.
 *
 * The mirror image of the customer module: positive balance means the store
 * owes the supplier, and the same append-only ledger discipline applies.
 */

export interface SupplierListRow {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  balance: Money;
  totalPurchases: Money;
  totalPaid: Money;
  purchaseCount: number;
  lastPurchaseAt: Date | null;
  isActive: boolean;
}

export async function listSuppliers(input: {
  storeId: string;
  query: ParsedTableQuery;
  creditorsOnly?: boolean;
}): Promise<{
  rows: SupplierListRow[];
  total: number;
  summary: { totalPayable: Money; creditorCount: number };
}> {
  const where: Prisma.SupplierWhereInput = {
    storeId: input.storeId,
    deletedAt: null,
    ...(input.creditorsOnly ? { balance: { gt: 0 } } : {}),
  };

  if (input.query.search) {
    where.OR = [
      { name: { contains: input.query.search, mode: 'insensitive' } },
      { company: { contains: input.query.search, mode: 'insensitive' } },
      { phone: { contains: input.query.search } },
    ];
  }

  const orderBy: Prisma.SupplierOrderByWithRelationInput =
    input.query.sort === 'balance'
      ? { balance: input.query.dir }
      : input.query.sort === 'name'
        ? { name: input.query.dir }
        : { name: 'asc' };

  const [suppliers, total, payable] = await Promise.all([
    db.supplier.findMany({
      where,
      orderBy,
      skip: input.query.skip,
      take: input.query.take,
      select: {
        id: true,
        name: true,
        company: true,
        phone: true,
        balance: true,
        isActive: true,
        purchases: {
          where: { deletedAt: null, status: { not: 'CANCELED' } },
          select: { total: true, paidTotal: true, purchasedAt: true },
          orderBy: { purchasedAt: 'desc' },
        },
      },
    }),
    db.supplier.count({ where }),
    db.supplier.aggregate({
      where: { storeId: input.storeId, deletedAt: null, balance: { gt: 0 } },
      _sum: { balance: true },
      _count: true,
    }),
  ]);

  return {
    total,
    summary: {
      totalPayable: fromDb(payable._sum.balance),
      creditorCount: payable._count,
    },
    rows: suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      company: supplier.company,
      phone: supplier.phone,
      balance: fromDb(supplier.balance),
      totalPurchases: supplier.purchases.reduce((sum, row) => sum + fromDb(row.total), 0),
      totalPaid: supplier.purchases.reduce((sum, row) => sum + fromDb(row.paidTotal), 0),
      purchaseCount: supplier.purchases.length,
      lastPurchaseAt: supplier.purchases[0]?.purchasedAt ?? null,
      isActive: supplier.isActive,
    })),
  };
}

export interface SupplierDetail {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  note: string | null;
  balance: Money;
  isActive: boolean;
  createdAt: Date;
  stats: {
    totalPurchases: Money;
    totalPaid: Money;
    purchaseCount: number;
    lastPurchaseAt: Date | null;
  };
  purchases: Array<{
    id: string;
    number: string;
    reference: string | null;
    total: Money;
    dueTotal: Money;
    status: PurchaseStatus;
    purchasedAt: Date;
    itemCount: number;
  }>;
  ledger: Array<{
    id: string;
    type: PartyLedgerType;
    amount: Money;
    balanceAfter: Money;
    description: string | null;
    occurredAt: Date;
    userName: string;
  }>;
}

export async function getSupplier(
  storeId: string,
  supplierId: string,
): Promise<SupplierDetail | null> {
  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, storeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      company: true,
      phone: true,
      email: true,
      address: true,
      note: true,
      balance: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (!supplier) return null;

  const [aggregate, purchases, ledger] = await Promise.all([
    db.purchase.aggregate({
      where: { storeId, supplierId, deletedAt: null, status: { not: 'CANCELED' } },
      _sum: { total: true, paidTotal: true },
      _count: true,
      _max: { purchasedAt: true },
    }),
    db.purchase.findMany({
      where: { storeId, supplierId, deletedAt: null },
      orderBy: { purchasedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        number: true,
        reference: true,
        total: true,
        dueTotal: true,
        status: true,
        purchasedAt: true,
        _count: { select: { items: true } },
      },
    }),
    db.supplierLedgerEntry.findMany({
      where: { storeId, supplierId },
      orderBy: { occurredAt: 'desc' },
      take: 40,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        description: true,
        occurredAt: true,
        userId: true,
      },
    }),
  ]);

  const userIds = [...new Set(ledger.map((entry) => entry.userId).filter(Boolean))] as string[];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  return {
    id: supplier.id,
    name: supplier.name,
    company: supplier.company,
    phone: supplier.phone,
    email: supplier.email,
    address: supplier.address,
    note: supplier.note,
    balance: fromDb(supplier.balance),
    isActive: supplier.isActive,
    createdAt: supplier.createdAt,
    stats: {
      totalPurchases: fromDb(aggregate._sum.total),
      totalPaid: fromDb(aggregate._sum.paidTotal),
      purchaseCount: aggregate._count,
      lastPurchaseAt: aggregate._max.purchasedAt,
    },
    purchases: purchases.map((purchase) => ({
      id: purchase.id,
      number: purchase.number,
      reference: purchase.reference,
      total: fromDb(purchase.total),
      dueTotal: fromDb(purchase.dueTotal),
      status: purchase.status,
      purchasedAt: purchase.purchasedAt,
      itemCount: purchase._count.items,
    })),
    ledger: ledger.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: fromDb(entry.amount),
      balanceAfter: fromDb(entry.balanceAfter),
      description: entry.description,
      occurredAt: entry.occurredAt,
      userName: entry.userId ? (names.get(entry.userId) ?? '—') : 'النظام',
    })),
  };
}

// ── Purchases ────────────────────────────────────────────────────────────────

export interface PurchaseListRow {
  id: string;
  number: string;
  reference: string | null;
  supplierName: string;
  supplierId: string;
  total: Money;
  paidTotal: Money;
  dueTotal: Money;
  status: PurchaseStatus;
  itemCount: number;
  purchasedAt: Date;
  receivedAt: Date | null;
  branchName: string;
}

export async function listPurchases(input: {
  storeId: string;
  branchId: string | null;
  query: ParsedTableQuery;
  status?: string;
  supplierId?: string;
}): Promise<{
  rows: PurchaseListRow[];
  total: number;
  totals: { purchases: Money; due: Money };
}> {
  const where: Prisma.PurchaseWhereInput = {
    storeId: input.storeId,
    deletedAt: null,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.status && input.status !== 'all'
      ? { status: input.status as PurchaseStatus }
      : {}),
    ...(input.supplierId && input.supplierId !== 'all' ? { supplierId: input.supplierId } : {}),
  };

  if (input.query.search) {
    where.OR = [
      { number: { contains: input.query.search, mode: 'insensitive' } },
      { reference: { contains: input.query.search, mode: 'insensitive' } },
      { supplier: { name: { contains: input.query.search, mode: 'insensitive' } } },
    ];
  }

  const [rows, total, aggregate] = await Promise.all([
    db.purchase.findMany({
      where,
      orderBy: { purchasedAt: input.query.dir },
      skip: input.query.skip,
      take: input.query.take,
      select: {
        id: true,
        number: true,
        reference: true,
        total: true,
        paidTotal: true,
        dueTotal: true,
        status: true,
        purchasedAt: true,
        receivedAt: true,
        supplier: { select: { id: true, name: true } },
        branch: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.purchase.count({ where }),
    db.purchase.aggregate({ where, _sum: { total: true, dueTotal: true } }),
  ]);

  return {
    total,
    totals: {
      purchases: fromDb(aggregate._sum.total),
      due: fromDb(aggregate._sum.dueTotal),
    },
    rows: rows.map((row) => ({
      id: row.id,
      number: row.number,
      reference: row.reference,
      supplierName: row.supplier.name,
      supplierId: row.supplier.id,
      total: fromDb(row.total),
      paidTotal: fromDb(row.paidTotal),
      dueTotal: fromDb(row.dueTotal),
      status: row.status,
      itemCount: row._count.items,
      purchasedAt: row.purchasedAt,
      receivedAt: row.receivedAt,
      branchName: row.branch.name,
    })),
  };
}

export async function getPurchase(storeId: string, purchaseId: string) {
  const purchase = await db.purchase.findFirst({
    where: { id: purchaseId, storeId, deletedAt: null },
    select: {
      id: true,
      number: true,
      reference: true,
      status: true,
      note: true,
      subtotal: true,
      discountTotal: true,
      extraCosts: true,
      taxTotal: true,
      total: true,
      paidTotal: true,
      dueTotal: true,
      purchasedAt: true,
      receivedAt: true,
      userId: true,
      supplier: { select: { id: true, name: true, phone: true, balance: true } },
      branch: { select: { id: true, name: true } },
      items: {
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          productName: true,
          sku: true,
          unitLabel: true,
          quantityBase: true,
          displayFactor: true,
          unitCost: true,
          discount: true,
          lineTotal: true,
          landedCostPerBase: true,
          receivedQuantityBase: true,
          variantId: true,
        },
      },
      payments: {
        where: { deletedAt: null },
        orderBy: { paidAt: 'asc' },
        select: {
          id: true,
          amount: true,
          reference: true,
          paidAt: true,
          method: { select: { name: true } },
        },
      },
    },
  });

  if (!purchase) return null;

  const user = await db.user.findUnique({
    where: { id: purchase.userId },
    select: { id: true, name: true },
  });

  return {
    id: purchase.id,
    number: purchase.number,
    reference: purchase.reference,
    status: purchase.status,
    note: purchase.note,
    subtotal: fromDb(purchase.subtotal),
    discountTotal: fromDb(purchase.discountTotal),
    extraCosts: fromDb(purchase.extraCosts),
    taxTotal: fromDb(purchase.taxTotal),
    total: fromDb(purchase.total),
    paidTotal: fromDb(purchase.paidTotal),
    dueTotal: fromDb(purchase.dueTotal),
    purchasedAt: purchase.purchasedAt,
    receivedAt: purchase.receivedAt,
    createdBy: user?.name ?? '—',
    supplier: {
      id: purchase.supplier.id,
      name: purchase.supplier.name,
      phone: purchase.supplier.phone,
      balance: fromDb(purchase.supplier.balance),
    },
    branch: purchase.branch,
    items: purchase.items.map((item) => {
      const factor = factorFromDb(item.displayFactor);
      const quantity = qtyFromDb(item.quantityBase);
      return {
        id: item.id,
        variantId: item.variantId,
        productName: item.productName,
        sku: item.sku,
        unitLabel: item.unitLabel,
        quantity,
        factor,
        units: quantity / factor,
        unitCost: fromDb(item.unitCost),
        discount: fromDb(item.discount),
        lineTotal: fromDb(item.lineTotal),
        receivedUnits: qtyFromDb(item.receivedQuantityBase) / factor,
      };
    }),
    payments: purchase.payments.map((payment) => ({
      id: payment.id,
      amount: fromDb(payment.amount),
      methodName: payment.method.name,
      reference: payment.reference,
      paidAt: payment.paidAt,
    })),
  };
}

/** Supplier options for the purchase form. */
export async function listSupplierOptions(storeId: string) {
  return db.supplier.findMany({
    where: { storeId, deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, balance: true },
  });
}
