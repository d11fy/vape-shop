'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { HandCoins, Printer } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { Modal } from '@/ui/overlays/modal';
import { MoneyInput } from '@/ui/forms/money-input';
import { Input, Select, Textarea } from '@/ui/primitives/input';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { newIdempotencyKey } from '@/modules/pos/types';
import { collectDebtAction, type CollectionResult } from './actions';

export interface CollectTarget {
  id: string;
  name: string;
  balance: number;
}

/**
 * Collect a payment against a customer's balance.
 *
 * The receipt matters here: a customer handing over cash against an old debt
 * expects something in their hand, so the success step offers to print a
 * payment voucher immediately.
 */
export function CollectDialog({
  open,
  customer,
  paymentMethods,
  openInvoices,
  onClose,
}: {
  open: boolean;
  customer: CollectTarget | null;
  paymentMethods: Array<{ id: string; name: string; affectsCashbox: boolean }>;
  openInvoices?: Array<{ number: string; dueTotal: number; ageDays: number }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();

  const [amount, setAmount] = useState(0);
  const [methodId, setMethodId] = useState(paymentMethods[0]?.id ?? '');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, startSave] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const [result, setResult] = useState<CollectionResult | null>(null);

  useEffect(() => {
    if (open && customer) {
      setAmount(customer.balance);
      setReference('');
      setNote('');
      setResult(null);
    }
  }, [open, customer]);

  if (!customer) return null;

  const submit = () => {
    if (amount <= 0) {
      toast.warning('أدخل مبلغاً أكبر من صفر');
      return;
    }
    if (amount > customer.balance) {
      toast.warning('المبلغ أكبر من الرصيد المستحق');
      return;
    }

    startSave(async () => {
      const response = await collectDebtAction({
        idempotencyKey,
        customerId: customer.id,
        amount,
        methodId,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });

      if (!response.ok) {
        toast.error('تعذر تسجيل الدفعة', response.error.message);
        return;
      }

      setResult(response.data);
      setIdempotencyKey(newIdempotencyKey());
      toast.success('تم تسجيل الدفعة', `${customer.name} — ${fmt.money(amount)}`);
      router.refresh();
    });
  };

  if (result) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title="تم تسجيل الدفعة"
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              iconStart={<Printer className="size-4" />}
              onClick={() =>
                window.open(
                  `/receipts/payment/${result.paymentId}`,
                  '_blank',
                  'noopener',
                )
              }
            >
              طباعة سند قبض
            </Button>
            <Button variant="accent" onClick={onClose}>
              تم
            </Button>
          </>
        }
      >
        <div className="text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
            <HandCoins className="size-7" />
          </span>
          <p className="num mt-4 text-[26px] font-bold text-primary">
            {fmt.money(result.amount)}
          </p>
          <p className="mt-1 text-[13px] text-secondary">من {customer.name}</p>

          <div className="mt-4 rounded-[var(--radius-md)] border border-line-subtle bg-sunken px-4 py-3">
            <p className="text-[12.5px] text-secondary">الرصيد المتبقي</p>
            <p
              className={cn(
                'num mt-0.5 text-[20px] font-bold',
                result.newBalance > 0 ? 'text-warning' : 'text-success',
              )}
            >
              {fmt.money(result.newBalance)}
            </p>
          </div>

          {result.settled.length > 0 && (
            <div className="mt-4 text-start">
              <p className="mb-1.5 text-[12px] font-bold text-secondary">
                طُبِّقت الدفعة على الفواتير التالية
              </p>
              <ul className="space-y-1">
                {result.settled.map((entry) => (
                  <li
                    key={entry.number}
                    className="flex items-center justify-between rounded-[var(--radius-xs)] bg-sunken px-2.5 py-1.5 text-[12.5px]"
                  >
                    <span className="num font-semibold text-primary">{entry.number}</span>
                    <span className="num-mixed text-secondary">
                      {fmt.money(entry.applied)}
                      {entry.remaining > 0 && (
                        <span className="ms-1.5 text-tertiary">
                          (متبقٍ {fmt.money(entry.remaining)})
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تحصيل دفعة"
      description={customer.name}
      size="md"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="accent" loading={saving} onClick={submit}>
            تسجيل الدفعة
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[var(--radius-md)] border border-warning-border bg-warning-soft px-4 py-3 text-center">
          <p className="text-[12.5px] text-secondary">الرصيد المستحق</p>
          <p className="num mt-0.5 text-[26px] font-bold text-warning">
            {fmt.money(customer.balance)}
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">المبلغ المستلم</span>
          <MoneyInput size="lg" value={amount} onValueChange={setAmount} />
          <span className="flex flex-wrap gap-1.5 pt-1">
            {[1, 0.5, 0.25].map((fraction) => (
              <button
                key={fraction}
                type="button"
                onClick={() => setAmount(Math.round(customer.balance * fraction))}
                className="rounded-full border border-line-strong px-2.5 py-1 text-[11.5px] font-semibold text-secondary transition-colors hover:border-accent-border hover:text-accent-strong"
              >
                {fraction === 1 ? 'كامل المبلغ' : `${fraction * 100}%`}
              </button>
            ))}
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">طريقة الدفع</span>
          <Select value={methodId} onChange={(event) => setMethodId(event.target.value)}>
            {paymentMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </Select>
        </label>

        {!paymentMethods.find((method) => method.id === methodId)?.affectsCashbox && (
          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold text-primary">رقم العملية</span>
            <Input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              placeholder="اختياري — رقم التحويل أو المرجع"
            />
          </label>
        )}

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">ملاحظة</span>
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="اختياري"
          />
        </label>

        {openInvoices && openInvoices.length > 0 && (
          <Alert tone="info" compact title="سيتم السداد من الأقدم للأحدث">
            <ul className="mt-1 space-y-0.5">
              {openInvoices.slice(0, 4).map((invoice) => (
                <li key={invoice.number} className="num-mixed flex justify-between">
                  <span>
                    {invoice.number}
                    <span className="ms-1.5 text-tertiary">({invoice.ageDays} يوم)</span>
                  </span>
                  <span>{fmt.money(invoice.dueTotal)}</span>
                </li>
              ))}
              {openInvoices.length > 4 && (
                <li className="text-tertiary">و{openInvoices.length - 4} فاتورة أخرى…</li>
              )}
            </ul>
          </Alert>
        )}
      </div>
    </Modal>
  );
}
