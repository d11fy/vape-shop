'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Plus } from 'lucide-react';

import { cn } from '@/lib/cn';
import { PLAN_FEATURE_LABELS } from '@/modules/subscriptions/features';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Card } from '@/ui/primitives/card';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input, Textarea } from '@/ui/primitives/input';
import { Modal } from '@/ui/overlays/modal';
import { MoneyInput } from '@/ui/forms/money-input';
import { Switch } from '@/ui/primitives/toggle';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { savePlanAction } from './actions';

export interface PlanRow {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  monthlyPrice: number;
  yearlyPrice: number;
  trialDays: number;
  graceDays: number;
  maxEmployees: number | null;
  maxBranches: number | null;
  maxProducts: number | null;
  maxMonthlyInvoices: number | null;
  features: string[];
  isPublic: boolean;
  isActive: boolean;
  sortOrder: number;
  subscriberCount: number;
}

export function PlansView({ plans }: { plans: PlanRow[] }) {
  const fmt = useFormat();
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button
          variant="accent"
          onClick={() => setCreating(true)}
          iconStart={<Plus className="size-4" />}
        >
          خطة جديدة
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className={cn('h-full', !plan.isActive && 'opacity-60')}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[16px] font-bold text-primary">{plan.nameAr}</h3>
                  <Badge tone="neutral" size="sm">
                    {plan.code}
                  </Badge>
                  {!plan.isActive && (
                    <Badge tone="danger" size="sm">
                      موقوفة
                    </Badge>
                  )}
                  {!plan.isPublic && (
                    <Badge tone="warning" size="sm">
                      غير معلنة
                    </Badge>
                  )}
                </div>
                {plan.descriptionAr && (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">
                    {plan.descriptionAr}
                  </p>
                )}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(plan)}
                iconStart={<Pencil className="size-3.5" />}
              >
                تعديل
              </Button>
            </div>

            <p className="num-mixed mt-4 text-[22px] font-bold text-primary">
              {fmt.money(plan.monthlyPrice)}
              <span className="text-[13px] font-normal text-tertiary"> / شهرياً</span>
            </p>
            <p className="num-mixed text-[12px] text-tertiary">
              {fmt.money(plan.yearlyPrice)} سنوياً · تجربة {plan.trialDays} يوم · سماح{' '}
              {plan.graceDays} يوم
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-line-subtle pt-3">
              <Limit label="موظفون" value={plan.maxEmployees} />
              <Limit label="فروع" value={plan.maxBranches} />
              <Limit label="منتجات" value={plan.maxProducts} />
              <Limit label="فواتير شهرياً" value={plan.maxMonthlyInvoices} />
            </dl>

            <ul className="mt-3 space-y-1.5 border-t border-line-subtle pt-3">
              {plan.features.slice(0, 5).map((feature) => (
                <li key={feature} className="flex items-start gap-1.5 text-[12px]">
                  <Check className="mt-0.5 size-3 shrink-0 text-success" />
                  <span className="text-secondary">
                    {PLAN_FEATURE_LABELS[feature] ?? feature}
                  </span>
                </li>
              ))}
              {plan.features.length > 5 && (
                <li className="num-mixed text-[11.5px] text-tertiary">
                  و{plan.features.length - 5} ميزة أخرى
                </li>
              )}
            </ul>

            <p className="num-mixed mt-3 border-t border-line-subtle pt-3 text-[12px] text-tertiary">
              {plan.subscriberCount} متجر مشترك
            </p>
          </Card>
        ))}
      </div>

      <PlanDialog
        open={creating || editing !== null}
        plan={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function Limit({ label, value }: { label: string; value: number | null }) {
  return (
    <div>
      <dt className="text-[11px] text-tertiary">{label}</dt>
      <dd className="num-mixed text-[13px] font-bold text-primary">
        {value === null ? 'غير محدود' : value}
      </dd>
    </div>
  );
}

const ALL_FEATURES = Object.keys(PLAN_FEATURE_LABELS);

function PlanDialog({
  open,
  plan,
  onClose,
}: {
  open: boolean;
  plan: PlanRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSave] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [seededKey, setSeededKey] = useState<string | null>(null);

  const [form, setForm] = useState({
    code: '',
    nameAr: '',
    nameEn: '',
    descriptionAr: '',
    monthlyPrice: 0,
    yearlyPrice: 0,
    trialDays: 14,
    graceDays: 7,
    maxEmployees: null as number | null,
    maxBranches: null as number | null,
    maxProducts: null as number | null,
    maxMonthlyInvoices: null as number | null,
    features: [] as string[],
    isPublic: true,
    isActive: true,
    sortOrder: 0,
  });

  const key = plan?.id ?? (open ? 'new' : null);
  if (key && seededKey !== key) {
    setSeededKey(key);
    setFieldErrors({});
    setForm(
      plan
        ? {
            code: plan.code,
            nameAr: plan.nameAr,
            nameEn: plan.nameEn,
            descriptionAr: plan.descriptionAr ?? '',
            monthlyPrice: plan.monthlyPrice,
            yearlyPrice: plan.yearlyPrice,
            trialDays: plan.trialDays,
            graceDays: plan.graceDays,
            maxEmployees: plan.maxEmployees,
            maxBranches: plan.maxBranches,
            maxProducts: plan.maxProducts,
            maxMonthlyInvoices: plan.maxMonthlyInvoices,
            features: plan.features,
            isPublic: plan.isPublic,
            isActive: plan.isActive,
            sortOrder: plan.sortOrder,
          }
        : {
            code: '',
            nameAr: '',
            nameEn: '',
            descriptionAr: '',
            monthlyPrice: 0,
            yearlyPrice: 0,
            trialDays: 14,
            graceDays: 7,
            maxEmployees: null,
            maxBranches: null,
            maxProducts: null,
            maxMonthlyInvoices: null,
            features: [],
            isPublic: true,
            isActive: true,
            sortOrder: 0,
          },
    );
  }
  if (!open && seededKey !== null) setSeededKey(null);

  const submit = () => {
    startSave(async () => {
      const response = await savePlanAction({ id: plan?.id ?? null, ...form });
      if (!response.ok) {
        setFieldErrors(response.error.fieldErrors ?? {});
        toast.error('تعذر حفظ الخطة', response.error.message);
        return;
      }
      toast.success(plan ? 'تم حفظ الخطة' : 'تمت إضافة الخطة', form.nameAr);
      onClose();
      router.refresh();
    });
  };

  const toggleFeature = (feature: string) =>
    setForm((current) => ({
      ...current,
      features: current.features.includes(feature)
        ? current.features.filter((entry) => entry !== feature)
        : [...current.features, feature],
    }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={plan ? `تعديل ${plan.nameAr}` : 'خطة جديدة'}
      size="lg"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="accent" loading={saving} onClick={submit}>
            حفظ الخطة
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldRow>
          <FormField label="الاسم بالعربية" required error={fieldErrors.nameAr}>
            <Input
              value={form.nameAr}
              onChange={(event) =>
                setForm((current) => ({ ...current, nameAr: event.target.value }))
              }
            />
          </FormField>

          <FormField label="الاسم بالإنجليزية" required error={fieldErrors.nameEn}>
            <Input
              value={form.nameEn}
              onChange={(event) =>
                setForm((current) => ({ ...current, nameEn: event.target.value }))
              }
            />
          </FormField>
        </FieldRow>

        <FieldRow>
          <FormField label="الكود" required hint="يُستخدم برمجياً — لا يظهر للعملاء" error={fieldErrors.code}>
            <Input
              numeric
              value={form.code}
              disabled={Boolean(plan)}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value.toLowerCase() }))
              }
              placeholder="professional"
            />
          </FormField>

          <FormField label="ترتيب العرض">
            <Input
              numeric
              inputMode="numeric"
              value={String(form.sortOrder)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sortOrder: Number(event.target.value.replace(/\D/g, '')) || 0,
                }))
              }
            />
          </FormField>
        </FieldRow>

        <FormField label="الوصف">
          <Textarea
            rows={2}
            value={form.descriptionAr}
            onChange={(event) =>
              setForm((current) => ({ ...current, descriptionAr: event.target.value }))
            }
          />
        </FormField>

        <FieldRow>
          <FormField label="السعر الشهري">
            <MoneyInput
              value={form.monthlyPrice}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, monthlyPrice: value }))
              }
            />
          </FormField>

          <FormField label="السعر السنوي">
            <MoneyInput
              value={form.yearlyPrice}
              onValueChange={(value) => setForm((current) => ({ ...current, yearlyPrice: value }))}
            />
          </FormField>
        </FieldRow>

        <FieldRow>
          <FormField label="أيام التجربة">
            <Input
              numeric
              inputMode="numeric"
              value={String(form.trialDays)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  trialDays: Number(event.target.value.replace(/\D/g, '')) || 0,
                }))
              }
            />
          </FormField>

          <FormField label="أيام السماح بعد الانتهاء" hint="يعمل النظام فيها بوضع القراءة فقط">
            <Input
              numeric
              inputMode="numeric"
              value={String(form.graceDays)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  graceDays: Number(event.target.value.replace(/\D/g, '')) || 0,
                }))
              }
            />
          </FormField>
        </FieldRow>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-primary">
            الحدود — اتركها فارغة لغير محدود
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <LimitInput
              label="الموظفون"
              value={form.maxEmployees}
              onChange={(value) => setForm((current) => ({ ...current, maxEmployees: value }))}
            />
            <LimitInput
              label="الفروع"
              value={form.maxBranches}
              onChange={(value) => setForm((current) => ({ ...current, maxBranches: value }))}
            />
            <LimitInput
              label="المنتجات"
              value={form.maxProducts}
              onChange={(value) => setForm((current) => ({ ...current, maxProducts: value }))}
            />
            <LimitInput
              label="فواتير شهرياً"
              value={form.maxMonthlyInvoices}
              onChange={(value) =>
                setForm((current) => ({ ...current, maxMonthlyInvoices: value }))
              }
            />
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-primary">المزايا</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {ALL_FEATURES.map((feature) => (
              <label
                key={feature}
                className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors hover:bg-sunken"
              >
                <input
                  type="checkbox"
                  checked={form.features.includes(feature)}
                  onChange={() => toggleFeature(feature)}
                  className="size-[17px] shrink-0 cursor-pointer appearance-none rounded-[5px] border border-line-strong bg-card checked:border-accent-strong checked:bg-accent-strong"
                />
                <span className="text-[12.5px] text-primary">
                  {PLAN_FEATURE_LABELS[feature] ?? feature}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3 border-t border-line-subtle pt-4">
          <Switch
            checked={form.isPublic}
            onChange={(event) =>
              setForm((current) => ({ ...current, isPublic: event.target.checked }))
            }
            label="خطة معلنة"
            description="تظهر للعملاء في صفحة الاشتراك"
          />
          <Switch
            checked={form.isActive}
            onChange={(event) =>
              setForm((current) => ({ ...current, isActive: event.target.checked }))
            }
            label="خطة مفعّلة"
            description="أوقفها لمنع اشتراكات جديدة دون التأثير على المشتركين الحاليين"
          />
        </div>
      </div>
    </Modal>
  );
}

function LimitInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <FormField label={label}>
      <Input
        numeric
        inputMode="numeric"
        placeholder="غير محدود"
        value={value === null ? '' : String(value)}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '');
          onChange(digits === '' ? null : Number(digits));
        }}
      />
    </FormField>
  );
}
