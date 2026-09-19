'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requireStore } from '@/core/auth/context';
import { diffFields, recordAudit } from '@/core/audit';
import { currencyDecimals } from '@/core/currency';
import { transaction } from '@/core/db';
import { businessRule, forbidden, readOnly, validation } from '@/core/errors';
import { qtyToDb, unitCostFromSaleUnitPrice } from '@/core/quantity';
import { countAr, NOUNS } from '@/lib/arabic-count';
import { describeChangedFields } from '@/lib/audit-fields';
import type { ActionResult } from '@/core/result';
import { applyStockMovement } from '@/modules/inventory/service';
import { generateSku, slugify } from '@/modules/products/validation';
import { assertCurrencyChangeAllowed } from '@/modules/settings/currency-guard';
import { toFieldErrors } from '@/modules/auth/validation';

/**
 * Onboarding.
 *
 * Each step saves on its own so a half-finished setup is never lost — the owner
 * can close the tab after adding categories and pick up at products. The wizard
 * only marks the store `ACTIVE` at the end.
 */

const storeStepSchema = z.object({
  name: z.string().trim().min(2, 'أدخل اسم المحل').max(80),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  address: z.string().trim().max(200).optional().or(z.literal('')),
  city: z.string().trim().max(80).optional().or(z.literal('')),
  currency: z.string().trim().length(3),
  timezone: z.string().trim().min(3).max(60),
  taxEnabled: z.boolean().default(false),
  taxRatePercent: z.number().min(0).max(100).default(15),
  taxInclusive: z.boolean().default(true),
});

export async function saveOnboardingStoreAction(
  input: z.input<typeof storeStepSchema>,
): Promise<ActionResult<void>> {
  return runAction('onboarding.store', async () => {
    const { store, user } = await requireOnboardingOwner();

    const parsed = storeStepSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    const next = {
      name: data.name,
      phone: data.phone || null,
      address: data.address || null,
      city: data.city || null,
      currency: data.currency,
      timezone: data.timezone,
      taxEnabled: data.taxEnabled,
      taxRateBps: Math.round(data.taxRatePercent * 100),
      taxInclusive: data.taxInclusive,
    };

    await transaction(async (tx) => {
      const [current, settings] = await Promise.all([
        tx.store.findUniqueOrThrow({
          where: { id: store.id },
          select: { name: true, phone: true, address: true, city: true },
        }),
        tx.storeSettings.findUniqueOrThrow({
          where: { storeId: store.id },
          select: {
            currency: true,
            timezone: true,
            taxEnabled: true,
            taxRateBps: true,
            taxInclusive: true,
          },
        }),
      ]);

      // The wizard re-sends these on every pass through the first two steps;
      // only a real change is written and audited.
      const diff = diffFields({ ...current, ...settings }, next, [
        'name',
        'phone',
        'address',
        'city',
        'currency',
        'timezone',
        'taxEnabled',
        'taxRateBps',
        'taxInclusive',
      ]);
      if (diff.changed.length === 0) return;

      await assertCurrencyChangeAllowed(tx, store.id, settings.currency, next.currency);

      await tx.store.update({
        where: { id: store.id },
        data: { name: next.name, phone: next.phone, address: next.address, city: next.city },
      });

      await tx.storeSettings.update({
        where: { storeId: store.id },
        data: {
          currency: next.currency,
          currencyDecimals: currencyDecimals(next.currency),
          timezone: next.timezone,
          taxEnabled: next.taxEnabled,
          taxRateBps: next.taxRateBps,
          taxInclusive: next.taxInclusive,
        },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'onboarding.store',
        entityType: 'store',
        entityId: store.id,
        summary: `تهيئة المتجر: ${describeChangedFields(diff.changed)}`,
        before: diff.before,
        after: diff.after,
      });
    });

    revalidatePath('/onboarding');
    revalidatePath('/', 'layout');
  });
}

const categoriesSchema = z.object({
  names: z.array(z.string().trim().min(1).max(60)).max(20),
});

export interface CategoryOption {
  id: string;
  name: string;
}

export async function saveOnboardingCategoriesAction(
  input: z.input<typeof categoriesSchema>,
): Promise<ActionResult<{ categories: CategoryOption[] }>> {
  return runAction('onboarding.categories', async () => {
    const { store, user } = await requireOnboardingOwner();

    const parsed = categoriesSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من التصنيفات', toFieldErrors(parsed.error));

    const categories = await transaction(async (tx) => {
      const existing = await tx.category.findMany({
        where: { storeId: store.id, deletedAt: null },
        select: { name: true },
      });
      const taken = new Set(existing.map((category) => category.name));

      // Adding is idempotent: re-running the step never duplicates a category.
      const fresh = [...new Set(parsed.data.names)].filter((name) => !taken.has(name));

      if (fresh.length > 0) {
        await tx.category.createMany({
          data: fresh.map((name, index) => ({
            storeId: store.id,
            name,
            slug: slugify(name),
            sortOrder: existing.length + index,
          })),
        });

        await recordAudit(tx, {
          storeId: store.id,
          userId: user.id,
          action: 'category.create',
          entityType: 'category',
          entityId: store.id,
          summary: `إضافة ${countAr(fresh.length, NOUNS.category)} من خطوات التهيئة: ${fresh.join('، ')}`,
          after: { names: fresh },
        });
      }

      // Return the whole set — the next step needs ids to attach a product to.
      return tx.category.findMany({
        where: { storeId: store.id, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { sortOrder: 'asc' },
      });
    });

    revalidatePath('/onboarding');
    revalidatePath('/products');
    return { categories };
  });
}

const firstProductSchema = z.object({
  name: z.string().trim().min(2, 'أدخل اسم المنتج').max(120),
  categoryId: z.string().min(1).optional().nullable(),
  unitKind: z.enum(['COUNT', 'WEIGHT', 'VOLUME']).default('COUNT'),
  unitLabel: z.string().trim().min(1).max(24).default('قطعة'),
  displayFactor: z.number().int().positive().default(1000),
  purchasePrice: z.number().int().min(0).default(0),
  sellingPrice: z.number().int().min(0),
  openingStock: z.number().int().min(0).default(0),
});

export async function saveOnboardingProductAction(
  input: z.input<typeof firstProductSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction('onboarding.product', async () => {
    const { store, user } = await requireOnboardingOwner();

    const parsed = firstProductSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من بيانات المنتج', toFieldErrors(parsed.error));
    const data = parsed.data;

    const id = await transaction(async (tx) => {
      const sequence = await tx.productVariant.count({ where: { storeId: store.id } });

      const product = await tx.product.create({
        data: {
          storeId: store.id,
          name: data.name,
          categoryId: data.categoryId ?? null,
          unitKind: data.unitKind,
          trackInventory: true,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      const variant = await tx.productVariant.create({
        data: {
          storeId: store.id,
          productId: product.id,
          name: 'افتراضي',
          sku: generateSku('VS', sequence + 1),
          unitLabel: data.unitLabel,
          displayFactor: qtyToDb(data.displayFactor),
          allowsFractional: data.unitKind !== 'COUNT',
          purchasePrice: BigInt(data.purchasePrice),
          sellingPrice: BigInt(data.sellingPrice),
          isDefault: true,
        },
        select: { id: true },
      });

      if (data.openingStock > 0) {
        // The owner types a purchase price per SALE unit; the ledger keeps cost
        // per BASE unit — a 250g pack bought at 40.00 lands at 0.16 per gram.
        const costPerBase = unitCostFromSaleUnitPrice(data.purchasePrice, data.displayFactor);

        await applyStockMovement(tx, {
          storeId: store.id,
          branchId: store.branch.id,
          variantId: variant.id,
          type: 'OPENING',
          quantityChange: data.openingStock,
          unitCostPerBase: costPerBase,
          referenceType: 'onboarding',
          referenceId: product.id,
          userId: user.id,
          reason: 'رصيد افتتاحي من خطوات التهيئة',
        });
      }

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'product.create',
        entityType: 'product',
        entityId: product.id,
        summary: `إضافة منتج من خطوات التهيئة: ${data.name}`,
        after: {
          name: data.name,
          unitLabel: data.unitLabel,
          purchasePrice: data.purchasePrice,
          sellingPrice: data.sellingPrice,
          openingStock: data.openingStock,
        },
      });

      return product.id;
    });

    revalidatePath('/onboarding');
    revalidatePath('/products');
    return { id };
  });
}

const paymentStepSchema = z.object({
  /** Ids of the methods that stay switched on. */
  activeIds: z.array(z.string().min(1)).min(1, 'أبقِ طريقة دفع واحدة على الأقل'),
  defaultId: z.string().min(1),
});

export async function saveOnboardingPaymentMethodsAction(
  input: z.input<typeof paymentStepSchema>,
): Promise<ActionResult<void>> {
  return runAction('onboarding.paymentMethods', async () => {
    const { store, user } = await requireOnboardingOwner();

    const parsed = paymentStepSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من طرق الدفع', toFieldErrors(parsed.error));
    const { activeIds, defaultId } = parsed.data;

    if (!activeIds.includes(defaultId)) {
      throw validation('طريقة الدفع الافتراضية يجب أن تكون مفعّلة');
    }

    await transaction(async (tx) => {
      const methods = await tx.paymentMethod.findMany({
        where: { storeId: store.id },
        select: { id: true, name: true, isActive: true, isDefault: true },
      });
      // Never trust ids from the browser to belong to this tenant.
      const known = new Set(methods.map((method) => method.id));
      if (!activeIds.every((id) => known.has(id))) throw validation('طريقة دفع غير معروفة');

      const unchanged = methods.every(
        (method) =>
          method.isActive === activeIds.includes(method.id) &&
          method.isDefault === (method.id === defaultId),
      );
      if (unchanged) return;

      await tx.paymentMethod.updateMany({
        where: { storeId: store.id },
        data: { isActive: false, isDefault: false },
      });
      await tx.paymentMethod.updateMany({
        where: { storeId: store.id, id: { in: activeIds } },
        data: { isActive: true },
      });
      await tx.paymentMethod.updateMany({
        where: { storeId: store.id, id: defaultId },
        data: { isDefault: true },
      });

      const nameOf = (id: string) => methods.find((method) => method.id === id)?.name ?? id;
      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'payment_method.update',
        entityType: 'payment_method',
        entityId: defaultId,
        summary: `ضبط طرق الدفع من خطوات التهيئة — الافتراضية: ${nameOf(defaultId)}`,
        before: {
          active: methods.filter((method) => method.isActive).map((method) => method.name),
          default: methods.find((method) => method.isDefault)?.name ?? null,
        },
        after: { active: activeIds.map(nameOf), default: nameOf(defaultId) },
      });
    });

    revalidatePath('/onboarding');
    revalidatePath('/settings/payment-methods');
  });
}

export async function completeOnboardingAction(): Promise<ActionResult<void>> {
  return runAction('onboarding.complete', async () => {
    const { store, user } = await requireStore();
    if (!store.isOwner) throw forbidden('خطوات التهيئة متاحة لصاحب المحل فقط.');
    // A double-click or a retry after a dropped connection lands here twice;
    // the second call is a no-op, not an error.
    if (store.onboarded) return;

    await transaction(async (tx) => {
      const { count } = await tx.store.updateMany({
        where: { id: store.id, onboardedAt: null },
        data: { status: 'ACTIVE', onboardedAt: new Date() },
      });
      if (count === 0) return;

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'onboarding.complete',
        entityType: 'store',
        entityId: store.id,
        summary: 'اكتمال تهيئة المتجر والبدء في الاستخدام',
      });
    });

    revalidatePath('/', 'layout');
  });
}

/**
 * Onboarding is the owner's job, and only before it has been completed.
 *
 * Afterwards these actions would be a side door around the settings screen's
 * own permission and audit rules, so they refuse outright.
 */
async function requireOnboardingOwner() {
  const context = await requireStore();
  if (!context.store.isOwner) {
    throw forbidden('خطوات التهيئة متاحة لصاحب المحل فقط.');
  }
  if (context.store.onboarded) {
    throw businessRule('تمت تهيئة المتجر مسبقاً. عدّل البيانات من صفحة الإعدادات.');
  }
  if (context.store.subscription.isReadOnly) throw readOnly();
  return context;
}
