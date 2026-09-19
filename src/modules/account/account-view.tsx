'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  KeyRound,
  LogOut,
  Monitor,
  Phone,
  ShieldCheck,
  Smartphone,
  Store,
  Tablet,
  User,
} from 'lucide-react';

import type { FieldErrors } from '@/core/errors';
import type { DeviceKind } from '@/lib/user-agent';
import { ChangePasswordForm } from '@/modules/auth/password-forms';
import { Alert } from '@/ui/feedback/alert';
import { useConfirm } from '@/ui/feedback/confirm';
import { useToast } from '@/ui/feedback/toast';
import { useFormat } from '@/ui/format';
import { FormField } from '@/ui/forms/form-field';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Card, CardHeader } from '@/ui/primitives/card';
import { Input } from '@/ui/primitives/input';
import { revokeOtherSessionsAction, revokeSessionAction, updateProfileAction } from './actions';
import type { AccountOverview } from './queries';

export function AccountView({ overview }: { overview: AccountOverview }) {
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        <ProfileCard user={overview.user} />
        <MembershipsCard memberships={overview.memberships} />
      </div>
      <div className="space-y-3">
        <Card>
          <CardHeader
            title="كلمة المرور"
            subtitle="تغييرها يُنهي دخولك على كل الأجهزة الأخرى."
            icon={<KeyRound className="size-4" />}
          />
          <div className="mt-4">
            <ChangePasswordForm />
          </div>
        </Card>
        <SessionsCard sessions={overview.sessions} />
      </div>
    </div>
  );
}

function ProfileCard({ user }: { user: AccountOverview['user'] }) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();
  const [saving, startSave] = useTransition();
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});

  const dirty = name.trim() !== user.name || phone.trim() !== (user.phone ?? '');

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    startSave(async () => {
      const result = await updateProfileAction({ name, phone });
      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? {});
        toast.error('تعذر حفظ البيانات', result.error.message);
        return;
      }
      toast.success('تم حفظ بياناتك');
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader
        title="بياناتي"
        subtitle={`عضو منذ ${fmt.date(user.createdAt)}${
          user.lastLoginAt ? ` · آخر دخول ${fmt.relative(user.lastLoginAt)}` : ''
        }`}
        icon={<User className="size-4" />}
      />
      <form onSubmit={save} className="mt-4 space-y-4" noValidate>
        <FormField label="الاسم" required error={errors.name}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            autoComplete="name"
          />
        </FormField>

        <FormField
          label="البريد الإلكتروني"
          hint="البريد هو اسم الدخول، ولا يمكن تغييره من هنا. تواصل مع صاحب المحل أو الدعم."
        >
          <Input value={user.email ?? '—'} readOnly disabled numeric />
        </FormField>

        <FormField label="رقم الهاتف" hint="يمكنك الدخول به بدل البريد" error={errors.phone}>
          <Input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            inputMode="tel"
            numeric
            placeholder="05xxxxxxxx"
            autoComplete="tel"
            iconStart={<Phone className="size-4" />}
          />
        </FormField>

        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={saving} disabled={!dirty}>
            حفظ التغييرات
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MembershipsCard({ memberships }: { memberships: AccountOverview['memberships'] }) {
  if (memberships.length === 0) return null;

  return (
    <Card>
      <CardHeader
        title="المتاجر"
        subtitle="المتاجر التي لديك وصول إليها ودورك في كل منها"
        icon={<Store className="size-4" />}
      />
      <ul className="mt-3 divide-y divide-line-subtle">
        {memberships.map((membership) => (
          <li key={membership.storeId} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-semibold text-primary">
                {membership.storeName}
              </span>
              <span className="block text-[12px] text-secondary">{membership.roleName}</span>
            </span>
            {membership.current && (
              <Badge tone="accent" size="sm">
                الحالي
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

const DEVICE_ICON: Record<DeviceKind, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

function SessionsCard({ sessions }: { sessions: AccountOverview['sessions'] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const fmt = useFormat();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const others = sessions.filter((session) => !session.current);

  const revoke = async (sessionId: string, device: string) => {
    const approved = await confirm({
      title: 'إنهاء الجلسة',
      message: `سيُسجَّل الخروج من «${device}» فوراً.`,
      confirmLabel: 'إنهاء الجلسة',
      tone: 'danger',
    });
    if (!approved) return;

    setBusyId(sessionId);
    startTransition(async () => {
      const result = await revokeSessionAction(sessionId);
      setBusyId(null);
      if (!result.ok) {
        toast.error('تعذر إنهاء الجلسة', result.error.message);
        return;
      }
      toast.success('تم إنهاء الجلسة');
      router.refresh();
    });
  };

  const revokeOthers = async () => {
    const approved = await confirm({
      title: 'تسجيل الخروج من الأجهزة الأخرى',
      message: 'ستبقى مسجلاً على هذا الجهاز فقط. استخدم هذا إن فقدت جهازاً أو شككت أن أحداً يعرف كلمة مرورك.',
      confirmLabel: 'تسجيل الخروج منها',
      tone: 'danger',
    });
    if (!approved) return;

    startTransition(async () => {
      const result = await revokeOtherSessionsAction();
      if (!result.ok) {
        toast.error('تعذر تسجيل الخروج', result.error.message);
        return;
      }
      toast.success('تم تسجيل الخروج من الأجهزة الأخرى');
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader
        title="الأجهزة المتصلة"
        subtitle="أين حسابك مفتوح الآن"
        icon={<ShieldCheck className="size-4" />}
        action={
          others.length > 0 ? (
            <Button
              size="sm"
              variant="danger-ghost"
              iconStart={<LogOut className="size-4" />}
              onClick={revokeOthers}
              disabled={pending}
            >
              الخروج من الكل
            </Button>
          ) : undefined
        }
      />

      <ul className="mt-3 divide-y divide-line-subtle">
        {sessions.map((session) => {
          const Icon = DEVICE_ICON[session.deviceKind];
          return (
            <li key={session.id} className="flex items-center gap-3 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-sunken text-secondary">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-primary">
                    {session.device}
                  </span>
                  {session.current && (
                    <Badge tone="success" size="sm" dot>
                      هذا الجهاز
                    </Badge>
                  )}
                </span>
                <span className="block text-[12px] text-secondary">
                  آخر نشاط {fmt.relative(session.lastSeenAt)}
                  {session.ipAddress && (
                    <>
                      {' · '}
                      <span className="num">{session.ipAddress}</span>
                    </>
                  )}
                </span>
              </span>
              {!session.current && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => revoke(session.id, session.device)}
                  loading={pending && busyId === session.id}
                  disabled={pending}
                >
                  إنهاء
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {others.length === 0 && (
        <Alert tone="success" compact className="mt-2">
          حسابك مفتوح على هذا الجهاز فقط.
        </Alert>
      )}
    </Card>
  );
}
