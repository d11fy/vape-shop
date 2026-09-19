'use client';

import { useEffect, useState, useTransition } from 'react';
import { Search, UserPlus, Users } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useFormat } from '@/ui/format';
import { Button } from '@/ui/primitives/button';
import { Input } from '@/ui/primitives/input';
import { Modal } from '@/ui/overlays/modal';
import { FormField } from '@/ui/forms/form-field';
import { useToast } from '@/ui/feedback/toast';
import { useFormAction } from '@/lib/use-form-action';
import { quickCreateCustomerAction, searchCustomersAction } from './actions';
import type { PosCustomerOption } from './queries';

/**
 * Customer selection without leaving the till.
 *
 * Two modes in one sheet: search the existing book, or create a customer on the
 * spot with just a name — because the person at the counter is waiting, and
 * anything more than that can be filled in later.
 */
export function CustomerPicker({
  open,
  recent,
  onClose,
  onSelect,
  canCreate,
}: {
  open: boolean;
  recent: PosCustomerOption[];
  onClose: () => void;
  onSelect: (customer: PosCustomerOption) => void;
  canCreate: boolean;
}) {
  const fmt = useFormat();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PosCustomerOption[]>(recent);
  const [searching, startSearch] = useTransition();
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(recent);
      setCreating(false);
    }
  }, [open, recent]);

  useEffect(() => {
    if (!open) return;
    const term = query.trim();

    if (term.length === 0) {
      setResults(recent);
      return;
    }

    const timer = setTimeout(() => {
      startSearch(async () => {
        const response = await searchCustomersAction(term);
        if (response.ok) setResults(response.data);
      });
    }, 220);

    return () => clearTimeout(timer);
  }, [query, open, recent]);

  const createForm = useFormAction(
    async (formData: FormData) =>
      quickCreateCustomerAction({
        name: String(formData.get('name') ?? ''),
        phone: String(formData.get('phone') ?? ''),
      }),
    {
      onSuccess: (customer) => {
        toast.success('تمت إضافة العميل', customer.name);
        onSelect(customer);
        onClose();
      },
    },
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={creating ? 'عميل جديد' : 'اختيار العميل'}
      description={
        creating ? 'الاسم فقط كافٍ — يمكنك إكمال البيانات لاحقاً' : 'ابحث بالاسم أو رقم الهاتف'
      }
      size="md"
      footer={
        creating ? (
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              رجوع
            </Button>
            <Button
              variant="primary"
              loading={createForm.pending}
              onClick={() => {
                const form = document.getElementById('quick-customer-form') as HTMLFormElement | null;
                form?.requestSubmit();
              }}
            >
              إضافة واختيار
            </Button>
          </>
        ) : undefined
      }
    >
      {creating ? (
        <form id="quick-customer-form" onSubmit={createForm.onSubmit} className="space-y-4" noValidate>
          <FormField label="اسم العميل" required error={createForm.fieldErrors.name}>
            <Input
              name="name"
              data-autofocus
              placeholder="مثال: عبدالرحمن الزهراني"
              invalid={Boolean(createForm.fieldErrors.name)}
              onChange={() => createForm.clearError('name')}
            />
          </FormField>

          <FormField label="رقم الهاتف" hint="يساعد على إيجاد العميل بسرعة لاحقاً" error={createForm.fieldErrors.phone}>
            <Input
              name="phone"
              type="tel"
              inputMode="tel"
              numeric
              placeholder="05xxxxxxxx"
              invalid={Boolean(createForm.fieldErrors.phone)}
              onChange={() => createForm.clearError('phone')}
            />
          </FormField>
        </form>
      ) : (
        <div className="space-y-3">
          <Input
            data-autofocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="اسم العميل أو رقم الهاتف…"
            iconStart={<Search className="size-4" />}
          />

          {canCreate && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] border border-dashed border-accent-border bg-accent-soft/40 px-3 py-2.5 text-[13px] font-semibold text-accent-strong transition-colors hover:bg-accent-soft"
            >
              <UserPlus className="size-4" />
              إضافة عميل جديد
              {query.trim() && <span className="text-tertiary">«{query.trim()}»</span>}
            </button>
          )}

          <div className="max-h-[46vh] overflow-y-auto">
            {results.length === 0 ? (
              <div className="py-10 text-center">
                <Users className="mx-auto size-7 text-tertiary" aria-hidden="true" />
                <p className="mt-2 text-[13px] font-semibold text-primary">
                  {searching ? 'جارٍ البحث…' : 'لا يوجد عملاء مطابقون'}
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {query.trim() === '' && (
                  <li className="px-1 pb-1 text-[11px] font-bold uppercase tracking-wide text-tertiary">
                    العملاء الأكثر تعاملاً
                  </li>
                )}
                {results.map((customer) => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(customer);
                        onClose();
                      }}
                      className="flex w-full items-center gap-3 rounded-[var(--radius-sm)] px-2.5 py-2.5 text-start transition-colors hover:bg-sunken"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-primary">
                          {customer.name}
                        </span>
                        {customer.phone && (
                          <span className="num block text-[12px] text-tertiary">
                            {customer.phone}
                          </span>
                        )}
                      </span>
                      {customer.balance !== 0 && (
                        <span
                          className={cn(
                            'num-mixed shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold',
                            customer.balance > 0
                              ? 'bg-warning-soft text-warning'
                              : 'bg-success-soft text-success',
                          )}
                        >
                          {customer.balance > 0 ? 'عليه ' : 'له '}
                          {fmt.money(Math.abs(customer.balance))}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
