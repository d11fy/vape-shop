import 'server-only';

import { db } from '@/core/db';
import { fromDb, type Money } from '@/core/money';
import { ALL_PERMISSIONS } from '@/core/rbac/permissions';
import type { DateRange } from '@/core/datetime';
import type { UserStatus } from '@/generated/prisma/enums';

/**
 * Team queries.
 *
 * Employee "performance" here is deliberately descriptive — counts and totals
 * of what was recorded — not a score. A cashier on the quiet shift is not a
 * worse employee, and the product should not imply otherwise.
 */

export interface EmployeeRow {
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  roleId: string;
  roleName: string;
  roleKey: string;
  branchName: string | null;
  status: UserStatus;
  isOwner: boolean;
  extraPermissions: string[];
  deniedPermissions: string[];
  lastActiveAt: Date | null;
  lastLoginAt: Date | null;
  joinedAt: Date;
}

export async function listEmployees(storeId: string): Promise<EmployeeRow[]> {
  const members = await db.storeUser.findMany({
    where: { storeId },
    orderBy: [{ role: { key: 'asc' } }, { createdAt: 'asc' }],
    select: {
      id: true,
      status: true,
      extraPermissions: true,
      deniedPermissions: true,
      lastActiveAt: true,
      joinedAt: true,
      role: { select: { id: true, key: true, nameAr: true } },
      branch: { select: { name: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatarUrl: true,
          lastLoginAt: true,
        },
      },
    },
  });

  return members.map((member) => ({
    membershipId: member.id,
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    phone: member.user.phone,
    avatarUrl: member.user.avatarUrl,
    roleId: member.role.id,
    roleName: member.role.nameAr,
    roleKey: member.role.key,
    branchName: member.branch?.name ?? null,
    status: member.status,
    isOwner: member.role.key === 'owner',
    extraPermissions: member.extraPermissions,
    deniedPermissions: member.deniedPermissions,
    lastActiveAt: member.lastActiveAt,
    lastLoginAt: member.user.lastLoginAt,
    joinedAt: member.joinedAt,
  }));
}

export interface RoleRow {
  id: string;
  key: string;
  nameAr: string;
  nameEn: string | null;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}

export async function listRoles(storeId: string): Promise<RoleRow[]> {
  const roles = await db.role.findMany({
    where: { storeId },
    orderBy: [{ isSystem: 'desc' }, { key: 'asc' }],
    select: {
      id: true,
      key: true,
      nameAr: true,
      nameEn: true,
      description: true,
      isSystem: true,
      permissions: true,
      _count: { select: { members: true } },
    },
  });

  return roles.map((role) => ({
    id: role.id,
    key: role.key,
    nameAr: role.nameAr,
    nameEn: role.nameEn,
    description: role.description,
    isSystem: role.isSystem,
    // Owners always hold everything, regardless of what is stored.
    permissions: role.key === 'owner' ? [...ALL_PERMISSIONS] : role.permissions,
    memberCount: role._count.members,
  }));
}

export interface EmployeeActivity {
  invoiceCount: number;
  salesTotal: Money;
  averageInvoice: Money;
  discountsGiven: Money;
  returnsHandled: number;
  returnsTotal: Money;
  collections: Money;
  expensesRecorded: Money;
  shiftsClosed: number;
  cashDifference: Money;
  auditCount: number;
}

/** Operational activity for one employee over a period. */
export async function getEmployeeActivity(
  storeId: string,
  userId: string,
  range: DateRange,
): Promise<EmployeeActivity> {
  const window = { gte: range.from, lt: range.to };

  const [sales, returns, collections, expenses, shifts, audits] = await Promise.all([
    db.sale.aggregate({
      where: { storeId, userId, deletedAt: null, status: { not: 'CANCELED' }, soldAt: window },
      _sum: { total: true, discountTotal: true },
      _count: true,
    }),
    db.saleReturn.aggregate({
      where: { storeId, userId, deletedAt: null, returnedAt: window },
      _sum: { total: true },
      _count: true,
    }),
    db.payment.aggregate({
      where: {
        storeId,
        userId,
        deletedAt: null,
        direction: 'IN',
        source: 'CUSTOMER_DEBT',
        paidAt: window,
      },
      _sum: { amount: true },
    }),
    db.expense.aggregate({
      where: { storeId, userId, deletedAt: null, spentAt: window },
      _sum: { amount: true },
    }),
    db.shift.aggregate({
      where: { storeId, userId, status: 'CLOSED', closedAt: window },
      _sum: { difference: true },
      _count: true,
    }),
    db.auditLog.count({ where: { storeId, userId, createdAt: window } }),
  ]);

  const salesTotal = fromDb(sales._sum.total);
  const invoiceCount = sales._count;

  return {
    invoiceCount,
    salesTotal,
    averageInvoice: invoiceCount > 0 ? Math.round(salesTotal / invoiceCount) : 0,
    discountsGiven: fromDb(sales._sum.discountTotal),
    returnsHandled: returns._count,
    returnsTotal: fromDb(returns._sum.total),
    collections: fromDb(collections._sum.amount),
    expensesRecorded: fromDb(expenses._sum.amount),
    shiftsClosed: shifts._count,
    cashDifference: fromDb(shifts._sum.difference),
    auditCount: audits,
  };
}

export async function getEmployee(storeId: string, membershipId: string) {
  const member = await db.storeUser.findFirst({
    where: { id: membershipId, storeId },
    select: {
      id: true,
      status: true,
      branchId: true,
      extraPermissions: true,
      deniedPermissions: true,
      joinedAt: true,
      lastActiveAt: true,
      role: { select: { id: true, key: true, nameAr: true, permissions: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatarUrl: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
        },
      },
    },
  });

  if (!member) return null;

  return {
    membershipId: member.id,
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    phone: member.user.phone,
    avatarUrl: member.user.avatarUrl,
    status: member.status,
    branchId: member.branchId,
    roleId: member.role.id,
    roleKey: member.role.key,
    roleName: member.role.nameAr,
    rolePermissions:
      member.role.key === 'owner' ? [...ALL_PERMISSIONS] : member.role.permissions,
    extraPermissions: member.extraPermissions,
    deniedPermissions: member.deniedPermissions,
    joinedAt: member.joinedAt,
    lastActiveAt: member.lastActiveAt,
    lastLoginAt: member.user.lastLoginAt,
  };
}

/** Count active members, for the plan's employee limit. */
export async function countActiveEmployees(storeId: string): Promise<number> {
  return db.storeUser.count({ where: { storeId, status: { in: ['ACTIVE', 'INVITED'] } } });
}

export async function listBranchOptions(storeId: string) {
  return db.branch.findMany({
    where: { storeId, isActive: true, deletedAt: null },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
}
