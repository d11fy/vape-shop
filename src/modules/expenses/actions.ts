'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requireWritePermission } from '@/core/auth/context';
import { recordAudit } from '@/core/audit';
import { transaction } from '@/core/db';
import { businessRule, notFound, validation } from '@/core/errors';
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from '@/core/idempotency';
import { fromDb, toDb } from '@/core/money';
import type { ActionResult } from '@/core/result';
import { storeFormatter } from '@/lib/formatter';
import { getBranchCashbox, postCashMovement } from '@/modules/cashbox/service';
import { recordExpense } from './service';
import { toFieldErrors } from '@/modules/auth/validation';

/**
 * Expense actions.
 *
 * A cash expense takes money out of the drawer, so it posts a cashbox movement
 * in the same transaction. Editing or deleting one reverses that movement
 * rather than quietly rewriting history — the drawer must always reconcile.
 */

const expenseSchema = z.object({
  id: z.string().optional().nullable(),
  idempotencyKey: z.string().min(8).max(80).optional(),
  categoryId: z.string().min(1, 'اختر فئة المصروف'),
  methodId: z.string().min(1).optional().nullable(),
  amount: z.number().int().positive('أدخل مبلغاً أكبر من صفر'),
  description: z.string().trim().min(2, 'أدخل وصف المصروف').max(200),
  note: z.string().trim().max(500).optional().or(z.literal('')),
  receiptUrl: z.string().trim().max(500).optional().or(z.literal('')),
  spentAt: z.string().optional().nullable(),
});

export type ExpenseInput = z.input<typeof expenseSchema>;

export async function saveExpenseAction(
  input: ExpenseInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction('expenses.save', async () => {
    const { store, user } = await requireWritePermission(
      input.id ? 'expenses.edit' : 'expenses.create',
    );

    const parsed = expenseSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات المصروف', toFieldErrors(parsed.error));
    }
    const data = parsed.data;
    const spentAt = data.spentAt ? new Date(data.spentAt) : new Date();

    const id = await transaction(async (tx) => {
      const category = await tx.expenseCategory.findFirst({
        where: { id: data.categoryId, storeId: store.id },
        select: { id: true, name: true },
      });
      if (!category) throw notFound('فئة المصروف');

      const method = data.methodId
        ? await tx.paymentMethod.findFirst({
            where: { id: data.methodId, storeId: store.id },
            select: { id: true, name: true, affectsCashbox: true },
          })
        : null;

      // ── Edit ──────────────────────────────────────────────────────────────
      if (data.id) {
        const existing = await tx.expense.findFirst({
          where: { id: data.id, storeId: store.id, deletedAt: null },
          select: {
            id: true,
            amount: true,
            description: true,
            categoryId: true,
            methodId: true,
            branchId: true,
            spentAt: true,
            method: { select: { affectsCashbox: true } },
          },
        });
        if (!existing) throw notFound('المصروف');

        const previousAmount = fromDb(existing.amount);
        const cashbox = await getBranchCashbox(tx, store.id, existing.branchId);

        // Reverse the old cash effect, then apply the new one — two documented
        // movements instead of one silent correction.
        if (existing.method?.affectsCashbox) {
          await postCashMovement(tx, {
            storeId: store.id,
            cashboxId: cashbox.id,
            type: 'ADJUSTMENT',
            amount: previousAmount,
            referenceType: 'expense_edit',
            referenceId: existing.id,
            userId: user.id,
            description: `عكس مصروف قبل التعديل: ${existing.description}`,
          });
        }

        await tx.expense.update({
          where: { id: existing.id },
          data: {
            categoryId: data.categoryId,
            methodId: method?.id ?? null,
            amount: toDb(data.amount),
            description: data.description,
            note: data.note || null,
            receiptUrl: data.receiptUrl || null,
            spentAt,
          },
        });

        if (method?.affectsCashbox) {
          await postCashMovement(tx, {
            storeId: store.id,
            cashboxId: cashbox.id,
            type: 'EXPENSE',
            amount: -data.amount,
            referenceType: 'expense',
            referenceId: existing.id,
            userId: user.id,
            description: data.description,
            occurredAt: spentAt,
          });
        }

        await recordAudit(tx, {
          storeId: store.id,
          userId: user.id,
          action: 'expense.update',
          entityType: 'expense',
          entityId: existing.id,
          summary: `تعديل مصروف: ${data.description}`,
          before: { amount: previousAmount, description: existing.description },
          after: { amount: data.amount, description: data.description },
        });

        return existing.id;
      }

      // ── Create ────────────────────────────────────────────────────────────
      if (data.idempotencyKey) {
        const claim = await claimIdempotencyKey(tx, {
          storeId: store.id,
          scope: 'expense.create',
          key: data.idempotencyKey,
          requestHash: hashRequest({
            amount: data.amount,
            description: data.description,
            categoryId: data.categoryId,
          }),
        });
        if (claim.status === 'duplicate' && claim.resultId) return claim.resultId;
      }

      const { expenseId } = await recordExpense(tx, {
        storeId: store.id,
        branchId: store.branch.id,
        userId: user.id,
        categoryId: category.id,
        method: method ? { id: method.id, affectsCashbox: method.affectsCashbox } : null,
        amount: data.amount,
        description: data.description,
        note: data.note,
        receiptUrl: data.receiptUrl,
        spentAt,
      });
      const expense = { id: expenseId };

      if (data.idempotencyKey) {
        await completeIdempotencyKey(tx, {
          storeId: store.id,
          scope: 'expense.create',
          key: data.idempotencyKey,
          resultId: expense.id,
        });
      }

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'expense.create',
        entityType: 'expense',
        entityId: expense.id,
        summary: `تسجيل مصروف ${storeFormatter(store.settings).money(data.amount)} — ${data.description}`,
        after: {
          amount: data.amount,
          category: category.name,
          method: method?.name ?? 'بدون',
          description: data.description,
        },
      });

      return expense.id;
    });

    revalidatePath('/expenses');
    revalidatePath('/cashbox');
    revalidatePath('/dashboard');
    return { id };
  });
}

export async function deleteExpenseAction(expenseId: string): Promise<ActionResult<void>> {
  return runAction('expenses.delete', async () => {
    const { store, user } = await requireWritePermission('expenses.delete');

    await transaction(async (tx) => {
      const expense = await tx.expense.findFirst({
        where: { id: expenseId, storeId: store.id, deletedAt: null },
        select: {
          id: true,
          amount: true,
          description: true,
          branchId: true,
          method: { select: { affectsCashbox: true } },
        },
      });
      if (!expense) throw notFound('المصروف');

      // Put the cash back before hiding the record.
      if (expense.method?.affectsCashbox) {
        const cashbox = await getBranchCashbox(tx, store.id, expense.branchId);
        await postCashMovement(tx, {
          storeId: store.id,
          cashboxId: cashbox.id,
          type: 'ADJUSTMENT',
          amount: fromDb(expense.amount),
          referenceType: 'expense_delete',
          referenceId: expense.id,
          userId: user.id,
          description: `حذف مصروف: ${expense.description}`,
        });
      }

      // Soft delete — the movement above references this row.
      await tx.expense.update({
        where: { id: expense.id },
        data: { deletedAt: new Date() },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'expense.delete',
        entityType: 'expense',
        entityId: expense.id,
        summary: `حذف مصروف ${storeFormatter(store.settings).money(fromDb(expense.amount))} — ${expense.description}`,
        before: { amount: fromDb(expense.amount), description: expense.description },
      });
    });

    revalidatePath('/expenses');
    revalidatePath('/cashbox');
    revalidatePath('/dashboard');
  });
}

// ── Categories ───────────────────────────────────────────────────────────────

const categorySchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2, 'أدخل اسم الفئة').max(60),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'لون غير صالح')
    .optional()
    .or(z.literal('')),
  isActive: z.boolean().default(true),
});

export async function saveExpenseCategoryAction(
  input: z.input<typeof categorySchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction('expenses.saveCategory', async () => {
    const { store, user } = await requireWritePermission('expenses.manage_categories');

    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    const id = await transaction(async (tx) => {
      const duplicate = await tx.expenseCategory.findFirst({
        where: {
          storeId: store.id,
          name: data.name,
          ...(data.id ? { id: { not: data.id } } : {}),
        },
        select: { id: true },
      });
      if (duplicate) throw validation('يوجد فئة بنفس الاسم', { name: ['الاسم مستخدم'] });

      if (data.id) {
        const current = await tx.expenseCategory.findFirst({
          where: { id: data.id, storeId: store.id },
          select: { id: true, name: true, isActive: true },
        });
        if (!current) throw notFound('الفئة');

        await tx.expenseCategory.update({
          where: { id: current.id },
          data: { name: data.name, color: data.color || null, isActive: data.isActive },
        });

        await recordAudit(tx, {
          storeId: store.id,
          userId: user.id,
          action: 'expense_category.update',
          entityType: 'expense_category',
          entityId: current.id,
          summary: `تعديل فئة مصاريف: ${data.name}`,
          before: { name: current.name, isActive: current.isActive },
          after: { name: data.name, isActive: data.isActive },
        });
        return current.id;
      }

      const created = await tx.expenseCategory.create({
        data: {
          storeId: store.id,
          name: data.name,
          color: data.color || null,
          isActive: data.isActive,
          sortOrder: await tx.expenseCategory.count({ where: { storeId: store.id } }),
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'expense_category.create',
        entityType: 'expense_category',
        entityId: created.id,
        summary: `إضافة فئة مصاريف: ${data.name}`,
      });
      return created.id;
    });

    revalidatePath('/expenses/categories');
    revalidatePath('/expenses');
    return { id };
  });
}

export async function deleteExpenseCategoryAction(
  categoryId: string,
): Promise<ActionResult<void>> {
  return runAction('expenses.deleteCategory', async () => {
    const { store, user } = await requireWritePermission('expenses.manage_categories');

    await transaction(async (tx) => {
      const category = await tx.expenseCategory.findFirst({
        where: { id: categoryId, storeId: store.id },
        select: { id: true, name: true, isSystem: true, _count: { select: { expenses: true } } },
      });
      if (!category) throw notFound('الفئة');

      // The default set (rent, salaries, electricity…) is what the reports and
      // the setup rely on; it can be switched off but not removed.
      if (category.isSystem) {
        throw businessRule('هذه فئة أساسية لا يمكن حذفها — يمكنك تعطيلها إن لم تكن تستخدمها.');
      }

      // Counts soft-deleted expenses too: their history still points here.
      if (category._count.expenses > 0) {
        throw businessRule('لا يمكن حذف الفئة لأنها مستخدمة في مصاريف مسجلة. عطّلها بدلاً من حذفها.');
      }

      await tx.expenseCategory.delete({ where: { id: category.id } });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'expense_category.delete',
        entityType: 'expense_category',
        entityId: category.id,
        summary: `حذف فئة مصاريف: ${category.name}`,
      });
    });

    revalidatePath('/expenses/categories');
  });
}
