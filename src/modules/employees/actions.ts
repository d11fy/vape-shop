'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requireWritePermission } from '@/core/auth/context';
import { recordAudit } from '@/core/audit';
import { generateTemporaryPassword, hashPassword } from '@/core/auth/password';
import { revokeAllSessionsForUser } from '@/core/auth/session';
import { transaction } from '@/core/db';
import { businessRule, forbidden, notFound, planLimit, validation } from '@/core/errors';
import { describePermission, sanitizePermissions } from '@/core/rbac/permissions';
import { OWNER_ROLE_KEY } from '@/core/rbac/roles';
import type { ActionResult } from '@/core/result';
import { toFieldErrors } from '@/modules/auth/validation';

/**
 * Team management.
 *
 * Two rules protect the store from locking itself out or leaking access:
 * the owner role can never be edited or removed, and nobody can grant a
 * permission they do not themselves hold.
 */

const employeeSchema = z.object({
  membershipId: z.string().optional().nullable(),
  name: z.string().trim().min(2, 'أدخل اسم الموظف').max(80),
  email: z.email('بريد إلكتروني غير صالح').trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s-]{7,20}$/, 'رقم هاتف غير صالح')
    .optional()
    .or(z.literal('')),
  password: z.string().min(8, 'كلمة المرور يجب ألا تقل عن 8 أحرف').max(128).optional(),
  roleId: z.string().min(1, 'اختر الدور'),
  branchId: z.string().min(1).optional().nullable(),
  extraPermissions: z.array(z.string()).default([]),
  deniedPermissions: z.array(z.string()).default([]),
  status: z.enum(['ACTIVE', 'DISABLED']).default('ACTIVE'),
});

export type EmployeeInput = z.input<typeof employeeSchema>;

export interface SaveEmployeeResult {
  membershipId: string;
  /** Returned once, on creation, so the owner can hand it over. */
  temporaryPassword?: string;
}

export async function saveEmployeeAction(
  input: EmployeeInput,
): Promise<ActionResult<SaveEmployeeResult>> {
  return runAction('employees.save', async () => {
    const context = await requireWritePermission('employees.manage');
    const { store, user: actor } = context;

    const parsed = employeeSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات الموظف', toFieldErrors(parsed.error));
    }
    const data = parsed.data;

    // You cannot grant what you do not have.
    const grantable = new Set(
      store.isOwner ? sanitizePermissions([...store.permissions]) : [...store.permissions],
    );
    const extra = sanitizePermissions(data.extraPermissions);
    const denied = sanitizePermissions(data.deniedPermissions);

    if (!store.isOwner) {
      const overreach = extra.find((permission) => !grantable.has(permission));
      if (overreach) {
        throw forbidden(
          `لا يمكنك منح صلاحية «${describePermission(overreach)}» لأنك لا تملكها بنفسك.`,
        );
      }
    }

    const result = await transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: data.roleId, storeId: store.id },
        select: { id: true, key: true, nameAr: true },
      });
      if (!role) throw notFound('الدور');

      // ── Edit ──────────────────────────────────────────────────────────────
      if (data.membershipId) {
        const membership = await tx.storeUser.findFirst({
          where: { id: data.membershipId, storeId: store.id },
          select: {
            id: true,
            status: true,
            userId: true,
            role: { select: { key: true, nameAr: true } },
            user: { select: { name: true, email: true } },
          },
        });
        if (!membership) throw notFound('الموظف');

        if (membership.role.key === OWNER_ROLE_KEY && role.key !== OWNER_ROLE_KEY) {
          throw businessRule('لا يمكن تغيير دور صاحب المحل.');
        }
        if (membership.userId === actor.id && data.status === 'DISABLED') {
          throw businessRule('لا يمكنك تعطيل حسابك بنفسك.');
        }

        await tx.user.update({
          where: { id: membership.userId },
          data: {
            name: data.name,
            phone: data.phone || null,
            // A password the manager typed for someone else is still not theirs.
            ...(data.password
              ? {
                  passwordHash: await hashPassword(data.password),
                  mustChangePassword: membership.userId !== actor.id,
                }
              : {}),
          },
        });

        await tx.storeUser.update({
          where: { id: membership.id },
          data: {
            roleId: role.id,
            branchId: data.branchId ?? null,
            extraPermissions: extra,
            deniedPermissions: denied,
            status: data.status,
          },
        });

        // Disabling a member must take effect immediately, not at token expiry.
        if (data.status === 'DISABLED' && membership.status !== 'DISABLED') {
          await revokeAllSessionsForUser(membership.userId);
        }

        await recordAudit(tx, {
          storeId: store.id,
          userId: actor.id,
          action: 'employee.update',
          entityType: 'store_user',
          entityId: membership.id,
          summary: `تعديل بيانات الموظف ${data.name}`,
          before: { role: membership.role.nameAr, status: membership.status },
          after: {
            role: role.nameAr,
            status: data.status,
            extraPermissions: extra,
            deniedPermissions: denied,
            passwordReset: Boolean(data.password),
          },
        });

        return { membershipId: membership.id };
      }

      // ── Create ────────────────────────────────────────────────────────────
      const limit = store.subscription.limits.maxEmployees;
      if (limit !== null) {
        const count = await tx.storeUser.count({
          where: { storeId: store.id, status: { in: ['ACTIVE', 'INVITED'] } },
        });
        if (count >= limit) {
          throw planLimit(
            `وصلت للحد الأقصى من الموظفين في خطتك (${limit} موظف). قم بترقية الاشتراك لإضافة المزيد.`,
            { limit, count },
          );
        }
      }

      if (role.key === OWNER_ROLE_KEY) {
        throw businessRule('لا يمكن إنشاء حساب بدور صاحب المحل.');
      }

      const temporaryPassword = data.password ?? generateTemporaryPassword();
      const passwordHash = await hashPassword(temporaryPassword);

      const existingUser = await tx.user.findUnique({
        where: { email: data.email },
        select: { id: true, name: true },
      });

      let userId: string;

      if (existingUser) {
        // An existing account can join a second store; the password is theirs.
        const alreadyMember = await tx.storeUser.findUnique({
          where: { storeId_userId: { storeId: store.id, userId: existingUser.id } },
          select: { id: true },
        });
        if (alreadyMember) {
          throw validation('هذا البريد مسجل بالفعل في المتجر', {
            email: ['هذا الموظف موجود بالفعل'],
          });
        }
        userId = existingUser.id;
      } else {
        const created = await tx.user.create({
          data: {
            name: data.name,
            email: data.email,
            phone: data.phone || null,
            passwordHash,
            mustChangePassword: true,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        userId = created.id;
      }

      const membership = await tx.storeUser.create({
        data: {
          storeId: store.id,
          userId,
          roleId: role.id,
          branchId: data.branchId ?? null,
          extraPermissions: extra,
          deniedPermissions: denied,
          status: 'ACTIVE',
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: actor.id,
        action: 'employee.create',
        entityType: 'store_user',
        entityId: membership.id,
        summary: `إضافة موظف جديد: ${data.name} بدور ${role.nameAr}`,
        after: { name: data.name, email: data.email, role: role.nameAr },
      });

      return {
        membershipId: membership.id,
        temporaryPassword: existingUser ? undefined : temporaryPassword,
      };
    });

    revalidatePath('/employees');
    return result;
  });
}

export async function resetEmployeePasswordAction(
  membershipId: string,
): Promise<ActionResult<{ password: string }>> {
  return runAction('employees.resetPassword', async () => {
    const { store, user: actor } = await requireWritePermission('employees.manage');

    const password = generateTemporaryPassword();

    await transaction(async (tx) => {
      const membership = await tx.storeUser.findFirst({
        where: { id: membershipId, storeId: store.id },
        select: { id: true, userId: true, user: { select: { name: true } } },
      });
      if (!membership) throw notFound('الموظف');

      await tx.user.update({
        where: { id: membership.userId },
        data: { passwordHash: await hashPassword(password), mustChangePassword: true },
      });

      // Force a fresh sign-in with the new password everywhere.
      await revokeAllSessionsForUser(membership.userId);

      await recordAudit(tx, {
        storeId: store.id,
        userId: actor.id,
        action: 'employee.password_reset',
        entityType: 'store_user',
        entityId: membership.id,
        summary: `إعادة تعيين كلمة مرور الموظف ${membership.user.name}`,
      });
    });

    return { password };
  });
}

export async function setEmployeeStatusAction(
  membershipId: string,
  status: 'ACTIVE' | 'DISABLED',
): Promise<ActionResult<void>> {
  return runAction('employees.setStatus', async () => {
    const { store, user: actor } = await requireWritePermission('employees.manage');

    await transaction(async (tx) => {
      const membership = await tx.storeUser.findFirst({
        where: { id: membershipId, storeId: store.id },
        select: {
          id: true,
          userId: true,
          status: true,
          role: { select: { key: true } },
          user: { select: { name: true } },
        },
      });
      if (!membership) throw notFound('الموظف');

      if (membership.role.key === OWNER_ROLE_KEY) {
        throw businessRule('لا يمكن تعطيل حساب صاحب المحل.');
      }
      if (membership.userId === actor.id) {
        throw businessRule('لا يمكنك تعطيل حسابك بنفسك.');
      }

      await tx.storeUser.update({ where: { id: membership.id }, data: { status } });

      if (status === 'DISABLED') await revokeAllSessionsForUser(membership.userId);

      await recordAudit(tx, {
        storeId: store.id,
        userId: actor.id,
        action: status === 'DISABLED' ? 'employee.disable' : 'employee.enable',
        entityType: 'store_user',
        entityId: membership.id,
        summary: `${status === 'DISABLED' ? 'تعطيل' : 'تفعيل'} حساب الموظف ${membership.user.name}`,
        before: { status: membership.status },
        after: { status },
      });
    });

    revalidatePath('/employees');
  });
}

// ── Roles ────────────────────────────────────────────────────────────────────

const roleSchema = z.object({
  id: z.string().optional().nullable(),
  nameAr: z.string().trim().min(2, 'أدخل اسم الدور').max(60),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  permissions: z.array(z.string()).min(1, 'اختر صلاحية واحدة على الأقل'),
});

export async function saveRoleAction(
  input: z.input<typeof roleSchema>,
): Promise<ActionResult<{ id: string }>> {
  return runAction('roles.save', async () => {
    const context = await requireWritePermission('roles.manage');
    const { store, user: actor } = context;

    const parsed = roleSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من بيانات الدور', toFieldErrors(parsed.error));
    const data = parsed.data;

    const permissions = sanitizePermissions(data.permissions);

    if (!store.isOwner) {
      const overreach = permissions.find((permission) => !store.permissions.has(permission));
      if (overreach) {
        throw forbidden(
          `لا يمكنك منح صلاحية «${describePermission(overreach)}» لأنك لا تملكها بنفسك.`,
        );
      }
    }

    const id = await transaction(async (tx) => {
      if (data.id) {
        const existing = await tx.role.findFirst({
          where: { id: data.id, storeId: store.id },
          select: { id: true, key: true, nameAr: true, permissions: true },
        });
        if (!existing) throw notFound('الدور');
        if (existing.key === OWNER_ROLE_KEY) {
          throw businessRule('لا يمكن تعديل صلاحيات دور صاحب المحل.');
        }

        await tx.role.update({
          where: { id: existing.id },
          data: {
            nameAr: data.nameAr,
            description: data.description || null,
            permissions,
          },
        });

        await recordAudit(tx, {
          storeId: store.id,
          userId: actor.id,
          action: 'role.update',
          entityType: 'role',
          entityId: existing.id,
          summary: `تعديل صلاحيات الدور: ${data.nameAr}`,
          before: { permissions: existing.permissions.length },
          after: { permissions: permissions.length },
        });

        return existing.id;
      }

      const key = `custom-${Date.now().toString(36)}`;
      const created = await tx.role.create({
        data: {
          storeId: store.id,
          key,
          nameAr: data.nameAr,
          description: data.description || null,
          isSystem: false,
          permissions,
        },
        select: { id: true },
      });

      await recordAudit(tx, {
        storeId: store.id,
        userId: actor.id,
        action: 'role.create',
        entityType: 'role',
        entityId: created.id,
        summary: `إنشاء دور جديد: ${data.nameAr}`,
        after: { name: data.nameAr, permissions: permissions.length },
      });

      return created.id;
    });

    revalidatePath('/employees/roles');
    revalidatePath('/employees');
    return { id };
  });
}

export async function deleteRoleAction(roleId: string): Promise<ActionResult<void>> {
  return runAction('roles.delete', async () => {
    const { store, user: actor } = await requireWritePermission('roles.manage');

    await transaction(async (tx) => {
      const role = await tx.role.findFirst({
        where: { id: roleId, storeId: store.id },
        select: {
          id: true,
          key: true,
          nameAr: true,
          isSystem: true,
          _count: { select: { members: true } },
        },
      });
      if (!role) throw notFound('الدور');

      if (role.isSystem) throw businessRule('لا يمكن حذف الأدوار الأساسية. يمكنك تعديل صلاحياتها.');
      if (role._count.members > 0) {
        throw businessRule(
          `لا يمكن حذف الدور لأنه مسند إلى ${role._count.members} موظف. غيّر أدوارهم أولاً.`,
        );
      }

      await tx.role.delete({ where: { id: role.id } });

      await recordAudit(tx, {
        storeId: store.id,
        userId: actor.id,
        action: 'role.delete',
        entityType: 'role',
        entityId: role.id,
        summary: `حذف الدور: ${role.nameAr}`,
      });
    });

    revalidatePath('/employees/roles');
  });
}
