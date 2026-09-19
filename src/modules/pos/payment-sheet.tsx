'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Check,
  CreditCard,
  NotebookPen,
  Phone,
  Plus,
  Trash2,
  UserRound,
  Wallet,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import { isValidPhone, normalizePhone } from '@/lib/phone';
import { parseMoneyInput } from '@/core/money';
import { quickCashAmounts } from '@/core/currency';
import { useFormat } from '@/ui/format';
import { Alert } from '@/ui/feedback/alert';
import { FormField } from '@/ui/forms/form-field';
import { Button } from '@/ui/primitives/button';
import { Modal } from '@/ui/overlays/modal';
import { Input, Textarea } from '@/ui/primitives/input';
import { searchCustomersAction } from './actions';
import type { PosCustomerOption, PosPaymentMethod } from './queries';
import type { TenderRow } from './types';

export interface DebtCustomerEntry {
  name: string;
  phone: string;
}

export interface PaymentConfirmation {
  tenders: TenderRow[];
  /** Set in "دين" mode when no customer was picked in the cart. */
  debtCustomer: DebtCustomerEntry | null;
}

export interface PaymentSheetProps {
  open: boolean;
  total: number;
  methods: PosPaymentMethod[];
  /** The customer already attached to the cart, if any. */
  customer: { name: string; phone: string | null; balance: number | null } | null;
  debtEnabled: boolean;
  canSellOnCredit: boolean;
  note: string;
  submitting: boolean;
  onNote: (note: string) => void;
  onClose: () => void;
  onConfirm: (payment: PaymentConfirmation) => void;
}

type Mode = 'pay' | 'debt';

/** How long after the sheet opens a confirm tap is still treated as a stray double tap. */
const CONFIRM_GUARD_MS = 600;

interface DebtDraft {
  name: string;
  phone: string;
  /** Down payment as typed; empty means none. */
  downText: string;
  methodId: string;
  /** Show field errors only after the first attempt to confirm. */
  attempted: boolean;
}

const EMPTY_DEBT_DRAFT: DebtDraft = {
  name: '',
  phone: '',
  downText: '',
  methodId: '',
  attempted: false,
};

const METHOD_ICON: Record<string, typeof Banknote> = {
  CASH: Banknote,
  CARD: CreditCard,
  BANK: Wallet,
  TRANSFER: Wallet,
  WALLET: Wallet,
  OTHER: Wallet,
};

/**
 * The payment step.
 *
 * Two ways to close a sale, chosen at the top:
 *  - «دفع»: paid in full, split across methods (card + cash), or partly on the
 *    account of the customer picked in the cart.
 *  - «دين»: the whole invoice (less an optional down payment) goes on a
 *    customer's account — typed here by name and phone if they were not picked
 *    in the cart — and shows up in the debts section at once.
 */
export function PaymentSheet({
  open,
  total,
  methods,
  customer,
  debtEnabled,
  canSellOnCredit,
  note,
  submitting,
  onNote,
  onClose,
  onConfirm,
}: PaymentSheetProps) {
  const fmt = useFormat();
  const defaultMethod = methods.find((method) => method.isDefault) ?? methods[0];
  const customerName = customer?.name ?? null;
  const customerBalance = customer?.balance ?? null;

  const [mode, setMode] = useState<Mode>('pay');
  const [rows, setRows] = useState<TenderRow[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [activeText, setActiveText] = useState('');
  // Kept here, not in the debt panel, so flipping between «دفع» and «دين»
  // never loses what the cashier already typed.
  const [debtDraft, setDebtDraft] = useState<DebtDraft>(EMPTY_DEBT_DRAFT);

  // Open with the full amount on the default method — the common case is one
  // tap away, and everything else is an edit from there.
  if (open && !seeded && defaultMethod) {
    setSeeded(true);
    setMode('pay');
    setRows([{ methodId: defaultMethod.id, amount: total, reference: '' }]);
    setActiveText(String(total / 10 ** fmt.decimals));
    setDebtDraft({ ...EMPTY_DEBT_DRAFT, methodId: defaultMethod.id });
  }
  if (!open && seeded) {
    setSeeded(false);
    setRows([]);
    setActiveText('');
  }

  // The confirm button sits exactly where «متابعة الدفع» was a moment ago. A
  // second, impatient tap must not complete the sale before the cashier has
  // even seen this sheet — so confirmations are ignored for a short moment.
  const openedAt = useRef(0);
  useEffect(() => {
    if (open) openedAt.current = performance.now();
  }, [open]);
  const settled = () => performance.now() - openedAt.current >= CONFIRM_GUARD_MS;

  // ── «دين» ────────────────────────────────────────────────────────────────
  const debtBlocked = !debtEnabled
    ? 'البيع بالدين غير مفعّل في إعدادات المتجر. يمكن للمالك تفعيله من الإعدادات.'
    : !canSellOnCredit
      ? 'ليس لديك صلاحية البيع بالدين. اطلب من المدير.'
      : null;
  const debtForm = useDebtForm({
    active: open && mode === 'debt',
    total,
    hasCustomer: customer !== null,
    draft: debtDraft,
    decimals: fmt.decimals,
  });
  const canConfirmDebt =
    !debtBlocked &&
    !submitting &&
    !debtForm.downInvalid &&
    !debtForm.downCoversAll &&
    debtForm.debt > 0;

  const confirmDebt = () => {
    if (!canConfirmDebt || !settled()) return;
    if (!customer && (!debtForm.nameValid || !debtForm.phoneValid)) {
      setDebtDraft({ ...debtDraft, attempted: true });
      return;
    }
    onConfirm({
      tenders:
        debtForm.down > 0
          ? [{ methodId: debtDraft.methodId, amount: debtForm.down, reference: '' }]
          : [],
      debtCustomer: customer
        ? null
        : { name: debtDraft.name.trim(), phone: debtDraft.phone.trim() },
    });
  };

  // ── «دفع» ────────────────────────────────────────────────────────────────
  const paid = rows.reduce((sum, row) => sum + Math.max(0, row.amount), 0);
  const remaining = total - paid;
  const change = remaining < 0 ? -remaining : 0;
  const due = remaining > 0 ? remaining : 0;

  const cashRow = rows.find(
    (row) => methods.find((method) => method.id === row.methodId)?.affectsCashbox,
  );
  const overTenderedNonCash = rows.some((row) => {
    const method = methods.find((entry) => entry.id === row.methodId);
    return method && !method.affectsCashbox && row.amount > total;
  });

  const creditBlocked = due > 0 && (!debtEnabled || !canSellOnCredit || !customerName);

  const setAmount = (index: number, amount: number) => {
    setRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, amount } : row)),
    );
  };

  const addRow = () => {
    const unused = methods.find((method) => !rows.some((row) => row.methodId === method.id));
    if (!unused) return;
    setRows((current) => [
      ...current,
      { methodId: unused.id, amount: Math.max(0, total - paid), reference: '' },
    ]);
  };

  const confirm = () => {
    if (overTenderedNonCash || creditBlocked || submitting || !settled()) return;
    onConfirm({ tenders: rows.filter((row) => row.amount > 0), debtCustomer: null });
  };

  const isDebt = mode === 'debt';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isDebt ? 'تسجيل البيع ديناً' : 'إتمام الدفع'}
      description={
        isDebt
          ? 'يُسجَّل المبلغ على حساب العميل ويظهر في قسم الديون'
          : customerName
            ? `العميل: ${customerName}`
            : 'عميل نقدي'
      }
      size="md"
      dismissible={!submitting}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            رجوع
          </Button>
          {isDebt ? (
            <Button
              variant="accent"
              size="lg"
              loading={submitting}
              disabled={!canConfirmDebt}
              onClick={confirmDebt}
              iconStart={!submitting ? <NotebookPen className="size-4" /> : undefined}
            >
              تسجيل دين <span className="num">{fmt.money(debtForm.debt)}</span>
            </Button>
          ) : (
            <Button
              variant="accent"
              size="lg"
              loading={submitting}
              disabled={overTenderedNonCash || creditBlocked}
              onClick={confirm}
              iconStart={!submitting ? <Check className="size-4" /> : undefined}
            >
              {due > 0 ? `إتمام وتسجيل دين ${fmt.money(due)}` : 'إتمام وحفظ الفاتورة'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <ModeSwitch mode={mode} onMode={setMode} />

        {isDebt ? (
          <DebtFields
            total={total}
            methods={methods}
            customer={customer}
            blocked={debtBlocked}
            draft={debtDraft}
            onDraft={setDebtDraft}
            form={debtForm}
            onSubmit={confirmDebt}
          />
        ) : (
          <>
            {/* Amount due */}
            <div className="rounded-[var(--radius-md)] border border-line-subtle bg-sunken px-4 py-3.5 text-center">
              <p className="text-[12px] text-secondary">المطلوب</p>
              <p className="num mt-1 text-[30px] font-bold leading-none text-primary">
                {fmt.money(total)}
              </p>
            </div>

            {/* Tender rows */}
            <div className="space-y-2.5">
              {rows.map((row, index) => {
                const method = methods.find((entry) => entry.id === row.methodId);
                const Icon = METHOD_ICON[method?.type ?? 'OTHER'] ?? Wallet;

                return (
                  <div
                    key={`${row.methodId}-${index}`}
                    className="rounded-[var(--radius-md)] border border-line-subtle bg-card p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
                      <select
                        value={row.methodId}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index ? { ...entry, methodId: event.target.value } : entry,
                            ),
                          )
                        }
                        className="h-9 min-w-0 flex-1 cursor-pointer rounded-[var(--radius-xs)] border border-line-strong bg-card px-2 text-[13px] font-semibold text-primary focus:border-accent-strong focus:outline-none"
                      >
                        {methods.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>

                      <input
                        inputMode="decimal"
                        value={
                          index === 0 && activeText !== ''
                            ? activeText
                            : row.amount === 0
                              ? ''
                              : String(row.amount / 10 ** fmt.decimals)
                        }
                        onChange={(event) => {
                          if (index === 0) setActiveText(event.target.value);
                          const parsed = parseMoneyInput(event.target.value, fmt.decimals);
                          setAmount(index, parsed ?? 0);
                        }}
                        onKeyDown={(event) => event.key === 'Enter' && confirm()}
                        className="num h-9 w-28 rounded-[var(--radius-xs)] border border-line-strong bg-card px-2 text-center text-[14px] font-bold focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
                      />

                      {rows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                          aria-label="حذف طريقة الدفع"
                          className="shrink-0 rounded-[var(--radius-xs)] p-1.5 text-tertiary transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>

                    {method && !method.affectsCashbox && (
                      <input
                        value={row.reference}
                        onChange={(event) =>
                          setRows((current) =>
                            current.map((entry, entryIndex) =>
                              entryIndex === index
                                ? { ...entry, reference: event.target.value }
                                : entry,
                            ),
                          )
                        }
                        placeholder="رقم العملية / المرجع (اختياري)"
                        className="mt-2 h-9 w-full rounded-[var(--radius-xs)] border border-line-strong bg-card px-2.5 text-[12.5px] focus:border-accent-strong focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}

              {rows.length < methods.length && (
                <button
                  type="button"
                  onClick={addRow}
                  className="flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-dashed border-line-strong py-2 text-[12.5px] font-semibold text-secondary transition-colors hover:border-accent-border hover:text-primary"
                >
                  <Plus className="size-3.5" />
                  تقسيم الدفع على طريقة أخرى
                </button>
              )}
            </div>

            {/* Quick cash */}
            {cashRow && (
              <div>
                <p className="mb-1.5 text-[12px] font-semibold text-secondary">مبالغ سريعة</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const index = rows.indexOf(cashRow);
                      setAmount(index, total);
                      if (index === 0) setActiveText(String(total / 10 ** fmt.decimals));
                    }}
                    className="h-10 rounded-[var(--radius-sm)] border border-accent-border bg-accent-soft px-3 text-[13px] font-bold text-accent-strong transition-colors"
                  >
                    المبلغ بالضبط
                  </button>
                  {quickCashAmounts(fmt.decimals)
                    .filter((amount) => amount >= total)
                    .slice(0, 4)
                    .map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => {
                          const index = rows.indexOf(cashRow);
                          setAmount(index, amount);
                          if (index === 0) setActiveText(String(amount / 10 ** fmt.decimals));
                        }}
                        className="num h-10 rounded-[var(--radius-sm)] border border-line-strong bg-card px-3.5 text-[13px] font-bold text-primary transition-colors hover:bg-sunken"
                      >
                        {fmt.amount(amount)}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Balance */}
            <div className="rounded-[var(--radius-md)] border border-line-subtle bg-sunken/60 px-4 py-3">
              <dl className="space-y-1.5 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-secondary">المدفوع</dt>
                  <dd className="num font-bold text-primary">{fmt.money(paid)}</dd>
                </div>
                {change > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-secondary">الباقي للعميل</dt>
                    <dd className="num font-bold text-success">{fmt.money(change)}</dd>
                  </div>
                )}
                {due > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-secondary">المتبقي (دين)</dt>
                    <dd className="num font-bold text-warning">{fmt.money(due)}</dd>
                  </div>
                )}
              </dl>
            </div>

            {overTenderedNonCash && (
              <Alert tone="danger" compact>
                قيمة الدفع الإلكتروني أكبر من إجمالي الفاتورة. الفكة تُسلَّم نقداً فقط.
              </Alert>
            )}

            {due > 0 && !creditBlocked && (
              <Alert tone="warning" compact title="بيع آجل">
                سيُسجَّل مبلغ <span className="num font-bold">{fmt.money(due)}</span> على حساب{' '}
                {customerName}
                {customerBalance !== null && customerBalance > 0 && (
                  <>
                    {' '}— رصيده الحالي <span className="num">{fmt.money(customerBalance)}</span>
                  </>
                )}
                .
              </Alert>
            )}

            {creditBlocked && (
              <Alert tone="danger" compact>
                <span className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {!debtEnabled
                      ? 'البيع الآجل غير مفعّل في إعدادات المتجر.'
                      : !canSellOnCredit
                        ? 'ليس لديك صلاحية البيع الآجل. أكمل المبلغ أو اطلب من المدير.'
                        : 'لتسجيل المبلغ المتبقي كدين اختر «دين» بالأعلى وأدخل اسم العميل ورقمه.'}
                  </span>
                </span>
              </Alert>
            )}
          </>
        )}

        <label className="block space-y-1.5">
          <span className="text-[12.5px] font-semibold text-secondary">ملاحظة على الفاتورة</span>
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => onNote(event.target.value)}
            placeholder={
              isDebt ? 'اختياري — مثال: يسدد نهاية الشهر' : 'اختياري — تظهر في الفاتورة المطبوعة'
            }
          />
        </label>
      </div>
    </Modal>
  );
}

function ModeSwitch({ mode, onMode }: { mode: Mode; onMode: (mode: Mode) => void }) {
  const options: { value: Mode; label: string; icon: typeof Banknote }[] = [
    { value: 'pay', label: 'دفع', icon: Banknote },
    { value: 'debt', label: 'دين', icon: NotebookPen },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="طريقة إتمام البيع"
      className="grid grid-cols-2 gap-1 rounded-[var(--radius-md)] border border-line-subtle bg-sunken p-1"
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = mode === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onMode(option.value)}
            className={cn(
              'flex h-10 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] text-[14px] font-bold transition-colors',
              active
                ? option.value === 'debt'
                  ? 'bg-warning-soft text-warning shadow-[var(--shadow-xs)]'
                  : 'bg-card text-primary shadow-[var(--shadow-xs)]'
                : 'text-secondary hover:text-primary',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type DebtForm = ReturnType<typeof useDebtForm>;

/**
 * The arithmetic and checks behind «دين», shared by its fields and the sheet's
 * confirm button.
 *
 * The phone number is what identifies the person: while the cashier types it,
 * it is looked up, so a number already on the books shows whose account the
 * debt will join before anything is recorded.
 */
function useDebtForm({
  active,
  total,
  hasCustomer,
  draft,
  decimals,
}: {
  active: boolean;
  total: number;
  hasCustomer: boolean;
  draft: DebtDraft;
  decimals: number;
}) {
  const typedPhone = normalizePhone(draft.phone);
  const phoneValid = isValidPhone(draft.phone);
  const nameValid = draft.name.trim().length >= 2;

  const [match, setMatch] = useState<{ phone: string; customer: PosCustomerOption | null } | null>(
    null,
  );
  useEffect(() => {
    if (!active || hasCustomer || !phoneValid) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const response = await searchCustomersAction(typedPhone);
      if (cancelled || !response.ok) return;
      const found =
        response.data.find((row) => row.phone && normalizePhone(row.phone) === typedPhone) ??
        null;
      setMatch({ phone: typedPhone, customer: found });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, hasCustomer, phoneValid, typedPhone]);
  const existing = !hasCustomer && match && match.phone === typedPhone ? match.customer : null;

  const down =
    draft.downText.trim() === '' ? 0 : (parseMoneyInput(draft.downText, decimals) ?? -1);
  const downInvalid = down < 0;
  const downCoversAll = total > 0 && down >= total;
  const debt = Math.max(0, total - Math.max(0, down));

  const nameError = draft.attempted && !hasCustomer && !nameValid ? 'أدخل اسم العميل' : null;
  const phoneError =
    draft.attempted && !hasCustomer && !phoneValid
      ? draft.phone.trim() === ''
        ? 'أدخل رقم هاتف العميل'
        : 'رقم الهاتف غير صحيح'
      : null;

  return {
    nameValid,
    phoneValid,
    nameError,
    phoneError,
    existing,
    down: Math.max(0, down),
    downInvalid,
    downCoversAll,
    debt,
  };
}

/**
 * «دين»: the invoice goes on a customer's account.
 *
 * With a customer already picked in the cart, the debt is theirs. Otherwise the
 * cashier types a name and phone number; a number already on the books puts the
 * debt on that existing account, and a new number opens a new one.
 */
function DebtFields({
  total,
  methods,
  customer,
  blocked,
  draft,
  onDraft,
  form,
  onSubmit,
}: {
  total: number;
  methods: PosPaymentMethod[];
  customer: PaymentSheetProps['customer'];
  blocked: string | null;
  draft: DebtDraft;
  onDraft: (draft: DebtDraft) => void;
  form: DebtForm;
  onSubmit: () => void;
}) {
  const fmt = useFormat();
  const set = (patch: Partial<DebtDraft>) => onDraft({ ...draft, ...patch });
  const { existing, down, debt } = form;

  const accountName = customer?.name ?? existing?.name ?? null;
  const accountBalance = customer?.balance ?? existing?.balance ?? null;

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      {blocked && (
        <Alert tone="danger" compact>
          <span className="flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>{blocked}</span>
          </span>
        </Alert>
      )}

      {/* Whose account */}
      {customer ? (
        <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-line-subtle bg-card px-3.5 py-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
            <UserRound className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-bold text-primary">{customer.name}</p>
            {customer.phone && (
              <p className="num text-[12.5px] text-secondary">{customer.phone}</p>
            )}
          </div>
          <p className="text-[11.5px] text-tertiary">العميل المختار في السلة</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="اسم العميل" required error={form.nameError}>
            <Input
              value={draft.name}
              onChange={(event) => set({ name: event.target.value })}
              placeholder="مثال: أحمد العتيبي"
              autoComplete="off"
              iconStart={<UserRound className="size-4" />}
              autoFocus
            />
          </FormField>
          <FormField label="رقم الهاتف" required error={form.phoneError}>
            <Input
              value={draft.phone}
              onChange={(event) => set({ phone: event.target.value })}
              placeholder="05xxxxxxxx"
              inputMode="tel"
              autoComplete="off"
              numeric
              iconStart={<Phone className="size-4" />}
            />
          </FormField>
        </div>
      )}

      {!customer && existing && (
        <Alert tone="info" compact>
          هذا الرقم مسجل باسم <strong>{existing.name}</strong> — سيُضاف الدين إلى حسابه
          {existing.balance > 0 && (
            <>
              {' '}
              (عليه حالياً <span className="num">{fmt.money(existing.balance)}</span>)
            </>
          )}
          .
        </Alert>
      )}

      {/* Optional down payment */}
      <div className="rounded-[var(--radius-md)] border border-line-subtle bg-card p-3">
        <p className="mb-2 text-[12.5px] font-semibold text-secondary">
          دفعة مقدمة <span className="font-normal text-tertiary">(اختياري)</span>
        </p>
        <div className="flex items-center gap-2">
          <select
            value={draft.methodId}
            onChange={(event) => set({ methodId: event.target.value })}
            aria-label="طريقة دفع الدفعة المقدمة"
            className="h-9 min-w-0 flex-1 cursor-pointer rounded-[var(--radius-xs)] border border-line-strong bg-card px-2 text-[13px] font-semibold text-primary focus:border-accent-strong focus:outline-none"
          >
            {methods.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <input
            inputMode="decimal"
            value={draft.downText}
            onChange={(event) => set({ downText: event.target.value })}
            placeholder="0"
            aria-label="مبلغ الدفعة المقدمة"
            className="num h-9 w-28 rounded-[var(--radius-xs)] border border-line-strong bg-card px-2 text-center text-[14px] font-bold focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
          />
        </div>
      </div>

      {/* Summary */}
      <div className="rounded-[var(--radius-md)] border border-warning-border bg-warning-soft px-4 py-3">
        <dl className="space-y-1.5 text-[13px]">
          <div className="flex justify-between">
            <dt className="text-secondary">إجمالي الفاتورة</dt>
            <dd className="num font-bold text-primary">{fmt.money(total)}</dd>
          </div>
          {down > 0 && (
            <div className="flex justify-between">
              <dt className="text-secondary">الدفعة المقدمة</dt>
              <dd className="num font-bold text-primary">{fmt.money(down)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-warning-border pt-1.5">
            <dt className="font-semibold text-primary">يُسجَّل ديناً</dt>
            <dd className="num text-[16px] font-bold text-warning">{fmt.money(debt)}</dd>
          </div>
          {accountName && accountBalance !== null && accountBalance > 0 && (
            <div className="flex justify-between text-[12px]">
              <dt className="text-secondary">رصيد {accountName} بعد البيع</dt>
              <dd className="num font-semibold text-primary">
                {fmt.money(accountBalance + debt)}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {form.downInvalid && (
        <Alert tone="danger" compact>
          مبلغ الدفعة المقدمة غير صحيح.
        </Alert>
      )}
      {form.downCoversAll && (
        <Alert tone="warning" compact>
          الدفعة تغطي كامل الفاتورة — لا يوجد دين. اختر «دفع» لإتمام البيع.
        </Alert>
      )}

      {/* Enter in a field submits; the visible button lives in the footer. */}
      <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
    </form>
  );
}

/** Success confirmation shown right after a sale completes. */
export function SaleSuccessDialog({
  open,
  number,
  total,
  change,
  dueTotal,
  customerName,
  saleId,
  onClose,
  onPrint,
}: {
  open: boolean;
  number: string;
  total: number;
  change: number;
  dueTotal: number;
  customerName: string | null;
  saleId: string;
  onClose: () => void;
  onPrint: () => void;
}) {
  const fmt = useFormat();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="تمت العملية بنجاح"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onPrint}>
            طباعة الفاتورة
          </Button>
          <Button variant="accent" onClick={onClose}>
            فاتورة جديدة
          </Button>
        </>
      }
    >
      <div className="text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-7" strokeWidth={2.5} />
        </span>

        <p className="num mt-4 text-[13px] font-bold text-secondary">{number}</p>
        <p className="num mt-1 text-[26px] font-bold text-primary">{fmt.money(total)}</p>

        {change > 0 && (
          <div className="mt-4 rounded-[var(--radius-md)] border border-success-border bg-success-soft px-4 py-3">
            <p className="text-[12.5px] text-secondary">الباقي للعميل</p>
            <p className="num mt-0.5 text-[22px] font-bold text-success">{fmt.money(change)}</p>
          </div>
        )}

        {dueTotal > 0 && (
          <div className="mt-3 rounded-[var(--radius-md)] border border-warning-border bg-warning-soft px-4 py-2.5">
            <p className="text-[12.5px] text-secondary">
              سُجّل دين بقيمة{' '}
              <span className="num font-bold text-warning">{fmt.money(dueTotal)}</span>
              {customerName && (
                <>
                  {' '}
                  على <strong className="text-primary">{customerName}</strong>
                </>
              )}
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <a
            href={`/invoices/${saleId}`}
            className="text-[12.5px] font-semibold text-accent-strong hover:underline"
          >
            عرض تفاصيل الفاتورة
          </a>
          {dueTotal > 0 && (
            <a
              href="/debts"
              className="text-[12.5px] font-semibold text-accent-strong hover:underline"
            >
              فتح قسم الديون
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}
