'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Mail, MapPin, Phone } from 'lucide-react';

import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { Card, CardHeader } from '@/ui/primitives/card';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input, Textarea } from '@/ui/primitives/input';
import { MoneyInput } from '@/ui/forms/money-input';
import { Switch } from '@/ui/primitives/toggle';
import { useToast } from '@/ui/feedback/toast';
import { saveSupplierAction, type SupplierInput } from './actions';

export function SupplierForm({
  supplier,
  allowOpeningBalance,
}: {
  supplier?: SupplierInput & { id: string };
  allowOpeningBalance: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSave] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState<SupplierInput>(
    () =>
      supplier ?? {
        id: null,
        name: '',
        company: '',
        phone: '',
        email: '',
        address: '',
        note: '',
        isActive: true,
        openingBalance: 0,
      },
  );

  const isEditing = Boolean(supplier?.id);
  const update = <K extends keyof SupplierInput>(key: K, value: SupplierInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key as string]: undefined }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    startSave(async () => {
      const response = await saveSupplierAction(form);

      if (!response.ok) {
        setFieldErrors(response.error.fieldErrors ?? {});
        if (!response.error.fieldErrors) setFormError(response.error.message);
        toast.error('تعذر حفظ المورد', response.error.message);
        return;
      }

      toast.success(isEditing ? 'تم حفظ التعديلات' : 'تمت إضافة المورد', String(form.name));
      router.push(`/suppliers/${response.data.id}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {formError && <Alert tone="danger">{formError}</Alert>}

      <Card>
        <CardHeader title="بيانات المورد" icon={<Building2 className="size-4" />} />
        <div className="mt-4 space-y-4">
          <FieldRow>
            <FormField label="اسم المورد" required error={fieldErrors.name}>
              <Input
                value={String(form.name ?? '')}
                onChange={(event) => update('name', event.target.value)}
                placeholder="مثال: مؤسسة الشرق للتوزيع"
                invalid={Boolean(fieldErrors.name)}
                autoFocus
              />
            </FormField>

            <FormField label="اسم الشركة">
              <Input
                value={String(form.company ?? '')}
                onChange={(event) => update('company', event.target.value)}
                placeholder="اختياري"
              />
            </FormField>
          </FieldRow>

          <FieldRow>
            <FormField label="رقم الهاتف" error={fieldErrors.phone}>
              <Input
                value={String(form.phone ?? '')}
                onChange={(event) => update('phone', event.target.value)}
                type="tel"
                inputMode="tel"
                numeric
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
              placeholder="شروط السداد، مواعيد التوريد، أي تفاصيل مفيدة"
            />
          </FormField>

          {allowOpeningBalance && (
            <FormField
              label="رصيد افتتاحي"
              hint="مبلغ مستحق لهذا المورد قبل استخدام النظام — يُسجَّل كحركة في كشف حسابه"
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
              label="المورد نشط"
              description="أوقفه لإخفائه من قوائم الشراء مع الاحتفاظ بسجله"
            />
          )}
        </div>
      </Card>

      <div className="safe-bottom sticky bottom-[calc(var(--bottom-nav-height)+8px)] z-10 flex items-center justify-end gap-2 rounded-[var(--radius-md)] border border-line-subtle bg-card/95 p-3 shadow-md backdrop-blur lg:bottom-4">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={saving}>
          إلغاء
        </Button>
        <Button type="submit" variant="accent" loading={saving}>
          {isEditing ? 'حفظ التعديلات' : 'إضافة المورد'}
        </Button>
      </div>
    </form>
  );
}
