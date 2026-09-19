'use client';

import { useState } from 'react';
import { ChevronDown, Eye, History, ShieldAlert } from 'lucide-react';

import { auditFieldLabel, formatAuditValue } from '@/lib/audit-fields';
import { cn } from '@/lib/cn';
import { Badge } from '@/ui/primitives/badge';
import { Card } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { useFormat } from '@/ui/format';

export interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  isSupport: boolean;
  userName: string;
  createdAt: Date;
}

/** Colour coding by what the action does, not by which module it came from. */
const ACTION_TONE: Array<{ match: RegExp; tone: 'danger' | 'warning' | 'success' | 'neutral' }> = [
  { match: /\.(delete|cancel|archive|disable)$/, tone: 'danger' },
  { match: /\.(adjust|price_change|balance_adjust|integrity_fix|password_reset)$/, tone: 'warning' },
  { match: /\.(create|receive|collect|open)$/, tone: 'success' },
];

function toneFor(action: string) {
  return ACTION_TONE.find((entry) => entry.match.test(action))?.tone ?? 'neutral';
}


/**
 * The activity log.
 *
 * Each row states what happened in one Arabic sentence; expanding it shows the
 * before/after values. That pairing is the point — "غيّر السعر" is a rumour,
 * "غيّر السعر من 50 إلى 45" is a record.
 */
export function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  const fmt = useFormat();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<History className="size-6" />}
          title="لا توجد عمليات في هذه الفترة"
          description="يسجّل النظام هنا كل عملية حساسة: تعديل الأسعار، إلغاء الفواتير، تسويات المخزون، تغيير الصلاحيات وغيرها."
        />
      </Card>
    );
  }

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ul className="space-y-2">
      {entries.map((entry) => {
        const tone = toneFor(entry.action);
        const isOpen = expanded.has(entry.id);
        const hasDetail =
          (entry.before && Object.keys(entry.before).length > 0) ||
          (entry.after && Object.keys(entry.after).length > 0);

        return (
          <li key={entry.id}>
            <Card padded={false} className="overflow-hidden">
              <button
                type="button"
                onClick={() => hasDetail && toggle(entry.id)}
                className={cn(
                  'flex w-full items-start gap-3 p-3.5 text-start transition-colors sm:p-4',
                  hasDetail && 'hover:bg-sunken/40',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 size-2.5 shrink-0 rounded-full',
                    tone === 'danger'
                      ? 'bg-danger'
                      : tone === 'warning'
                        ? 'bg-warning'
                        : tone === 'success'
                          ? 'bg-success'
                          : 'bg-line-strong',
                  )}
                  aria-hidden="true"
                />

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-primary">
                      {entry.summary}
                    </span>
                    {entry.isSupport && (
                      <Badge tone="warning" size="sm">
                        <ShieldAlert className="size-3" />
                        وضع الدعم
                      </Badge>
                    )}
                  </span>

                  <span className="num mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-tertiary">
                    <span className="font-semibold text-secondary">{entry.userName}</span>
                    <span>·</span>
                    <span>{fmt.dateTime(entry.createdAt)}</span>
                    <span>·</span>
                    <span className="rounded bg-sunken px-1.5 py-0.5">{entry.action}</span>
                    {entry.ipAddress && (
                      <>
                        <span>·</span>
                        <span>{entry.ipAddress}</span>
                      </>
                    )}
                  </span>
                </span>

                {hasDetail && (
                  <ChevronDown
                    className={cn(
                      'mt-0.5 size-4 shrink-0 text-tertiary transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                )}
              </button>

              {isOpen && hasDetail && (
                <div className="border-t border-line-subtle bg-sunken/40 p-3.5 sm:p-4">
                  <ChangeTable before={entry.before} after={entry.after} />
                </div>
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function ChangeTable({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const fmt = useFormat();
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])];
  const show = (key: string, value: unknown) => formatAuditValue(key, value, fmt.money);

  if (keys.length === 0) {
    return <p className="text-[12.5px] text-tertiary">لا توجد تفاصيل إضافية.</p>;
  }

  return (
    <table className="w-full text-[12.5px]">
      <thead className="text-tertiary">
        <tr>
          <th className="pb-1.5 text-start font-semibold">الحقل</th>
          {before && <th className="pb-1.5 text-start font-semibold">قبل</th>}
          {after && <th className="pb-1.5 text-start font-semibold">بعد</th>}
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => {
          const previous = show(key, before?.[key]);
          const next = show(key, after?.[key]);
          return (
            <tr key={key} className="border-t border-line-subtle/60">
              <td className="py-1.5 pe-3 font-semibold text-secondary">{auditFieldLabel(key)}</td>
              {before && (
                <td className="py-1.5 pe-3 text-tertiary line-through">
                  <span className={cn(previous.numeric && 'num')}>{previous.text}</span>
                </td>
              )}
              {after && (
                <td className="py-1.5 font-semibold text-primary">
                  <span className={cn(next.numeric && 'num')}>{next.text}</span>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Small inline badge used elsewhere to link into the log. */
export function AuditLink({ count }: { count: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-secondary">
      <Eye className="size-3.5" />
      <span className="num">{count}</span> عملية مسجلة
    </span>
  );
}
