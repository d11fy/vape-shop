'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requireWritePermission, type StoreSession } from '@/core/auth/context';
import { recordAudit, diffFields } from '@/core/audit';
import { transaction, type Tx } from '@/core/db';
import { businessRule, notFound, planLimit, validation } from '@/core/errors';
import { qtyToDb, unitCostFromSaleUnitPrice } from '@/core/quantity';
import type { ActionResult } from '@/core/result';
import { countAr, NOUNS } from '@/lib/arabic-count';
import { applyStockMovement } from '@/modules/inventory/service';
import { toFieldErrors } from '@/modules/auth/validation';
import {
  brandSchema,
  categorySchema,
  generateSku,
  productSchema,
  slugify,
  type ProductInput,
} from './validation';

/**
 * Catalogue writes.
 *
 * Price changes are audited with their before/after values — "who dropped the
 * price of تفاحتين to 30?" is one of the questions this product exists to
 * answer. Opening stock is applied as a real `OPENING` inventory movement so
 * even the first quantity has a documented origin.
 */

export async function saveProductAction(
  input: ProductInput,
): Promise<ActionResult<{ id: string }>> {
  return runAction('products.save', async () => {
    const context = await requireWritePermission(
      input.id ? 'products.edit' : 'products.create',
    );

    const parsed = productSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات المنتج', toFieldErrors(parsed.error));
    }
    const data = parsed.data;

    const id = await transaction(async (tx) => {
      if (data.id) return updateProduct(tx, context, data);
      return createProduct(tx, context, data);
    });

    revalidatePath('/products');
    revalidatePath(`/products/${id}`);
    revalidatePath('/inventory');
    return { id };
  });
}

async function createProduct(
  tx: Tx,
  context: StoreSession,
  data: ProductInput,
): Promise<string> {
  const { store, user } = context;

  // Plan limit — the ceiling lives in the database, not in the code.
  const limit = store.subscription.limits.maxProducts;
  if (limit !== null) {
    const count = await tx.product.count({ where: { storeId: store.id, deletedAt: null } });
    if (count >= limit) {
      throw planLimit(
        `وصلت للحد الأقصى من المنتجات في خطتك (${limit} منتج). قم بترقية الاشتراك لإضافة المزيد.`,
        { limit, count },
      );
    }
  }

  await assertUniqueIdentifiers(tx, store.id, data.variants, null);

  const product = await tx.product.create({
    data: {
      storeId: store.id,
      name: data.name,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      categoryId: data.categoryId ?? null,
      brandId: data.brandId ?? null,
      unitKind: data.unitKind,
      trackInventory: data.trackInventory,
      isAgeRestricted: data.isAgeRestricted,
      hasVariants: data.variants.length > 1,
      status: data.status,
    },
    select: { id: true },
  });

  const sequenceBase = await tx.productVariant.count({ where: { storeId: store.id } });

  for (const [index, variant] of data.variants.entries()) {
    const created = await tx.productVariant.create({
      data: {
        storeId: store.id,
        productId: product.id,
        name: variant.name,
        sku: variant.sku || generateSku('VS', sequenceBase + index + 1),
        barcode: variant.barcode || null,
        unitLabel: variant.unitLabel,
        displayFactor: qtyToDb(variant.displayFactor),
        allowsFractional: variant.allowsFractional,
        sellingPrice: BigInt(variant.sellingPrice),
        wholesalePrice: BigInt(variant.wholesalePrice),
        purchasePrice: BigInt(variant.purchasePrice),
        minimumStock: qtyToDb(variant.minimumStock),
        isDefault: index === 0,
        isActive: variant.isActive,
        sortOrder: index,
      },
      select: { id: true },
    });

    // Opening stock is a documented movement, valued at the purchase price the
    // user entered — so the very first COGS figure is already meaningful.
    if (variant.openingStock > 0 && data.trackInventory) {
      const costPerBase = unitCostFromSaleUnitPrice(variant.purchasePrice, variant.displayFactor);

      await applyStockMovement(tx, {
        storeId: store.id,
        branchId: store.branch.id,
        variantId: created.id,
        type: 'OPENING',
        quantityChange: variant.openingStock,
        unitCostPerBase: costPerBase,
        referenceType: 'product',
        referenceId: product.id,
        userId: user.id,
        reason: 'رصيد افتتاحي عند إضافة المنتج',
      });
    }
  }

  await recordAudit(tx, {
    storeId: store.id,
    userId: user.id,
    action: 'product.create',
    entityType: 'product',
    entityId: product.id,
    summary: `إضافة منتج جديد: ${data.name}`,
    after: { name: data.name, variants: data.variants.length, status: data.status },
  });

  return product.id;
}

async function updateProduct(
  tx: Tx,
  context: StoreSession,
  data: ProductInput,
): Promise<string> {
  const { store, user } = context;

  const existing = await tx.product.findFirst({
    where: { id: data.id!, storeId: store.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      description: true,
      categoryId: true,
      brandId: true,
      status: true,
      trackInventory: true,
      isAgeRestricted: true,
      variants: {
        where: { deletedAt: null },
        select: { id: true, name: true, sku: true, sellingPrice: true, wholesalePrice: true },
      },
    },
  });

  if (!existing) throw notFound('المنتج');

  await assertUniqueIdentifiers(tx, store.id, data.variants, existing.id);

  await tx.product.update({
    where: { id: existing.id },
    data: {
      name: data.name,
      description: data.description || null,
      imageUrl: data.imageUrl || null,
      categoryId: data.categoryId ?? null,
      brandId: data.brandId ?? null,
      unitKind: data.unitKind,
      trackInventory: data.trackInventory,
      isAgeRestricted: data.isAgeRestricted,
      hasVariants: data.variants.length > 1,
      status: data.status,
    },
  });

  const keptIds = new Set(data.variants.map((variant) => variant.id).filter(Boolean) as string[]);
  const priceChanges: Array<{ name: string; from: number; to: number }> = [];
  const sequenceBase = await tx.productVariant.count({ where: { storeId: store.id } });

  for (const [index, variant] of data.variants.entries()) {
    if (variant.id) {
      const previous = existing.variants.find((entry) => entry.id === variant.id);
      if (previous && Number(previous.sellingPrice) !== variant.sellingPrice) {
        priceChanges.push({
          name: `${data.name} — ${variant.name}`,
          from: Number(previous.sellingPrice),
          to: variant.sellingPrice,
        });
      }

      await tx.productVariant.update({
        where: { id: variant.id },
        data: {
          name: variant.name,
          sku: variant.sku || undefined,
          barcode: variant.barcode || null,
          unitLabel: variant.unitLabel,
          displayFactor: qtyToDb(variant.displayFactor),
          allowsFractional: variant.allowsFractional,
          sellingPrice: BigInt(variant.sellingPrice),
          wholesalePrice: BigInt(variant.wholesalePrice),
          purchasePrice: BigInt(variant.purchasePrice),
          minimumStock: qtyToDb(variant.minimumStock),
          isActive: variant.isActive,
          isDefault: index === 0,
          sortOrder: index,
        },
      });
      continue;
    }

    await tx.productVariant.create({
      data: {
        storeId: store.id,
        productId: existing.id,
        name: variant.name,
        sku: variant.sku || generateSku('VS', sequenceBase + index + 1),
        barcode: variant.barcode || null,
        unitLabel: variant.unitLabel,
        displayFactor: qtyToDb(variant.displayFactor),
        allowsFractional: variant.allowsFractional,
        sellingPrice: BigInt(variant.sellingPrice),
        wholesalePrice: BigInt(variant.wholesalePrice),
        purchasePrice: BigInt(variant.purchasePrice),
        minimumStock: qtyToDb(variant.minimumStock),
        isDefault: index === 0,
        isActive: variant.isActive,
        sortOrder: index,
      },
    });
  }

  // Variants dropped from the form are archived, never deleted — historical
  // invoices still reference them.
  const removed = existing.variants.filter((variant) => !keptIds.has(variant.id));
  for (const variant of removed) {
    const used = await tx.saleItem.count({ where: { variantId: variant.id } });
    if (used > 0) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { isActive: false, deletedAt: new Date() },
      });
    } else {
      await tx.productVariant.delete({ where: { id: variant.id } });
    }
  }

  const diff = diffFields(
    {
      name: existing.name,
      description: existing.description,
      categoryId: existing.categoryId,
      brandId: existing.brandId,
      status: existing.status,
    },
    {
      name: data.name,
      description: data.description || null,
      categoryId: data.categoryId ?? null,
      brandId: data.brandId ?? null,
      status: data.status,
    },
    ['name', 'description', 'categoryId', 'brandId', 'status'],
  );

  const summary =
    priceChanges.length > 0
      ? `تعديل أسعار ${priceChanges.length > 1 ? `${priceChanges.length} أصناف` : priceChanges[0]!.name}`
      : `تعديل بيانات المنتج: ${data.name}`;

  await recordAudit(tx, {
    storeId: store.id,
    userId: user.id,
    action: priceChanges.length > 0 ? 'product.price_change' : 'product.update',
    entityType: 'product',
    entityId: existing.id,
    summary,
    before: { ...diff.before, prices: priceChanges.map((change) => change.from) },
    after: { ...diff.after, prices: priceChanges.map((change) => change.to) },
  });

  return existing.id;
}

/** SKUs and barcodes are unique per store; reject clashes with a clear message. */
async function assertUniqueIdentifiers(
  tx: Tx,
  storeId: string,
  variants: ProductInput['variants'],
  productId: string | null,
): Promise<void> {
  const skus = variants.map((variant) => variant.sku).filter(Boolean) as string[];
  const barcodes = variants.map((variant) => variant.barcode).filter(Boolean) as string[];

  if (new Set(skus).size !== skus.length) {
    throw validation('يوجد تكرار في أكواد الأصناف (SKU) داخل نفس المنتج');
  }
  if (new Set(barcodes).size !== barcodes.length) {
    throw validation('يوجد تكرار في الباركود داخل نفس المنتج');
  }

  if (skus.length > 0) {
    const clash = await tx.productVariant.findFirst({
      where: {
        storeId,
        sku: { in: skus },
        deletedAt: null,
        ...(productId ? { productId: { not: productId } } : {}),
      },
      select: { sku: true, product: { select: { name: true } } },
    });
    if (clash) {
      throw validation(`الكود ${clash.sku} مستخدم في المنتج "${clash.product.name}"`);
    }
  }

  if (barcodes.length > 0) {
    const clash = await tx.productVariant.findFirst({
      where: {
        storeId,
        barcode: { in: barcodes },
        deletedAt: null,
        ...(productId ? { productId: { not: productId } } : {}),
      },
      select: { barcode: true, product: { select: { name: true } } },
    });
    if (clash) {
      throw validation(`الباركود ${clash.barcode} مستخدم في المنتج "${clash.product.name}"`);
    }
  }
}

export async function archiveProductAction(
  productId: string,
): Promise<ActionResult<void>> {
  return runAction('products.archive', async () => {
    const { store, user } = await requireWritePermission('products.delete');

    await transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, storeId: store.id, deletedAt: null },
        select: { id: true, name: true, status: true },
      });
      if (!product) throw notFound('المنتج');

      // Archived, not deleted: invoices, stock movements and reports all still
      // point at this row.
      await tx.product.update({
        where: { id: product.id },
        data: { status: 'ARCHIVED', deletedAt: new Date() },
      });
      await tx.productVariant.updateMany({
        where: { productId: product.id },
        data: { isActive: false },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'product.archive',
        entityType: 'product',
        entityId: product.id,
        summary: `أرشفة المنتج: ${product.name}`,
        before: { status: product.status },
        after: { status: 'ARCHIVED' },
      });
    });

    revalidatePath('/products');
  });
}

// ── Categories & brands ──────────────────────────────────────────────────────

export async function saveCategoryAction(
  input: z.input<typeof categorySchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction('categories.save', async () => {
    const { store, user } = await requireWritePermission('catalog.manage');

    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    const id = await transaction(async (tx) => {
      const duplicate = await tx.category.findFirst({
        where: {
          storeId: store.id,
          name: data.name,
          deletedAt: null,
          ...(data.id ? { id: { not: data.id } } : {}),
        },
        select: { id: true },
      });
      if (duplicate) throw validation('يوجد تصنيف بنفس الاسم', { name: ['الاسم مستخدم'] });

      if (data.id) {
        const current = await tx.category.findFirst({
          where: { id: data.id, storeId: store.id, deletedAt: null },
          select: { id: true, name: true, color: true, isActive: true },
        });
        if (!current) throw notFound('التصنيف');

        await tx.category.update({
          where: { id: current.id },
          data: { name: data.name, color: data.color || null, isActive: data.isActive },
        });

        await recordAudit(tx, {
          storeId: store.id,
          userId: user.id,
          action: 'category.update',
          entityType: 'category',
          entityId: current.id,
          summary: `تعديل تصنيف: ${data.name}`,
          before: { name: current.name, isActive: current.isActive },
          after: { name: data.name, isActive: data.isActive },
        });
        return current.id;
      }

      const created = await tx.category.create({
        data: {
          storeId: store.id,
          name: data.name,
          slug: slugify(data.name),
          color: data.color || null,
          isActive: data.isActive,
          sortOrder: await tx.category.count({ where: { storeId: store.id } }),
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'category.create',
        entityType: 'category',
        entityId: created.id,
        summary: `إضافة تصنيف: ${data.name}`,
      });

      return created.id;
    });

    revalidatePath('/products/categories');
    revalidatePath('/products');
    return { id };
  });
}

export async function saveBrandAction(
  input: z.input<typeof brandSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction('brands.save', async () => {
    const { store, user } = await requireWritePermission('catalog.manage');

    const parsed = brandSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    const id = await transaction(async (tx) => {
      const duplicate = await tx.brand.findFirst({
        where: {
          storeId: store.id,
          name: data.name,
          deletedAt: null,
          ...(data.id ? { id: { not: data.id } } : {}),
        },
        select: { id: true },
      });
      if (duplicate) throw validation('يوجد ماركة بنفس الاسم', { name: ['الاسم مستخدم'] });

      if (data.id) {
        const current = await tx.brand.findFirst({
          where: { id: data.id, storeId: store.id, deletedAt: null },
          select: { id: true, name: true, isActive: true },
        });
        if (!current) throw notFound('الماركة');

        await tx.brand.update({
          where: { id: current.id },
          data: { name: data.name, isActive: data.isActive },
        });

        await recordAudit(tx, {
          storeId: store.id,
          userId: user.id,
          action: 'brand.update',
          entityType: 'brand',
          entityId: current.id,
          summary: `تعديل ماركة: ${data.name}`,
          before: { name: current.name, isActive: current.isActive },
          after: { name: data.name, isActive: data.isActive },
        });
        return current.id;
      }

      const created = await tx.brand.create({
        data: {
          storeId: store.id,
          name: data.name,
          slug: slugify(data.name),
          isActive: data.isActive,
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'brand.create',
        entityType: 'brand',
        entityId: created.id,
        summary: `إضافة ماركة: ${data.name}`,
      });
      return created.id;
    });

    revalidatePath('/products/categories');
    revalidatePath('/products');
    return { id };
  });
}

/** Soft-delete a brand no live product uses. */
export async function deleteBrandAction(brandId: string): Promise<ActionResult<void>> {
  return runAction('brands.delete', async () => {
    const { store, user } = await requireWritePermission('catalog.manage');

    await transaction(async (tx) => {
      const brand = await tx.brand.findFirst({
        where: { id: brandId, storeId: store.id, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!brand) throw notFound('الماركة');

      const inUse = await tx.product.count({
        where: { storeId: store.id, brandId: brand.id, deletedAt: null },
      });
      if (inUse > 0) {
        throw businessRule(
          `لا يمكن حذف الماركة لأنها مرتبطة بـ ${countAr(inUse, NOUNS.product)}. عطّلها بدلاً من حذفها.`,
        );
      }

      await tx.brand.update({
        where: { id: brand.id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'brand.delete',
        entityType: 'brand',
        entityId: brand.id,
        summary: `حذف ماركة: ${brand.name}`,
      });
    });

    revalidatePath('/products/categories');
  });
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionResult<void>> {
  return runAction('categories.delete', async () => {
    const { store, user } = await requireWritePermission('catalog.manage');

    await transaction(async (tx) => {
      const category = await tx.category.findFirst({
        where: { id: categoryId, storeId: store.id, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!category) throw notFound('التصنيف');

      const inUse = await tx.product.count({
        where: { storeId: store.id, categoryId: category.id, deletedAt: null },
      });
      if (inUse > 0) {
        throw businessRule(
          `لا يمكن حذف التصنيف لأنه مرتبط بـ ${countAr(inUse, NOUNS.product)}. انقل المنتجات لتصنيف آخر أو عطّله.`,
        );
      }

      await tx.category.update({
        where: { id: category.id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: user.id,
        action: 'category.delete',
        entityType: 'category',
        entityId: category.id,
        summary: `حذف تصنيف: ${category.name}`,
      });
    });

    revalidatePath('/products/categories');
    revalidatePath('/products');
  });
}
