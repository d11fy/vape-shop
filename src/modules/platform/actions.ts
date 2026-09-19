'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requirePlatformAdmin } from '@/core/auth/context';
import { auditOutsideTransaction, recordAudit } from '@/core/audit';
import { setSupportStore } from '@/core/auth/session';
import { revokeAllSessionsForUser } from '@/core/auth/session';
import { transaction } from '@/core/db';
import { businessRule, notFound, validation } from '@/core/errors';
import { generateTemporaryPassword, hashPassword } from '@/core/auth/password';
import type { ActionResult } from '@/core/result';
import { provisionStore } from '@/modules/store/provisioning';
import { toFieldErrors } from '@/modules/auth/validation';

/**
 * Platform administration.
 *
 * Every action here crosses a tenant boundary, so all of them start with
 * `requirePlatformAdmin` and end with an audit entry attributed to the admin.
 * Support access in particular is a recorded, reason-carrying session — not a
 * silent impersonation.
 */

const extendSchema = z.object({
  storeId: z.string().min(1),
  days: z.number().int().min(1).max(3650),
  note: z.string().max(300).optional().nullable(),
});

export async function extendSubscriptionAction(
  input: z.input<typeof extendSchema>,
): Promise<ActionResult<{ endsAt: string }>> {
  return runAction('platform.extend', async () => {
    const context = await requirePlatformAdmin();

    const parsed = extendSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    const endsAt = await transaction(async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { storeId: data.storeId },
        select: { id: true, endsAt: true, status: true, plan: { select: { graceDays: true } } },
      });
      if (!subscription) throw notFound('الاشتراك');

      // Extend from today when it has already lapsed, otherwise from the
      // existing end date so the customer never loses paid days.
      const base =
        subscription.endsAt.getTime() > Date.now() ? subscription.endsAt : new Date();
      const next = new Date(base.getTime() + data.days * 24 * 60 * 60 * 1000);
      const grace = new Date(next.getTime() + subscription.plan.graceDays * 24 * 60 * 60 * 1000);

      await tx.subscription.update({
        where: { id: subscription.id },
        data: { endsAt: next, graceEndsAt: grace, status: 'ACTIVE', canceledAt: null },
      });

      await tx.store.update({
        where: { id: data.storeId },
        data: { status: 'ACTIVE', suspendedAt: null, suspendReason: null },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          type: 'extended',
          previousEndsAt: subscription.endsAt,
          newEndsAt: next,
          actorUserId: context.user.id,
          note: data.note ?? `تمديد ${data.days} يوم`,
        },
      });

      await recordAudit(tx, {
        storeId: data.storeId,
        userId: context.user.id,
        action: 'platform.subscription_extend',
        entityType: 'subscription',
        entityId: subscription.id,
        summary: `تمديد اشتراك المتجر ${data.days} يوم`,
        before: { endsAt: subscription.endsAt, status: subscription.status },
        after: { endsAt: next, status: 'ACTIVE' },
      });

      return next;
    });

    revalidatePath('/platform');
    revalidatePath(`/platform/stores/${data.storeId}`);
    return { endsAt: endsAt.toISOString() };
  });
}

const planChangeSchema = z.object({
  storeId: z.string().min(1),
  planId: z.string().min(1),
  note: z.string().max(300).optional().nullable(),
});

export async function changeStorePlanAction(
  input: z.input<typeof planChangeSchema>,
): Promise<ActionResult<void>> {
  return runAction('platform.changePlan', async () => {
    const context = await requirePlatformAdmin();

    const parsed = planChangeSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    await transaction(async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { storeId: data.storeId },
        select: { id: true, planId: true, plan: { select: { nameAr: true } } },
      });
      if (!subscription) throw notFound('الاشتراك');

      const plan = await tx.plan.findUnique({
        where: { id: data.planId },
        select: { id: true, nameAr: true, monthlyPrice: true },
      });
      if (!plan) throw notFound('الخطة');

      await tx.subscription.update({
        where: { id: subscription.id },
        data: { planId: plan.id, amount: plan.monthlyPrice },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          type: 'plan_changed',
          fromPlanId: subscription.planId,
          toPlanId: plan.id,
          actorUserId: context.user.id,
          note: data.note ?? null,
        },
      });

      await recordAudit(tx, {
        storeId: data.storeId,
        userId: context.user.id,
        action: 'platform.plan_change',
        entityType: 'subscription',
        entityId: subscription.id,
        summary: `تغيير خطة المتجر من ${subscription.plan.nameAr} إلى ${plan.nameAr}`,
        before: { plan: subscription.plan.nameAr },
        after: { plan: plan.nameAr },
      });
    });

    revalidatePath(`/platform/stores/${data.storeId}`);
  });
}

const suspendSchema = z.object({
  storeId: z.string().min(1),
  suspend: z.boolean(),
  reason: z.string().max(300).optional().nullable(),
});

export async function setStoreSuspensionAction(
  input: z.input<typeof suspendSchema>,
): Promise<ActionResult<void>> {
  return runAction('platform.suspend', async () => {
    const context = await requirePlatformAdmin();

    const parsed = suspendSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    if (data.suspend && !data.reason?.trim()) {
      throw businessRule('اذكر سبب تعليق المتجر.');
    }

    await transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { id: data.storeId },
        select: { id: true, name: true, status: true },
      });
      if (!store) throw notFound('المتجر');

      await tx.store.update({
        where: { id: store.id },
        data: data.suspend
          ? {
              status: 'SUSPENDED',
              suspendedAt: new Date(),
              suspendReason: data.reason?.trim() ?? null,
            }
          : { status: 'ACTIVE', suspendedAt: null, suspendReason: null },
      });

      // The tenant sees this the moment they next load a page.
      await tx.notification.create({
        data: {
          storeId: store.id,
          kind: 'SYSTEM',
          severity: data.suspend ? 'DANGER' : 'SUCCESS',
          title: data.suspend ? 'تم تعليق حساب المتجر' : 'تم إعادة تفعيل المتجر',
          body: data.suspend
            ? `السبب: ${data.reason?.trim() ?? 'غير محدد'} — تواصل مع الدعم.`
            : 'تمت إعادة تفعيل حسابك ويمكنك متابعة العمل.',
        },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: context.user.id,
        action: data.suspend ? 'platform.store_suspend' : 'platform.store_reactivate',
        entityType: 'store',
        entityId: store.id,
        summary: data.suspend
          ? `تعليق المتجر ${store.name}: ${data.reason?.trim() ?? ''}`
          : `إعادة تفعيل المتجر ${store.name}`,
        before: { status: store.status },
        after: { status: data.suspend ? 'SUSPENDED' : 'ACTIVE' },
      });
    });

    revalidatePath('/platform/stores');
    revalidatePath(`/platform/stores/${data.storeId}`);
  });
}

// ── Support mode ─────────────────────────────────────────────────────────────

const supportSchema = z.object({
  storeId: z.string().min(1),
  reason: z.string().trim().min(5, 'اذكر سبب الدخول للدعم').max(300),
});

/**
 * Enter a tenant for support.
 *
 * Read-only by construction (see `SUPPORT_MODE_PERMISSIONS`), announced by a
 * banner the admin cannot dismiss, and recorded as a `SupportSession` row with
 * a reason — so the tenant can be told exactly who looked and why.
 */
export async function enterSupportModeAction(
  input: z.input<typeof supportSchema>,
): Promise<ActionResult<never>> {
  const context = await requirePlatformAdmin();

  const parsed = supportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'VALIDATION',
        message: 'اذكر سبب الدخول للدعم',
        fieldErrors: toFieldErrors(parsed.error),
      },
    };
  }

  const data = parsed.data;

  await transaction(async (tx) => {
    const store = await tx.store.findUnique({
      where: { id: data.storeId },
      select: { id: true, name: true },
    });
    if (!store) throw notFound('المتجر');

    await tx.supportSession.create({
      data: {
        storeId: store.id,
        userId: context.user.id,
        reason: data.reason,
      },
    });

    await recordAudit(tx, {
      storeId: store.id,
      userId: context.user.id,
      action: 'support.enter',
      entityType: 'store',
      entityId: store.id,
      summary: `دخول وضع الدعم الفني: ${data.reason}`,
      isSupport: true,
      after: { reason: data.reason },
    });
  });

  await setSupportStore(context.sessionId, data.storeId);
  redirect('/dashboard');
}

// ── Store provisioning ───────────────────────────────────────────────────────

const createStoreSchema = z.object({
  storeName: z.string().trim().min(2, 'أدخل اسم المحل').max(80),
  ownerName: z.string().trim().min(2, 'أدخل اسم المالك').max(80),
  email: z.email('بريد إلكتروني غير صالح').trim().toLowerCase(),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  planCode: z.string().min(1),
  country: z.string().trim().length(2).default('SA'),
  paidDays: z.number().int().min(0).max(3650).default(0),
});

export async function createStoreAction(
  input: z.input<typeof createStoreSchema>,
): Promise<ActionResult<{ storeId: string; password: string }>> {
  return runAction('platform.createStore', async () => {
    const context = await requirePlatformAdmin();

    const parsed = createStoreSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    }
    const data = parsed.data;

    const password = generateTemporaryPassword();

    const result = await transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: data.email },
        select: { id: true },
      });
      if (existing) {
        throw validation('هذا البريد مسجل مسبقاً', {
          email: ['يوجد حساب بهذا البريد'],
        });
      }

      const owner = await tx.user.create({
        data: {
          name: data.ownerName,
          email: data.email,
          phone: data.phone || null,
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      const provisioned = await provisionStore(tx, {
        name: data.storeName,
        ownerId: owner.id,
        country: data.country,
        phone: data.phone || null,
        email: data.email,
        planCode: data.planCode,
        paidDays: data.paidDays > 0 ? data.paidDays : undefined,
      });

      await recordAudit(tx, {
        storeId: provisioned.store.id,
        userId: context.user.id,
        action: 'platform.store_create',
        entityType: 'store',
        entityId: provisioned.store.id,
        summary: `إنشاء متجر جديد من لوحة المنصة: ${data.storeName}`,
        after: { name: data.storeName, owner: data.email, plan: data.planCode },
      });

      return { storeId: provisioned.store.id };
    });

    revalidatePath('/platform/stores');
    return { storeId: result.storeId, password };
  });
}

// ── Plans ────────────────────────────────────────────────────────────────────

const planSchema = z.object({
  id: z.string().optional().nullable(),
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[a-z0-9-]+$/, 'استخدم حروفاً إنجليزية صغيرة وأرقاماً'),
  nameAr: z.string().trim().min(2).max(60),
  nameEn: z.string().trim().min(2).max(60),
  descriptionAr: z.string().trim().max(300).optional().or(z.literal('')),
  monthlyPrice: z.number().int().min(0),
  yearlyPrice: z.number().int().min(0),
  trialDays: z.number().int().min(0).max(365).default(14),
  graceDays: z.number().int().min(0).max(90).default(7),
  maxEmployees: z.number().int().min(1).nullable(),
  maxBranches: z.number().int().min(1).nullable(),
  maxProducts: z.number().int().min(1).nullable(),
  maxMonthlyInvoices: z.number().int().min(1).nullable(),
  features: z.array(z.string()).default([]),
  isPublic: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
});

export async function savePlanAction(
  input: z.input<typeof planSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction('platform.savePlan', async () => {
    const context = await requirePlatformAdmin();

    const parsed = planSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من بيانات الخطة', toFieldErrors(parsed.error));
    const data = parsed.data;

    const id = await transaction(async (tx) => {
      const payload = {
        code: data.code,
        nameAr: data.nameAr,
        nameEn: data.nameEn,
        descriptionAr: data.descriptionAr || null,
        monthlyPrice: BigInt(data.monthlyPrice),
        yearlyPrice: BigInt(data.yearlyPrice),
        trialDays: data.trialDays,
        graceDays: data.graceDays,
        maxEmployees: data.maxEmployees,
        maxBranches: data.maxBranches,
        maxProducts: data.maxProducts,
        maxMonthlyInvoices: data.maxMonthlyInvoices,
        features: data.features,
        isPublic: data.isPublic,
        isActive: data.isActive,
        sortOrder: data.sortOrder,
      };

      if (data.id) {
        await tx.plan.update({ where: { id: data.id }, data: payload });
        return data.id;
      }

      const clash = await tx.plan.findUnique({ where: { code: data.code }, select: { id: true } });
      if (clash) throw validation('يوجد خطة بنفس الكود', { code: ['الكود مستخدم'] });

      const created = await tx.plan.create({ data: payload, select: { id: true } });
      return created.id;
    });

    await auditOutsideTransaction({
      storeId: null,
      userId: context.user.id,
      action: 'platform.plan_save',
      entityType: 'plan',
      entityId: id,
      summary: `حفظ خطة الاشتراك: ${data.nameAr}`,
    });

    revalidatePath('/platform/plans');
    return { id };
  });
}

/** Send a notice to one store or to every store. */
const announcementSchema = z.object({
  storeId: z.string().min(1).nullable(),
  title: z.string().trim().min(3, 'أدخل عنوان الإشعار').max(120),
  body: z.string().trim().min(5, 'أدخل نص الإشعار').max(1000),
  severity: z.enum(['INFO', 'SUCCESS', 'WARNING', 'DANGER']).default('INFO'),
});

export async function sendAnnouncementAction(
  input: z.input<typeof announcementSchema>,
): Promise<ActionResult<{ delivered: number }>> {
  return runAction('platform.announce', async () => {
    const context = await requirePlatformAdmin();

    const parsed = announcementSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    const delivered = await transaction(async (tx) => {
      const targets = data.storeId
        ? [{ id: data.storeId }]
        : await tx.store.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });

      await tx.notification.createMany({
        data: targets.map((store) => ({
          storeId: store.id,
          kind: 'PLATFORM_ANNOUNCEMENT' as const,
          severity: data.severity,
          title: data.title,
          body: data.body,
        })),
      });

      return targets.length;
    });

    await auditOutsideTransaction({
      storeId: data.storeId,
      userId: context.user.id,
      action: 'platform.announcement',
      entityType: 'notification',
      summary: `إرسال إشعار إلى ${delivered} متجر: ${data.title}`,
    });

    revalidatePath('/platform');
    return { delivered };
  });
}

/** Reset a store owner's password when they are locked out. */
export async function resetOwnerPasswordAction(
  storeId: string,
): Promise<ActionResult<{ password: string; email: string | null }>> {
  return runAction('platform.resetOwnerPassword', async () => {
    const context = await requirePlatformAdmin();
    const password = generateTemporaryPassword();

    const result = await transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { id: storeId },
        select: { id: true, name: true, owner: { select: { id: true, email: true } } },
      });
      if (!store?.owner) throw notFound('مالك المتجر');

      await tx.user.update({
        where: { id: store.owner.id },
        data: { passwordHash: await hashPassword(password), mustChangePassword: true },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: context.user.id,
        action: 'platform.owner_password_reset',
        entityType: 'user',
        entityId: store.owner.id,
        summary: `إعادة تعيين كلمة مرور مالك المتجر ${store.name}`,
      });

      return { ownerId: store.owner.id, email: store.owner.email };
    });

    await revokeAllSessionsForUser(result.ownerId);
    return { password, email: result.email };
  });
}
