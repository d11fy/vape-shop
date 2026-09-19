'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  CreditCard,
  FolderTree,
  Package,
  Rocket,
  Store as StoreIcon,
  UserPlus,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import { countAr, NOUNS } from '@/lib/arabic-count';
import { currencyDecimals, getCurrency } from '@/core/currency';
import type { FieldErrors } from '@/core/errors';
import type { ActionResult } from '@/core/result';
import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { Card } from '@/ui/primitives/card';
import { FormatProvider } from '@/ui/format';
import { Wordmark } from '@/ui/brand/logo';
import { useToast } from '@/ui/feedback/toast';

import { saveEmployeeAction } from '@/modules/employees/actions';
import {
  completeOnboardingAction,
  saveOnboardingCategoriesAction,
  saveOnboardingPaymentMethodsAction,
  saveOnboardingProductAction,
  saveOnboardingStoreAction,
} from './actions';
import { SUGGESTED_CATEGORIES } from './constants';
import type { OnboardingSnapshot } from './queries';
import {
  CategoriesStep,
  CurrencyStep,
  EmployeeStep,
  PaymentMethodsStep,
  ProductStep,
  StoreProfileStep,
  type EmployeeState,
  type ProductState,
  type ProfileState,
  type RegionalState,
} from './steps';

/**
 * The seven-step setup an owner walks through once.
 *
 * Three rules keep it from being annoying:
 *   · every step saves to the database as it is left, so closing the tab loses
 *     nothing and re-opening resumes where the data actually is;
 *   · the three "content" steps (employee, categories, product) can be skipped
 *     — a shop can be ringing up sales with none of them;
 *   · going back never re-saves, so nothing is created twice.
 */

const STEPS = [
  { key: 'store', title: 'معلومات المحل', icon: StoreIcon },
  { key: 'currency', title: 'العملة والضريبة', icon: Coins },
  { key: 'employee', title: 'أول موظف', icon: UserPlus },
  { key: 'categories', title: 'التصنيفات', icon: FolderTree },
  { key: 'product', title: 'أول منتج', icon: Package },
  { key: 'payments', title: 'طرق الدفع', icon: CreditCard },
  { key: 'ready', title: 'جاهز للعمل', icon: Rocket },
] as const;

const SUBTITLES: Record<(typeof STEPS)[number]['key'], string> = {
  store: 'الاسم والعنوان يظهران على كل فاتورة تطبعها.',
  currency: 'كل مبلغ في النظام يُحفظ بهذه العملة.',
  employee: 'أضف من سيعمل معك على الكاشير — يمكنك تخطي هذه الخطوة.',
  categories: 'تجميع المنتجات يجعل البحث في شاشة البيع أسرع.',
  product: 'أدخل منتجاً واحداً لتجرب البيع فوراً — والباقي لاحقاً أو باستيراد ملف.',
  payments: 'ما تقبله من طرق الدفع، وأيّها الافتراضية في شاشة البيع.',
  ready: 'كل شيء جاهز. افتح شاشة البيع وابدأ.',
};

/** Steps the owner may leave without filling anything in. */
const SKIPPABLE = new Set(['employee', 'categories', 'product']);

export function OnboardingWizard({ snapshot }: { snapshot: OnboardingSnapshot }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileState>({
    name: snapshot.store.name,
    phone: snapshot.store.phone ?? '',
    city: snapshot.store.city ?? '',
    address: snapshot.store.address ?? '',
  });

  const [regional, setRegional] = useState<RegionalState>({
    currency: snapshot.settings.currency,
    timezone: snapshot.settings.timezone,
    taxEnabled: snapshot.settings.taxEnabled,
    taxRatePercent: snapshot.settings.taxRateBps / 100,
    taxInclusive: snapshot.settings.taxInclusive,
  });

  const [employee, setEmployee] = useState<EmployeeState>({
    name: '',
    email: '',
    // The first hire is usually behind the counter.
    roleId:
      snapshot.roles.find((role) => role.key === 'cashier')?.id ?? snapshot.roles[0]?.id ?? '',
  });
  const [employeePassword, setEmployeePassword] = useState<string | null>(null);
  const [employeeCount, setEmployeeCount] = useState(snapshot.counts.employees);

  const [categories, setCategories] = useState(snapshot.categories);
  const [pickedCategories, setPickedCategories] = useState<string[]>(() =>
    snapshot.categories.length === 0 ? SUGGESTED_CATEGORIES.slice(0, 5) : [],
  );

  const [product, setProduct] = useState<ProductState>({
    name: '',
    categoryId: '',
    unitKind: 'COUNT',
    unitLabel: 'قطعة',
    displayFactor: 1000,
    purchasePrice: 0,
    sellingPrice: 0,
    openingStock: 0,
  });
  const [productCount, setProductCount] = useState(snapshot.counts.products);

  const [activeMethods, setActiveMethods] = useState<string[]>(() =>
    snapshot.paymentMethods.filter((method) => method.isActive).map((method) => method.id),
  );
  const [defaultMethod, setDefaultMethod] = useState<string>(
    () =>
      snapshot.paymentMethods.find((method) => method.isDefault)?.id ??
      snapshot.paymentMethods[0]?.id ??
      '',
  );

  const current = STEPS[step]!;

  // Every step is saved before the wizard moves past it, so reopening the page
  // can safely land where the owner left off instead of back at step one.
  // A per-browser convenience only: losing it just means starting from the top.
  // Written only when the owner actually moves, never from an effect — an
  // effect would record step 0 on mount before the saved step is applied.
  const stepKey = `vs:onboarding-step:${snapshot.store.id}`;
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(stepKey));
      if (Number.isInteger(saved) && saved > 0 && saved < STEPS.length) setStep(saved);
    } catch {
      /* storage unavailable — start at the first step */
    }
  }, [stepKey]);

  const goTo = (index: number) => {
    const next = Math.min(Math.max(index, 0), STEPS.length - 1);
    setStep(next);
    clearErrors();
    try {
      window.localStorage.setItem(stepKey, String(next));
    } catch {
      /* ignore */
    }
  };

  const formatSettings = useMemo(
    () => ({
      currency: regional.currency,
      decimals: currencyDecimals(regional.currency),
      timezone: regional.timezone,
      locale: 'ar',
    }),
    [regional.currency, regional.timezone],
  );

  const clearErrors = () => {
    setFieldErrors({});
    setFormError(null);
  };

  /** Run a step's save; advance only when it succeeded. */
  const run = <T,>(work: () => Promise<ActionResult<T>>, onDone: (data: T) => void) => {
    clearErrors();
    startTransition(async () => {
      const result = await work();
      if (result.ok) {
        onDone(result.data);
        return;
      }
      if (result.error.fieldErrors) setFieldErrors(result.error.fieldErrors);
      setFormError(result.error.message);
    });
  };

  const advance = () => goTo(step + 1);
  const goBack = () => goTo(step - 1);

  const saveAndAdvance = () => {
    switch (current.key) {
      case 'store':
      case 'currency':
        run(
          () =>
            saveOnboardingStoreAction({
              name: profile.name,
              phone: profile.phone,
              city: profile.city,
              address: profile.address,
              currency: regional.currency,
              timezone: regional.timezone,
              taxEnabled: regional.taxEnabled,
              taxRatePercent: regional.taxRatePercent,
              taxInclusive: regional.taxInclusive,
            }),
          advance,
        );
        return;

      case 'employee': {
        // Already created on this visit — the credentials panel is showing.
        if (employeePassword) {
          advance();
          return;
        }
        // Same action as the employees screen: one path for plan limits, audit
        // and temporary passwords.
        run(() => saveEmployeeAction(employee), (data) => {
          setEmployeeCount((count) => count + 1);
          if (data.temporaryPassword) {
            setEmployeePassword(data.temporaryPassword);
            toast.success('تم إنشاء حساب الموظف');
            return;
          }
          // An existing account joined the store — they keep their own password.
          toast.success('تمت إضافة الموظف', 'لديه حساب مسبق، ويدخل بكلمة المرور الخاصة به.');
          setEmployee((value) => ({ ...value, name: '', email: '' }));
          advance();
        });
        return;
      }

      case 'categories': {
        const fresh = pickedCategories.filter(
          (name) => !categories.some((category) => category.name === name),
        );
        if (fresh.length === 0) {
          advance();
          return;
        }
        run(() => saveOnboardingCategoriesAction({ names: fresh }), (data) => {
          setCategories(data.categories);
          setPickedCategories([]);
          advance();
        });
        return;
      }

      case 'product':
        run(
          () =>
            saveOnboardingProductAction({
              name: product.name,
              categoryId: product.categoryId || null,
              unitKind: product.unitKind,
              unitLabel: product.unitLabel,
              displayFactor: product.displayFactor,
              purchasePrice: product.purchasePrice,
              sellingPrice: product.sellingPrice,
              openingStock: product.openingStock,
            }),
          () => {
            setProductCount((count) => count + 1);
            setProduct((value) => ({
              ...value,
              name: '',
              purchasePrice: 0,
              sellingPrice: 0,
              openingStock: 0,
            }));
            toast.success('تمت إضافة المنتج');
            advance();
          },
        );
        return;

      case 'payments':
        run(
          () =>
            saveOnboardingPaymentMethodsAction({
              activeIds: activeMethods,
              defaultId: defaultMethod,
            }),
          advance,
        );
        return;

      case 'ready':
        run(completeOnboardingAction, () => {
          try {
            window.localStorage.removeItem(stepKey);
          } catch {
            /* ignore */
          }
          router.replace('/dashboard');
          router.refresh();
        });
        return;
    }
  };

  // The skip button covers "nothing entered" on the optional steps, so `التالي`
  // stays disabled until the step actually has something worth saving.
  const canAdvance = (() => {
    switch (current.key) {
      case 'store':
        return profile.name.trim().length >= 2;
      case 'employee':
        return (
          employeePassword !== null ||
          (employee.name.trim().length >= 2 && employee.email.trim() !== '')
        );
      case 'categories':
        return pickedCategories.length > 0 || categories.length > 0;
      case 'product':
        return product.name.trim().length >= 2 && product.sellingPrice > 0;
      case 'payments':
        return activeMethods.length > 0 && activeMethods.includes(defaultMethod);
      default:
        return true;
    }
  })();

  return (
    <FormatProvider settings={formatSettings}>
      <div className="mx-auto w-full max-w-2xl px-5 py-8 sm:py-12">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Wordmark size="sm" />
          <p className="num-mixed text-[12.5px] font-semibold text-tertiary">
            الخطوة {step + 1} من {STEPS.length}
          </p>
        </div>

        <Stepper current={step} onSelect={(index) => index < step && goTo(index)} />

        <Card className="mt-6">
          <div className="mb-6 flex items-start gap-3.5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-soft text-accent-strong">
              <current.icon className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[19px] font-bold text-primary">{current.title}</h1>
              <p className="mt-0.5 text-[13px] leading-relaxed text-secondary">
                {SUBTITLES[current.key]}
              </p>
            </div>
          </div>

          {formError && (
            <Alert tone="danger" className="mb-5" compact>
              {formError}
            </Alert>
          )}

          {current.key === 'store' && (
            <StoreProfileStep
              value={profile}
              onChange={(next) => setProfile((value) => ({ ...value, ...next }))}
              errors={fieldErrors}
            />
          )}

          {current.key === 'currency' && (
            <CurrencyStep
              value={regional}
              onChange={(next) => setRegional((value) => ({ ...value, ...next }))}
              errors={fieldErrors}
            />
          )}

          {current.key === 'employee' && (
            <EmployeeStep
              value={employee}
              onChange={(next) => setEmployee((value) => ({ ...value, ...next }))}
              errors={fieldErrors}
              roles={snapshot.roles}
              createdPassword={employeePassword}
              existingCount={employeeCount}
            />
          )}

          {current.key === 'categories' && (
            <CategoriesStep
              suggestions={SUGGESTED_CATEGORIES}
              selected={pickedCategories}
              onToggle={(name) =>
                setPickedCategories((value) =>
                  value.includes(name)
                    ? value.filter((entry) => entry !== name)
                    : [...value, name],
                )
              }
              existing={categories}
              errors={fieldErrors}
            />
          )}

          {current.key === 'product' && (
            <ProductStep
              value={product}
              onChange={(next) => setProduct((value) => ({ ...value, ...next }))}
              errors={fieldErrors}
              categories={categories}
              existingCount={productCount}
            />
          )}

          {current.key === 'payments' && (
            <PaymentMethodsStep
              methods={snapshot.paymentMethods}
              activeIds={activeMethods}
              defaultId={defaultMethod}
              onToggle={(id, active) =>
                setActiveMethods((value) => {
                  const next = active ? [...value, id] : value.filter((entry) => entry !== id);
                  if (!active && defaultMethod === id) setDefaultMethod(next[0] ?? '');
                  return next;
                })
              }
              onSetDefault={setDefaultMethod}
            />
          )}

          {current.key === 'ready' && (
            <ReadyStep
              storeName={profile.name}
              currency={regional.currency}
              categories={categories.length}
              products={productCount}
              employees={employeeCount}
            />
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line-subtle pt-6">
            <Button
              onClick={goBack}
              disabled={step === 0 || pending}
              variant="ghost"
              iconStart={<ArrowRight className="size-4" />}
            >
              رجوع
            </Button>

            <div className="flex items-center gap-2">
              {SKIPPABLE.has(current.key) && !(current.key === 'employee' && employeePassword) && (
                <Button onClick={advance} disabled={pending} variant="ghost">
                  تخطي
                </Button>
              )}
              <Button
                onClick={saveAndAdvance}
                loading={pending}
                disabled={!canAdvance}
                variant="accent"
                size="lg"
                iconEnd={
                  current.key === 'ready' ? undefined : <ArrowLeft className="size-4" />
                }
              >
                {current.key === 'ready' ? 'ابدأ العمل' : 'التالي'}
              </Button>
            </div>
          </div>
        </Card>

        <p className="mt-6 text-center text-[12px] leading-relaxed text-tertiary">
          كل ما تدخله هنا يمكن تعديله لاحقاً من الإعدادات.
        </p>
      </div>
    </FormatProvider>
  );
}

/**
 * Progress indicator. On a phone it collapses to a bar plus the current label —
 * seven circles do not fit at 360px without becoming unreadable.
 */
function Stepper({ current, onSelect }: { current: number; onSelect: (index: number) => void }) {
  const percent = Math.round(((current + 1) / STEPS.length) * 100);

  return (
    <div>
      <ol className="hidden items-center sm:flex">
        {STEPS.map((entry, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={entry.key} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => onSelect(index)}
                disabled={!done}
                aria-current={active ? 'step' : undefined}
                className="group flex shrink-0 flex-col items-center gap-1.5"
                title={entry.title}
              >
                <span
                  className={cn(
                    'num flex size-8 items-center justify-center rounded-full border text-[12.5px] font-bold transition-colors',
                    done
                      ? 'border-accent-strong bg-accent-strong text-white group-hover:bg-accent'
                      : active
                        ? 'border-accent-strong bg-accent-soft text-accent-strong'
                        : 'border-line-strong bg-card text-tertiary',
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                </span>
                <span
                  className={cn(
                    'max-w-20 text-center text-[11px] leading-tight font-semibold',
                    active ? 'text-primary' : 'text-tertiary',
                  )}
                >
                  {entry.title}
                </span>
              </button>

              {index < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'mx-1 -mt-5 h-0.5 flex-1 rounded-full transition-colors',
                    done ? 'bg-accent-strong' : 'bg-line',
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="sm:hidden">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-[13px] font-bold text-primary">{STEPS[current]!.title}</p>
          <p className="num-mixed text-[12px] font-semibold text-tertiary">{percent}٪</p>
        </div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span
            className="block h-full rounded-full bg-accent-strong transition-[width] duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ReadyStep({
  storeName,
  currency,
  categories,
  products,
  employees,
}: {
  storeName: string;
  currency: string;
  categories: number;
  products: number;
  employees: number;
}) {
  const rows = [
    { label: 'المحل', value: storeName, done: true },
    { label: 'العملة', value: getCurrency(currency).nameAr, done: true },
    {
      label: 'التصنيفات',
      value: categories > 0 ? countAr(categories, NOUNS.category) : 'لم تُضف بعد',
      done: categories > 0,
    },
    {
      label: 'المنتجات',
      value: products > 0 ? countAr(products, NOUNS.product) : 'لم تُضف بعد',
      done: products > 0,
    },
    {
      label: 'الموظفون',
      value: employees > 0 ? countAr(employees, NOUNS.employee) : 'تعمل وحدك حالياً',
      done: employees > 0,
    },
  ];

  return (
    <div className="space-y-5">
      <ul className="divide-y divide-line-subtle rounded-[var(--radius-md)] border border-line-subtle">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full',
                  row.done ? 'bg-success-soft text-success' : 'bg-sunken text-tertiary',
                )}
              >
                <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
              </span>
              <span className="text-[13.5px] font-semibold text-primary">{row.label}</span>
            </span>
            <span className="truncate text-[13px] text-secondary">{row.value}</span>
          </li>
        ))}
      </ul>

      <Alert tone="info" title="ما الذي يمكنك فعله الآن؟">
        افتح شاشة البيع وسجّل أول فاتورة، أو أضف بقية منتجاتك من صفحة المنتجات. الديون
        والمصاريف والتقارير كلها جاهزة وتعمل من أول يوم.
      </Alert>
    </div>
  );
}
