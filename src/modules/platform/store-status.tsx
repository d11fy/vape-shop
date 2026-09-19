import { Badge } from '@/ui/primitives/badge';

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  ACTIVE: { label: 'نشط', tone: 'success' },
  PENDING: { label: 'قيد التهيئة', tone: 'warning' },
  SUSPENDED: { label: 'معلّق', tone: 'danger' },
};

/** Tenant status chip, shared by the console's overview, list and detail. */
export function StoreStatusBadge({ status }: { status: string }) {
  const entry = STATUS[status] ?? STATUS.ACTIVE!;
  return (
    <Badge tone={entry.tone} size="sm">
      {entry.label}
    </Badge>
  );
}

const SUBSCRIPTION_STATUS: Record<
  string,
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  TRIALING: { label: 'فترة تجريبية', tone: 'warning' },
  ACTIVE: { label: 'نشط', tone: 'success' },
  GRACE: { label: 'فترة سماح', tone: 'danger' },
  EXPIRED: { label: 'منتهي', tone: 'danger' },
  CANCELED: { label: 'ملغى', tone: 'neutral' },
};

export function SubscriptionStatusBadge({ status }: { status: string }) {
  const entry = SUBSCRIPTION_STATUS[status] ?? SUBSCRIPTION_STATUS.ACTIVE!;
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
