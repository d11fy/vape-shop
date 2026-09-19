'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Pencil, Plus } from 'lucide-react';

import { Alert } from '@/ui/feedback/alert';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Card } from '@/ui/primitives/card';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input } from '@/ui/primitives/input';
import { Modal } from '@/ui/overlays/modal';
import { Switch } from '@/ui/primitives/toggle';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { saveBranchAction } from './actions';

export interface BranchRow {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
  cashboxBalance: number;
  employeeCount: number;
  salesCount: number;
}

export function BranchesView({
  branches,
  canManage,
  limit,
  planName,
}: {
  branches: BranchRow[];
  canManage: boolean;
  limit: number | null;
  planName: string;
}) {
  const fmt = useFormat();
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [creating, setCreating] = useState(false);

  const atLimit = limit !== null && branches.length >= limit;

  return (
    <>
      {atLimit && (
        <Alert tone="warning" className="mb-4" title="وصلت للحد الأقصى من الفروع">
          خطة {planName} تسمح بـ <span className="num font-bold">{limit}</span>{' '}
          {limit === 1 ? 'فرع واحد' : 'فروع'}. قم بترقية الاشتراك لإضافة فرع جديد.
        </Alert>
      )}

      {canManage && !atLimit && (
        <div className="mb-4 flex justify-end">
          <Button
            variant="accent"
            onClick={() => setCreating(true)}
            iconStart={<Plus className="size-4" />}
          >
            إضافة فرع
          </Button>
        </div>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {branches.map((branch) => (
          <li key={branch.id}>
            <Card className="h-full">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-sunken text-secondary">
                    <Building2 className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-primary">{branch.name}</span>
                      <Badge tone="neutral" size="sm">
                        {branch.code}
                      </Badge>
                      {branch.isDefault && (
                        <Badge tone="accent" size="sm">
                          رئيسي
                        </Badge>
                      )}
                      {!branch.isActive && (
                        <Badge tone="danger" size="sm">
                          موقوف
                        </Badge>
                      )}
                    </div>
                    {branch.address && (
                      <p className="mt-0.5 truncate text-[12.5px] text-secondary">
                        {branch.address}
                      </p>
                    )}
                    {branch.phone && (
                      <p className="num truncate text-[11.5px] text-tertiary">{branch.phone}</p>
                    )}
                  </div>
                </div>

                {canManage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditing(branch)}
                    iconStart={<Pencil className="size-3.5" />}
                  >
                    تعديل
                  </Button>
                )}
              </div>

              <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line-subtle pt-3">
                <div>
                  <dt className="text-[11px] text-tertiary">رصيد الصندوق</dt>
                  <dd className="num text-[13px] font-bold text-primary">
                    {fmt.money(branch.cashboxBalance)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-tertiary">الموظفون</dt>
                  <dd className="num text-[13px] font-bold text-primary">
                    {fmt.number(branch.employeeCount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] text-tertiary">الفواتير</dt>
                  <dd className="num text-[13px] font-bold text-primary">
                    {fmt.number(branch.salesCount)}
                  </dd>
                </div>
              </dl>
            </Card>
          </li>
        ))}
      </ul>

      <BranchDialog
        open={creating || editing !== null}
        branch={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </>
  );
}

function BranchDialog({
  open,
  branch,
  onClose,
}: {
  open: boolean;
  branch: BranchRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSave] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [seededKey, setSeededKey] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    code: '',
    phone: '',
    address: '',
    isActive: true,
  });

  const key = branch?.id ?? (open ? 'new' : null);
  if (key && seededKey !== key) {
    setSeededKey(key);
    setFieldErrors({});
    setForm({
      name: branch?.name ?? '',
      code: branch?.code ?? '',
      phone: branch?.phone ?? '',
      address: branch?.address ?? '',
      isActive: branch?.isActive ?? true,
    });
  }
  if (!open && seededKey !== null) setSeededKey(null);

  const submit = () => {
    startSave(async () => {
      const response = await saveBranchAction({ id: branch?.id ?? null, ...form });
      if (!response.ok) {
        setFieldErrors(response.error.fieldErrors ?? {});
        toast.error('تعذر حفظ الفرع', response.error.message);
        return;
      }
      toast.success(branch ? 'تم حفظ الفرع' : 'تمت إضافة الفرع', form.name);
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={branch ? `تعديل ${branch.name}` : 'فرع جديد'}
      description={
        branch
          ? undefined
          : 'سيُنشأ للفرع صندوق نقدي خاص به، ويمكن ربط موظفين ومخزون به'
      }
      size="sm"
      dismissible={!saving}
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
        <FormField label="اسم الفرع" required error={fieldErrors.name}>
          <Input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="مثال: فرع النزهة"
            invalid={Boolean(fieldErrors.name)}
          />
        </FormField>

        <FieldRow>
          <FormField
            label="كود الفرع"
            required
            hint="حروف إنجليزية وأرقام فقط"
            error={fieldErrors.code}
          >
            <Input
              numeric
              value={form.code}
              onChange={(event) =>
                setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
              }
              placeholder="MAIN"
              invalid={Boolean(fieldErrors.code)}
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

        <FormField label="العنوان">
          <Input
            value={form.address}
            onChange={(event) =>
              setForm((current) => ({ ...current, address: event.target.value }))
            }
          />
        </FormField>

        {branch && !branch.isDefault && (
          <Switch
            checked={form.isActive}
            onChange={(event) =>
              setForm((current) => ({ ...current, isActive: event.target.checked }))
            }
            label="الفرع نشط"
            description="أوقفه لإخفائه من قوائم الفروع دون حذف بياناته"
          />
        )}
      </div>
    </Modal>
  );
}
