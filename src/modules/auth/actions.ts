'use server';

import { randomBytes, createHash } from 'node:crypto';
import { redirect } from 'next/navigation';

import { runAction } from '@/core/action';
import { auditOutsideTransaction } from '@/core/audit';
import { db, transaction } from '@/core/db';
import { env } from '@/core/env';
import { businessRule, validation } from '@/core/errors';
import { clearRateLimit, enforceRateLimit } from '@/core/rate-limit';
import { logger } from '@/core/logger';
import type { ActionResult } from '@/core/result';
import { hashPassword, needsRehash, verifyPassword } from '@/core/auth/password';
import {
  createSession,
  readFingerprint,
  setActiveStore,
  writeSessionCookie,
} from '@/core/auth/session';
import { CHANGE_PASSWORD_PATH, requireAuth } from '@/core/auth/context';
import { provisionStore } from '@/modules/store/provisioning';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
  signInSchema,
  toFieldErrors,
} from './validation';

/**
 * Authentication actions.
 *
 * Two rules shape everything here: never reveal whether an account exists (the
 * same message for a wrong password and an unknown email), and never let an
 * unlimited number of guesses through (see `enforceRateLimit`).
 */

const GENERIC_CREDENTIALS_ERROR = 'بيانات الدخول غير صحيحة. تحقق من البريد وكلمة المرور.';

export interface SignInResult {
  /** Where the browser should go next. */
  redirectTo: string;
}

export async function signInAction(formData: FormData): Promise<ActionResult<SignInResult>> {
  return runAction('auth.signIn', async () => {
    const parsed = signInSchema.safeParse({
      identifier: formData.get('identifier'),
      password: formData.get('password'),
      remember: formData.get('remember') === 'on',
    });

    if (!parsed.success) {
      throw validation('تحقق من البيانات المدخلة', toFieldErrors(parsed.error));
    }

    const { identifier, password } = parsed.data;
    const fingerprint = await readFingerprint();
    const normalized = identifier.toLowerCase();

    enforceRateLimit('signIn', `${fingerprint.ipAddress ?? 'unknown'}`);
    enforceRateLimit('signIn', normalized);

    const isEmail = normalized.includes('@');
    const user = await db.user.findFirst({
      where: isEmail
        ? { email: normalized }
        : { phone: { in: [identifier, identifier.replace(/[\s-]/g, '')] } },
      select: {
        id: true,
        name: true,
        passwordHash: true,
        status: true,
        platformRole: true,
        mustChangePassword: true,
        memberships: {
          where: { status: 'ACTIVE' },
          select: { storeId: true, store: { select: { status: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    // Always run a hash comparison so the response time does not leak whether
    // the account exists.
    const passwordValid = user
      ? await verifyPassword(password, user.passwordHash)
      : await verifyPassword(password, DUMMY_HASH);

    if (!user || !passwordValid) {
      logger.security('failed sign-in', { identifier: normalized, ip: fingerprint.ipAddress });
      throw validation(GENERIC_CREDENTIALS_ERROR, { identifier: [' '], password: [' '] });
    }

    if (user.status === 'DISABLED') {
      throw businessRule('تم تعطيل هذا الحساب. تواصل مع صاحب المحل.');
    }

    clearRateLimit('signIn', normalized);

    // Silently upgrade the hash if the cost parameters have been raised.
    if (needsRehash(user.passwordHash)) {
      const upgraded = await hashPassword(password);
      await db.user.update({ where: { id: user.id }, data: { passwordHash: upgraded } });
    }

    const activeStoreId = user.memberships.length === 1 ? user.memberships[0]!.storeId : null;

    const session = await createSession(user.id, { activeStoreId, fingerprint });
    await writeSessionCookie(session);

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    if (activeStoreId) {
      await db.storeUser.updateMany({
        where: { userId: user.id, storeId: activeStoreId },
        data: { lastActiveAt: new Date() },
      });
    }

    await auditOutsideTransaction({
      storeId: activeStoreId,
      userId: user.id,
      action: 'auth.sign_in',
      entityType: 'session',
      entityId: session.id,
      summary: 'تسجيل دخول للنظام',
    });

    if (user.mustChangePassword) return { redirectTo: CHANGE_PASSWORD_PATH };
    if (user.memberships.length === 0) {
      return { redirectTo: user.platformRole ? '/platform' : '/no-access' };
    }
    if (user.memberships.length > 1) return { redirectTo: '/select-store' };
    return { redirectTo: '/dashboard' };
  });
}

/** A valid scrypt hash of a random string — used only for constant-time failure. */
const DUMMY_HASH =
  'scrypt$32768$8$1$Y2xhdWRlZHVtbXlzYWx0MDE$4Q8Zr1n1yR6mJ1n0aVYyq5oKQ8W1Q5xkxq0R6bJvT2r6yv5V0oJ2lD9d9V3n7w3ZQ1kQ0xq7vB1eM4V5c8w9A';

export async function registerStoreAction(formData: FormData): Promise<ActionResult<SignInResult>> {
  return runAction('auth.register', async () => {
    if (!env.ALLOW_PUBLIC_SIGNUP) {
      throw businessRule('التسجيل الذاتي غير متاح حالياً. تواصل معنا لإنشاء متجرك.');
    }

    const parsed = registerSchema.safeParse({
      ownerName: formData.get('ownerName'),
      email: formData.get('email'),
      phone: formData.get('phone') ?? '',
      password: formData.get('password'),
      storeName: formData.get('storeName'),
      country: formData.get('country') ?? 'SA',
      acceptTerms: formData.get('acceptTerms') === 'on',
    });

    if (!parsed.success) {
      throw validation('تحقق من البيانات المدخلة', toFieldErrors(parsed.error));
    }

    const input = parsed.data;
    const fingerprint = await readFingerprint();
    enforceRateLimit('register', fingerprint.ipAddress ?? 'unknown');

    const existing = await db.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) {
      throw validation('هذا البريد مسجل مسبقاً', {
        email: ['هذا البريد مسجل مسبقاً. سجّل الدخول بدلاً من ذلك.'],
      });
    }

    const passwordHash = await hashPassword(input.password);
    const phone = input.phone && input.phone.trim() !== '' ? input.phone.trim() : null;

    const { userId, storeId } = await transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.ownerName,
          email: input.email,
          phone,
          passwordHash,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      const provisioned = await provisionStore(tx, {
        name: input.storeName,
        ownerId: user.id,
        country: input.country,
        phone,
        email: input.email,
      });

      return { userId: user.id, storeId: provisioned.store.id };
    });

    const session = await createSession(userId, { activeStoreId: storeId, fingerprint });
    await writeSessionCookie(session);

    await auditOutsideTransaction({
      storeId,
      userId,
      action: 'store.create',
      entityType: 'store',
      entityId: storeId,
      summary: `إنشاء متجر جديد: ${input.storeName}`,
    });

    return { redirectTo: '/onboarding' };
  });
}

export async function forgotPasswordAction(formData: FormData): Promise<ActionResult<void>> {
  return runAction('auth.forgotPassword', async () => {
    const parsed = forgotPasswordSchema.safeParse({ email: formData.get('email') });
    if (!parsed.success) {
      throw validation('بريد إلكتروني غير صالح', toFieldErrors(parsed.error));
    }

    const fingerprint = await readFingerprint();
    enforceRateLimit('passwordReset', fingerprint.ipAddress ?? 'unknown');
    enforceRateLimit('passwordReset', parsed.data.email);

    const user = await db.user.findUnique({
      where: { email: parsed.data.email },
      select: { id: true, status: true },
    });

    // Respond identically whether or not the account exists.
    if (user && user.status === 'ACTIVE') {
      const token = randomBytes(32).toString('base64url');
      await db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: createHash('sha256').update(token).digest('base64url'),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });

      // Delivery is intentionally pluggable: wire an email provider here.
      logger.info('password reset requested', {
        userId: user.id,
        resetUrl: `${env.APP_URL}/reset-password?token=${token}`,
      });
    }
  });
}

export async function resetPasswordAction(formData: FormData): Promise<ActionResult<void>> {
  return runAction('auth.resetPassword', async () => {
    const parsed = resetPasswordSchema.safeParse({
      token: formData.get('token'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    });
    if (!parsed.success) {
      throw validation('تحقق من البيانات المدخلة', toFieldErrors(parsed.error));
    }

    const tokenHash = createHash('sha256').update(parsed.data.token).digest('base64url');
    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true, usedAt: true },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw businessRule('رابط إعادة التعيين غير صالح أو منتهي الصلاحية.');
    }

    const passwordHash = await hashPassword(parsed.data.password);

    await transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      // Any other session was possibly the attacker's — end them all.
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await auditOutsideTransaction({
      storeId: null,
      userId: record.userId,
      action: 'auth.password_reset',
      entityType: 'user',
      entityId: record.userId,
      summary: 'إعادة تعيين كلمة المرور',
    });
  });
}

export async function changePasswordAction(formData: FormData): Promise<ActionResult<void>> {
  return runAction('auth.changePassword', async () => {
    const context = await requireAuth();

    const parsed = changePasswordSchema.safeParse({
      currentPassword: formData.get('currentPassword'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    });
    if (!parsed.success) {
      throw validation('تحقق من البيانات المدخلة', toFieldErrors(parsed.error));
    }

    const user = await db.user.findUniqueOrThrow({
      where: { id: context.user.id },
      select: { passwordHash: true },
    });

    const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!valid) {
      throw validation('كلمة المرور الحالية غير صحيحة', {
        currentPassword: ['كلمة المرور الحالية غير صحيحة'],
      });
    }

    if (parsed.data.password === parsed.data.currentPassword) {
      throw validation('اختر كلمة مرور جديدة', {
        password: ['كلمة المرور الجديدة يجب أن تختلف عن الحالية'],
      });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await db.user.update({
      where: { id: context.user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    // Keep this session alive, drop every other one.
    await db.session.updateMany({
      where: { userId: context.user.id, revokedAt: null, id: { not: context.sessionId } },
      data: { revokedAt: new Date() },
    });

    await auditOutsideTransaction({
      storeId: context.store?.id ?? null,
      userId: context.user.id,
      action: 'auth.password_change',
      entityType: 'user',
      entityId: context.user.id,
      summary: 'تغيير كلمة المرور',
    });
  });
}

/** Pick a store after signing in when the user belongs to several. */
export async function chooseStoreAction(storeId: string): Promise<void> {
  const context = await requireAuth();
  const allowed = context.memberships.some((membership) => membership.storeId === storeId);
  if (!allowed) redirect('/select-store');

  await setActiveStore(context.sessionId, storeId);
  await db.storeUser.updateMany({
    where: { userId: context.user.id, storeId },
    data: { lastActiveAt: new Date() },
  });

  redirect('/dashboard');
}
