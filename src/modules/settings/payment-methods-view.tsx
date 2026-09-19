'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Banknote, CreditCard, Pencil, Plus, Wallet } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Alert } from '@/ui/feedback/alert';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Card } from '@/ui/primitives/card';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input, Select } from '@/ui/primitives/input';
import { Modal } from '@/ui/overlays/modal';
import { Switch } from '@/ui/primitives/toggle';
import { useToast } from '@/ui/feedback/toast';
import { savePaymentMethodAction, togglePaymentMethodAction } from './actions';

export interface PaymentMethodRow {
  id: string;
  name: string;
  type: string;
  affectsCashbox: boolean;
  isDefault: boolean;
  isActive: boolean;
  usageCount: number;
}

const TYPE_LABEL: Record<string, string> = {
  CASH: 'نقدي',
  CARD: 'بطاقة / شبكة',
  BANK: 'بنك',
  TRANSFER: 'تحويل',
  WALLET: 'محفظة إلكترونية',
  OTHER: 'أخرى',
};

const TYPE_ICON: Record<string, typeof Wallet> = {
  CASH: Banknote,
  CARD: CreditCard,
  BANK: Wallet,
  TRANSFER: Wallet,
  WALLET: Wallet,
  OTHER: Wallet,
};

export function PaymentMethodsView({
  methods,
  canManage,
}: {
  methods: PaymentMethodRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<PaymentMethodRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = (method: PaymentMethodRow) => {
    startTransition(async () => {
      const response = await togglePaymentMethodAction(method.id, !method.isActive);
      if (!response.ok) {
        toast.error('تعذر تغيير الحالة', response.error.message);
        return;
      }
      toast.success(method.isActive ? 'تم تعطيل طريقة الدفع' : 'تم تفعيل طريقة الدفع', method.name);
      router.refresh();
    });
  };

  return (
    <>
      <Alert tone="info" className="mb-4" title="ما معنى «يؤثر على الصندوق»؟">
        الطرق النقدية فقط هي التي تدخل درج الكاشير وتُحتسب عند تسوية الوردية. الشبكة والتحويل
        البنكي تصل للحساب البنكي، فلا تُحتسب في عدّ الدرج.
      </Alert>

      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="accent"
            onClick={() => setCreating(true)}
            iconStart={<Plus className="size-4" />}
          >
            طريقة دفع جديدة
          </Button>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {methods.map((method) => {
          const Icon = TYPE_ICON[method.type] ?? Wallet;
          return (
            <li key={method.id}>
              <Card className={cn('h-full', !method.isActive && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)]',
                        method.affectsCashbox
                          ? 'bg-accent-soft text-accent-strong'
                          : 'bg-sunken text-secondary',
                      )}
                    >
                      <Icon className="size-5" />
                    </span>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-bold text-primary">{method.name}</span>
                        {method.isDefault && (
                          <Badge tone="accent" size="sm">
                            افتراضية
                          </Badge>
                        )}
                        {!method.isActive && (
                          <Badge tone="danger" size="sm">
                            معطّلة
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-[12.5px] text-secondary">
                        {TYPE_LABEL[method.type] ?? method.type}
                        {method.affectsCashbox && ' · تدخل الصندوق'}
                      </p>
                      <p className="num-mixed text-[11.5px] text-tertiary">
                        استُخدمت في {method.usageCount} عملية
                      </p>
                    </div>
                  </div>

                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(method)}
                        iconStart={<Pencil className="size-3.5" />}
                      >
                        تعديل
                      </Button>
                      <Button
                        variant={method.isActive ? 'danger-ghost' : 'ghost'}
                        size="sm"
                        disabled={pending}
                        onClick={() => toggle(method)}
                      >
                        {method.isActive ? 'تعطيل' : 'تفعيل'}
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <MethodDialog
        open={creating || editing !== null}
        method={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function MethodDialog({
  open,
  method,
  onClose,
}: {
  open: boolean;
  method: PaymentMethodRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSave] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [seededKey, setSeededKey] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    type: 'CASH' as PaymentMethodRow['type'],
    affectsCashbox: true,
    isDefault: false,
    isActive: true,
  });

  const key = method?.id ?? (open ? 'new' : null);
  if (key && seededKey !== key) {
    setSeededKey(key);
    setFieldErrors({});
    setForm({
      name: method?.name ?? '',
      type: method?.type ?? 'CASH',
      affectsCashbox: method?.affectsCashbox ?? true,
      isDefault: method?.isDefault ?? false,
      isActive: method?.isActive ?? true,
    });
  }
  if (!open && seededKey !== null) setSeededKey(null);

  const submit = () => {
    startSave(async () => {
      const response = await savePaymentMethodAction({
        id: method?.id ?? null,
        name: form.name,
        type: form.type as 'CASH' | 'BANK' | 'CARD' | 'WALLET' | 'TRANSFER' | 'OTHER',
        affectsCashbox: form.affectsCashbox,
        isDefault: form.isDefault,
        isActive: form.isActive,
      });

      if (!response.ok) {
        setFieldErrors(response.error.fieldErrors ?? {});
        toast.error('تعذر الحفظ', response.error.message);
        return;
      }

      toast.success(method ? 'تم حفظ التعديلات' : 'تمت إضافة طريقة الدفع', form.name);
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={method ? `تعديل ${method.name}` : 'طريقة دفع جديدة'}
      size="sm"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="accent" loading={saving} onClick={submit}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldRow>
          <FormField label="الاسم" required error={fieldErrors.name}>
            <Input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="مثال: مدى"
              invalid={Boolean(fieldErrors.name)}
            />
          </FormField>

          <FormField label="النوع">
            <Select
              value={form.type}
              onChange={(event) => {
                const type = event.target.value;
                setForm((current) => ({
                  ...current,
                  type,
                  // Cash is the only type that lands in the drawer by default.
                  affectsCashbox: type === 'CASH',
                }));
              }}
            >
              {Object.entries(TYPE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
        </FieldRow>

        <Switch
          checked={form.affectsCashbox}
          onChange={(event) =>
            setForm((current) => ({ ...current, affectsCashbox: event.target.checked }))
          }
          label="تؤثر على رصيد الصندوق"
          description="فعّلها للمبالغ التي تدخل درج الكاشير فعلياً"
        />

        <Switch
          checked={form.isDefault}
          onChange={(event) =>
            setForm((current) => ({ ...current, isDefault: event.target.checked }))
          }
          label="الطريقة الافتراضية"
          description="تُختار تلقائياً عند فتح شاشة الدفع"
        />
      </div>
    </Modal>
  );
}
