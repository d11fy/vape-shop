'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, KeyRound, Lock, Mail } from 'lucide-react';

import { Alert } from '@/ui/feedback/alert';
import { Button, ButtonLink } from '@/ui/primitives/button';
import { FormField } from '@/ui/forms/form-field';
import { Input } from '@/ui/primitives/input';
import { useFormAction } from '@/lib/use-form-action';
import { changePasswordAction, forgotPasswordAction, resetPasswordAction } from './actions';
import { PasswordStrengthMeter } from './password-strength-meter';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);

  const form = useFormAction(forgotPasswordAction, {
    toastOnError: false,
    onSuccess: () => setSent(true),
  });

  if (sent) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-7" />
        </span>
        <h1 className="mt-5 text-[22px] font-bold text-primary">تحقق من بريدك</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          إذا كان البريد مسجلاً لدينا، ستصلك رسالة تحتوي على رابط لإعادة تعيين كلمة المرور. الرابط
          صالح لمدة ساعة واحدة.
        </p>
        <ButtonLink href="/login" variant="outline" className="mt-6">
          العودة لتسجيل الدخول
        </ButtonLink>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-tight text-primary">
          نسيت كلمة المرور؟
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة التعيين.
        </p>
      </div>

      {form.formError && (
        <Alert tone="danger" className="mb-5" compact>
          {form.formError}
        </Alert>
      )}

      <form onSubmit={form.onSubmit} className="space-y-4" noValidate>
        <FormField label="البريد الإلكتروني" required error={form.fieldErrors.email}>
          <Input
            name="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="name@example.com"
            iconStart={<Mail className="size-4" />}
            invalid={Boolean(form.fieldErrors.email)}
            onChange={() => form.clearError('email')}
          />
        </FormField>

        <Button type="submit" variant="primary" size="lg" block loading={form.pending}>
          إرسال الرابط
        </Button>
      </form>

      <p className="mt-7 text-center text-[13px] text-secondary">
        تذكرت كلمة المرور؟{' '}
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

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState('');

  const form = useFormAction(resetPasswordAction, {
    toastOnError: false,
    onSuccess: () => setDone(true),
  });

  if (done) {
    return (
      <div className="text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="size-7" />
        </span>
        <h1 className="mt-5 text-[22px] font-bold text-primary">تم تغيير كلمة المرور</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          سُجِّل خروجك من كل الأجهزة الأخرى لحماية حسابك. يمكنك الآن الدخول بكلمة المرور الجديدة.
        </p>
        <Button
          variant="accent"
          className="mt-6"
          onClick={() => router.replace('/login')}
        >
          تسجيل الدخول
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-[26px] font-bold tracking-tight text-primary">كلمة مرور جديدة</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          اختر كلمة مرور قوية لا تستخدمها في مواقع أخرى.
        </p>
      </div>

      {form.formError && (
        <Alert tone="danger" className="mb-5" compact>
          {form.formError}
        </Alert>
      )}

      <form onSubmit={form.onSubmit} className="space-y-4" noValidate>
        <input type="hidden" name="token" value={token} />

        <FormField label="كلمة المرور الجديدة" required error={form.fieldErrors.password}>
          <Input
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="new-password"
            value={password}
            iconStart={<Lock className="size-4" />}
            invalid={Boolean(form.fieldErrors.password)}
            onChange={(event) => {
              setPassword(event.target.value);
              form.clearError('password');
            }}
          />
          <PasswordStrengthMeter password={password} />
        </FormField>

        <FormField label="تأكيد كلمة المرور" required error={form.fieldErrors.confirmPassword}>
          <Input
            name="confirmPassword"
            type="password"
            required
            autoComplete="new-password"
            iconStart={<Lock className="size-4" />}
            invalid={Boolean(form.fieldErrors.confirmPassword)}
            onChange={() => form.clearError('confirmPassword')}
          />
        </FormField>

        <Button type="submit" variant="accent" size="lg" block loading={form.pending}>
          حفظ كلمة المرور
        </Button>
      </form>
    </div>
  );
}

/**
 * Change the signed-in user's password.
 *
 * Used in two places: forced, right after signing in with a temporary password
 * (`redirectTo` set — the user continues into the app), and voluntarily from
 * the account page (the form clears itself and stays).
 */
export function ChangePasswordForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState('');

  const form = useFormAction(changePasswordAction, {
    toastOnError: false,
    successMessage: 'تم تغيير كلمة المرور. سُجّل خروجك من الأجهزة الأخرى.',
    onSuccess: () => {
      if (redirectTo) {
        router.replace(redirectTo);
        router.refresh();
        return;
      }
      formRef.current?.reset();
      setPassword('');
    },
  });

  return (
    <form ref={formRef} onSubmit={form.onSubmit} className="space-y-4" noValidate>
      {form.formError && (
        <Alert tone="danger" compact>
          {form.formError}
        </Alert>
      )}

      <FormField
        label={redirectTo ? 'كلمة المرور المؤقتة' : 'كلمة المرور الحالية'}
        required
        error={form.fieldErrors.currentPassword}
      >
        <Input
          name="currentPassword"
          type="password"
          required
          autoFocus={Boolean(redirectTo)}
          autoComplete="current-password"
          iconStart={<Lock className="size-4" />}
          onChange={() => form.clearError('currentPassword')}
        />
      </FormField>

      <FormField label="كلمة المرور الجديدة" required error={form.fieldErrors.password}>
        <Input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          iconStart={<KeyRound className="size-4" />}
          onChange={(event) => {
            setPassword(event.target.value);
            form.clearError('password');
          }}
        />
        <PasswordStrengthMeter password={password} />
      </FormField>

      <FormField label="تأكيد كلمة المرور الجديدة" required error={form.fieldErrors.confirmPassword}>
        <Input
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          iconStart={<KeyRound className="size-4" />}
          onChange={() => form.clearError('confirmPassword')}
        />
      </FormField>

      <Button
        type="submit"
        variant={redirectTo ? 'accent' : 'primary'}
        size={redirectTo ? 'lg' : 'md'}
        block={Boolean(redirectTo)}
        loading={form.pending}
      >
        {redirectTo ? 'حفظ والمتابعة' : 'تغيير كلمة المرور'}
      </Button>
    </form>
  );
}
