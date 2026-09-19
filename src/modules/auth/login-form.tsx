'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, User } from 'lucide-react';

import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Checkbox } from '@/ui/primitives/toggle';
import { FormField } from '@/ui/forms/form-field';
import { useFormAction } from '@/lib/use-form-action';
import { signInAction } from './actions';

export function LoginForm({ allowSignup }: { allowSignup: boolean }) {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);

  const form = useFormAction(signInAction, {
    toastOnError: false,
    onSuccess: (data) => {
      router.replace(data.redirectTo);
      router.refresh();
    },
  });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-tight text-primary">أهلاً بعودتك</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          سجّل الدخول للمتابعة إلى لوحة إدارة محلك.
        </p>
      </div>

      {form.formError && (
        <Alert tone="danger" className="mb-5" compact>
          {form.formError}
        </Alert>
      )}

      <form onSubmit={form.onSubmit} className="space-y-4" noValidate>
        <FormField
          label="البريد الإلكتروني أو رقم الهاتف"
          error={form.fieldErrors.identifier?.filter((message) => message.trim() !== '')}
        >
          <Input
            name="identifier"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoFocus
            required
            placeholder="name@example.com"
            iconStart={<User className="size-4" />}
            invalid={Boolean(form.fieldErrors.identifier)}
            onChange={() => form.clearError('identifier')}
          />
        </FormField>

        <FormField
          label="كلمة المرور"
          error={form.fieldErrors.password?.filter((message) => message.trim() !== '')}
          labelAction={
            <Link
              href="/forgot-password"
              className="text-[12px] font-semibold text-accent-strong underline-offset-4 hover:underline"
            >
              نسيت كلمة المرور؟
            </Link>
          }
        >
          <Input
            name="password"
            type={revealed ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••"
            iconStart={<Lock className="size-4" />}
            invalid={Boolean(form.fieldErrors.password)}
            onChange={() => form.clearError('password')}
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
        </FormField>

        <Checkbox name="remember" defaultChecked label="تذكّرني على هذا الجهاز" />

        <Button type="submit" variant="primary" size="lg" block loading={form.pending}>
          تسجيل الدخول
        </Button>
      </form>

      {allowSignup && (
        <p className="mt-7 text-center text-[13px] text-secondary">
          ليس لديك حساب؟{' '}
          <Link
            href="/register"
            className="font-bold text-accent-strong underline-offset-4 hover:underline"
          >
            أنشئ متجرك الآن
          </Link>
        </p>
      )}
    </div>
  );
}
