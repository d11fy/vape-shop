import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClipboardCheck } from 'lucide-react';

import { can, requirePermission } from '@/core/auth/context';
import { qtyToSaleUnits } from '@/core/quantity';
import { storeFormatter } from '@/lib/formatter';
import { getAdjustment } from '@/modules/inventory/queries';
import { StatCard } from '@/ui/data/stat-card';
import { Badge } from '@/ui/primitives/badge';
import { Card, CardHeader } from '@/ui/primitives/card';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'تفاصيل التسوية' };

const STATUS = {
  APPLIED: { label: 'مطبّقة', tone: 'success' as const },
  DRAFT: { label: 'مسودة', tone: 'neutral' as const },
  CANCELED: { label: 'ملغاة', tone: 'danger' as const },
};

export default async function AdjustmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { store } = await requirePermission('inventory.view');
  const { id } = await params;

  const adjustment = await getAdjustment(store.id, id);
  if (!adjustment) notFound();

  const fmt = storeFormatter(store.settings);
  // Stock value is cost information: shown only to those allowed to see it.
  const showValue = can(store, 'inventory.view_value');
  const status = STATUS[adjustment.status];
  const units = (qty: number, factor: number) =>
    qtyToSaleUnits(qty, factor).toLocaleString('en-US', { maximumFractionDigits: 3 });

  return (
    <>
      <PageHeader
        title={`تسوية ${adjustment.number}`}
        description={`${adjustment.reason}${adjustment.note ? ` · ${adjustment.note}` : ''}`}
        backHref="/inventory/adjustments"
        breadcrumbs={[
          { label: 'التسويات', href: '/inventory/adjustments' },
          { label: adjustment.number },
        ]}
        actions={<Badge tone={status.tone}>{status.label}</Badge>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="الأصناف المعدّلة" value={fmt.number(adjustment.items.length)} />
        <StatCard
          label="نفّذها"
          value={adjustment.userName}
          hint={`${adjustment.branchName} · ${fmt.dateTime(adjustment.appliedAt ?? adjustment.createdAt)}`}
        />
        {showValue && (
          <>
            <StatCard
              label="قيمة الزيادة"
              value={fmt.money(adjustment.totals.increase)}
              tone="success"
            />
            <StatCard
              label="قيمة النقص"
              value={fmt.money(Math.abs(adjustment.totals.decrease))}
              tone="danger"
              hint={`الصافي ${fmt.money(adjustment.totals.net, { signed: true })}`}
            />
          </>
        )}
      </div>

      <Card className="mt-3" padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader title="الأصناف" icon={<ClipboardCheck className="size-4" />} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="border-y border-line-subtle bg-sunken/60 text-[12px] text-secondary">
              <tr>
                <th className="px-4 py-2.5 text-start font-semibold">الصنف</th>
                <th className="px-3 py-2.5 text-center font-semibold">في النظام</th>
                <th className="px-3 py-2.5 text-center font-semibold">الفعلي</th>
                <th className="px-3 py-2.5 text-center font-semibold">الفرق</th>
                {showValue && <th className="px-4 py-2.5 text-end font-semibold">القيمة</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {adjustment.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/products/${item.productId}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {item.name}
                    </Link>
                    <span className="num block text-[11.5px] text-tertiary">{item.sku}</span>
                    {item.note && (
                      <span className="block text-[11.5px] text-secondary">{item.note}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-center text-secondary">
                    <span className="num">{units(item.systemQty, item.factor)}</span> {item.unitLabel}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="num">{units(item.countedQty, item.factor)}</span> {item.unitLabel}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-center font-bold ${
                      item.difference > 0 ? 'text-success' : 'text-danger'
                    }`}
                  >
                    <span className="num">
                      {item.difference > 0 ? '+' : ''}
                      {units(item.difference, item.factor)}
                    </span>
                  </td>
                  {showValue && (
                    <td
                      className={`num px-4 py-2.5 text-end font-semibold ${
                        item.valueImpact >= 0 ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {fmt.money(item.valueImpact, { signed: true })}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
