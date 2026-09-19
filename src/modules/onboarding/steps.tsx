'use client';

import { useState } from 'react';
import {
  Building2,
  Check,
  Copy,
  MapPin,
  Phone,
  Plus,
  Store as StoreIcon,
  Tag,
  X,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import { countAr, NOUNS } from '@/lib/arabic-count';
import { CURRENCIES, COUNTRIES, getCurrency } from '@/core/currency';
import type { FieldErrors } from '@/core/errors';
import { UNIT_PRESETS } from '@/core/quantity';
import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input, Select } from '@/ui/primitives/input';
import { MoneyInput, QuantityInput } from '@/ui/forms/money-input';
import { Radio, Switch } from '@/ui/primitives/toggle';
import { useFormat } from '@/ui/format';
import type { OnboardingSnapshot } from './queries';

/**
 * The seven step bodies.
 *
 * Every step is a controlled view over state the wizard owns, so moving back
 * and forth never loses what was typed and nothing is saved twice.
 */

// ── 1 · Store profile ────────────────────────────────────────────────────────

export interface ProfileState {
  name: string;
  phone: string;
  city: string;
  address: string;
}

export function StoreProfileStep({
  value,
  onChange,
  errors,
}: {
  value: ProfileState;
  onChange: (next: Partial<ProfileState>) => void;
  errors: FieldErrors;
}) {
  return (
    <div className="space-y-4">
      <FormField label="اسم المحل" required error={errors.name}>
        <Input
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
          autoFocus
          maxLength={80}
          placeholder="مثال: محل الليالي للمعسل والفيب"
          iconStart={<StoreIcon className="size-4" />}
          invalid={Boolean(errors.name)}
        />
      </FormField>

      <FieldRow>
        <FormField label="رقم الهاتف" hint="يظهر على الفاتورة" error={errors.phone}>
          <Input
            value={value.phone}
            onChange={(event) => onChange({ phone: event.target.value })}
            type="tel"
            inputMode="tel"
            numeric
            placeholder="05xxxxxxxx"
            iconStart={<Phone className="size-4" />}
            invalid={Boolean(errors.phone)}
          />
        </FormField>

        <FormField label="المدينة" error={errors.city}>
          <Input
            value={value.city}
            onChange={(event) => onChange({ city: event.target.value })}
            maxLength={80}
            placeholder="الرياض"
            iconStart={<Building2 className="size-4" />}
            invalid={Boolean(errors.city)}
          />
        </FormField>
      </FieldRow>

      <FormField label="العنوان" error={errors.address}>
        <Input
          value={value.address}
          onChange={(event) => onChange({ address: event.target.value })}
          maxLength={200}
          placeholder="حي النسيم، شارع الأمير سلطان"
          iconStart={<MapPin className="size-4" />}
          invalid={Boolean(errors.address)}
        />
      </FormField>
    </div>
  );
}

// ── 2 · Currency & tax ───────────────────────────────────────────────────────

export interface RegionalState {
  currency: string;
  timezone: string;
  taxEnabled: boolean;
  taxRatePercent: number;
  taxInclusive: boolean;
}

export function CurrencyStep({
  value,
  onChange,
  errors,
}: {
  value: RegionalState;
  onChange: (next: Partial<RegionalState>) => void;
  errors: FieldErrors;
}) {
  const currency = getCurrency(value.currency);
  // The rate is edited as text: parsing on every keystroke would swallow the
  // decimal point and make "7.5" impossible to type.
  const [rateText, setRateText] = useState(String(value.taxRatePercent));

  function changeTimezone(timezone: string) {
    const country = COUNTRIES.find((entry) => entry.timezone === timezone);
    // Until the owner turns tax on, keep the suggested rate in step with the country.
    if (country && !value.taxEnabled) {
      const suggested = country.vatBps / 100;
      setRateText(String(suggested));
      onChange({ timezone, taxRatePercent: suggested });
      return;
    }
    onChange({ timezone });
  }

  return (
    <div className="space-y-5">
      <FieldRow>
        <FormField
          label="العملة"
          required
          hint={`الأسعار ستُحفظ بـ ${currency.decimals} خانات عشرية`}
          error={errors.currency}
        >
          <Select
            value={value.currency}
            onChange={(event) => onChange({ currency: event.target.value })}
          >
            {CURRENCIES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.nameAr} ({option.symbol})
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="المنطقة الزمنية"
          required
          hint="تحدد بداية اليوم في التقارير والورديات"
          error={errors.timezone}
        >
          <Select
            value={value.timezone}
            onChange={(event) => changeTimezone(event.target.value)}
          >
            {COUNTRIES.map((country) => (
              <option key={country.timezone} value={country.timezone}>
                {country.nameAr} — {country.timezone}
              </option>
            ))}
          </Select>
        </FormField>
      </FieldRow>

      <Alert tone="warning" compact>
        تغيير العملة بعد تسجيل مبيعات لا يعيد تسعير الفواتير القديمة — اخترها الآن بعناية.
      </Alert>

      <div className="rounded-[var(--radius-md)] border border-line-subtle bg-sunken p-4">
        <Switch
          checked={value.taxEnabled}
          onChange={(event) => onChange({ taxEnabled: event.target.checked })}
          label="تفعيل ضريبة القيمة المضافة"
          description="إذا كان محلك مسجلاً في الضريبة، فعّلها ليظهر المبلغ على الفاتورة."
        />

        {value.taxEnabled && (
          <div className="mt-4 space-y-4 border-t border-line-subtle pt-4">
            <FormField label="نسبة الضريبة" required error={errors.taxRatePercent}>
              <Input
                value={rateText}
                onChange={(event) => {
                  const text = event.target.value.replace(/[^\d.]/g, '');
                  setRateText(text);
                  onChange({ taxRatePercent: Number(text) || 0 });
                }}
                inputMode="decimal"
                numeric
                iconEnd={<span className="text-[13px] font-semibold">%</span>}
                invalid={Boolean(errors.taxRatePercent)}
              />
            </FormField>

            <div className="space-y-2.5">
              <Radio
                name="taxInclusive"
                checked={value.taxInclusive}
                onChange={() => onChange({ taxInclusive: true })}
                label="الأسعار شاملة الضريبة"
                description="السعر المعروض هو ما يدفعه الزبون، وتُستخرج الضريبة منه."
              />
              <Radio
                name="taxInclusive"
                checked={!value.taxInclusive}
                onChange={() => onChange({ taxInclusive: false })}
                label="الأسعار غير شاملة"
                description="تُضاف الضريبة فوق السعر عند الحساب."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 3 · First employee ───────────────────────────────────────────────────────

export interface EmployeeState {
  name: string;
  email: string;
  roleId: string;
}

export function EmployeeStep({
  value,
  onChange,
  errors,
  roles,
  createdPassword,
  existingCount,
}: {
  value: EmployeeState;
  onChange: (next: Partial<EmployeeState>) => void;
  errors: FieldErrors;
  roles: OnboardingSnapshot['roles'];
  createdPassword: string | null;
  existingCount: number;
}) {
  if (createdPassword) {
    return <CredentialsPanel email={value.email} password={createdPassword} />;
  }

  return (
    <div className="space-y-4">
      {existingCount > 0 && (
        <Alert tone="success" compact>
          لديك {countAr(existingCount, NOUNS.employee)} مضاف بالفعل. يمكنك إضافة غيرهم الآن أو
          لاحقاً من صفحة الموظفين.
        </Alert>
      )}

      <FieldRow>
        <FormField label="اسم الموظف" required error={errors.name}>
          <Input
            value={value.name}
            onChange={(event) => onChange({ name: event.target.value })}
            maxLength={80}
            placeholder="مثال: خالد العمري"
            invalid={Boolean(errors.name)}
          />
        </FormField>

        <FormField label="البريد الإلكتروني" required error={errors.email}>
          <Input
            value={value.email}
            onChange={(event) => onChange({ email: event.target.value })}
            type="email"
            placeholder="name@example.com"
            invalid={Boolean(errors.email)}
          />
        </FormField>
      </FieldRow>

      <FormField
        label="الصلاحية"
        required
        hint="يمكنك تعديل الصلاحيات بالتفصيل لاحقاً، أو إنشاء صلاحية مخصصة."
        error={errors.roleId}
      >
        <div role="radiogroup" aria-label="الصلاحية" className="grid gap-2 sm:grid-cols-2">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              role="radio"
              aria-checked={value.roleId === role.id}
              onClick={() => onChange({ roleId: role.id })}
              className={cn(
                'rounded-[var(--radius-md)] border p-3 text-start transition-colors',
                value.roleId === role.id
                  ? 'border-accent-strong bg-accent-soft'
                  : 'border-line-subtle bg-card hover:border-line-strong',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13.5px] font-bold text-primary">{role.nameAr}</span>
                {value.roleId === role.id && (
                  <Check className="size-4 shrink-0 text-accent-strong" aria-hidden="true" />
                )}
              </span>
              {role.description && (
                <span className="mt-1 block text-[12px] leading-relaxed text-secondary">
                  {role.description}
                </span>
              )}
            </button>
          ))}
        </div>
      </FormField>
    </div>
  );
}

/**
 * The generated password is shown exactly once, here. There is no mail delivery
 * wired up yet, so if the owner leaves this screen without copying it the only
 * way back is a password reset — which the text says plainly.
 */
function CredentialsPanel({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      <Alert tone="success" title="تم إنشاء حساب الموظف">
        سلّمه بيانات الدخول التالية. سيُطلب منه اختيار كلمة مرور خاصة به عند أول دخول. لن تظهر
        هذه الكلمة المؤقتة مرة أخرى — إن فقدها، أعد تعيينها من صفحة الموظفين.
      </Alert>

      <div className="space-y-3 rounded-[var(--radius-md)] border border-line-subtle bg-sunken p-4">
        <div>
          <p className="text-[12px] font-semibold text-secondary">البريد</p>
          <p className="num mt-0.5 text-[14px] font-bold text-primary">{email}</p>
        </div>
        <div>
          <p className="text-[12px] font-semibold text-secondary">كلمة المرور المؤقتة</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="num flex-1 rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 py-2 text-[15px] font-bold tracking-wider text-primary">
              {password}
            </code>
            <Button
              size="sm"
              iconStart={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              onClick={() => {
                void navigator.clipboard.writeText(password).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? 'تم النسخ' : 'نسخ'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 4 · Categories ───────────────────────────────────────────────────────────

export function CategoriesStep({
  suggestions,
  selected,
  onToggle,
  existing,
  errors,
}: {
  suggestions: readonly string[];
  selected: string[];
  onToggle: (name: string) => void;
  existing: OnboardingSnapshot['categories'];
  errors: FieldErrors;
}) {
  const [draft, setDraft] = useState('');
  const existingNames = new Set(existing.map((category) => category.name));
  const custom = selected.filter((name) => !suggestions.includes(name));

  const addDraft = () => {
    const name = draft.trim();
    if (name === '' || existingNames.has(name) || selected.includes(name)) {
      setDraft('');
      return;
    }
    onToggle(name);
    setDraft('');
  };

  return (
    <div className="space-y-5">
      {existing.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-semibold text-primary">التصنيفات الموجودة</p>
          <div className="flex flex-wrap gap-1.5">
            {existing.map((category) => (
              <span
                key={category.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-success-border bg-success-soft px-3 py-1.5 text-[12.5px] font-semibold text-primary"
              >
                <Check className="size-3.5 text-success" aria-hidden="true" />
                {category.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-[13px] font-semibold text-primary">
          اختر ما يناسب محلك — اضغط لإضافته
        </p>
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((name) => {
            const already = existingNames.has(name);
            const active = selected.includes(name);
            return (
              <button
                key={name}
                type="button"
                disabled={already}
                onClick={() => onToggle(name)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors',
                  already
                    ? 'cursor-not-allowed border-line-subtle bg-sunken text-tertiary'
                    : active
                      ? 'border-accent-strong bg-accent-strong text-white'
                      : 'border-line-strong bg-card text-secondary hover:border-accent-border hover:text-primary',
                )}
              >
                {active ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <Plus className="size-3.5" aria-hidden="true" />
                )}
                {name}
              </button>
            );
          })}
        </div>
      </div>

      <FormField label="تصنيف آخر" error={errors.names}>
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addDraft();
              }
            }}
            maxLength={60}
            placeholder="اكتب اسم التصنيف واضغط Enter"
            iconStart={<Tag className="size-4" />}
          />
          <Button onClick={addDraft} iconStart={<Plus className="size-4" />}>
            إضافة
          </Button>
        </div>
      </FormField>

      {custom.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {custom.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1.5 rounded-full border border-accent-strong bg-accent-strong px-3 py-1.5 text-[12.5px] font-semibold text-white"
            >
              {name}
              <button
                type="button"
                onClick={() => onToggle(name)}
                aria-label={`إزالة ${name}`}
                className="opacity-70 transition-opacity hover:opacity-100"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 5 · First product ────────────────────────────────────────────────────────

export interface ProductState {
  name: string;
  categoryId: string;
  unitKind: 'COUNT' | 'WEIGHT' | 'VOLUME';
  unitLabel: string;
  /** Base units per sale unit, ×1000. */
  displayFactor: number;
  purchasePrice: number;
  sellingPrice: number;
  openingStock: number;
}

const UNIT_KINDS = [
  { value: 'COUNT', label: 'بالعدد', hint: 'قطعة، علبة، كرتون' },
  { value: 'WEIGHT', label: 'بالوزن', hint: 'معسل بالجرام أو الكيلو' },
  { value: 'VOLUME', label: 'بالحجم', hint: 'نكهات بالمليلتر' },
] as const;

export function ProductStep({
  value,
  onChange,
  errors,
  categories,
  existingCount,
}: {
  value: ProductState;
  onChange: (next: Partial<ProductState>) => void;
  errors: FieldErrors;
  categories: OnboardingSnapshot['categories'];
  existingCount: number;
}) {
  const fmt = useFormat();
  const presets = UNIT_PRESETS[value.unitKind];
  const profit = value.sellingPrice - value.purchasePrice;
  // Margin on the selling price — the same definition the product form and the
  // profit reports use, so the owner sees one number for one idea.
  const marginPercent =
    profit > 0 && value.sellingPrice > 0
      ? Math.round((profit / value.sellingPrice) * 1000) / 10
      : null;

  return (
    <div className="space-y-4">
      {existingCount > 0 && (
        <Alert tone="success" compact>
          لديك {countAr(existingCount, NOUNS.product)} في المخزون. أضف منتجاً آخر أو تابع.
        </Alert>
      )}

      <FormField label="اسم المنتج" required error={errors.name}>
        <Input
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
          autoFocus
          maxLength={120}
          placeholder="مثال: معسل تفاحتين ٢٥٠ جرام"
          invalid={Boolean(errors.name)}
        />
      </FormField>

      <FieldRow>
        <FormField label="التصنيف" error={errors.categoryId}>
          <Select
            value={value.categoryId}
            onChange={(event) => onChange({ categoryId: event.target.value })}
          >
            <option value="">بدون تصنيف</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="طريقة البيع" hint="تحدد وحدة القياس في المخزون">
          <div className="grid grid-cols-3 gap-1.5">
            {UNIT_KINDS.map((kind) => (
              <button
                key={kind.value}
                type="button"
                onClick={() => {
                  const first = UNIT_PRESETS[kind.value][0]!;
                  onChange({
                    unitKind: kind.value,
                    unitLabel: first.label,
                    displayFactor: first.factor * 1000,
                  });
                }}
                title={kind.hint}
                className={cn(
                  'h-11 rounded-[var(--radius-sm)] border text-[13px] font-semibold transition-colors',
                  value.unitKind === kind.value
                    ? 'border-accent-strong bg-accent-soft text-accent-strong'
                    : 'border-line-strong bg-card text-secondary hover:text-primary',
                )}
              >
                {kind.label}
              </button>
            ))}
          </div>
        </FormField>
      </FieldRow>

      <FormField
        label="وحدة البيع"
        hint="كيف يطلبه الزبون: قطعة، علبة ٢٥٠ جرام، كيلو…"
        error={errors.unitLabel}
      >
        <Select
          value={value.unitLabel}
          onChange={(event) => {
            const preset = presets.find((option) => option.label === event.target.value);
            if (preset) onChange({ unitLabel: preset.label, displayFactor: preset.factor * 1000 });
          }}
        >
          {presets.map((preset) => (
            <option key={preset.label} value={preset.label}>
              {preset.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FieldRow>
        <FormField label="سعر الشراء" hint="للوحدة الواحدة" error={errors.purchasePrice}>
          <MoneyInput
            value={value.purchasePrice}
            onValueChange={(next) => onChange({ purchasePrice: next })}
            invalid={Boolean(errors.purchasePrice)}
          />
        </FormField>

        <FormField
          label="سعر البيع"
          required
          hint={
            marginPercent !== null && value.purchasePrice > 0
              ? `ربح ${fmt.money(profit)} للوحدة · الهامش ${marginPercent}%`
              : undefined
          }
          error={errors.sellingPrice}
        >
          <MoneyInput
            value={value.sellingPrice}
            onValueChange={(next) => onChange({ sellingPrice: next })}
            invalid={Boolean(errors.sellingPrice)}
          />
        </FormField>
      </FieldRow>

      <FormField
        label="الكمية المتوفرة الآن"
        hint="الرصيد الافتتاحي — يدخل المخزون بسعر الشراء أعلاه"
        error={errors.openingStock}
      >
        <QuantityInput
          value={value.openingStock}
          onValueChange={(next) => onChange({ openingStock: next })}
          factor={value.displayFactor}
          unitLabel={value.unitLabel}
          allowFractional={value.unitKind !== 'COUNT'}
        />
      </FormField>
    </div>
  );
}

// ── 6 · Payment methods ──────────────────────────────────────────────────────

export function PaymentMethodsStep({
  methods,
  activeIds,
  defaultId,
  onToggle,
  onSetDefault,
}: {
  methods: OnboardingSnapshot['paymentMethods'];
  activeIds: string[];
  defaultId: string;
  onToggle: (id: string, active: boolean) => void;
  onSetDefault: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-[13.5px] leading-relaxed text-secondary">
        فعّل ما تقبله في محلك. الطريقة الافتراضية هي التي تظهر جاهزة في شاشة البيع.
      </p>

      <ul className="space-y-2">
        {methods.map((method) => {
          const active = activeIds.includes(method.id);
          return (
            <li
              key={method.id}
              className={cn(
                'rounded-[var(--radius-md)] border p-3.5 transition-colors',
                active ? 'border-line-strong bg-card' : 'border-line-subtle bg-sunken',
              )}
            >
              <Switch
                checked={active}
                onChange={(event) => onToggle(method.id, event.target.checked)}
                label={method.name}
                description={
                  method.affectsCashbox
                    ? 'يدخل صندوق النقد ويُحتسب في تسوية الوردية'
                    : 'لا يدخل صندوق النقد — يُسجَّل كتحصيل بنكي'
                }
              />

              {active && (
                <div className="mt-3 border-t border-line-subtle pt-3">
                  <Radio
                    name="defaultMethod"
                    checked={defaultId === method.id}
                    onChange={() => onSetDefault(method.id)}
                    label="اجعلها الافتراضية في شاشة البيع"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {activeIds.length === 0 && (
        <Alert tone="danger" compact>
          يجب إبقاء طريقة دفع واحدة مفعّلة على الأقل.
        </Alert>
      )}
    </div>
  );
}
