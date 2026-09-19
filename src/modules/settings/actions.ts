'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requireWritePermission } from '@/core/auth/context';
import { diffFields, recordAudit } from '@/core/audit';
import { currencyDecimals } from '@/core/currency';
import { describeChangedFields } from '@/lib/audit-fields';
import { assertCurrencyChangeAllowed } from './currency-guard';
import { transaction } from '@/core/db';
import { businessRule, notFound, planLimit, validation } from '@/core/errors';
import { qtyToDb } from '@/core/quantity';
import type { ActionResult } from '@/core/result';
import { toFieldErrors } from '@/modules/auth/validation';

/**
 * Store configuration.
 *
 * Currency and tax settings change how every future figure is computed, so they
 * are audited with their previous values — and the currency's decimal places
 * are derived from the code rather than typed, because a Kuwaiti dinar has
 * three and getting that wrong corrupts every amount entered afterwards.
 */

const storeSettingsSchema = z.object({
  name: z.string().trim().min(2, 'أدخل اسم المحل').max(80),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  email: z.email('بريد إلكتروني غير صالح').optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  logoUrl: z.string().trim().max(500).optional().or(z.literal('')),

  currency: z.string().trim().length(3),
  timezone: z.string().trim().min(3).max(60),

  taxEnabled: z.boolean().default(false),
  taxRatePercent: z.number().min(0).max(100).default(15),
  taxInclusive: z.boolean().default(true),
  taxNumber: z.string().trim().max(40).optional().or(z.literal('')),

  invoicePrefix: z
    .string()
    .trim()
    .min(1, 'أدخل بادئة الفاتورة')
    .max(8)
    .regex(/^[A-Za-z0-9-]+$/, 'استخدم حروفاً إنجليزية أو أرقاماً فقط'),
  invoicePadding: z.number().int().min(3).max(10).default(6),
  receiptWidthMm: z.number().int().min(50).max(120).default(80),
  receiptFooterAr: z.string().trim().max(200).default(''),
  showLogoOnReceipt: z.boolean().default(true),

  lowStockAlerts: z.boolean().default(true),
  negativeStockAllowed: z.boolean().default(false),

  debtEnabled: z.boolean().default(true),
  defaultDebtLimit: z.number().int().min(0).default(0),
  debtOverdueDays: z.number().int().min(1).max(365).default(30),

  ageVerificationEnabled: z.boolean().default(true),
  minimumCustomerAge: z.number().int().min(15).max(25).default(18),
  ageNoticeAr: z.string().trim().max(200).default(''),
  requireAgeCheckAtSale: z.boolean().default(false),
});

export type StoreSettingsInput = z.input<typeof storeSettingsSchema>;

export async function saveStoreSettingsAction(
  input: StoreSettingsInput,
): Promise<ActionResult<void>> {
  return runAction('settings.save', async () => {
    const { store, user } = await requireWritePermission('settings.manage');

    const parsed = storeSettingsSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من الإعدادات', toFieldErrors(parsed.error));
    }
    const data = parsed.data;

    await transaction(async (tx) => {
      const existing = await tx.storeSettings.findUniqueOrThrow({
        where: { storeId: store.id },
        select: {
          currency: true,
          currencyDecimals: true,
          taxEnabled: true,
          taxRateBps: true,
          taxInclusive: true,
          invoicePrefix: true,
          timezone: true,
        },
      });

      await assertCurrencyChangeAllowed(tx, store.id, existing.currency, data.currency);

      await tx.store.update({
        where: { id: store.id },
        data: {
          name: data.name,
          phone: data.phone || null,
          email: data.email || null,
          address: data.address || null,
          city: data.city || null,
          logoUrl: data.logoUrl || null,
        },
      });

      await tx.storeSettings.update({
        where: { storeId: store.id },
        data: {
          currency: data.currency,
          // Derived, never typed: 2 for SAR, 3 for KWD, and so on.
          currencyDecimals: currencyDecimals(data.currency),
          timezone: data.timezone,
          taxEnabled: data.taxEnabled,
          taxRateBps: Math.round(data.taxRatePercent * 100),
          taxInclusive: data.taxInclusive,
          taxNumber: data.taxNumber || null,
          invoicePrefix: data.invoicePrefix.toUpperCase(),
          invoicePadding: data.invoicePadding,
          receiptWidthMm: data.receiptWidthMm,
          receiptFooterAr: data.receiptFooterAr,
          showLogoOnReceipt: data.showLogoOnReceipt,
          lowStockAlerts: data.lowStockAlerts,
          negativeStockAllowed: data.negativeStockAllowed,
          debtEnabled: data.debtEnabled,
          defaultDebtLimit: BigInt(data.defaultDebtLimit),
          debtOverdueDays: data.debtOverdueDays,
          ageVerificationEnabled: data.ageVerificationEnabled,
          minimumCustomerAge: data.minimumCustomerAge,
          ageNoticeAr: data.ageNoticeAr,
          requireAgeCheckAtSale: data.requireAgeCheckAtSale,
        },
      });

      const diff = diffFields(
        {
          currency: existing.currency,
          taxEnabled: existing.taxEnabled,
          taxRateBps: existing.taxRateBps,
          taxInclusive: existing.taxInclusive,
          invoicePrefix: existing.invoicePrefix,
          timezone: existing.timezone,
        },
        {
          currency: data.currency,
          taxEnabled: data.taxEnabled,
          taxRateBps: Math.round(data.taxRatePercent * 100),
          taxInclusive: data.taxInclusive,
          invoicePrefix: data.invoicePrefix.toUpperCase(),
          timezone: data.timezone,
        },
        ['currency', 'taxEnabled', 'taxRateBps', 'taxInclusive', 'invoicePrefix', 'timezone'],
      );

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'settings.update',
        entityType: 'store_settings',
        entityId: store.id,
        summary:
          diff.changed.length > 0
            ? `تعديل إعدادات المتجر: ${describeChangedFields(diff.changed)}`
            : 'تعديل بيانات المتجر',
        before: diff.before,
        after: diff.after,
      });
    });

    revalidatePath('/settings');
    revalidatePath('/', 'layout');
  });
}

// ── Branches ─────────────────────────────────────────────────────────────────

const branchSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2, 'أدخل اسم الفرع').max(60),
  code: z
    .string()
    .trim()
    .min(2, 'أدخل كود الفرع')
    .max(12)
    .regex(/^[A-Za-z0-9-]+$/, 'استخدم حروفاً إنجليزية أو أرقاماً فقط'),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});

export async function saveBranchAction(
  input: z.input<typeof branchSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction('settings.saveBranch', async () => {
    const { store, user } = await requireWritePermission('settings.branches');

    const parsed = branchSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من بيانات الفرع', toFieldErrors(parsed.error));
    const data = parsed.data;
    const code = data.code.toUpperCase();

    const id = await transaction(async (tx) => {
      const clash = await tx.branch.findFirst({
        where: {
          storeId: store.id,
          code,
          deletedAt: null,
          ...(data.id ? { id: { not: data.id } } : {}),
        },
        select: { id: true },
      });
      if (clash) throw validation('كود الفرع مستخدم', { code: ['هذا الكود مستخدم لفرع آخر'] });

      if (data.id) {
        await tx.branch.updateMany({
          where: { id: data.id, storeId: store.id },
          data: {
            name: data.name,
            code,
            phone: data.phone || null,
            address: data.address || null,
            isActive: data.isActive,
          },
        });
        return data.id;
      }

      // Branch count is a plan limit, enforced here rather than in the UI.
      const limit = store.subscription.limits.maxBranches;
      if (limit !== null) {
        const count = await tx.branch.count({ where: { storeId: store.id, deletedAt: null } });
        if (count >= limit) {
          throw planLimit(
            `خطتك تسمح بـ ${limit} ${limit === 1 ? 'فرع واحد' : 'فروع'} فقط. قم بترقية الاشتراك لإضافة المزيد.`,
            { limit, count },
          );
        }
      }

      const created = await tx.branch.create({
        data: {
          storeId: store.id,
          name: data.name,
          code,
          phone: data.phone || null,
          address: data.address || null,
          isActive: data.isActive,
        },
        select: { id: true },
      });

      // Every branch needs its own drawer from the moment it exists.
      await tx.cashbox.create({
        data: {
          storeId: store.id,
          branchId: created.id,
          name: 'الصندوق الرئيسي',
          isDefault: true,
        },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'branch.create',
        entityType: 'branch',
        entityId: created.id,
        summary: `إضافة فرع جديد: ${data.name}`,
      });

      return created.id;
    });

    revalidatePath('/settings/branches');
    revalidatePath('/', 'layout');
    return { id };
  });
}

// ── Payment methods ──────────────────────────────────────────────────────────

const methodSchema = z.object({
  id: z.string().optional().nullable(),
  name: z.string().trim().min(2, 'أدخل اسم طريقة الدفع').max(40),
  type: z.enum(['CASH', 'BANK', 'CARD', 'WALLET', 'TRANSFER', 'OTHER']),
  affectsCashbox: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export async function savePaymentMethodAction(
  input: z.input<typeof methodSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction('settings.savePaymentMethod', async () => {
    const { store, user } = await requireWritePermission('settings.payment_methods');

    const parsed = methodSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    const id = await transaction(async (tx) => {
      const clash = await tx.paymentMethod.findFirst({
        where: {
          storeId: store.id,
          name: data.name,
          ...(data.id ? { id: { not: data.id } } : {}),
        },
        select: { id: true },
      });
      if (clash) throw validation('يوجد طريقة دفع بنفس الاسم');

      // Exactly one default, so the till always has something preselected.
      if (data.isDefault) {
        await tx.paymentMethod.updateMany({
          where: { storeId: store.id },
          data: { isDefault: false },
        });
      }

      if (data.id) {
        await tx.paymentMethod.updateMany({
          where: { id: data.id, storeId: store.id },
          data: {
            name: data.name,
            type: data.type,
            affectsCashbox: data.affectsCashbox,
            isDefault: data.isDefault,
            isActive: data.isActive,
          },
        });
        return data.id;
      }

      const created = await tx.paymentMethod.create({
        data: {
          storeId: store.id,
          name: data.name,
          type: data.type,
          affectsCashbox: data.affectsCashbox,
          isDefault: data.isDefault,
          isActive: data.isActive,
          sortOrder: await tx.paymentMethod.count({ where: { storeId: store.id } }),
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'payment_method.create',
        entityType: 'payment_method',
        entityId: created.id,
        summary: `إضافة طريقة دفع: ${data.name}`,
      });

      return created.id;
    });

    revalidatePath('/settings/payment-methods');
    return { id };
  });
}

export async function togglePaymentMethodAction(
  methodId: string,
  isActive: boolean,
): Promise<ActionResult<void>> {
  return runAction('settings.togglePaymentMethod', async () => {
    const { store } = await requireWritePermission('settings.payment_methods');

    await transaction(async (tx) => {
      const method = await tx.paymentMethod.findFirst({
        where: { id: methodId, storeId: store.id },
        select: { id: true, isDefault: true },
      });
      if (!method) throw notFound('طريقة الدفع');

      if (!isActive && method.isDefault) {
        throw businessRule('لا يمكن تعطيل طريقة الدفع الافتراضية. اجعل طريقة أخرى افتراضية أولاً.');
      }

      const remaining = await tx.paymentMethod.count({
        where: { storeId: store.id, isActive: true, id: { not: methodId } },
      });
      if (!isActive && remaining === 0) {
        throw businessRule('يجب أن تبقى طريقة دفع واحدة مفعّلة على الأقل.');
      }

      await tx.paymentMethod.update({ where: { id: method.id }, data: { isActive } });
    });

    revalidatePath('/settings/payment-methods');
  });
}

// ── Integrity check ──────────────────────────────────────────────────────────

export interface IntegrityReport {
  customersChecked: number;
  customersFixed: number;
  suppliersChecked: number;
  suppliersFixed: number;
  cashboxesChecked: number;
  cashboxesFixed: number;
}

/**
 * Re-derive every cached balance from its ledger and repair any drift.
 *
 * The balances are written inside the same transaction as their entries, so
 * they should never disagree — but a tool that can prove it, and fix it if a
 * future bug ever breaks that promise, is worth having.
 */
export async function runIntegrityCheckAction(): Promise<ActionResult<IntegrityReport>> {
  return runAction('settings.integrityCheck', async () => {
    const { store, user } = await requireWritePermission('settings.manage');

    const report = await transaction(
      async (tx) => {
        const { recomputeCustomerBalance, recomputeSupplierBalance } = await import(
          '@/modules/ledger/service'
        );
        const { recomputeCashboxBalance } = await import('@/modules/cashbox/service');

        const [customers, suppliers, cashboxes] = await Promise.all([
          tx.customer.findMany({
            where: { storeId: store.id, deletedAt: null },
            select: { id: true, balance: true },
          }),
          tx.supplier.findMany({
            where: { storeId: store.id, deletedAt: null },
            select: { id: true, balance: true },
          }),
          tx.cashbox.findMany({
            where: { storeId: store.id },
            select: { id: true, balance: true },
          }),
        ]);

        let customersFixed = 0;
        for (const customer of customers) {
          const derived = await recomputeCustomerBalance(tx, customer.id);
          if (BigInt(derived) !== customer.balance) customersFixed += 1;
        }

        let suppliersFixed = 0;
        for (const supplier of suppliers) {
          const derived = await recomputeSupplierBalance(tx, supplier.id);
          if (BigInt(derived) !== supplier.balance) suppliersFixed += 1;
        }

        let cashboxesFixed = 0;
        for (const cashbox of cashboxes) {
          const derived = await recomputeCashboxBalance(tx, cashbox.id);
          if (BigInt(derived) !== cashbox.balance) cashboxesFixed += 1;
        }

        return {
          customersChecked: customers.length,
          customersFixed,
          suppliersChecked: suppliers.length,
          suppliersFixed,
          cashboxesChecked: cashboxes.length,
          cashboxesFixed,
        };
      },
      { timeoutMs: 120_000 },
    );

    const fixed = report.customersFixed + report.suppliersFixed + report.cashboxesFixed;
    if (fixed > 0) {
      await transaction(async (tx) => {
        await recordAudit(tx, {
          storeId: store.id,
          userId: user.id,
          action: 'settings.integrity_fix',
          entityType: 'store',
          entityId: store.id,
          summary: `فحص سلامة البيانات — تم تصحيح ${fixed} رصيد`,
          after: report as unknown as Record<string, unknown>,
        });
      });
    }

    revalidatePath('/settings');
    return report;
  });
}

/** Default minimum stock applied to new products, kept with the other settings. */
export async function setDefaultMinimumStockAction(
  value: number,
): Promise<ActionResult<void>> {
  return runAction('settings.defaultMinimumStock', async () => {
    const { store } = await requireWritePermission('settings.manage');

    await transaction(async (tx) => {
      await tx.storeSettings.update({
        where: { storeId: store.id },
        data: { defaultMinimumStock: qtyToDb(Math.max(0, Math.round(value))) },
      });
    });

    revalidatePath('/settings');
  });
}
