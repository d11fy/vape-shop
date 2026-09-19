import type { Metadata } from 'next';

import { requirePermission } from '@/core/auth/context';
import { db } from '@/core/db';
import { Prisma } from '@/generated/prisma/client';
import { firstParam, parseTableQuery } from '@/lib/table-query';
import { readPeriod, resolvePeriod } from '@/core/datetime';
import { buildFormatter } from '@/lib/formatter';
import { AuditTimeline } from '@/modules/settings/audit-timeline';
import { SettingsTabs } from '@/modules/settings/settings-tabs';
import { FilterBar } from '@/ui/filters/filter-bar';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';
import { PeriodFilter } from '@/ui/filters/period-filter';

export const metadata: Metadata = { title: 'سجل النشاط' };

/** Actions worth filtering by, grouped for the dropdown. */
const ACTION_FILTERS = [
  { value: 'all', label: 'كل العمليات' },
  { value: 'sale.', label: 'المبيعات والفواتير' },
  { value: 'return.', label: 'المرتجعات' },
  { value: 'product.', label: 'المنتجات والأسعار' },
  { value: 'inventory.', label: 'المخزون والتسويات' },
  { value: 'debt.', label: 'الديون والتحصيل' },
  { value: 'expense.', label: 'المصاريف' },
  { value: 'purchase.', label: 'المشتريات' },
  { value: 'shift.', label: 'الورديات' },
  { value: 'employee.', label: 'الموظفون' },
  { value: 'role.', label: 'الأدوار والصلاحيات' },
  { value: 'settings.', label: 'الإعدادات' },
  { value: 'auth.', label: 'الدخول والخروج' },
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('audit.view');
  const params = await searchParams;

  const query = parseTableQuery(params, { defaultPerPage: 50 });
  const period = readPeriod(params, 'last_30_days');
  const range = resolvePeriod(period.preset, store.settings.timezone, {
    from: period.from,
    to: period.to,
  });

  const actionPrefix = firstParam(params, 'action');
  const userId = firstParam(params, 'user');

  const where: Prisma.AuditLogWhereInput = {
    storeId: store.id,
    createdAt: { gte: range.from, lt: range.to },
    ...(actionPrefix && actionPrefix !== 'all'
      ? { action: { startsWith: actionPrefix } }
      : {}),
    ...(userId && userId !== 'all' ? { userId } : {}),
    ...(query.search ? { summary: { contains: query.search, mode: 'insensitive' } } : {}),
  };

  const [entries, total, members] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: query.skip,
      take: query.take,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        summary: true,
        before: true,
        after: true,
        ipAddress: true,
        isSupport: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
    }),
    db.auditLog.count({ where }),
    db.storeUser.findMany({
      where: { storeId: store.id },
      select: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: 'asc' } },
    }),
  ]);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  return (
    <>
      <PageHeader
        title="سجل النشاط"
        description="كل عملية حساسة داخل النظام: من قام بها، متى، وما الذي تغيّر"
      />

      <SettingsTabs />

      <FilterBar
        searchPlaceholder="ابحث في وصف العملية…"
        filters={[
          { key: 'action', label: 'نوع العملية', options: ACTION_FILTERS },
          {
            key: 'user',
            label: 'المستخدم',
            options: [
              { value: 'all', label: 'كل المستخدمين' },
              ...members.map((member) => ({
                value: member.user.id,
                label: member.user.name,
              })),
            ],
          },
        ]}
      >
        <PeriodFilter value={period.preset} from={period.from} to={period.to} compact />
      </FilterBar>

      <AuditTimeline
        entries={entries.map((entry) => ({
          id: entry.id,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          summary: entry.summary,
          before: entry.before as Record<string, unknown> | null,
          after: entry.after as Record<string, unknown> | null,
          ipAddress: entry.ipAddress,
          isSupport: entry.isSupport,
          userName: entry.user?.name ?? 'النظام',
          createdAt: entry.createdAt,
        }))}
      />

      <Pagination total={total} page={query.page} perPage={query.perPage} unit="عملية" />
    </>
  );
}
