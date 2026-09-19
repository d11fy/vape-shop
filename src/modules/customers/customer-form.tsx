'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, MapPin, Phone, User } from 'lucide-react';

import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { Card, CardHeader } from '@/ui/primitives/card';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input, Textarea } from '@/ui/primitives/input';
import { MoneyInput } from '@/ui/forms/money-input';
import { Switch } from '@/ui/primitives/toggle';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { saveCustomerAction, type CustomerInput } from './actions';

export interface CustomerFormProps {
  customer?: CustomerInput & { id: string };
  /** Store-wide default credit limit, shown as the fallback hint. */
  defaultDebtLimit: number;
  ageVerificationEnabled: boolean;
  minimumAge: number;
  /** Opening balance is only offered when creating. */
  allowOpeningBalance: boolean;
}

export function CustomerForm({
  customer,
  defaultDebtLimit,
  ageVerificationEnabled,
  minimumAge,
  allowOpeningBalance,
}: CustomerFormProps) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();
  const [saving, startSave] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState<CustomerInput>(
    () =>
      customer ?? {
        id: null,
        name: '',
        phone: '',
        email: '',
        address: '',
        note: '',
        debtLimit: 0,
        ageVerified: false,
        isActive: true,
        openingBalance: 0,
      },
  );

  const isEditing = Boolean(customer?.id);
  const update = <K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key as string]: undefined }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    startSave(async () => {
      const response = await saveCustomerAction(form);

      if (!response.ok) {
        setFieldErrors(response.error.fieldErrors ?? {});
        if (!response.error.fieldErrors) setFormError(response.error.message);
        toast.error('تعذر حفظ العميل', response.error.message);
        return;
      }

      toast.success(isEditing ? 'تم حفظ التعديلات' : 'تمت إضافة العميل', String(form.name));
      router.push(`/customers/${response.data.id}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {formError && <Alert tone="danger">{formError}</Alert>}

      <Card>
        <CardHeader title="بيانات العميل" icon={<User className="size-4" />} />
        <div className="mt-4 space-y-4">
          <FormField label="الاسم" required error={fieldErrors.name}>
            <Input
              value={String(form.name ?? '')}
              onChange={(event) => update('name', event.target.value)}
              placeholder="مثال: عبدالرحمن الزهراني"
              invalid={Boolean(fieldErrors.name)}
              autoFocus
            />
          </FormField>

          <FieldRow>
            <FormField label="رقم الهاتف" error={fieldErrors.phone} hint="يُستخدم للبحث السريع">
              <Input
                value={String(form.phone ?? '')}
                onChange={(event) => update('phone', event.target.value)}
                type="tel"
                inputMode="tel"
                numeric
                placeholder="05xxxxxxxx"
                iconStart={<Phone className="size-4" />}
                invalid={Boolean(fieldErrors.phone)}
              />
            </FormField>

            <FormField label="البريد الإلكتروني" error={fieldErrors.email}>
              <Input
                value={String(form.email ?? '')}
                onChange={(event) => update('email', event.target.value)}
                type="email"
                placeholder="اختياري"
                iconStart={<Mail className="size-4" />}
                invalid={Boolean(fieldErrors.email)}
              />
            </FormField>
          </FieldRow>

          <FormField label="العنوان">
            <Input
              value={String(form.address ?? '')}
              onChange={(event) => update('address', event.target.value)}
              placeholder="اختياري"
              iconStart={<MapPin className="size-4" />}
            />
          </FormField>

          <FormField label="ملاحظات">
            <Textarea
              rows={2}
              value={String(form.note ?? '')}
              onChange={(event) => update('note', event.target.value)}
              placeholder="أي معلومة تساعدك على التعامل مع هذا العميل"
            />
          </FormField>
        </div>
      </Card>

      <Card>
        <CardHeader title="الحساب والائتمان" subtitle="حد الدين المسموح به لهذا العميل" />
        <div className="mt-4 space-y-4">
          <FormField
            label="حد الدين"
            hint={
              defaultDebtLimit > 0
                ? `اتركه صفراً لاستخدام الحد الافتراضي للمتجر (${fmt.money(defaultDebtLimit)})`
                : 'اتركه صفراً لعدم تحديد سقف للدين'
            }
          >
            <MoneyInput
              value={Number(form.debtLimit ?? 0)}
              onValueChange={(value) => update('debtLimit', value)}
            />
          </FormField>

          {allowOpeningBalance && (
            <FormField
              label="رصيد افتتاحي"
              hint="مبلغ مستحق على العميل قبل استخدام النظام — يُسجَّل كحركة في كشف حسابه"
            >
              <MoneyInput
                value={Number(form.openingBalance ?? 0)}
                onValueChange={(value) => update('openingBalance', value)}
              />
            </FormField>
          )}

          {isEditing && (
            <Switch
              checked={Boolean(form.isActive)}
              onChange={(event) => update('isActive', event.target.checked)}
              label="العميل نشط"
              description="أوقفه لمنع تسجيل مبيعات جديدة له مع الاحتفاظ بسجله"
            />
          )}
        </div>
      </Card>

      {ageVerificationEnabled && (
        <Card>
          <CardHeader
            title="التحقق من العمر"
            subtitle={`الحد الأدنى للسن في إعدادات المتجر: ${minimumAge} سنة`}
          />
          <div className="mt-4">
            <Switch
              checked={Boolean(form.ageVerified)}
              onChange={(event) => update('ageVerified', event.target.checked)}
              label="تم التحقق من سن العميل"
              description="سجّل فقط أن التحقق تم — لا تُحفظ صور أو أرقام هويات في النظام"
            />
          </div>
        </Card>
      )}

      <div className="safe-bottom sticky bottom-[calc(var(--bottom-nav-height)+8px)] z-10 flex items-center justify-end gap-2 rounded-[var(--radius-md)] border border-line-subtle bg-card/95 p-3 shadow-md backdrop-blur lg:bottom-4">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={saving}>
          إلغاء
        </Button>
        <Button type="submit" variant="accent" loading={saving}>
          {isEditing ? 'حفظ التعديلات' : 'إضافة العميل'}
        </Button>
      </div>
    </form>
  );
}
