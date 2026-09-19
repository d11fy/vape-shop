'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, CalendarPlus, Copy, KeyRound, LifeBuoy, Megaphone, Plus } from 'lucide-react';

import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input, Select, Textarea } from '@/ui/primitives/input';
import { Modal } from '@/ui/overlays/modal';
import { MoneyInput } from '@/ui/forms/money-input';
import { useConfirm } from '@/ui/feedback/confirm';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import {
  changeStorePlanAction,
  createStoreAction,
  enterSupportModeAction,
  extendSubscriptionAction,
  resetOwnerPasswordAction,
  sendAnnouncementAction,
  setStoreSuspensionAction,
} from './actions';

/** All the controls on a single store's page. */
export function StoreActions({
  store,
  plans,
}: {
  store: { id: string; name: string; status: string; planId: string | null };
  plans: Array<{ id: string; nameAr: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [extendOpen, setExtendOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [credentials, setCredentials] = useState<{ password: string; email: string | null } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const suspended = store.status === 'SUSPENDED';

  const toggleSuspension = async () => {
    if (suspended) {
      const approved = await confirm({
        title: `إعادة تفعيل ${store.name}؟`,
        message: 'سيستعيد المتجر الوصول الكامل للنظام فوراً.',
        confirmLabel: 'إعادة التفعيل',
      });
      if (!approved) return;

      startTransition(async () => {
        const response = await setStoreSuspensionAction({ storeId: store.id, suspend: false });
        if (!response.ok) {
          toast.error('تعذر التفعيل', response.error.message);
          return;
        }
        toast.success('تم إعادة تفعيل المتجر');
        router.refresh();
      });
      return;
    }

    const reason = window.prompt('سبب تعليق المتجر:');
    if (!reason?.trim()) return;

    const approved = await confirm({
      title: `تعليق ${store.name}؟`,
      tone: 'danger',
      message:
        'سيفقد المتجر القدرة على تسجيل أي عملية، وستظهر لهم رسالة توضح السبب. بياناتهم تبقى محفوظة كاملة.',
      details: reason,
      confirmLabel: 'تعليق المتجر',
    });
    if (!approved) return;

    startTransition(async () => {
      const response = await setStoreSuspensionAction({
        storeId: store.id,
        suspend: true,
        reason: reason.trim(),
      });
      if (!response.ok) {
        toast.error('تعذر التعليق', response.error.message);
        return;
      }
      toast.success('تم تعليق المتجر');
      router.refresh();
    });
  };

  const resetPassword = async () => {
    const approved = await confirm({
      title: 'إعادة تعيين كلمة مرور المالك؟',
      tone: 'warning',
      message: 'ستظهر كلمة المرور الجديدة مرة واحدة، وسيُسجَّل خروج المالك من كل الأجهزة.',
      confirmLabel: 'إعادة التعيين',
    });
    if (!approved) return;

    startTransition(async () => {
      const response = await resetOwnerPasswordAction(store.id);
      if (!response.ok) {
        toast.error('تعذر إعادة التعيين', response.error.message);
        return;
      }
      setCredentials(response.data);
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="accent"
          onClick={() => setExtendOpen(true)}
          iconStart={<CalendarPlus className="size-4" />}
        >
          تمديد الاشتراك
        </Button>
        <Button variant="outline" onClick={() => setPlanOpen(true)}>
          تغيير الخطة
        </Button>
        <Button
          variant="outline"
          onClick={() => setSupportOpen(true)}
          iconStart={<LifeBuoy className="size-4" />}
        >
          دخول وضع الدعم
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={resetPassword}
          iconStart={<KeyRound className="size-4" />}
        >
          كلمة مرور المالك
        </Button>
        <Button
          variant={suspended ? 'ghost' : 'danger-ghost'}
          disabled={pending}
          onClick={toggleSuspension}
          iconStart={<Ban className="size-4" />}
        >
          {suspended ? 'إعادة تفعيل' : 'تعليق المتجر'}
        </Button>
      </div>

      <ExtendDialog
        open={extendOpen}
        storeId={store.id}
        storeName={store.name}
        onClose={() => setExtendOpen(false)}
      />

      <PlanDialog
        open={planOpen}
        storeId={store.id}
        currentPlanId={store.planId}
        plans={plans}
        onClose={() => setPlanOpen(false)}
      />

      <SupportDialog
        open={supportOpen}
        storeId={store.id}
        storeName={store.name}
        onClose={() => setSupportOpen(false)}
      />

      {credentials && (
        <Modal
          open
          onClose={() => setCredentials(null)}
          title="كلمة المرور الجديدة"
          description={credentials.email ?? undefined}
          size="sm"
          footer={
            <Button variant="accent" onClick={() => setCredentials(null)}>
              تم
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-sunken px-4 py-3">
              <span className="num flex-1 select-all text-[18px] font-bold tracking-wider text-primary">
                {credentials.password}
              </span>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(credentials.password);
                  toast.success('تم النسخ');
                }}
                aria-label="نسخ"
                className="rounded-[var(--radius-xs)] p-2 text-secondary hover:bg-card hover:text-primary"
              >
                <Copy className="size-4" />
              </button>
            </div>
            <Alert tone="warning" compact>
              سلّمها للمالك عبر قناة آمنة — لن تظهر مرة أخرى.
            </Alert>
          </div>
        </Modal>
      )}
    </>
  );
}

function ExtendDialog({
  open,
  storeId,
  storeName,
  onClose,
}: {
  open: boolean;
  storeId: string;
  storeName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();
  const [days, setDays] = useState(30);
  const [note, setNote] = useState('');
  const [saving, startSave] = useTransition();

  const submit = () => {
    startSave(async () => {
      const response = await extendSubscriptionAction({
        storeId,
        days,
        note: note.trim() || null,
      });
      if (!response.ok) {
        toast.error('تعذر التمديد', response.error.message);
        return;
      }
      toast.success('تم تمديد الاشتراك', `حتى ${fmt.date(response.data.endsAt)}`);
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تمديد الاشتراك"
      description={storeName}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="accent" loading={saving} onClick={submit}>
            تمديد
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="مدة التمديد">
          <div className="flex flex-wrap gap-2">
            {[30, 90, 180, 365].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={`h-10 rounded-[var(--radius-sm)] border px-3.5 text-[13px] font-bold transition-colors ${
                  days === option
                    ? 'border-accent-strong bg-accent-soft text-accent-strong'
                    : 'border-line-strong bg-card text-secondary hover:text-primary'
                }`}
              >
                {option === 365 ? 'سنة' : `${option} يوم`}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="عدد الأيام">
          <Input
            numeric
            inputMode="numeric"
            value={String(days)}
            onChange={(event) => setDays(Number(event.target.value.replace(/\D/g, '')) || 0)}
          />
        </FormField>

        <FormField label="ملاحظة" hint="تُحفظ في سجل الاشتراك">
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="مثال: تحويل بنكي بتاريخ…"
          />
        </FormField>

        <Alert tone="info" compact>
          إذا كان الاشتراك منتهياً سيبدأ التمديد من اليوم، وإذا كان سارياً سيُضاف إلى تاريخ
          الانتهاء الحالي.
        </Alert>
      </div>
    </Modal>
  );
}

function PlanDialog({
  open,
  storeId,
  currentPlanId,
  plans,
  onClose,
}: {
  open: boolean;
  storeId: string;
  currentPlanId: string | null;
  plans: Array<{ id: string; nameAr: string }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [planId, setPlanId] = useState(currentPlanId ?? plans[0]?.id ?? '');
  const [note, setNote] = useState('');
  const [saving, startSave] = useTransition();

  const submit = () => {
    startSave(async () => {
      const response = await changeStorePlanAction({
        storeId,
        planId,
        note: note.trim() || null,
      });
      if (!response.ok) {
        toast.error('تعذر تغيير الخطة', response.error.message);
        return;
      }
      toast.success('تم تغيير الخطة');
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تغيير خطة الاشتراك"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="accent" loading={saving} onClick={submit}>
            حفظ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="الخطة الجديدة">
          <Select value={planId} onChange={(event) => setPlanId(event.target.value)}>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.nameAr}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="ملاحظة">
          <Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </FormField>

        <Alert tone="warning" compact>
          تغيير الخطة يطبّق حدودها الجديدة فوراً. إذا كان المتجر يتجاوز الحد الجديد، لن يستطيع
          إضافة المزيد لكن بياناته الحالية تبقى كما هي.
        </Alert>
      </div>
    </Modal>
  );
}

function SupportDialog({
  open,
  storeId,
  storeName,
  onClose,
}: {
  open: boolean;
  storeId: string;
  storeName: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, startSave] = useTransition();

  const submit = () => {
    if (reason.trim().length < 5) {
      toast.warning('اذكر سبب الدخول', 'السبب يُسجَّل ويُعرض للمتجر عند الطلب.');
      return;
    }

    startSave(async () => {
      // On success this redirects into the tenant; only failures return.
      const response = await enterSupportModeAction({ storeId, reason: reason.trim() });
      if (response && !response.ok) {
        toast.error('تعذر الدخول', response.error.message);
      }
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="دخول وضع الدعم الفني"
      description={storeName}
      size="sm"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            دخول
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Alert tone="warning" title="ما الذي سيحدث">
          ستدخل حساب المتجر <strong>للقراءة فقط</strong> — لا يمكنك تسجيل أو تعديل أي عملية. سيظهر
          شريط تنبيه دائم أعلى الشاشة، وتُسجَّل الجلسة باسمك وسببها في سجل نشاط المتجر.
        </Alert>

        <FormField label="سبب الدخول" required>
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="مثال: متابعة بلاغ العميل رقم 1234 بخصوص خطأ في تقرير الأرباح"
          />
        </FormField>
      </div>
    </Modal>
  );
}

/** Broadcast a notice to one store or all stores. */
export function AnnouncementButton({ storeId }: { storeId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState<'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER'>('INFO');
  const [saving, startSave] = useTransition();

  const submit = () => {
    startSave(async () => {
      const response = await sendAnnouncementAction({
        storeId: storeId ?? null,
        title,
        body,
        severity,
      });
      if (!response.ok) {
        toast.error('تعذر الإرسال', response.error.message);
        return;
      }
      toast.success('تم إرسال الإشعار', `وصل إلى ${response.data.delivered} متجر`);
      setTitle('');
      setBody('');
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        iconStart={<Megaphone className="size-4" />}
      >
        إرسال إشعار
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={storeId ? 'إشعار لهذا المتجر' : 'إشعار لكل المتاجر'}
        description={storeId ? undefined : 'سيصل إلى جميع المتاجر النشطة'}
        size="md"
        dismissible={!saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button variant="accent" loading={saving} onClick={submit}>
              إرسال
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldRow>
            <FormField label="العنوان" required>
              <Input value={title} onChange={(event) => setTitle(event.target.value)} />
            </FormField>

            <FormField label="الأهمية">
              <Select
                value={severity}
                onChange={(event) =>
                  setSeverity(event.target.value as 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER')
                }
              >
                <option value="INFO">معلومة</option>
                <option value="SUCCESS">خبر جيد</option>
                <option value="WARNING">تنبيه</option>
                <option value="DANGER">عاجل</option>
              </Select>
            </FormField>
          </FieldRow>

          <FormField label="النص" required>
            <Textarea rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
          </FormField>
        </div>
      </Modal>
    </>
  );
}

/** Create a tenant from the console, for sales-led onboarding. */
export function CreateStoreButton({
  plans,
}: {
  plans: Array<{ id: string; code: string; nameAr: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [credentials, setCredentials] = useState<{ password: string; email: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});

  const [form, setForm] = useState({
    storeName: '',
    ownerName: '',
    email: '',
    phone: '',
    planCode: plans[0]?.code ?? 'starter',
    country: 'SA',
    paidDays: 0,
  });

  const submit = () => {
    setFieldErrors({});
    startSave(async () => {
      const response = await createStoreAction(form);
      if (!response.ok) {
        setFieldErrors(response.error.fieldErrors ?? {});
        toast.error('تعذر إنشاء المتجر', response.error.message);
        return;
      }
      setCredentials({ password: response.data.password, email: form.email });
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)} iconStart={<Plus className="size-4" />}>
        متجر جديد
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="إنشاء متجر جديد"
        description="سيُنشأ حساب المالك مع كلمة مرور مؤقتة"
        size="md"
        dismissible={!saving}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
              إلغاء
            </Button>
            <Button variant="accent" loading={saving} onClick={submit}>
              إنشاء المتجر
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FieldRow>
            <FormField label="اسم المحل" required error={fieldErrors.storeName}>
              <Input
                value={form.storeName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, storeName: event.target.value }))
                }
              />
            </FormField>

            <FormField label="اسم المالك" required error={fieldErrors.ownerName}>
              <Input
                value={form.ownerName}
                onChange={(event) =>
                  setForm((current) => ({ ...current, ownerName: event.target.value }))
                }
              />
            </FormField>
          </FieldRow>

          <FieldRow>
            <FormField label="البريد الإلكتروني" required error={fieldErrors.email}>
              <Input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </FormField>

            <FormField label="رقم الهاتف">
              <Input
                numeric
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({ ...current, phone: event.target.value }))
                }
              />
            </FormField>
          </FieldRow>

          <FieldRow>
            <FormField label="الخطة">
              <Select
                value={form.planCode}
                onChange={(event) =>
                  setForm((current) => ({ ...current, planCode: event.target.value }))
                }
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.code}>
                    {plan.nameAr}
                  </option>
                ))}
              </Select>
            </FormField>

            <FormField label="أيام مدفوعة" hint="صفر يعني بدء فترة تجريبية">
              <Input
                numeric
                inputMode="numeric"
                value={String(form.paidDays)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    paidDays: Number(event.target.value.replace(/\D/g, '')) || 0,
                  }))
                }
              />
            </FormField>
          </FieldRow>
        </div>
      </Modal>

      {credentials && (
        <Modal
          open
          onClose={() => setCredentials(null)}
          title="تم إنشاء المتجر"
          description="سلّم هذه البيانات للمالك"
          size="sm"
          footer={
            <Button variant="accent" onClick={() => setCredentials(null)}>
              تم
            </Button>
          }
        >
          <div className="space-y-3">
            <div className="rounded-[var(--radius-md)] border border-line-strong bg-sunken px-4 py-3">
              <p className="text-[11.5px] text-tertiary">البريد الإلكتروني</p>
              <p className="num select-all text-[14px] font-bold text-primary">
                {credentials.email}
              </p>
              <p className="mt-2 text-[11.5px] text-tertiary">كلمة المرور المؤقتة</p>
              <p className="num select-all text-[18px] font-bold tracking-wider text-primary">
                {credentials.password}
              </p>
            </div>
            <Alert tone="warning" compact>
              لن تظهر كلمة المرور مرة أخرى. سيُطلب من المالك تغييرها إلزامياً عند أول دخول.
            </Alert>
          </div>
        </Modal>
      )}
    </>
  );
}
