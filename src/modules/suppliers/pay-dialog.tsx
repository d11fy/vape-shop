'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/ui/primitives/button';
import { Modal } from '@/ui/overlays/modal';
import { MoneyInput } from '@/ui/forms/money-input';
import { Input, Select, Textarea } from '@/ui/primitives/input';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { newIdempotencyKey } from '@/modules/pos/types';
import { paySupplierAction } from './actions';

/**
 * Pay a supplier against their outstanding balance. The payment is applied to
 * their oldest unpaid invoices first, mirroring how customer collection works.
 */
export function PaySupplierDialog({
  open,
  supplier,
  paymentMethods,
  onClose,
}: {
  open: boolean;
  supplier: { id: string; name: string; balance: number } | null;
  paymentMethods?: Array<{ id: string; name: string; affectsCashbox: boolean }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();

  const [methods, setMethods] = useState(paymentMethods ?? []);
  const [amount, setAmount] = useState(0);
  const [methodId, setMethodId] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, startSave] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());

  // The table version of this dialog is rendered without the method list, so
  // fetch it lazily the first time it opens.
  useEffect(() => {
    if (!open || methods.length > 0) return;
    void (async () => {
      const response = await fetch('/api/payment-methods');
      if (!response.ok) return;
      const payload = (await response.json()) as {
        methods: Array<{ id: string; name: string; affectsCashbox: boolean }>;
      };
      setMethods(payload.methods);
      setMethodId(payload.methods[0]?.id ?? '');
    })();
  }, [open, methods.length]);

  useEffect(() => {
    if (open && supplier) {
      setAmount(supplier.balance);
      setReference('');
      setNote('');
      if (methods[0] && !methodId) setMethodId(methods[0].id);
    }
  }, [open, supplier, methods, methodId]);

  if (!supplier) return null;

  const submit = () => {
    if (amount <= 0) {
      toast.warning('أدخل مبلغاً أكبر من صفر');
      return;
    }
    if (!methodId) {
      toast.warning('اختر طريقة الدفع');
      return;
    }

    startSave(async () => {
      const response = await paySupplierAction({
        idempotencyKey,
        supplierId: supplier.id,
        amount,
        methodId,
        reference: reference.trim() || null,
        note: note.trim() || null,
      });

      if (!response.ok) {
        toast.error('تعذر تسجيل الدفعة', response.error.message);
        return;
      }

      const paymentId = response.data.paymentId;
      toast.show({
        tone: 'success',
        title: 'تم تسجيل الدفعة',
        description: `${supplier.name} — الرصيد المتبقي ${fmt.money(response.data.newBalance)}`,
        duration: 8000,
        action: {
          label: 'طباعة سند صرف',
          onClick: () => window.open(`/receipts/payment/${paymentId}`, '_blank', 'noopener'),
        },
      });
      setIdempotencyKey(newIdempotencyKey());
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="سداد دفعة للمورد"
      description={supplier.name}
      size="sm"
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
          <p className="text-[12.5px] text-secondary">المستحق للمورد</p>
          <p className="num mt-0.5 text-[26px] font-bold text-warning">
            {fmt.money(supplier.balance)}
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">المبلغ المدفوع</span>
          <MoneyInput size="lg" value={amount} onValueChange={setAmount} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">طريقة الدفع</span>
          <Select value={methodId} onChange={(event) => setMethodId(event.target.value)}>
            {methods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">رقم العملية</span>
          <Input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="اختياري — رقم التحويل أو الشيك"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">ملاحظة</span>
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="اختياري"
          />
        </label>
      </div>
    </Modal>
  );
}
