'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, Mail, Phone, Store, User } from 'lucide-react';

import { COUNTRIES } from '@/core/currency';
import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { Checkbox } from '@/ui/primitives/toggle';
import { FormField } from '@/ui/forms/form-field';
import { Input, Select } from '@/ui/primitives/input';
import { useFormAction } from '@/lib/use-form-action';
import { registerStoreAction } from './actions';
import { PasswordStrengthMeter } from './password-strength-meter';

export function RegisterForm() {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [password, setPassword] = useState('');

  const form = useFormAction(registerStoreAction, {
    toastOnError: false,
    onSuccess: (data) => {
      router.replace(data.redirectTo);
      router.refresh();
    },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-tight text-primary">أنشئ متجرك</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          ابدأ فترة تجريبية مجانية — بدون بطاقة بنكية.
        </p>
      </div>

      {form.formError && (
        <Alert tone="danger" className="mb-5" compact>
          {form.formError}
        </Alert>
      )}

      <form onSubmit={form.onSubmit} className="space-y-4" noValidate>
        <FormField label="اسم المحل" required error={form.fieldErrors.storeName}>
          <Input
            name="storeName"
            required
            autoFocus
            placeholder="مثال: محل الليالي"
            iconStart={<Store className="size-4" />}
            invalid={Boolean(form.fieldErrors.storeName)}
            onChange={() => form.clearError('storeName')}
          />
        </FormField>

        <FormField label="اسمك" required error={form.fieldErrors.ownerName}>
          <Input
            name="ownerName"
            required
            autoComplete="name"
            iconStart={<User className="size-4" />}
            invalid={Boolean(form.fieldErrors.ownerName)}
            onChange={() => form.clearError('ownerName')}
          />
        </FormField>

        <FormField label="البريد الإلكتروني" required error={form.fieldErrors.email}>
          <Input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="name@example.com"
            iconStart={<Mail className="size-4" />}
            invalid={Boolean(form.fieldErrors.email)}
            onChange={() => form.clearError('email')}
          />
        </FormField>

        <FormField label="رقم الهاتف" error={form.fieldErrors.phone}>
          <Input
            name="phone"
            type="tel"
            inputMode="tel"
            numeric
            placeholder="05xxxxxxxx"
            iconStart={<Phone className="size-4" />}
            invalid={Boolean(form.fieldErrors.phone)}
            onChange={() => form.clearError('phone')}
          />
        </FormField>

        <FormField label="الدولة" hint="تُحدد العملة والمنطقة الزمنية — يمكنك تغييرها لاحقاً">
          <Select name="country" defaultValue="SA">
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.nameAr}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField
          label="كلمة المرور"
          required
          error={form.fieldErrors.password}
          hint={password ? undefined : '8 أحرف على الأقل'}
        >
          <Input
            name="password"
            type={revealed ? 'text' : 'password'}
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              form.clearError('password');
            }}
            iconStart={<Lock className="size-4" />}
            invalid={Boolean(form.fieldErrors.password)}
            iconEnd={
              <button
                type="button"
                onClick={() => setRevealed((value) => !value)}
                aria-label={revealed ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                className="pointer-events-auto text-tertiary transition-colors hover:text-primary"
              >
                {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          />

          <PasswordStrengthMeter password={password} />
        </FormField>

        <Checkbox
          name="acceptTerms"
          required
          label={
            <span>
              أوافق على شروط الاستخدام وسياسة الخصوصية، وأقر بأن المحل ملتزم بأنظمة بيع منتجات
              التبغ في بلده
            </span>
          }
        />
        {form.fieldErrors.acceptTerms && (
          <p className="text-[12px] font-medium text-danger">
            {form.fieldErrors.acceptTerms[0]}
          </p>
        )}

        <Button type="submit" variant="accent" size="lg" block loading={form.pending}>
          إنشاء المتجر والبدء
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-secondary">
        لديك حساب؟{' '}
        <Link
          href="/login"
          className="font-bold text-accent-strong underline-offset-4 hover:underline"
        >
          تسجيل الدخول
        </Link>
      </p>
    </div>
  );
}
