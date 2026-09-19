'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requirePermission, requireWritePermission } from '@/core/auth/context';
import { transaction } from '@/core/db';
import { forbidden, validation } from '@/core/errors';
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from '@/core/idempotency';
import type { ActionResult } from '@/core/result';
import {
  closeShift,
  computeShiftTotals,
  openShift,
  recordCashMovement,
  type ShiftTotals,
} from '@/modules/shifts/service';
import { toFieldErrors } from '@/modules/auth/validation';

/**
 * Cash drawer and shift actions.
 */

const openShiftSchema = z.object({
  openingCash: z.number().int().min(0),
  note: z.string().max(300).optional().nullable(),
});

export async function openShiftAction(
  input: z.input<typeof openShiftSchema>,
): Promise<ActionResult<{ id: string; number: string }>> {
  return runAction('shifts.open', async () => {
    const { store, user } = await requireWritePermission('shifts.open');

    const parsed = openShiftSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));

    const shift = await transaction(async (tx) =>
      openShift(tx, {
        storeId: store.id,
        branchId: store.branch.id,
        userId: user.id,
        openingCash: parsed.data.openingCash,
        note: parsed.data.note ?? null,
      }),
    );

    revalidatePath('/cashbox');
    revalidatePath('/pos');
    return shift;
  });
}

/** Live totals for the close-shift dialog, so the cashier sees what to expect. */
export async function getShiftTotalsAction(
  shiftId: string,
): Promise<ActionResult<ShiftTotals>> {
  return runAction('shifts.totals', async () => {
    const { store, user } = await requirePermission('shifts.open', 'shifts.close', 'cashbox.view');

    const totals = await transaction(async (tx) => {
      const shift = await tx.shift.findFirst({
        where: { id: shiftId, storeId: store.id },
        select: { id: true, userId: true },
      });
      if (!shift) throw validation('الوردية غير موجودة');

      const canSeeAll = store.isOwner || store.permissions.has('shifts.view_all');
      if (shift.userId !== user.id && !canSeeAll) throw forbidden();

      return computeShiftTotals(tx, shift.id);
    });

    return totals;
  });
}

const closeShiftSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  shiftId: z.string().min(1),
  actualCash: z.number().int().min(0),
  differenceReason: z.string().max(300).optional().nullable(),
  note: z.string().max(300).optional().nullable(),
});

export async function closeShiftAction(
  input: z.input<typeof closeShiftSchema>,
): Promise<ActionResult<{ number: string; difference: number; expected: number }>> {
  return runAction('shifts.close', async () => {
    const { store, user } = await requireWritePermission('shifts.close');

    const parsed = closeShiftSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));
    const data = parsed.data;

    const result = await transaction(async (tx) => {
      const claim = await claimIdempotencyKey(tx, {
        storeId: store.id,
        scope: 'shift.close',
        key: data.idempotencyKey,
        requestHash: hashRequest({ shiftId: data.shiftId, actualCash: data.actualCash }),
      });

      if (claim.status === 'duplicate' && claim.resultId) {
        const existing = await tx.shift.findUniqueOrThrow({
          where: { id: claim.resultId },
          select: { number: true, difference: true, expectedCash: true },
        });
        return {
          number: existing.number,
          difference: Number(existing.difference),
          expected: Number(existing.expectedCash),
        };
      }

      const shift = await tx.shift.findFirst({
        where: { id: data.shiftId, storeId: store.id },
        select: { id: true, userId: true },
      });
      if (!shift) throw validation('الوردية غير موجودة');

      // A cashier closes their own shift; a manager may close anyone's.
      const canCloseOthers = store.isOwner || store.permissions.has('shifts.view_all');
      if (shift.userId !== user.id && !canCloseOthers) throw forbidden();

      const closed = await closeShift(tx, {
        storeId: store.id,
        userId: user.id,
        shiftId: shift.id,
        actualCash: data.actualCash,
        differenceReason: data.differenceReason ?? null,
        note: data.note ?? null,
      });

      await completeIdempotencyKey(tx, {
        storeId: store.id,
        scope: 'shift.close',
        key: data.idempotencyKey,
        resultId: shift.id,
      });

      return {
        number: closed.number,
        difference: closed.difference,
        expected: closed.expected,
      };
    });

    revalidatePath('/cashbox');
    revalidatePath('/pos');
    revalidatePath('/dashboard');
    return result;
  });
}

const cashMovementSchema = z.object({
  direction: z.enum(['in', 'out']),
  amount: z.number().int().positive('أدخل مبلغاً أكبر من صفر'),
  reason: z.string().trim().min(3, 'اذكر سبب الحركة').max(200),
});

export async function recordCashMovementAction(
  input: z.input<typeof cashMovementSchema>,
): Promise<ActionResult<{ balanceAfter: number }>> {
  return runAction('cashbox.move', async () => {
    const { store, user } = await requireWritePermission('cashbox.manage');

    const parsed = cashMovementSchema.safeParse(input);
    if (!parsed.success) throw validation('تحقق من البيانات', toFieldErrors(parsed.error));

    const movement = await transaction(async (tx) =>
      recordCashMovement(tx, {
        storeId: store.id,
        branchId: store.branch.id,
        userId: user.id,
        direction: parsed.data.direction,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
      }),
    );

    revalidatePath('/cashbox');
    revalidatePath('/dashboard');
    return { balanceAfter: movement.balanceAfter };
  });
}
