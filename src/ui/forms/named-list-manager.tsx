'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';

import { cn } from '@/lib/cn';
import { countAr, type ArabicNoun } from '@/lib/arabic-count';
import type { ActionResult } from '@/core/result';
import type { FieldErrors } from '@/core/errors';
import { useConfirm } from '@/ui/feedback/confirm';
import { EmptyState } from '@/ui/feedback/empty-state';
import { useToast } from '@/ui/feedback/toast';
import { FormField } from '@/ui/forms/form-field';
import { Modal } from '@/ui/overlays/modal';
import { Badge } from '@/ui/primitives/badge';
import { Button } from '@/ui/primitives/button';
import { Card, CardHeader } from '@/ui/primitives/card';
import { Input } from '@/ui/primitives/input';
import { Switch } from '@/ui/primitives/toggle';

/**
 * A short list of named things a shop maintains by hand — product categories,
 * brands, expense categories. One component so they all add, rename, switch
 * off and delete the same way; the server actions stay specific to each.
 */

export interface NamedItem {
  id: string;
  name: string;
  color?: string | null;
  isActive: boolean;
  /** How many records use it — deletion is refused while this is above zero. */
  usage: number;
  /** Part of the default set: can be switched off, not deleted. */
  isSystem?: boolean;
}

export interface NamedItemInput {
  id?: string | null;
  name: string;
  color?: string;
  isActive: boolean;
}

const SWATCHES = ['#34D399', '#60A5FA', '#F59E0B', '#F472B6', '#A78BFA', '#F87171', '#2DD4BF', '#94A3B8'];

export function NamedListManager({
  title,
  subtitle,
  icon,
  noun,
  usageNoun,
  items,
  withColor = false,
  canEdit,
  onSave,
  onDelete,
  emptyText,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  /** Singular, for buttons and dialog titles: "تصنيف". */
  noun: string;
  /** What `usage` counts: products, expenses… */
  usageNoun: ArabicNoun;
  items: NamedItem[];
  withColor?: boolean;
  canEdit: boolean;
  onSave: (input: NamedItemInput) => Promise<ActionResult<{ id: string }>>;
  onDelete?: (id: string) => Promise<ActionResult<void>>;
  emptyText: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<NamedItem | 'new' | null>(null);
  const [deleting, startDelete] = useTransition();

  const remove = async (item: NamedItem) => {
    if (!onDelete) return;
    const approved = await confirm({
      title: `حذف ${noun}`,
      message: `سيُحذف «${item.name}» نهائياً من القوائم.`,
      confirmLabel: 'حذف',
      tone: 'danger',
    });
    if (!approved) return;

    startDelete(async () => {
      const result = await onDelete(item.id);
      if (!result.ok) {
        toast.error('تعذر الحذف', result.error.message);
        return;
      }
      toast.success(`تم حذف ${noun}`, item.name);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        action={
          canEdit ? (
            <Button
              size="sm"
              variant="soft"
              iconStart={<Plus className="size-4" />}
              onClick={() => setEditing('new')}
            >
              إضافة {noun}
            </Button>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState variant="compact" icon={icon} title={emptyText} />
      ) : (
        <ul className="mt-3 divide-y divide-line-subtle">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5">
              {withColor && (
                <span
                  className="size-3 shrink-0 rounded-full border border-line"
                  style={{ backgroundColor: item.color ?? 'transparent' }}
                  aria-hidden="true"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'truncate text-[13.5px] font-semibold',
                      item.isActive ? 'text-primary' : 'text-tertiary line-through',
                    )}
                  >
                    {item.name}
                  </span>
                  {item.isSystem && (
                    <Badge size="sm" tone="neutral">
                      أساسية
                    </Badge>
                  )}
                  {!item.isActive && (
                    <Badge size="sm" tone="warning">
                      معطّل
                    </Badge>
                  )}
                </span>
                <span className="block text-[12px] text-secondary">
                  {item.usage > 0 ? countAr(item.usage, usageNoun) : 'غير مستخدم بعد'}
                </span>
              </span>

              {canEdit && (
                <span className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`تعديل ${item.name}`}
                    onClick={() => setEditing(item)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {onDelete && !item.isSystem && item.usage === 0 && (
                    <Button
                      size="icon-sm"
                      variant="danger-ghost"
                      aria-label={`حذف ${item.name}`}
                      onClick={() => remove(item)}
                      disabled={deleting}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <ItemDialog
        key={editing === 'new' ? 'new' : (editing?.id ?? 'closed')}
        open={editing !== null}
        item={editing === 'new' ? null : editing}
        noun={noun}
        withColor={withColor}
        onSave={onSave}
        onClose={() => setEditing(null)}
      />
    </Card>
  );
}

function ItemDialog({
  open,
  item,
  noun,
  withColor,
  onSave,
  onClose,
}: {
  open: boolean;
  item: NamedItem | null;
  noun: string;
  withColor: boolean;
  onSave: (input: NamedItemInput) => Promise<ActionResult<{ id: string }>>;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, startSave] = useTransition();
  const [name, setName] = useState(item?.name ?? '');
  const [color, setColor] = useState(item?.color ?? (withColor ? SWATCHES[0]! : ''));
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    startSave(async () => {
      const result = await onSave({
        id: item?.id ?? null,
        name,
        color: withColor ? color : undefined,
        isActive,
      });
      if (!result.ok) {
        setErrors(result.error.fieldErrors ?? {});
        if (!result.error.fieldErrors) toast.error('تعذر الحفظ', result.error.message);
        return;
      }
      toast.success(item ? 'تم حفظ التعديلات' : `تمت إضافة ${noun}`, name.trim());
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `تعديل ${noun}` : `إضافة ${noun}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="accent" type="submit" form="named-item-form" loading={saving}>
            حفظ
          </Button>
        </>
      }
    >
      <form id="named-item-form" onSubmit={submit} className="space-y-4" noValidate>
        <FormField label="الاسم" required error={errors.name}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            autoFocus
          />
        </FormField>

        {withColor && (
          <FormField label="اللون" hint="يظهر على أزرار التصنيفات في شاشة البيع">
            <div role="radiogroup" aria-label="اللون" className="flex flex-wrap gap-2">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  role="radio"
                  aria-checked={color === swatch}
                  aria-label={swatch}
                  onClick={() => setColor(swatch)}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border-2 transition-transform',
                    color === swatch ? 'scale-110 border-primary' : 'border-transparent',
                  )}
                  style={{ backgroundColor: swatch }}
                >
                  {color === swatch && <Check className="size-4 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </FormField>
        )}

        <Switch
          checked={isActive}
          onChange={(event) => setIsActive(event.target.checked)}
          label="مفعّل"
          description="المعطّل يختفي من القوائم عند الإضافة، ويبقى ظاهراً في السجلات القديمة."
        />
      </form>
    </Modal>
  );
}
