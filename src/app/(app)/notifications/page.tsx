import type { Metadata } from 'next';

import { requireStore } from '@/core/auth/context';
import { firstParam } from '@/lib/table-query';
import { NotificationsView } from '@/modules/notifications/notifications-view';
import { listNotifications } from '@/modules/notifications/queries';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'الإشعارات' };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await requireStore();
  const params = await searchParams;
  const unreadOnly = firstParam(params, 'filter') === 'unread';
  const page = Math.max(1, Number(firstParam(params, 'page')) || 1);

  const data = await listNotifications(context, { unreadOnly, page });

  return (
    <>
      <PageHeader
        title="الإشعارات"
        description="تنبيهات المخزون والديون والصندوق والاشتراك — ما يخصك حسب صلاحياتك"
      />
      <NotificationsView data={data} unreadOnly={unreadOnly} />
    </>
  );
}
