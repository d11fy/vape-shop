'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Receipt, Trash2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Button } from '@/ui/primitives/button';
import { Card } from '@/ui/primitives/card';
import { DataTable, type Column } from '@/ui/data/data-table';
import { EmptyState } from '@/ui/feedback/empty-state';
import { FieldRow, FormField } from '@/ui/forms/form-field';
import { Input, Select, Textarea } from '@/ui/primitives/input';
import { Modal } from '@/ui/overlays/modal';
import { MoneyInput } from '@/ui/forms/money-input';
import { useConfirm } from '@/ui/feedback/confirm';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { newIdempotencyKey } from '@/modules/pos/types';
import { deleteExpenseAction, saveExpenseAction, type ExpenseInput } from './actions';
import type { ExpenseRow } from './queries';

export interface ExpenseOption {
  id: string;
  name: string;
  color?: string | null;
}

export function ExpenseTable({
  rows,
  categories,
  paymentMethods,
  canEdit,
  canDelete,
  canCreate,
}: {
  rows: ExpenseRow[];
  categories: ExpenseOption[];
  paymentMethods: Array<{ id: string; name: string; affectsCashbox: boolean }>;
  canEdit: boolean;
  canDelete: boolean;
  canCreate: boolean;
}) {
  const fmt = useFormat();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<ExpenseRow | null>(null);
  const [deleting, startDelete] = useTransition();

  const remove = async (row: ExpenseRow) => {
    const approved = await confirm({
      title: 'حذف هذا المصروف؟',
      tone: 'danger',
      message:
        'سيُحذف المصروف من التقارير، وإذا كان مدفوعاً نقداً ستُعاد قيمته إلى رصيد الصندوق بحركة موثقة.',
      details: (
        <span className="num">
          {row.description} — {fmt.money(row.amount)}
        </span>
      ),
      confirmLabel: 'حذف',
    });
    if (!approved) return;

    startDelete(async () => {
      const response = await deleteExpenseAction(row.id);
      if (!response.ok) {
        toast.error('تعذر حذف المصروف', response.error.message);
        return;
      }
      toast.success('تم حذف المصروف');
      router.refresh();
    });
  };

  const columns: Column<ExpenseRow>[] = [
    {
      id: 'description',
      header: 'البيان',
      priority: 1,
      cell: (row) => (
        <span className="min-w-0">
          <span className="block truncate font-semibold text-primary">{row.description}</span>
          {row.note && <span className="block truncate text-[11.5px] text-tertiary">{row.note}</span>}
        </span>
      ),
    },
    {
      id: 'category',
      header: 'الفئة',
      priority: 2,
      cell: (row) => (
        <span className="flex items-center gap-2">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: row.categoryColor ?? 'var(--border-strong)' }}
            aria-hidden="true"
          />
          <span className="truncate text-secondary">{row.categoryName}</span>
        </span>
      ),
    },
    {
      id: 'amount',
      header: 'المبلغ',
      sortKey: 'amount',
      align: 'end',
      priority: 1,
      cell: (row) => <span className="num font-bold text-primary">{fmt.money(row.amount)}</span>,
    },
    {
      id: 'method',
      header: 'طريقة الدفع',
      priority: 3,
      cell: (row) => <span className="text-secondary">{row.methodName ?? '—'}</span>,
    },
    {
      id: 'user',
      header: 'سجّله',
      priority: 3,
      cell: (row) => <span className="text-secondary">{row.userName}</span>,
    },
    {
      id: 'date',
      header: 'التاريخ',
      sortKey: 'spentAt',
      align: 'end',
      priority: 2,
      cell: (row) => <span className="num text-secondary">{fmt.date(row.spentAt)}</span>,
    },
  ];

  return (
    <>
      <DataTable
        tableId="expenses"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        onRowClick={canEdit ? (row) => setEditing(row) : undefined}
        actions={
          canEdit || canDelete
            ? (row) => (
                <span className="flex items-center gap-1">
                  {canEdit && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditing(row);
                      }}
                      aria-label={`تعديل ${row.description}`}
                      className="inline-flex size-8 items-center justify-center rounded-[var(--radius-xs)] text-tertiary transition-colors hover:bg-sunken hover:text-primary"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={(event) => {
                        event.stopPropagation();
                        void remove(row);
                      }}
                      aria-label={`حذف ${row.description}`}
                      className="inline-flex size-8 items-center justify-center rounded-[var(--radius-xs)] text-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </span>
              )
            : undefined
        }
        empty={
          <EmptyState
            icon={<Receipt className="size-6" />}
            title="لا توجد مصاريف في هذه الفترة"
            description="سجّل مصاريف المحل — الإيجار والرواتب والكهرباء وغيرها — ليظهر صافي ربحك الحقيقي."
            action={
              canCreate ? (
                <ExpenseButton categories={categories} paymentMethods={paymentMethods} />
              ) : undefined
            }
          />
        }
      />

      <ExpenseDialog
        open={editing !== null}
        expense={editing}
        categories={categories}
        paymentMethods={paymentMethods}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

/** Standalone "new expense" button with its dialog. */
export function ExpenseButton({
  categories,
  paymentMethods,
  label = 'مصروف جديد',
  defaultOpen = false,
}: {
  categories: ExpenseOption[];
  paymentMethods: Array<{ id: string; name: string; affectsCashbox: boolean }>;
  label?: string;
  /** Open straight away — the "تسجيل مصروف" quick action lands here. */
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);

  const close = () => {
    setOpen(false);
    // Drop `?new=1` so a refresh does not reopen the dialog.
    if (defaultOpen) router.replace('/expenses', { scroll: false });
  };

  return (
    <>
      <Button variant="accent" onClick={() => setOpen(true)} iconStart={<Plus className="size-4" />}>
        {label}
      </Button>
      <ExpenseDialog
        open={open}
        expense={null}
        categories={categories}
        paymentMethods={paymentMethods}
        onClose={close}
      />
    </>
  );
}

function ExpenseDialog({
  open,
  expense,
  categories,
  paymentMethods,
  onClose,
}: {
  open: boolean;
  expense: ExpenseRow | null;
  categories: ExpenseOption[];
  paymentMethods: Array<{ id: string; name: string; affectsCashbox: boolean }>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSave] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const [seededId, setSeededId] = useState<string | null>(null);

  const [form, setForm] = useState<ExpenseInput>({
    id: null,
    categoryId: categories[0]?.id ?? '',
    methodId: paymentMethods[0]?.id ?? null,
    amount: 0,
    description: '',
    note: '',
    receiptUrl: '',
    spentAt: new Date().toISOString().slice(0, 10),
  });

  // Seed the form whenever the dialog opens for a different record.
  const key = expense?.id ?? (open ? 'new' : null);
  if (key && seededId !== key) {
    setSeededId(key);
    setFieldErrors({});
    setForm(
      expense
        ? {
            id: expense.id,
            categoryId: expense.categoryId,
            methodId: paymentMethods.find((m) => m.name === expense.methodName)?.id ?? null,
            amount: expense.amount,
            description: expense.description,
            note: expense.note ?? '',
            receiptUrl: expense.receiptUrl ?? '',
            spentAt: expense.spentAt.toISOString().slice(0, 10),
          }
        : {
            id: null,
            categoryId: categories[0]?.id ?? '',
            methodId: paymentMethods[0]?.id ?? null,
            amount: 0,
            description: '',
            note: '',
            receiptUrl: '',
            spentAt: new Date().toISOString().slice(0, 10),
          },
    );
  }
  if (!open && seededId !== null) setSeededId(null);

  const update = <K extends keyof ExpenseInput>(field: K, value: ExpenseInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field as string]: undefined }));
  };

  const submit = () => {
    startSave(async () => {
      const response = await saveExpenseAction({
        ...form,
        idempotencyKey: form.id ? undefined : idempotencyKey,
      });

      if (!response.ok) {
        setFieldErrors(response.error.fieldErrors ?? {});
        toast.error('تعذر حفظ المصروف', response.error.message);
        return;
      }

      toast.success(form.id ? 'تم حفظ التعديلات' : 'تم تسجيل المصروف', String(form.description));
      setIdempotencyKey(newIdempotencyKey());
      onClose();
      router.refresh();
    });
  };

  const selectedMethod = paymentMethods.find((method) => method.id === form.methodId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form.id ? 'تعديل المصروف' : 'تسجيل مصروف'}
      description={
        selectedMethod?.affectsCashbox
          ? 'سيُخصم المبلغ من رصيد الصندوق'
          : 'لن يؤثر على رصيد الصندوق النقدي'
      }
      size="md"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="accent" loading={saving} onClick={submit}>
            {form.id ? 'حفظ التعديلات' : 'تسجيل المصروف'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="المبلغ" required error={fieldErrors.amount}>
          <MoneyInput
            size="lg"
            value={Number(form.amount ?? 0)}
            onValueChange={(value) => update('amount', value)}
          />
        </FormField>

        <FormField label="البيان" required error={fieldErrors.description}>
          <Input
            value={String(form.description ?? '')}
            onChange={(event) => update('description', event.target.value)}
            placeholder="مثال: إيجار المحل لشهر سبتمبر"
            invalid={Boolean(fieldErrors.description)}
          />
        </FormField>

        <FieldRow>
          <FormField label="الفئة" required error={fieldErrors.categoryId}>
            <Select
              value={String(form.categoryId ?? '')}
              onChange={(event) => update('categoryId', event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="طريقة الدفع">
            <Select
              value={String(form.methodId ?? '')}
              onChange={(event) => update('methodId', event.target.value || null)}
            >
              <option value="">بدون تحديد</option>
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.name}
                </option>
              ))}
            </Select>
          </FormField>
        </FieldRow>

        <FieldRow>
          <FormField label="التاريخ">
            <Input
              type="date"
              numeric
              value={String(form.spentAt ?? '')}
              onChange={(event) => update('spentAt', event.target.value)}
            />
          </FormField>

          <FormField label="رابط الإيصال" hint="اختياري — صورة مرفوعة أو رابط خارجي">
            <Input
              value={String(form.receiptUrl ?? '')}
              onChange={(event) => update('receiptUrl', event.target.value)}
              placeholder="https://…"
            />
          </FormField>
        </FieldRow>

        <FormField label="ملاحظة">
          <Textarea
            rows={2}
            value={String(form.note ?? '')}
            onChange={(event) => update('note', event.target.value)}
            placeholder="اختياري"
          />
        </FormField>
      </div>
    </Modal>
  );
}

/** Category spending breakdown shown above the table. */
export function ExpenseBreakdown({
  categories,
}: {
  categories: Array<{ id: string; name: string; color: string | null; amount: number }>;
}) {
  const fmt = useFormat();
  const total = categories.reduce((sum, category) => sum + category.amount, 0);

  if (total === 0) return null;

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-bold text-primary">المصاريف حسب الفئة</h2>
        <span className="num text-[13px] font-bold text-primary">{fmt.money(total)}</span>
      </div>

      <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-sunken">
        {categories.map((category) => (
          <div
            key={category.id}
            style={{
              width: `${(category.amount / total) * 100}%`,
              backgroundColor: category.color ?? 'var(--chart-2)',
            }}
            title={category.name}
          />
        ))}
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        {categories.slice(0, 8).map((category) => (
          <li key={category.id} className="flex items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: category.color ?? 'var(--chart-2)' }}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="block truncate text-[11.5px] text-tertiary">{category.name}</span>
              <span className="num block text-[13px] font-bold text-primary">
                {fmt.money(category.amount)}
              </span>
            </span>
            <span className={cn('num ms-auto shrink-0 text-[11px] text-tertiary')}>
              {Math.round((category.amount / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
