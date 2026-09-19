import 'server-only';

import type { StoreContext } from '@/core/auth/context';
import { dayKey } from '@/core/datetime';
import { db } from '@/core/db';
import { logger } from '@/core/logger';
import { fromDb } from '@/core/money';
import type { Prisma } from '@/generated/prisma/client';
import { countAr, NOUNS } from '@/lib/arabic-count';
import { storeFormatter } from '@/lib/formatter';
import { overdueDebtSummary } from '@/modules/customers/queries';

/**
 * Time-based notices — overdue debts, unpaid supplier invoices, a subscription
 * about to end — have no event to hang off, so they are produced as a daily
 * digest the first time anyone opens the store that day.
 *
 * Two layers keep this cheap and exactly-once:
 *  - an in-process memo skips the work for the rest of the day after the first
 *    request, so ordinary page loads pay nothing;
 *  - every notice carries a `dedupeKey` under a unique index, so concurrent
 *    requests or several server instances can never create it twice.
 *
 * It never throws: a failed digest must not take the page down with it.
 */

const lastRun = new Map<string, string>();

/** Days before the end of a subscription on which the owner is reminded. */
const SUBSCRIPTION_REMINDER_DAYS = new Set([7, 3, 1]);

export async function ensureDailyNotices(store: StoreContext): Promise<void> {
  const today = dayKey(new Date(), store.settings.timezone);
  if (lastRun.get(store.id) === today) return;
  // Claimed before the work so concurrent requests on this instance do not
  // all run it; released again if the work fails so the next request retries.
  lastRun.set(store.id, today);

  try {
    const notices = await collectNotices(store, today);
    if (notices.length > 0) {
      await db.notification.createMany({ data: notices, skipDuplicates: true });
    }
  } catch (error) {
    lastRun.delete(store.id);
    logger.error('daily notices failed', { storeId: store.id, error });
  }
}

async function collectNotices(
  store: StoreContext,
  today: string,
): Promise<Prisma.NotificationCreateManyInput[]> {
  const { settings, subscription } = store;
  const fmt = storeFormatter(settings);
  const cutoff = new Date(Date.now() - settings.debtOverdueDays * 24 * 60 * 60 * 1000);

  const [overdue, supplierDue] = await Promise.all([
    settings.debtEnabled ? overdueDebtSummary(store.id, settings.debtOverdueDays) : null,
    db.purchase.aggregate({
      where: {
        storeId: store.id,
        deletedAt: null,
        status: { in: ['RECEIVED', 'PARTIALLY_RETURNED'] },
        dueTotal: { gt: 0 },
        purchasedAt: { lt: cutoff },
      },
      _sum: { dueTotal: true },
      _count: true,
    }),
  ]);

  const notices: Prisma.NotificationCreateManyInput[] = [];

  if (overdue && overdue.customers > 0) {
    notices.push({
      storeId: store.id,
      kind: 'OVERDUE_DEBT',
      severity: 'WARNING',
      title: 'ديون متأخرة',
      // The amount ends the sentence: formatted money already carries its own
      // trailing mark ("ر.س."), so no full stop is added after it.
      body: `${countAr(overdue.customers, NOUNS.customer)} تجاوزت ديونهم ${countAr(
        settings.debtOverdueDays,
        NOUNS.day,
      )} — الإجمالي ${fmt.money(overdue.total)}`,
      link: '/debts?overdue=yes',
      dedupeKey: `overdue-debts:${today}`,
    });
  }

  const supplierDueTotal = fromDb(supplierDue._sum.dueTotal);
  if (supplierDue._count > 0 && supplierDueTotal > 0) {
    notices.push({
      storeId: store.id,
      kind: 'SUPPLIER_DUE',
      severity: 'INFO',
      title: 'مستحقات موردين قديمة',
      body: `${countAr(supplierDue._count, NOUNS.invoice)} شراء غير مسددة منذ أكثر من ${countAr(
        settings.debtOverdueDays,
        NOUNS.day,
      )} — الإجمالي ${fmt.money(supplierDueTotal)}`,
      link: '/suppliers',
      dedupeKey: `supplier-due:${today}`,
    });
  }

  const endsOn = dayKey(subscription.endsAt, settings.timezone);
  if (
    !subscription.isBlocked &&
    (subscription.status === 'TRIALING' || subscription.status === 'ACTIVE') &&
    SUBSCRIPTION_REMINDER_DAYS.has(subscription.daysRemaining)
  ) {
    notices.push({
      storeId: store.id,
      kind: 'SUBSCRIPTION_EXPIRING',
      severity: subscription.daysRemaining <= 1 ? 'DANGER' : 'WARNING',
      title: subscription.status === 'TRIALING' ? 'الفترة التجريبية تنتهي قريباً' : 'الاشتراك ينتهي قريباً',
      body: `متبقٍ ${countAr(subscription.daysRemaining, NOUNS.day)} على انتهاء خطة ${subscription.planName}. جدّد لتجنب توقف البيع.`,
      link: '/settings/subscription',
      // One reminder per threshold per subscription period.
      dedupeKey: `subscription-expiring:${endsOn}:${subscription.daysRemaining}`,
    });
  }

  if (subscription.status === 'GRACE') {
    notices.push({
      storeId: store.id,
      kind: 'SUBSCRIPTION_EXPIRED',
      severity: 'DANGER',
      title: 'انتهى الاشتراك',
      body: 'المتجر في فترة السماح: يمكنك عرض البيانات فقط حتى تجديد الاشتراك.',
      link: '/settings/subscription',
      dedupeKey: `subscription-expired:${endsOn}`,
    });
  }

  return notices;
}
