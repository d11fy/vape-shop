'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, KeyRound, Pencil, Plus, ShieldCheck, UserCog, UserX } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Alert } from '@/ui/feedback/alert';
import { Avatar } from '@/ui/primitives/avatar';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Card } from '@/ui/primitives/card';
import { EmptyState } from '@/ui/feedback/empty-state';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input, Select } from '@/ui/primitives/input';
import { Modal } from '@/ui/overlays/modal';
import { useConfirm } from '@/ui/feedback/confirm';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { PermissionEditor, PermissionOverrides } from './permission-editor';
import {
  resetEmployeePasswordAction,
  saveEmployeeAction,
  saveRoleAction,
  setEmployeeStatusAction,
  type EmployeeInput,
} from './actions';
import type { EmployeeRow, RoleRow } from './queries';

export function EmployeeList({
  employees,
  roles,
  branches,
  canManage,
  canCreate,
  grantable,
  focusId,
}: {
  employees: EmployeeRow[];
  roles: RoleRow[];
  branches: Array<{ id: string; name: string }>;
  /** Edit, disable and reset existing members. */
  canManage: boolean;
  /** Add members — false at the plan's limit, while editing stays allowed. */
  canCreate: boolean;
  grantable: string[];
  /** Membership to open straight away — a global-search result lands here. */
  focusId?: string;
}) {
  const fmt = useFormat();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<EmployeeRow | null>(() =>
    canManage && focusId
      ? (employees.find((employee) => employee.membershipId === focusId && !employee.isOwner) ??
        null)
      : null,
  );
  const [creating, setCreating] = useState(false);
  const [credentials, setCredentials] = useState<{ name: string; password: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleStatus = async (employee: EmployeeRow) => {
    const disabling = employee.status === 'ACTIVE';
    const approved = await confirm({
      title: disabling ? `تعطيل حساب ${employee.name}؟` : `تفعيل حساب ${employee.name}؟`,
      tone: disabling ? 'danger' : 'neutral',
      message: disabling
        ? 'سيُسجَّل خروجه من كل الأجهزة فوراً ولن يتمكن من الدخول. سجلّ عملياته السابقة يبقى محفوظاً.'
        : 'سيتمكن الموظف من تسجيل الدخول مرة أخرى بنفس صلاحياته.',
      confirmLabel: disabling ? 'تعطيل الحساب' : 'تفعيل الحساب',
    });
    if (!approved) return;

    startTransition(async () => {
      const response = await setEmployeeStatusAction(
        employee.membershipId,
        disabling ? 'DISABLED' : 'ACTIVE',
      );
      if (!response.ok) {
        toast.error('تعذر تغيير الحالة', response.error.message);
        return;
      }
      toast.success(disabling ? 'تم تعطيل الحساب' : 'تم تفعيل الحساب', employee.name);
      router.refresh();
    });
  };

  const resetPassword = async (employee: EmployeeRow) => {
    const approved = await confirm({
      title: `إعادة تعيين كلمة مرور ${employee.name}؟`,
      tone: 'warning',
      message:
        'ستُنشأ كلمة مرور جديدة تظهر لك مرة واحدة فقط، وسيُسجَّل خروج الموظف من كل الأجهزة.',
      confirmLabel: 'إعادة التعيين',
    });
    if (!approved) return;

    startTransition(async () => {
      const response = await resetEmployeePasswordAction(employee.membershipId);
      if (!response.ok) {
        toast.error('تعذر إعادة التعيين', response.error.message);
        return;
      }
      setCredentials({ name: employee.name, password: response.data.password });
      router.refresh();
    });
  };

  return (
    <>
      {canCreate && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="accent"
            onClick={() => setCreating(true)}
            iconStart={<Plus className="size-4" />}
          >
            إضافة موظف
          </Button>
        </div>
      )}

      {employees.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserCog className="size-6" />}
            title="لا يوجد موظفون"
            description="أضف فريقك وحدد صلاحيات كل شخص بدقة."
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {employees.map((employee) => (
            <li key={employee.membershipId}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={employee.name} src={employee.avatarUrl} size="lg" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[14px] font-bold text-primary">
                        {employee.name}
                      </span>
                      {employee.isOwner && (
                        <Badge tone="accent" size="sm">
                          صاحب المحل
                        </Badge>
                      )}
                      {employee.status === 'DISABLED' && (
                        <Badge tone="danger" size="sm">
                          معطّل
                        </Badge>
                      )}
                      {(employee.extraPermissions.length > 0 ||
                        employee.deniedPermissions.length > 0) && (
                        <Badge tone="info" size="sm">
                          صلاحيات مخصصة
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-[12.5px] text-secondary">
                      {employee.roleName}
                      {employee.branchName && ` · ${employee.branchName}`}
                    </p>
                    <p className="num-mixed truncate text-[11.5px] text-tertiary">
                      {employee.email ?? employee.phone ?? '—'}
                      {employee.lastLoginAt && ` · آخر دخول ${fmt.relative(employee.lastLoginAt)}`}
                    </p>
                  </div>
                </div>

                {canManage && !employee.isOwner && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => setEditing(employee)}
                      iconStart={<Pencil className="size-3.5" />}
                    >
                      تعديل
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => void resetPassword(employee)}
                      iconStart={<KeyRound className="size-3.5" />}
                    >
                      كلمة المرور
                    </Button>
                    <Button
                      variant={employee.status === 'ACTIVE' ? 'danger-ghost' : 'ghost'}
                      size="sm"
                      disabled={pending}
                      onClick={() => void toggleStatus(employee)}
                      iconStart={<UserX className="size-3.5" />}
                    >
                      {employee.status === 'ACTIVE' ? 'تعطيل' : 'تفعيل'}
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <EmployeeDialog
        open={creating || editing !== null}
        employee={editing}
        roles={roles}
        branches={branches}
        grantable={new Set(grantable)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onCreated={(name, password) => setCredentials({ name, password })}
      />

      <CredentialsDialog
        credentials={credentials}
        onClose={() => setCredentials(null)}
      />
    </>
  );
}

function EmployeeDialog({
  open,
  employee,
  roles,
  branches,
  grantable,
  onClose,
  onCreated,
}: {
  open: boolean;
  employee: EmployeeRow | null;
  roles: RoleRow[];
  branches: Array<{ id: string; name: string }>;
  grantable: Set<string>;
  onClose: () => void;
  onCreated: (name: string, password: string) => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSave] = useTransition();
  const [tab, setTab] = useState<'details' | 'permissions'>('details');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [seededKey, setSeededKey] = useState<string | null>(null);

  const assignableRoles = roles.filter((role) => role.key !== 'owner');

  const [form, setForm] = useState<EmployeeInput>({
    membershipId: null,
    name: '',
    email: '',
    phone: '',
    roleId: assignableRoles[0]?.id ?? '',
    branchId: null,
    extraPermissions: [],
    deniedPermissions: [],
    status: 'ACTIVE',
  });

  const key = employee?.membershipId ?? (open ? 'new' : null);
  if (key && seededKey !== key) {
    setSeededKey(key);
    setTab('details');
    setFieldErrors({});
    setForm(
      employee
        ? {
            membershipId: employee.membershipId,
            name: employee.name,
            email: employee.email ?? '',
            phone: employee.phone ?? '',
            roleId: employee.roleId,
            branchId: employee.branchName
              ? (branches.find((branch) => branch.name === employee.branchName)?.id ?? null)
              : null,
            extraPermissions: employee.extraPermissions,
            deniedPermissions: employee.deniedPermissions,
            status: employee.status === 'DISABLED' ? 'DISABLED' : 'ACTIVE',
          }
        : {
            membershipId: null,
            name: '',
            email: '',
            phone: '',
            roleId: assignableRoles[0]?.id ?? '',
            branchId: null,
            extraPermissions: [],
            deniedPermissions: [],
            status: 'ACTIVE',
          },
    );
  }
  if (!open && seededKey !== null) setSeededKey(null);

  const update = <K extends keyof EmployeeInput>(field: K, value: EmployeeInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field as string]: undefined }));
  };

  const selectedRole = roles.find((role) => role.id === form.roleId);

  const submit = () => {
    startSave(async () => {
      const response = await saveEmployeeAction(form);

      if (!response.ok) {
        setFieldErrors(response.error.fieldErrors ?? {});
        toast.error('تعذر حفظ الموظف', response.error.message);
        return;
      }

      if (response.data.temporaryPassword) {
        onCreated(String(form.name), response.data.temporaryPassword);
      } else {
        toast.success('تم حفظ بيانات الموظف', String(form.name));
      }

      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={employee ? `تعديل ${employee.name}` : 'إضافة موظف جديد'}
      description={
        employee
          ? 'يمكنك تغيير الدور أو منح صلاحيات إضافية لهذا الموظف'
          : 'ستُنشأ كلمة مرور مؤقتة تظهر لك مرة واحدة'
      }
      size="lg"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="accent" loading={saving} onClick={submit}>
            {employee ? 'حفظ التعديلات' : 'إضافة الموظف'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="inline-flex rounded-[var(--radius-sm)] border border-line-subtle bg-sunken p-0.5">
          {(
            [
              { value: 'details' as const, label: 'البيانات والدور' },
              { value: 'permissions' as const, label: 'صلاحيات مخصصة' },
            ]
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTab(option.value)}
              className={cn(
                'h-9 rounded-[var(--radius-xs)] px-3 text-[12.5px] font-semibold transition-all',
                tab === option.value ? 'bg-card text-primary shadow-xs' : 'text-secondary',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {tab === 'details' ? (
          <div className="space-y-4">
            <FieldRow>
              <FormField label="الاسم" required error={fieldErrors.name}>
                <Input
                  value={String(form.name ?? '')}
                  onChange={(event) => update('name', event.target.value)}
                  placeholder="اسم الموظف"
                  invalid={Boolean(fieldErrors.name)}
                />
              </FormField>

              <FormField label="البريد الإلكتروني" required error={fieldErrors.email}>
                <Input
                  type="email"
                  value={String(form.email ?? '')}
                  onChange={(event) => update('email', event.target.value)}
                  placeholder="name@example.com"
                  disabled={Boolean(employee)}
                  invalid={Boolean(fieldErrors.email)}
                />
              </FormField>
            </FieldRow>

            <FieldRow>
              <FormField label="رقم الهاتف" error={fieldErrors.phone}>
                <Input
                  type="tel"
                  numeric
                  value={String(form.phone ?? '')}
                  onChange={(event) => update('phone', event.target.value)}
                  placeholder="05xxxxxxxx"
                  invalid={Boolean(fieldErrors.phone)}
                />
              </FormField>

              <FormField label="الدور" required>
                <Select
                  value={String(form.roleId ?? '')}
                  onChange={(event) => update('roleId', event.target.value)}
                >
                  {assignableRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.nameAr}
                    </option>
                  ))}
                </Select>
                {selectedRole && (
                  <p className="mt-1.5 text-[12px] text-tertiary">
                    {selectedRole.description ?? ''}{' '}
                    <span>
                      (<span className="num">{selectedRole.permissions.length}</span> صلاحية)
                    </span>
                  </p>
                )}
              </FormField>
            </FieldRow>

            {branches.length > 1 && (
              <FormField
                label="الفرع"
                hint="اتركه فارغاً ليتمكن الموظف من التنقل بين الفروع"
              >
                <Select
                  value={String(form.branchId ?? '')}
                  onChange={(event) => update('branchId', event.target.value || null)}
                >
                  <option value="">كل الفروع</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </Select>
              </FormField>
            )}

            {employee && (
              <FormField
                label="كلمة مرور جديدة"
                hint="اتركها فارغة للإبقاء على كلمة المرور الحالية"
              >
                <Input
                  type="text"
                  value={String(form.password ?? '')}
                  onChange={(event) => update('password', event.target.value)}
                  placeholder="••••••••"
                />
              </FormField>
            )}
          </div>
        ) : (
          <PermissionOverrides
            rolePermissions={selectedRole?.permissions ?? []}
            extra={form.extraPermissions ?? []}
            denied={form.deniedPermissions ?? []}
            onExtraChange={(permissions) => update('extraPermissions', permissions)}
            onDeniedChange={(permissions) => update('deniedPermissions', permissions)}
            grantable={grantable}
          />
        )}
      </div>
    </Modal>
  );
}

function CredentialsDialog({
  credentials,
  onClose,
}: {
  credentials: { name: string; password: string } | null;
  onClose: () => void;
}) {
  const toast = useToast();
  if (!credentials) return null;

  return (
    <Modal
      open
      onClose={onClose}
      title="كلمة المرور المؤقتة"
      description={`سلّم هذه الكلمة إلى ${credentials.name} — لن تظهر مرة أخرى، وسيُطلب منه تغييرها عند أول دخول`}
      size="sm"
      footer={
        <Button variant="accent" onClick={onClose}>
          تم، حفظتها
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-line-strong bg-sunken px-4 py-3">
          <span className="num flex-1 select-all text-[18px] font-bold tracking-wider text-primary">
            {credentials.password}
          </span>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(credentials.password);
                toast.success('تم نسخ كلمة المرور');
              } catch {
                toast.error('تعذر النسخ — انسخها يدوياً');
              }
            }}
            aria-label="نسخ"
            className="rounded-[var(--radius-xs)] p-2 text-secondary transition-colors hover:bg-card hover:text-primary"
          >
            <Copy className="size-4" />
          </button>
        </div>

        <Alert tone="warning" compact>
          اطلب من الموظف تغييرها بعد أول تسجيل دخول من صفحة «حسابي».
        </Alert>
      </div>
    </Modal>
  );
}

/** Role cards with an inline editor. */
export function RoleList({
  roles,
  canManage,
  grantable,
}: {
  roles: RoleRow[];
  canManage: boolean;
  grantable: string[];
}) {
  const [editing, setEditing] = useState<RoleRow | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="accent"
            onClick={() => setCreating(true)}
            iconStart={<Plus className="size-4" />}
          >
            دور جديد
          </Button>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {roles.map((role) => (
          <li key={role.id}>
            <Card className="h-full">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-bold text-primary">{role.nameAr}</span>
                    {role.isSystem && (
                      <Badge tone="neutral" size="sm">
                        أساسي
                      </Badge>
                    )}
                    {role.key === 'owner' && (
                      <Badge tone="accent" size="sm">
                        كل الصلاحيات
                      </Badge>
                    )}
                  </div>
                  {role.description && (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-secondary">
                      {role.description}
                    </p>
                  )}
                </div>

                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sunken text-secondary">
                  <ShieldCheck className="size-4" />
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-line-subtle pt-3">
                <span className="num-mixed text-[12.5px] text-tertiary">
                  {role.permissions.length} صلاحية · {role.memberCount} موظف
                </span>
                {canManage && role.key !== 'owner' && (
                  <Button variant="ghost" size="sm" onClick={() => setEditing(role)}>
                    تعديل الصلاحيات
                  </Button>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <RoleDialog
        open={creating || editing !== null}
        role={editing}
        grantable={new Set(grantable)}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function RoleDialog({
  open,
  role,
  grantable,
  onClose,
}: {
  open: boolean;
  role: RoleRow | null;
  grantable: Set<string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSave] = useTransition();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<string[]>([]);
  const [seededKey, setSeededKey] = useState<string | null>(null);

  const key = role?.id ?? (open ? 'new' : null);
  if (key && seededKey !== key) {
    setSeededKey(key);
    setName(role?.nameAr ?? '');
    setDescription(role?.description ?? '');
    setPermissions(role?.permissions ?? []);
  }
  if (!open && seededKey !== null) setSeededKey(null);

  const submit = () => {
    startSave(async () => {
      const response = await saveRoleAction({
        id: role?.id ?? null,
        nameAr: name,
        description,
        permissions,
      });

      if (!response.ok) {
        toast.error('تعذر حفظ الدور', response.error.message);
        return;
      }

      toast.success(role ? 'تم حفظ الدور' : 'تم إنشاء الدور', name);
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={role ? `تعديل دور ${role.nameAr}` : 'دور جديد'}
      description="اختر بدقة ما يستطيع أصحاب هذا الدور فعله"
      size="lg"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="accent" loading={saving} onClick={submit}>
            حفظ الدور
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldRow>
          <FormField label="اسم الدور" required>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="مثال: كاشير المسائية"
            />
          </FormField>

          <FormField label="وصف مختصر">
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="اختياري"
            />
          </FormField>
        </FieldRow>

        <PermissionEditor
          selected={permissions}
          onChange={setPermissions}
          grantable={grantable}
        />
      </div>
    </Modal>
  );
}
