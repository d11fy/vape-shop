'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HandCoins, Pencil, Scale } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button, ButtonLink } from '@/ui/primitives/button';
import { Modal } from '@/ui/overlays/modal';
import { MoneyInput } from '@/ui/forms/money-input';
import { Textarea } from '@/ui/primitives/input';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { adjustCustomerBalanceAction } from './actions';
import { CollectDialog } from './collect-dialog';
import type { LedgerEntryRow } from './queries';

const LEDGER_LABEL: Record<string, string> = {
  OPENING_BALANCE: 'رصيد افتتاحي',
  INVOICE: 'فاتورة آجلة',
  PAYMENT: 'دفعة',
  RETURN: 'مرتجع',
  ADJUSTMENT: 'تسوية',
  WRITE_OFF: 'إعدام دين',
};

/** Actions available on a customer's page. */
export function CustomerActions({
  customer,
  paymentMethods,
  openInvoices,
  canCollect,
  canAdjust,
  canEdit,
}: {
  customer: { id: string; name: string; balance: number };
  paymentMethods: Array<{ id: string; name: string; affectsCashbox: boolean }>;
  openInvoices: Array<{ number: string; dueTotal: number; ageDays: number }>;
  canCollect: boolean;
  canAdjust: boolean;
  canEdit: boolean;
}) {
  const [collectOpen, setCollectOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canCollect && customer.balance > 0 && (
          <Button
            variant="accent"
            onClick={() => setCollectOpen(true)}
            iconStart={<HandCoins className="size-4" />}
          >
            تحصيل دفعة
          </Button>
        )}
        {canAdjust && (
          <Button
            variant="outline"
            onClick={() => setAdjustOpen(true)}
            iconStart={<Scale className="size-4" />}
          >
            تسوية رصيد
          </Button>
        )}
        {canEdit && (
          <ButtonLink
            href={`/customers/${customer.id}/edit`}
            variant="ghost"
            iconStart={<Pencil className="size-4" />}
          >
            تعديل
          </ButtonLink>
        )}
      </div>

      <CollectDialog
        open={collectOpen}
        customer={customer}
        paymentMethods={paymentMethods}
        openInvoices={openInvoices}
        onClose={() => setCollectOpen(false)}
      />

      <AdjustDialog
        open={adjustOpen}
        customer={customer}
        onClose={() => setAdjustOpen(false)}
      />
    </>
  );
}

function AdjustDialog({
  open,
  customer,
  onClose,
}: {
  open: boolean;
  customer: { id: string; name: string; balance: number };
  onClose: () => void;
}) {
  const toast = useToast();
  const fmt = useFormat();
  const [direction, setDirection] = useState<'increase' | 'decrease'>('decrease');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const signed = direction === 'increase' ? amount : -amount;
  const projected = customer.balance + signed;

  const submit = async () => {
    if (amount <= 0) {
      toast.warning('أدخل مبلغاً أكبر من صفر');
      return;
    }
    if (reason.trim().length < 3) {
      toast.warning('اذكر سبب التسوية');
      return;
    }

    setSaving(true);
    const response = await adjustCustomerBalanceAction({
      customerId: customer.id,
      amount: signed,
      reason: reason.trim(),
    });
    setSaving(false);

    if (!response.ok) {
      toast.error('تعذر تسجيل التسوية', response.error.message);
      return;
    }

    toast.success('تمت التسوية', `الرصيد الجديد ${fmt.money(response.data.newBalance)}`);
    setAmount(0);
    setReason('');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تسوية رصيد العميل"
      description={`${customer.name} — الرصيد الحالي ${fmt.money(customer.balance)}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            حفظ التسوية
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="inline-flex w-full rounded-[var(--radius-sm)] border border-line-subtle bg-sunken p-0.5">
          {(
            [
              { value: 'decrease' as const, label: 'خصم من الرصيد' },
              { value: 'increase' as const, label: 'إضافة للرصيد' },
            ]
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setDirection(option.value)}
              className={cn(
                'h-9 flex-1 rounded-[var(--radius-xs)] text-[12.5px] font-semibold transition-all',
                direction === option.value
                  ? 'bg-card text-primary shadow-xs'
                  : 'text-secondary hover:text-primary',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">المبلغ</span>
          <MoneyInput size="lg" value={amount} onValueChange={setAmount} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">سبب التسوية</span>
          <Textarea
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="مثال: تسوية فرق تقريب بالاتفاق مع العميل"
          />
        </label>

        {amount > 0 && (
          <p className="rounded-[var(--radius-sm)] bg-sunken px-3 py-2 text-[12.5px] text-secondary">
            الرصيد بعد التسوية:{' '}
            <span className={cn('num font-bold', projected > 0 ? 'text-warning' : 'text-success')}>
              {fmt.money(projected)}
            </span>
          </p>
        )}
      </div>
    </Modal>
  );
}

/** Running account statement — the customer's full financial history. */
export function LedgerTimeline({ entries }: { entries: LedgerEntryRow[] }) {
  const fmt = useFormat();

  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-[13px] text-tertiary">
        لا توجد حركات على حساب هذا العميل بعد.
      </p>
    );
  }

  return (
    <ul className="mt-3 divide-y divide-line-subtle">
      {entries.map((entry) => {
        const increases = entry.amount > 0;
        const href =
          entry.referenceType === 'sale' && entry.referenceId
            ? `/invoices/${entry.referenceId}`
            : null;

        const body = (
          <>
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold',
                increases ? 'bg-warning-soft text-warning' : 'bg-success-soft text-success',
              )}
              aria-hidden="true"
            >
              {increases ? '+' : '−'}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-primary">
                {LEDGER_LABEL[entry.type] ?? entry.type}
              </span>
              <span className="block truncate text-[11.5px] text-tertiary">
                {entry.description ?? '—'} · {entry.userName}
              </span>
            </span>

            <span className="shrink-0 text-end">
              <span
                className={cn(
                  'num block text-[13.5px] font-bold',
                  increases ? 'text-warning' : 'text-success',
                )}
              >
                {fmt.money(Math.abs(entry.amount))}
              </span>
              <span className="num-mixed block text-[11px] text-tertiary">
                الرصيد {fmt.money(entry.balanceAfter)}
              </span>
              <span className="num block text-[11px] text-tertiary">
                {fmt.dateTime(entry.occurredAt)}
              </span>
            </span>
          </>
        );

        return (
          <li key={entry.id}>
            {href ? (
              <Link
                href={href}
                className="-mx-2 flex items-start gap-3 rounded-[var(--radius-sm)] px-2 py-3 transition-colors hover:bg-sunken"
              >
                {body}
              </Link>
            ) : (
              <div className="flex items-start gap-3 py-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
