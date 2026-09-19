'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Percent, Printer, Receipt, ShieldCheck, Wallet } from 'lucide-react';

import { CURRENCIES } from '@/core/currency';
import { COMMON_TIMEZONES } from '@/core/datetime';
import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { Card, CardHeader } from '@/ui/primitives/card';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input, Select, Textarea } from '@/ui/primitives/input';
import { MoneyInput } from '@/ui/forms/money-input';
import { Switch } from '@/ui/primitives/toggle';
import { useToast } from '@/ui/feedback/toast';
import { saveStoreSettingsAction, type StoreSettingsInput } from './actions';

export function StoreSettingsForm({
  settings,
  currencyLocked,
  invoicePreview,
}: {
  settings: StoreSettingsInput;
  /** Once money has moved the currency is fixed — amounts are already stored in it. */
  currencyLocked: boolean;
  invoicePreview: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSave] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [form, setForm] = useState<StoreSettingsInput>(settings);
  // Edited as text so a trailing decimal point survives while typing "7.5".
  const [taxRateText, setTaxRateText] = useState(String(settings.taxRatePercent ?? 15));

  const update = <K extends keyof StoreSettingsInput>(key: K, value: StoreSettingsInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key as string]: undefined }));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});

    startSave(async () => {
      const response = await saveStoreSettingsAction(form);
      if (!response.ok) {
        setFieldErrors(response.error.fieldErrors ?? {});
        toast.error('تعذر حفظ الإعدادات', response.error.message);
        return;
      }
      toast.success('تم حفظ الإعدادات');
      router.refresh();
    });
  };

  const previewNumber = `${String(form.invoicePrefix ?? 'VS').toUpperCase()}-${new Date().getFullYear()}-${'1'.padStart(
    Number(form.invoicePadding ?? 6),
    '0',
  )}`;

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Card>
        <CardHeader title="بيانات المحل" icon={<Building2 className="size-4" />} />
        <div className="mt-4 space-y-4">
          <FieldRow>
            <FormField label="اسم المحل" required error={fieldErrors.name}>
              <Input
                value={String(form.name ?? '')}
                onChange={(event) => update('name', event.target.value)}
                invalid={Boolean(fieldErrors.name)}
              />
            </FormField>

            <FormField label="رقم الهاتف">
              <Input
                numeric
                value={String(form.phone ?? '')}
                onChange={(event) => update('phone', event.target.value)}
                placeholder="يظهر على الفاتورة"
              />
            </FormField>
          </FieldRow>

          <FieldRow>
            <FormField label="البريد الإلكتروني" error={fieldErrors.email}>
              <Input
                type="email"
                value={String(form.email ?? '')}
                onChange={(event) => update('email', event.target.value)}
                invalid={Boolean(fieldErrors.email)}
              />
            </FormField>

            <FormField label="المدينة">
              <Input
                value={String(form.city ?? '')}
                onChange={(event) => update('city', event.target.value)}
              />
            </FormField>
          </FieldRow>

          <FormField label="العنوان" hint="يظهر أسفل اسم المحل في الفاتورة">
            <Input
              value={String(form.address ?? '')}
              onChange={(event) => update('address', event.target.value)}
            />
          </FormField>

          <FormField label="رابط الشعار" hint="رابط صورة مربعة — يظهر في الفاتورة والقائمة">
            <Input
              value={String(form.logoUrl ?? '')}
              onChange={(event) => update('logoUrl', event.target.value)}
              placeholder="https://…"
            />
          </FormField>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="العملة والمنطقة الزمنية"
          subtitle="تؤثر على كل المبالغ والتقارير"
          icon={<Wallet className="size-4" />}
        />
        <div className="mt-4 space-y-4">
          <FieldRow>
            <FormField
              label="العملة"
              hint={
                currencyLocked
                  ? 'لا يمكن تغيير العملة بعد تسجيل عمليات مالية'
                  : 'عدد الخانات العشرية يُحدَّد تلقائياً حسب العملة'
              }
            >
              <Select
                value={String(form.currency ?? 'SAR')}
                onChange={(event) => update('currency', event.target.value)}
                disabled={currencyLocked}
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.nameAr} ({currency.code})
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="المنطقة الزمنية" hint="تحدد متى يبدأ «اليوم» في التقارير">
              <Select
                value={String(form.timezone ?? 'Asia/Riyadh')}
                onChange={(event) => update('timezone', event.target.value)}
              >
                {COMMON_TIMEZONES.map((zone) => (
                  <option key={zone.value} value={zone.value}>
                    {zone.label}
                  </option>
                ))}
              </Select>
            </FormField>
          </FieldRow>
        </div>
      </Card>

      <Card>
        <CardHeader title="الضريبة" icon={<Percent className="size-4" />} />
        <div className="mt-4 space-y-4">
          <Switch
            checked={Boolean(form.taxEnabled)}
            onChange={(event) => update('taxEnabled', event.target.checked)}
            label="تفعيل الضريبة"
            description="تُحتسب على كل فاتورة جديدة وتظهر منفصلة في التقارير"
          />

          {form.taxEnabled && (
            <>
              <FieldRow>
                <FormField label="نسبة الضريبة %">
                  <Input
                    numeric
                    inputMode="decimal"
                    value={taxRateText}
                    onChange={(event) => {
                      const text = event.target.value.replace(/[^\d.]/g, '');
                      setTaxRateText(text);
                      update('taxRatePercent', Number(text) || 0);
                    }}
                  />
                </FormField>

                <FormField label="الرقم الضريبي" hint="يظهر على الفاتورة">
                  <Input
                    numeric
                    value={String(form.taxNumber ?? '')}
                    onChange={(event) => update('taxNumber', event.target.value)}
                  />
                </FormField>
              </FieldRow>

              <Switch
                checked={Boolean(form.taxInclusive)}
                onChange={(event) => update('taxInclusive', event.target.checked)}
                label="الأسعار شاملة الضريبة"
                description={
                  form.taxInclusive
                    ? 'السعر المعروض هو ما يدفعه العميل، وتُستخرج الضريبة منه'
                    : 'تُضاف الضريبة فوق السعر المعروض عند الدفع'
                }
              />
            </>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="الفواتير والطباعة"
          icon={<Printer className="size-4" />}
          action={
            <span className="num rounded-[var(--radius-sm)] bg-sunken px-2.5 py-1 text-[12px] font-bold text-secondary">
              {previewNumber}
            </span>
          }
        />
        <div className="mt-4 space-y-4">
          <FieldRow>
            <FormField label="بادئة رقم الفاتورة" error={fieldErrors.invoicePrefix}>
              <Input
                value={String(form.invoicePrefix ?? '')}
                onChange={(event) => update('invoicePrefix', event.target.value)}
                placeholder="VS"
                invalid={Boolean(fieldErrors.invoicePrefix)}
              />
            </FormField>

            <FormField label="عدد خانات الترقيم">
              <Select
                value={String(form.invoicePadding ?? 6)}
                onChange={(event) => update('invoicePadding', Number(event.target.value))}
              >
                {[4, 5, 6, 7, 8].map((value) => (
                  <option key={value} value={value}>
                    {value} خانات
                  </option>
                ))}
              </Select>
            </FormField>
          </FieldRow>

          <FieldRow>
            <FormField label="عرض ورق الطابعة الحرارية">
              <Select
                value={String(form.receiptWidthMm ?? 80)}
                onChange={(event) => update('receiptWidthMm', Number(event.target.value))}
              >
                <option value={58}>58 مم</option>
                <option value={80}>80 مم</option>
              </Select>
            </FormField>

            <FormField label="عبارة أسفل الفاتورة">
              <Input
                value={String(form.receiptFooterAr ?? '')}
                onChange={(event) => update('receiptFooterAr', event.target.value)}
                placeholder="شكراً لتعاملكم معنا"
              />
            </FormField>
          </FieldRow>

          <Switch
            checked={Boolean(form.showLogoOnReceipt)}
            onChange={(event) => update('showLogoOnReceipt', event.target.checked)}
            label="إظهار الشعار على الفاتورة"
          />

          <p className="rounded-[var(--radius-sm)] bg-sunken px-3 py-2 text-[12.5px] text-secondary">
            آخر رقم فاتورة مستخدم:{' '}
            <span className="num font-bold text-primary">{invoicePreview}</span>
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title="المخزون والديون" icon={<Receipt className="size-4" />} />
        <div className="mt-4 space-y-4">
          <Switch
            checked={Boolean(form.lowStockAlerts)}
            onChange={(event) => update('lowStockAlerts', event.target.checked)}
            label="تنبيهات المخزون المنخفض"
            description="إشعار عند وصول أي صنف لحد التنبيه المحدد له"
          />

          <Switch
            checked={Boolean(form.negativeStockAllowed)}
            onChange={(event) => update('negativeStockAllowed', event.target.checked)}
            label="السماح بالبيع عند نفاد المخزون"
            description="فعّلها فقط إذا كنت تبيع أصنافاً لا تتابع كمياتها بدقة"
          />

          <div className="border-t border-line-subtle pt-4" />

          <Switch
            checked={Boolean(form.debtEnabled)}
            onChange={(event) => update('debtEnabled', event.target.checked)}
            label="تفعيل البيع الآجل"
            description="السماح بإتمام فاتورة دون سداد كامل وتسجيل الباقي كدين"
          />

          {form.debtEnabled && (
            <FieldRow>
              <FormField
                label="حد الدين الافتراضي"
                hint="صفر يعني بدون حد — يمكن تخصيصه لكل عميل"
              >
                <MoneyInput
                  value={Number(form.defaultDebtLimit ?? 0)}
                  onValueChange={(value) => update('defaultDebtLimit', value)}
                />
              </FormField>

              <FormField label="اعتبار الدين متأخراً بعد" hint="يُستخدم في تقرير أعمار الديون">
                <Select
                  value={String(form.debtOverdueDays ?? 30)}
                  onChange={(event) => update('debtOverdueDays', Number(event.target.value))}
                >
                  {[7, 14, 30, 45, 60, 90].map((value) => (
                    <option key={value} value={value}>
                      {value} يوم
                    </option>
                  ))}
                </Select>
              </FormField>
            </FieldRow>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader
          title="الالتزام والسن القانونية"
          subtitle="اضبطها حسب أنظمة بلدك"
          icon={<ShieldCheck className="size-4" />}
        />
        <div className="mt-4 space-y-4">
          <Alert tone="info" compact>
            هذه الإعدادات تساعدك على تطبيق القوانين المحلية لبيع منتجات التبغ والنيكوتين. راجع
            الأنظمة المعمول بها في بلدك — النظام لا يغني عن ذلك.
          </Alert>

          <Switch
            checked={Boolean(form.ageVerificationEnabled)}
            onChange={(event) => update('ageVerificationEnabled', event.target.checked)}
            label="تفعيل تنبيهات السن القانونية"
            description="يظهر التنبيه على الفواتير وفي ملفات العملاء"
          />

          {form.ageVerificationEnabled && (
            <>
              <FieldRow>
                <FormField label="الحد الأدنى للسن">
                  <Select
                    value={String(form.minimumCustomerAge ?? 18)}
                    onChange={(event) => update('minimumCustomerAge', Number(event.target.value))}
                  >
                    {[16, 18, 19, 20, 21].map((value) => (
                      <option key={value} value={value}>
                        {value} سنة
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField label="نص التنبيه">
                  <Input
                    value={String(form.ageNoticeAr ?? '')}
                    onChange={(event) => update('ageNoticeAr', event.target.value)}
                  />
                </FormField>
              </FieldRow>

              <Switch
                checked={Boolean(form.requireAgeCheckAtSale)}
                onChange={(event) => update('requireAgeCheckAtSale', event.target.checked)}
                label="تذكير الكاشير بالتحقق عند كل عملية بيع"
                description="لا يُخزَّن أي مستند هوية — يُسجَّل فقط أن التحقق تم"
              />
            </>
          )}

          <Textarea
            rows={2}
            readOnly
            value="النظام لا يوفّر أي وسيلة لتجاوز التحقق من العمر أو القيود القانونية."
            className="bg-sunken text-tertiary"
          />
        </div>
      </Card>

      <div className="safe-bottom sticky bottom-[calc(var(--bottom-nav-height)+8px)] z-10 flex items-center justify-end gap-2 rounded-[var(--radius-md)] border border-line-subtle bg-card/95 p-3 shadow-md backdrop-blur lg:bottom-4">
        <Button type="submit" variant="accent" loading={saving}>
          حفظ الإعدادات
        </Button>
      </div>
    </form>
  );
}
