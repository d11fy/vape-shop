'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requireStore } from '@/core/auth/context';
import { db } from '@/core/db';
import { validation } from '@/core/errors';
import type { ActionResult } from '@/core/result';
import { notificationScope } from './queries';

const markSchema = z.object({
  /** Omit to mark everything this member can see. */
  ids: z.array(z.string().min(1)).max(200).optional(),
});

/**
 * Mark notifications read for the current member only. Ids from the browser
 * are intersected with what this member may see, so a guessed id from another
 * store or a hidden kind is silently ignored rather than recorded.
 */
export async function markNotificationsReadAction(
  input: z.input<typeof markSchema>,
): Promise<ActionResult<{ marked: number }>> {
  return runAction('notifications.markRead', async () => {
    const context = await requireStore();

    const parsed = markSchema.safeParse(input);
    if (!parsed.success) throw validation('طلب غير صالح');

    const targets = await db.notification.findMany({
      where: {
        ...notificationScope(context),
        ...(parsed.data.ids ? { id: { in: parsed.data.ids } } : {}),
        reads: { none: { userId: context.user.id } },
      },
      select: { id: true },
      take: 1000,
    });

    if (targets.length > 0) {
      await db.notificationRead.createMany({
        data: targets.map((target) => ({ notificationId: target.id, userId: context.user.id })),
        skipDuplicates: true,
      });
    }

    revalidatePath('/', 'layout');
    return { marked: targets.length };
  });
}
