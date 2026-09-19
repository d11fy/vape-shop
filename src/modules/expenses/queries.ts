import 'server-only';

import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { fromDb, type Money } from '@/core/money';
import type { ParsedTableQuery } from '@/lib/table-query';
import type { DateRange } from '@/core/datetime';

/**
 * Expense queries.
 *
 * Expenses are what turn "مبيعات" into "ربح", so the list always carries its
 * period totals and a breakdown by category — an owner opening this page wants
 * the shape of their spending, not just a list of rows.
 */

export interface ExpenseRow {
  id: string;
  amount: Money;
  description: string;
  note: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string | null;
  methodName: string | null;
  userName: string;
  branchName: string;
  receiptUrl: string | null;
  spentAt: Date;
}

export interface ExpenseResult {
  rows: ExpenseRow[];
  total: number;
  totals: { amount: Money; count: number; average: Money };
  byCategory: Array<{ id: string; name: string; color: string | null; amount: Money }>;
}

export async function listExpenses(input: {
  storeId: string;
  branchId: string | null;
  query: ParsedTableQuery;
  range?: DateRange;
  categoryId?: string;
  userId?: string;
}): Promise<ExpenseResult> {
  const where: Prisma.ExpenseWhereInput = {
    storeId: input.storeId,
    deletedAt: null,
    ...(input.branchId ? { branchId: input.branchId } : {}),
    ...(input.categoryId && input.categoryId !== 'all' ? { categoryId: input.categoryId } : {}),
    ...(input.userId && input.userId !== 'all' ? { userId: input.userId } : {}),
    ...(input.range ? { spentAt: { gte: input.range.from, lt: input.range.to } } : {}),
  };

  if (input.query.search) {
    where.OR = [
      { description: { contains: input.query.search, mode: 'insensitive' } },
      { note: { contains: input.query.search, mode: 'insensitive' } },
    ];
  }

  const orderBy: Prisma.ExpenseOrderByWithRelationInput =
    input.query.sort === 'amount'
      ? { amount: input.query.dir }
      : { spentAt: input.query.dir };

  const [rows, total, aggregate, grouped] = await Promise.all([
    db.expense.findMany({
      where,
      orderBy,
      skip: input.query.skip,
      take: input.query.take,
      select: {
        id: true,
        amount: true,
        description: true,
        note: true,
        receiptUrl: true,
        spentAt: true,
        userId: true,
        category: { select: { id: true, name: true, color: true } },
        method: { select: { name: true } },
        branch: { select: { name: true } },
      },
    }),
    db.expense.count({ where }),
    db.expense.aggregate({ where, _sum: { amount: true }, _count: true }),
    db.expense.groupBy({
      by: ['categoryId'],
      where,
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
    }),
  ]);

  const userIds = [...new Set(rows.map((row) => row.userId))];
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const names = new Map(users.map((user) => [user.id, user.name]));

  const categoryIds = grouped.map((row) => row.categoryId);
  const categories = categoryIds.length
    ? await db.expenseCategory.findMany({
        where: { id: { in: categoryIds } },
        select: { id: true, name: true, color: true },
      })
    : [];
  const categoryIndex = new Map(categories.map((category) => [category.id, category]));

  const amount = fromDb(aggregate._sum.amount);
  const count = aggregate._count;

  return {
    total,
    totals: {
      amount,
      count,
      average: count > 0 ? Math.round(amount / count) : 0,
    },
    byCategory: grouped.map((row) => ({
      id: row.categoryId,
      name: categoryIndex.get(row.categoryId)?.name ?? '—',
      color: categoryIndex.get(row.categoryId)?.color ?? null,
      amount: fromDb(row._sum.amount),
    })),
    rows: rows.map((row) => ({
      id: row.id,
      amount: fromDb(row.amount),
      description: row.description,
      note: row.note,
      categoryId: row.category.id,
      categoryName: row.category.name,
      categoryColor: row.category.color,
      methodName: row.method?.name ?? null,
      userName: names.get(row.userId) ?? '—',
      branchName: row.branch.name,
      receiptUrl: row.receiptUrl,
      spentAt: row.spentAt,
    })),
  };
}

export async function listExpenseCategories(storeId: string) {
  return db.expenseCategory.findMany({
    where: { storeId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      color: true,
      icon: true,
      isActive: true,
      isSystem: true,
      _count: { select: { expenses: { where: { deletedAt: null } } } },
    },
  });
}

export async function getExpense(storeId: string, expenseId: string) {
  const expense = await db.expense.findFirst({
    where: { id: expenseId, storeId, deletedAt: null },
    select: {
      id: true,
      amount: true,
      description: true,
      note: true,
      receiptUrl: true,
      spentAt: true,
      categoryId: true,
      methodId: true,
    },
  });

  if (!expense) return null;

  return {
    id: expense.id,
    amount: fromDb(expense.amount),
    description: expense.description,
    note: expense.note ?? '',
    receiptUrl: expense.receiptUrl ?? '',
    spentAt: expense.spentAt,
    categoryId: expense.categoryId,
    methodId: expense.methodId,
  };
}
