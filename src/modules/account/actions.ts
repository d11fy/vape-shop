'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { auditOutsideTransaction } from '@/core/audit';
import { CHANGE_PASSWORD_PATH, requireAuth } from '@/core/auth/context';
import { db } from '@/core/db';
import { businessRule, notFound, validation } from '@/core/errors';
import type { ActionResult } from '@/core/result';
import { phoneSchema, toFieldErrors } from '@/modules/auth/validation';

/**
 * Self-service account actions. A user can only ever touch their own profile
 * and their own sessions — every query is keyed by the session's user id, never
 * by an id from the browser alone.
 */

async function requireAccount() {
  const context = await requireAuth();
  if (context.user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  return context;
}

const profileSchema = z.object({
  name: z.string().trim().min(2, 'أدخل اسمك').max(80, 'الاسم طويل جداً'),
  phone: phoneSchema.optional().or(z.literal('')),
});

export async function updateProfileAction(
  input: z.input<typeof profileSchema>,
): Promise<ActionResult<void>> {
  return runAction('account.updateProfile', async () => {
    const context = await requireAccount();

    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const phone = parsed.data.phone ? parsed.data.phone.replace(/[\s-]/g, '') : null;

    // Phone numbers sign people in, so they are unique across the platform.
    if (phone) {
      const taken = await db.user.findFirst({
        where: { phone, id: { not: context.user.id } },
        select: { id: true },
      });
      if (taken) {
        throw validation('رقم الهاتف مستخدم', { phone: ['هذا الرقم مسجل لحساب آخر'] });
      }
    }

    const before = await db.user.findUniqueOrThrow({
      where: { id: context.user.id },
      select: { name: true, phone: true },
    });

    await db.user.update({
      where: { id: context.user.id },
      data: { name: parsed.data.name, phone },
    });

    await auditOutsideTransaction({
      storeId: context.store?.id ?? null,
      userId: context.user.id,
      action: 'account.profile_update',
      entityType: 'user',
      entityId: context.user.id,
      summary: 'تعديل بيانات الحساب الشخصي',
      before,
      after: { name: parsed.data.name, phone },
    });

    revalidatePath('/', 'layout');
  });
}

/** End one of the user's other sessions — a lost phone, a shared computer. */
export async function revokeSessionAction(sessionId: string): Promise<ActionResult<void>> {
  return runAction('account.revokeSession', async () => {
    const context = await requireAccount();

    if (sessionId === context.sessionId) {
      throw businessRule('هذه جلستك الحالية — استخدم «تسجيل الخروج» لإنهائها.');
    }

    const { count } = await db.session.updateMany({
      where: { id: sessionId, userId: context.user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw notFound('الجلسة');

    await auditOutsideTransaction({
      storeId: context.store?.id ?? null,
      userId: context.user.id,
      action: 'account.session_revoke',
      entityType: 'session',
      entityId: sessionId,
      summary: 'إنهاء جلسة دخول على جهاز آخر',
    });

    revalidatePath('/account');
  });
}

/** Sign out everywhere except here. */
export async function revokeOtherSessionsAction(): Promise<ActionResult<{ count: number }>> {
  return runAction('account.revokeOtherSessions', async () => {
    const context = await requireAccount();

    const { count } = await db.session.updateMany({
      where: { userId: context.user.id, revokedAt: null, id: { not: context.sessionId } },
      data: { revokedAt: new Date() },
    });

    if (count > 0) {
      await auditOutsideTransaction({
        storeId: context.store?.id ?? null,
        userId: context.user.id,
        action: 'account.session_revoke_all',
        entityType: 'user',
        entityId: context.user.id,
        summary: `تسجيل الخروج من كل الأجهزة الأخرى (${count})`,
      });
    }

    revalidatePath('/account');
    return { count };
  });
}
