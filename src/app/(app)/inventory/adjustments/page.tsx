import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { parseTableQuery } from '@/lib/table-query';
import { buildFormatter } from '@/lib/formatter';
import { listAdjustments } from '@/modules/inventory/queries';
import { Badge } from '@/ui/primitives/badge';
import { ButtonLink } from '@/ui/primitives/button';
import { Card } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { LinkTabs } from '@/ui/primitives/tabs';
import { PageHeader } from '@/ui/layout/page-header';
import { Pagination } from '@/ui/data/pagination';

export const metadata: Metadata = { title: 'تسويات المخزون' };

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { store } = await requirePermission('inventory.view');
  const params = await searchParams;
  const query = parseTableQuery(params);

  const result = await listAdjustments(store.id, query, store.branch.id);

  const fmt = buildFormatter({
    currency: store.settings.currency,
    decimals: store.settings.currencyDecimals,
    timezone: store.settings.timezone,
    locale: store.settings.locale,
  });

  return (
    <>
      <PageHeader
        title="تسويات المخزون"
        description="كل عملية جرد وتصحيح كمية، مع سببها ومن نفّذها"
        backHref="/inventory"
        actions={
          can(store, 'inventory.adjust') && !store.subscription.isReadOnly ? (
            <ButtonLink href="/inventory/count" variant="accent" iconStart={<ClipboardCheck className="size-4" />}>
                جرد جديد
              </ButtonLink>
          ) : undefined
        }
      />

      <LinkTabs
        className="mb-4"
        items={[
          { href: '/inventory', label: 'الأصناف', exact: true },
          { href: '/inventory/movements', label: 'حركات المخزون' },
          { href: '/inventory/adjustments', label: 'التسويات' },
        ]}
      />

      {result.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardCheck className="size-6" />}
            title="لم تُسجَّل أي تسوية بعد"
            description="عند اختلاف الكمية على الرف عن الكمية في النظام، سجّل جرداً ليُحفظ الفرق وسببه."
            action={
              can(store, 'inventory.adjust') ? (
                <ButtonLink href="/inventory/count" variant="accent">بدء جرد</ButtonLink>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-2">
            {result.rows.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/inventory/adjustments/${row.id}`}
                  className="block rounded-[var(--radius-md)] transition-shadow hover:shadow-sm focus-visible:shadow-[var(--ring-accent)] focus-visible:outline-none"
                >
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="num text-[14px] font-bold text-primary">{row.number}</span>
                      <Badge tone={row.status === 'APPLIED' ? 'success' : 'neutral'} size="sm">
                        {row.status === 'APPLIED' ? 'مطبّقة' : 'مسودة'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-secondary">
                      {row.reason}
                      {row.note && ` · ${row.note}`}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-tertiary">
                      {row.userName} · {row.branchName} ·{' '}
                      {fmt.dateTime(row.appliedAt ?? row.createdAt)}
                    </p>
                  </div>

                  <div className="text-end">
                    <p className="num text-[18px] font-bold text-primary">{row.itemCount}</p>
                    <p className="text-[11.5px] text-tertiary">صنف معدَّل</p>
                  </div>
                </Card>
                </Link>
              </li>
            ))}
          </ul>

          <Pagination
            total={result.total}
            page={query.page}
            perPage={query.perPage}
            unit="تسوية"
          />
        </>
      )}
    </>
  );
}
