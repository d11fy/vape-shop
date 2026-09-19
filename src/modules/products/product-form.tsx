'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, GripVertical, Plus, Trash2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { UNIT_PRESETS, QTY_SCALE } from '@/core/quantity';
import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { Card, CardHeader } from '@/ui/primitives/card';
import { Checkbox, Switch } from '@/ui/primitives/toggle';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input, Select, Textarea } from '@/ui/primitives/input';
import { MoneyInput, QuantityInput } from '@/ui/forms/money-input';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { saveProductAction } from './actions';
import type { ProductInput, VariantInput } from './validation';

export interface ProductFormProps {
  /** Omitted when creating. */
  product?: ProductInput & { id: string };
  categories: Array<{ id: string; name: string }>;
  brands: Array<{ id: string; name: string }>;
  /** Only offered on creation — later changes go through a stock adjustment. */
  allowOpeningStock: boolean;
}

const UNIT_KIND_LABEL = {
  COUNT: 'بالعدد (قطعة / علبة)',
  WEIGHT: 'بالوزن (جرام / كيلو)',
  VOLUME: 'بالحجم (مل / لتر)',
} as const;

const BASE_UNIT_NAME = { COUNT: 'قطعة', WEIGHT: 'جرام', VOLUME: 'مل' } as const;

function blankVariant(unitKind: keyof typeof BASE_UNIT_NAME): VariantInput {
  const preset = UNIT_PRESETS[unitKind][0]!;
  return {
    id: null,
    name: 'افتراضي',
    sku: '',
    barcode: '',
    unitLabel: preset.label,
    displayFactor: preset.factor * QTY_SCALE,
    allowsFractional: unitKind !== 'COUNT',
    sellingPrice: 0,
    wholesalePrice: 0,
    purchasePrice: 0,
    minimumStock: 0,
    openingStock: 0,
    isActive: true,
  };
}

/**
 * Create / edit a product.
 *
 * The variant repeater is the heart of it: a tin of معسل sold as a 50g box, a
 * 250g box and loose by the kilo is one product with three variants, each with
 * its own barcode, price and sale unit. Getting that shape right is what makes
 * "بعت 250 جرام" and "بعت علبة" both work at the till.
 */
export function ProductForm({ product, categories, brands, allowOpeningStock }: ProductFormProps) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();
  const [saving, startSave] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [form, setForm] = useState<ProductInput>(
    () =>
      product ?? {
        id: null,
        name: '',
        description: '',
        categoryId: categories[0]?.id ?? null,
        brandId: null,
        unitKind: 'COUNT',
        trackInventory: true,
        isAgeRestricted: true,
        status: 'ACTIVE',
        imageUrl: '',
        variants: [blankVariant('COUNT')],
      },
  );

  const isEditing = Boolean(product?.id);
  const update = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const updateVariant = (index: number, patch: Partial<VariantInput>) =>
    setForm((current) => ({
      ...current,
      variants: current.variants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, ...patch } : variant,
      ),
    }));

  const addVariant = () => {
    setForm((current) => {
      const last = current.variants[current.variants.length - 1];
      return {
        ...current,
        variants: [
          ...current.variants,
          {
            ...blankVariant(current.unitKind),
            // Carry the pricing forward — most variants differ only in size.
            sellingPrice: last?.sellingPrice ?? 0,
            purchasePrice: last?.purchasePrice ?? 0,
            name: '',
          },
        ],
      };
    });
  };

  const duplicateVariant = (index: number) => {
    setForm((current) => {
      const source = current.variants[index];
      if (!source) return current;
      const copy: VariantInput = {
        ...source,
        id: null,
        name: `${source.name} (نسخة)`,
        sku: '',
        barcode: '',
        openingStock: 0,
      };
      const variants = [...current.variants];
      variants.splice(index + 1, 0, copy);
      return { ...current, variants };
    });
  };

  const removeVariant = (index: number) =>
    setForm((current) => ({
      ...current,
      variants: current.variants.filter((_, variantIndex) => variantIndex !== index),
    }));

  const changeUnitKind = (unitKind: ProductInput['unitKind']) => {
    setForm((current) => {
      const preset = UNIT_PRESETS[unitKind][0]!;
      return {
        ...current,
        unitKind,
        // Reset sale units to something valid for the new measurement family.
        variants: current.variants.map((variant) => ({
          ...variant,
          unitLabel: preset.label,
          displayFactor: preset.factor * QTY_SCALE,
          allowsFractional: unitKind !== 'COUNT',
        })),
      };
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFieldErrors({});
    setFormError(null);

    startSave(async () => {
      const response = await saveProductAction(form);

      if (!response.ok) {
        setFieldErrors(response.error.fieldErrors ?? {});
        setFormError(response.error.message);
        toast.error('تعذر حفظ المنتج', response.error.message);
        return;
      }

      toast.success(isEditing ? 'تم حفظ التعديلات' : 'تمت إضافة المنتج', form.name);
      router.push(`/products/${response.data.id}`);
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      {formError && <Alert tone="danger">{formError}</Alert>}

      {/* Basics */}
      <Card>
        <CardHeader title="بيانات المنتج" subtitle="الاسم والتصنيف ونوع الوحدة" />
        <div className="mt-4 space-y-4">
          <FormField label="اسم المنتج" required error={fieldErrors.name}>
            <Input
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              placeholder="مثال: معسل مزايا تفاحتين"
              invalid={Boolean(fieldErrors.name)}
              autoFocus
            />
          </FormField>

          <FieldRow>
            <FormField label="التصنيف">
              <Select
                value={form.categoryId ?? ''}
                onChange={(event) => update('categoryId', event.target.value || null)}
              >
                <option value="">بدون تصنيف</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="الماركة">
              <Select
                value={form.brandId ?? ''}
                onChange={(event) => update('brandId', event.target.value || null)}
              >
                <option value="">بدون ماركة</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
            </FormField>
          </FieldRow>

          <FormField
            label="طريقة القياس"
            hint={`الوحدة الأساسية للمخزون ستكون «${BASE_UNIT_NAME[form.unitKind]}» — وحدات البيع تُحدَّد لكل صنف بالأسفل.`}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {(['COUNT', 'WEIGHT', 'VOLUME'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => changeUnitKind(kind)}
                  disabled={isEditing}
                  className={cn(
                    'rounded-[var(--radius-sm)] border px-3 py-2.5 text-start text-[13px] font-semibold transition-colors',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    form.unitKind === kind
                      ? 'border-accent-strong bg-accent-soft text-accent-strong'
                      : 'border-line-strong bg-card text-secondary hover:text-primary',
                  )}
                >
                  {UNIT_KIND_LABEL[kind]}
                </button>
              ))}
            </div>
            {isEditing && (
              <p className="mt-1.5 text-[12px] text-tertiary">
                لا يمكن تغيير طريقة القياس بعد إنشاء المنتج حفاظاً على دقة حركات المخزون السابقة.
              </p>
            )}
          </FormField>

          <FormField label="وصف مختصر">
            <Textarea
              rows={2}
              value={form.description ?? ''}
              onChange={(event) => update('description', event.target.value)}
              placeholder="اختياري — يظهر في صفحة المنتج فقط"
            />
          </FormField>

          <div className="space-y-3 rounded-[var(--radius-sm)] border border-line-subtle bg-sunken/50 p-3.5">
            <Switch
              checked={form.trackInventory}
              onChange={(event) => update('trackInventory', event.target.checked)}
              label="تتبّع المخزون"
              description="أوقفه للخدمات أو الأصناف التي لا تُحسب كمياتها"
            />
            <Switch
              checked={form.isAgeRestricted}
              onChange={(event) => update('isAgeRestricted', event.target.checked)}
              label="منتج مقيّد بالعمر"
              description="يُظهر تنبيه السن القانونية على الفاتورة حسب إعدادات المتجر"
            />
            {isEditing && (
              <Switch
                checked={form.status === 'ACTIVE'}
                onChange={(event) => update('status', event.target.checked ? 'ACTIVE' : 'ARCHIVED')}
                label="المنتج متاح للبيع"
                description="أوقفه لإخفائه من شاشة نقطة البيع دون حذف سجله"
              />
            )}
          </div>
        </div>
      </Card>

      {/* Variants */}
      <Card>
        <CardHeader
          title="الأصناف والأسعار"
          subtitle="كل حجم أو نكهة صنف مستقل له سعره وباركوده ومخزونه"
          action={
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={addVariant}
              iconStart={<Plus className="size-3.5" />}
            >
              إضافة صنف
            </Button>
          }
        />

        <div className="mt-4 space-y-3">
          {form.variants.map((variant, index) => (
            <VariantRow
              key={variant.id ?? `new-${index}`}
              variant={variant}
              index={index}
              unitKind={form.unitKind}
              trackInventory={form.trackInventory}
              allowOpeningStock={allowOpeningStock}
              canRemove={form.variants.length > 1}
              onChange={(patch) => updateVariant(index, patch)}
              onRemove={() => removeVariant(index)}
              onDuplicate={() => duplicateVariant(index)}
            />
          ))}
        </div>

        {fieldErrors.variants && (
          <p className="mt-2 text-[12px] font-medium text-danger">{fieldErrors.variants[0]}</p>
        )}
      </Card>

      {/* Actions */}
      <div className="safe-bottom sticky bottom-[calc(var(--bottom-nav-height)+8px)] z-10 flex items-center justify-end gap-2 rounded-[var(--radius-md)] border border-line-subtle bg-card/95 p-3 shadow-md backdrop-blur lg:bottom-4">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={saving}>
          إلغاء
        </Button>
        <Button type="submit" variant="accent" loading={saving}>
          {isEditing ? 'حفظ التعديلات' : 'إضافة المنتج'}
        </Button>
      </div>

      <p className="pb-2 text-center text-[12px] text-tertiary">
        العملة: {fmt.currency} · كل الأسعار تشمل {form.variants.length} صنف
      </p>
    </form>
  );
}

function VariantRow({
  variant,
  index,
  unitKind,
  trackInventory,
  allowOpeningStock,
  canRemove,
  onChange,
  onRemove,
  onDuplicate,
}: {
  variant: VariantInput;
  index: number;
  unitKind: ProductInput['unitKind'];
  trackInventory: boolean;
  allowOpeningStock: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<VariantInput>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const fmt = useFormat();
  const presets = UNIT_PRESETS[unitKind];
  const margin =
    variant.sellingPrice > 0 && variant.purchasePrice > 0
      ? Math.round(
          ((variant.sellingPrice - variant.purchasePrice) / variant.sellingPrice) * 1000,
        ) / 10
      : null;

  const matchedPreset = presets.find(
    (preset) => preset.factor * QTY_SCALE === variant.displayFactor,
  );

  return (
    <div className="rounded-[var(--radius-md)] border border-line-subtle bg-sunken/40 p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[12px] font-bold text-secondary">
          <GripVertical className="size-3.5 text-tertiary" aria-hidden="true" />
          الصنف {index + 1}
          {index === 0 && (
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] text-accent-strong">
              افتراضي
            </span>
          )}
        </span>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            aria-label="نسخ الصنف"
            className="rounded-[var(--radius-xs)] p-1.5 text-tertiary transition-colors hover:bg-card hover:text-primary"
          >
            <Copy className="size-3.5" />
          </button>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label="حذف الصنف"
              className="rounded-[var(--radius-xs)] p-1.5 text-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="اسم الصنف" className="lg:col-span-2">
          <Input
            size="sm"
            value={variant.name}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="مثال: علبة 250 جرام"
          />
        </FormField>

        <FormField label="الباركود">
          <Input
            size="sm"
            numeric
            value={variant.barcode ?? ''}
            onChange={(event) => onChange({ barcode: event.target.value })}
            placeholder="اختياري"
          />
        </FormField>

        <FormField label="الكود SKU">
          <Input
            size="sm"
            numeric
            value={variant.sku ?? ''}
            onChange={(event) => onChange({ sku: event.target.value })}
            placeholder="يُولَّد تلقائياً"
          />
        </FormField>

        <FormField
          label="وحدة البيع"
          hint={
            matchedPreset
              ? undefined
              : `${variant.displayFactor / QTY_SCALE} ${BASE_UNIT_NAME[unitKind]}`
          }
        >
          <Select
            size="sm"
            value={matchedPreset ? String(matchedPreset.factor) : 'custom'}
            onChange={(event) => {
              if (event.target.value === 'custom') return;
              const preset = presets.find(
                (entry) => String(entry.factor) === event.target.value,
              );
              if (preset) {
                onChange({
                  unitLabel: preset.label,
                  displayFactor: preset.factor * QTY_SCALE,
                });
              }
            }}
          >
            {presets.map((preset) => (
              <option key={preset.label} value={preset.factor}>
                {preset.label}
              </option>
            ))}
            <option value="custom">مخصص…</option>
          </Select>
        </FormField>

        <FormField label="اسم الوحدة">
          <Input
            size="sm"
            value={variant.unitLabel}
            onChange={(event) => onChange({ unitLabel: event.target.value })}
            placeholder="علبة"
          />
        </FormField>

        <FormField label="سعر الشراء" hint={margin !== null ? `الهامش ${margin}%` : undefined}>
          <MoneyInput
            size="sm"
            value={variant.purchasePrice}
            onValueChange={(value) => onChange({ purchasePrice: value })}
          />
        </FormField>

        <FormField label="سعر البيع" required>
          <MoneyInput
            size="sm"
            value={variant.sellingPrice}
            onValueChange={(value) => onChange({ sellingPrice: value })}
          />
        </FormField>

        <FormField label="سعر الجملة">
          <MoneyInput
            size="sm"
            value={variant.wholesalePrice}
            onValueChange={(value) => onChange({ wholesalePrice: value })}
          />
        </FormField>

        {trackInventory && (
          <FormField label="حد التنبيه" hint="تنبيه عند الوصول لهذه الكمية">
            <QuantityInput
              size="sm"
              value={variant.minimumStock}
              onValueChange={(value) => onChange({ minimumStock: value })}
              factor={variant.displayFactor}
              unitLabel={variant.unitLabel}
            />
          </FormField>
        )}

        {trackInventory && allowOpeningStock && (
          <FormField label="الرصيد الافتتاحي" hint="الكمية المتوفرة حالياً">
            <QuantityInput
              size="sm"
              value={variant.openingStock}
              onValueChange={(value) => onChange({ openingStock: value })}
              factor={variant.displayFactor}
              unitLabel={variant.unitLabel}
            />
          </FormField>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line-subtle pt-3">
        <Checkbox
          checked={variant.allowsFractional}
          onChange={(event) => onChange({ allowsFractional: event.target.checked })}
          label="السماح بالكسور"
          description="مثل بيع 250 جرام من كيلو"
        />
        <Checkbox
          checked={variant.isActive}
          onChange={(event) => onChange({ isActive: event.target.checked })}
          label="متاح للبيع"
        />
        {variant.sellingPrice > 0 && (
          <span className="num-mixed ms-auto text-[12px] text-tertiary">
            {fmt.money(variant.sellingPrice)} / {variant.unitLabel}
          </span>
        )}
      </div>
    </div>
  );
}
