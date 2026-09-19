'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requireWritePermission } from '@/core/auth/context';
import { diffFields, recordAudit } from '@/core/audit';
import { transaction } from '@/core/db';
import { businessRule, notFound, validation } from '@/core/errors';
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from '@/core/idempotency';
import { fromDb, toDb } from '@/core/money';
import type { ActionResult } from '@/core/result';
import { storeFormatter } from '@/lib/formatter';
import { normalizePhone } from '@/lib/phone';
import { postCustomerEntry } from '@/modules/ledger/service';
import { recordPayment } from '@/modules/payments/service';
import { toFieldErrors } from '@/modules/auth/validation';

/**
 * Customer and receivable actions.
 *
 * Collecting a payment is the one that has to be exactly right: the money hits
 * the cash drawer, the customer's ledger gets an entry, and the payment is
 * applied to the oldest open invoices first — which is what makes the "المتبقي"
 * column on each invoice mean something.
 */

const customerSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2, 'أدخل اسم العميل').max(100),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s-]{7,20}$/, 'رقم هاتف غير صالح')
    .optional()
    .or(z.literal('')),
  email: z.email('بريد إلكتروني غير صالح').optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
  /** 0 means "use the store default". */
  debtLimit: z.number().int().min(0).default(0),
  ageVerified: z.boolean().default(false),
  isActive: z.boolean().default(true),
  /** Only honoured on creation. */
  openingBalance: z.number().int().default(0),
});

export type CustomerInput = z.input<typeof customerSchema>;

export async function saveCustomerAction(
  input: CustomerInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction('customers.save', async () => {
    const context = await requireWritePermission(
      input.id ? 'customers.edit' : 'customers.create',
    );
    const { store, user } = context;

    const parsed = customerSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات العميل', toFieldErrors(parsed.error));
    }
    const data = parsed.data;
    // Stored normalised: the till finds a customer by phone when recording a debt.
    const phone = data.phone ? normalizePhone(data.phone) || null : null;

    const id = await transaction(async (tx) => {
      if (phone) {
        const clash = await tx.customer.findFirst({
          where: {
            storeId: store.id,
            phone,
            deletedAt: null,
            ...(data.id ? { id: { not: data.id } } : {}),
          },
          select: { name: true },
        });
        if (clash) {
          throw validation('رقم الهاتف مستخدم', {
            phone: [`الرقم مسجل باسم ${clash.name}`],
          });
        }
      }

      if (data.id) {
        const existing = await tx.customer.findFirst({
          where: { id: data.id, storeId: store.id, deletedAt: null },
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            note: true,
            debtLimit: true,
            isActive: true,
          },
        });
        if (!existing) throw notFound('العميل');

        await tx.customer.update({
          where: { id: existing.id },
          data: {
            name: data.name,
            phone,
            email: data.email || null,
            address: data.address || null,
            note: data.note || null,
            debtLimit: BigInt(data.debtLimit),
            ageVerified: data.ageVerified,
            ageVerifiedAt: data.ageVerified ? (existing ? undefined : new Date()) : null,
            isActive: data.isActive,
          },
        });

        const diff = diffFields(
          {
            name: existing.name,
            phone: existing.phone,
            address: existing.address,
            debtLimit: Number(existing.debtLimit),
            isActive: existing.isActive,
          },
          {
            name: data.name,
            phone,
            address: data.address || null,
            debtLimit: data.debtLimit,
            isActive: data.isActive,
          },
          ['name', 'phone', 'address', 'debtLimit', 'isActive'],
        );

        if (diff.changed.length > 0) {
          await recordAudit(tx, {
            storeId: store.id,
            userId: user.id,
            action: 'customer.update',
            entityType: 'customer',
            entityId: existing.id,
            summary: `تعديل بيانات العميل: ${data.name}`,
            before: diff.before,
            after: diff.after,
          });
        }

        return existing.id;
      }

      const created = await tx.customer.create({
        data: {
          storeId: store.id,
          name: data.name,
          phone,
          email: data.email || null,
          address: data.address || null,
          note: data.note || null,
          debtLimit: BigInt(data.debtLimit),
          ageVerified: data.ageVerified,
          ageVerifiedAt: data.ageVerified ? new Date() : null,
          isActive: data.isActive,
        },
        select: { id: true },
      });

      // An opening balance is a documented ledger entry, never a bare number
      // written into the balance column.
      if (data.openingBalance !== 0) {
        await postCustomerEntry(tx, created.id, {
          storeId: store.id,
          type: 'OPENING_BALANCE',
          amount: data.openingBalance,
          description: 'رصيد افتتاحي عند إضافة العميل',
          userId: user.id,
        });
      }

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'customer.create',
        entityType: 'customer',
        entityId: created.id,
        summary: `إضافة عميل جديد: ${data.name}`,
        after: { name: data.name, phone, openingBalance: data.openingBalance },
      });

      return created.id;
    });

    revalidatePath('/customers');
    revalidatePath(`/customers/${id}`);
    revalidatePath('/debts');
    return { id };
  });
}

export async function deactivateCustomerAction(
  customerId: string,
): Promise<ActionResult<void>> {
  return runAction('customers.deactivate', async () => {
    const { store, user } = await requireWritePermission('customers.delete');

    await transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: customerId, storeId: store.id, deletedAt: null },
        select: { id: true, name: true, balance: true },
      });
      if (!customer) throw notFound('العميل');

      if (fromDb(customer.balance) !== 0) {
        throw businessRule(
          'لا يمكن حذف عميل عليه رصيد. سوِّ الحساب أولاً ثم أعد المحاولة.',
        );
      }

      // Soft delete — invoices and ledger entries still reference this row.
      await tx.customer.update({
        where: { id: customer.id },
        data: { isActive: false, deletedAt: new Date() },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'customer.delete',
        entityType: 'customer',
        entityId: customer.id,
        summary: `حذف العميل: ${customer.name}`,
      });
    });

    revalidatePath('/customers');
  });
}

// ── Debt collection ──────────────────────────────────────────────────────────

const collectSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  customerId: z.string().min(1),
  amount: z.number().int().positive('أدخل مبلغاً أكبر من صفر'),
  methodId: z.string().min(1, 'اختر طريقة الدفع'),
  reference: z.string().max(80).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export interface CollectionResult {
  paymentId: string;
  amount: number;
  newBalance: number;
  /** Invoices the payment was applied to, oldest first. */
  settled: Array<{ number: string; applied: number; remaining: number }>;
}

export async function collectDebtAction(
  input: z.input<typeof collectSchema>,
): Promise<ActionResult<CollectionResult>> {
  return runAction('debts.collect', async () => {
    const { store, user } = await requireWritePermission('debts.collect');

    const parsed = collectSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات الدفعة', toFieldErrors(parsed.error));
    }
    const data = parsed.data;

    const result = await transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx, {
        storeId: store.id,
        scope: 'payment.create',
        key: data.idempotencyKey,
        requestHash: hashRequest({
          customerId: data.customerId,
          amount: data.amount,
          methodId: data.methodId,
        }),
      });

      if (claim.status === 'duplicate' && claim.resultId) {
        const existing = await tx.payment.findUniqueOrThrow({
          where: { id: claim.resultId },
          select: { id: true, amount: true, customer: { select: { balance: true } } },
        });
        return {
          paymentId: existing.id,
          amount: fromDb(existing.amount),
          newBalance: fromDb(existing.customer?.balance ?? 0n),
          settled: [],
        };
      }

      const customer = await tx.customer.findFirst({
        where: { id: data.customerId, storeId: store.id, deletedAt: null },
        select: { id: true, name: true, balance: true },
      });
      if (!customer) throw notFound('العميل');

      const balance = fromDb(customer.balance);
      if (balance <= 0) {
        throw businessRule('لا يوجد رصيد مستحق على هذا العميل.');
      }
      if (data.amount > balance) {
        throw businessRule(
          'المبلغ أكبر من الرصيد المستحق. أدخل مبلغاً مساوياً للرصيد أو أقل منه.',
        );
      }

      const shift = await tx.shift.findFirst({
        where: { storeId: store.id, branchId: store.branch.id, userId: user.id, status: 'OPEN' },
        select: { id: true },
      });

      const payment = await recordPayment(tx, {
        storeId: store.id,
        branchId: store.branch.id,
        userId: user.id,
        shiftId: shift?.id ?? null,
        direction: 'IN',
        source: 'CUSTOMER_DEBT',
        amount: data.amount,
        methodId: data.methodId,
        reference: data.reference ?? null,
        note: data.note ?? null,
        customerId: customer.id,
        postToLedger: true,
        ledgerDescription: 'تحصيل دفعة من الرصيد',
      });

      // Apply oldest-first, so each invoice's "المتبقي" reflects reality.
      const openInvoices = await tx.sale.findMany({
        where: { storeId: store.id, customerId: customer.id, deletedAt: null, dueTotal: { gt: 0 } },
        orderBy: { soldAt: 'asc' },
        select: { id: true, number: true, dueTotal: true, paidTotal: true },
      });

      let remaining = data.amount;
      const settled: CollectionResult['settled'] = [];

      for (const invoice of openInvoices) {
        if (remaining <= 0) break;
        const due = fromDb(invoice.dueTotal);
        const applied = Math.min(due, remaining);

        await tx.sale.update({
          where: { id: invoice.id },
          data: {
            dueTotal: toDb(due - applied),
            paidTotal: toDb(fromDb(invoice.paidTotal) + applied),
          },
        });

        settled.push({ number: invoice.number, applied, remaining: due - applied });
        remaining -= applied;
      }

      if (shift) {
        await tx.shift.update({
          where: { id: shift.id },
          data: { collectionsTotal: { increment: toDb(data.amount) } },
        });
      }

      await completeIdempotencyKey(tx, {
        storeId: store.id,
        scope: 'payment.create',
        key: data.idempotencyKey,
        resultId: payment.paymentId,
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'debt.collect',
        entityType: 'payment',
        entityId: payment.paymentId,
        summary: `تحصيل ${storeFormatter(store.settings).money(data.amount)} من العميل ${customer.name}`,
        after: {
          amount: data.amount,
          customer: customer.name,
          balanceBefore: balance,
          balanceAfter: balance - data.amount,
          invoices: settled.map((entry) => entry.number),
        },
      });

      return {
        paymentId: payment.paymentId,
        amount: data.amount,
        newBalance: balance - data.amount,
        settled,
      };
    });

    revalidatePath('/debts');
    revalidatePath('/customers');
    revalidatePath(`/customers/${data.customerId}`);
    revalidatePath('/cashbox');
    revalidatePath('/dashboard');

    return result;
  });
}

// ── Manual balance adjustment ────────────────────────────────────────────────

const adjustSchema = z.object({
  customerId: z.string().min(1),
  /** Signed: positive increases what the customer owes. */
  amount: z.number().int(),
  reason: z.string().trim().min(3, 'اذكر سبب التسوية').max(300),
});

export async function adjustCustomerBalanceAction(
  input: z.input<typeof adjustSchema>,
): Promise<ActionResult<{ newBalance: number }>> {
  return runAction('customers.adjustBalance', async () => {
    const { store, user } = await requireWritePermission('debts.adjust');

    const parsed = adjustSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    if (data.amount === 0) throw businessRule('أدخل مبلغاً غير صفري.');

    const newBalance = await transaction(async (tx) => {
      const customer = await tx.customer.findFirst({
        where: { id: data.customerId, storeId: store.id, deletedAt: null },
        select: { id: true, name: true, balance: true },
      });
      if (!customer) throw notFound('العميل');

      const entry = await postCustomerEntry(tx, customer.id, {
        storeId: store.id,
        type: 'ADJUSTMENT',
        amount: data.amount,
        description: data.reason,
        userId: user.id,
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'customer.balance_adjust',
        entityType: 'customer',
        entityId: customer.id,
        summary: `تسوية رصيد العميل ${customer.name} بمقدار ${storeFormatter(store.settings).money(
          data.amount,
          { signed: true },
        )}`,
        before: { balance: fromDb(customer.balance) },
        after: { balance: entry.balanceAfter, reason: data.reason },
      });

      return entry.balanceAfter;
    });

    revalidatePath('/debts');
    revalidatePath(`/customers/${data.customerId}`);
    return { newBalance };
  });
}
