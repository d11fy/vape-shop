'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  LockKeyhole,
  PlayCircle,
  Wallet,
} from 'lucide-react';

import { cn } from '@/lib/cn';
import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { DataTable, type Column } from '@/ui/data/data-table';
import { EmptyState } from '@/ui/feedback/empty-state';
import { Modal } from '@/ui/overlays/modal';
import { MoneyInput } from '@/ui/forms/money-input';
import { Textarea } from '@/ui/primitives/input';
import { useFormat } from '@/ui/format';
import { useToast } from '@/ui/feedback/toast';
import { newIdempotencyKey } from '@/modules/pos/types';
import {
  closeShiftAction,
  getShiftTotalsAction,
  openShiftAction,
  recordCashMovementAction,
} from './actions';
import { CASH_TYPE_LABEL } from './labels';
import type { CashMovementRow } from './queries';
import type { ShiftTotals } from '@/modules/shifts/service';

/** Cash in / cash out / open shift / close shift controls. */
export function CashboxActions({
  openShift,
  canManage,
  canOpenShift,
  canCloseShift,
}: {
  openShift: { id: string; number: string; userName: string; openedAt: Date } | null;
  canManage: boolean;
  canOpenShift: boolean;
  canCloseShift: boolean;
}) {
  const [movementOpen, setMovementOpen] = useState<'in' | 'out' | null>(null);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canManage && (
          <>
            <Button
              variant="outline"
              onClick={() => setMovementOpen('in')}
              iconStart={<ArrowDownToLine className="size-4" />}
            >
              إيداع نقدي
            </Button>
            <Button
              variant="outline"
              onClick={() => setMovementOpen('out')}
              iconStart={<ArrowUpFromLine className="size-4" />}
            >
              سحب نقدي
            </Button>
          </>
        )}

        {openShift ? (
          canCloseShift && (
            <Button
              variant="accent"
              onClick={() => setCloseOpen(true)}
              iconStart={<LockKeyhole className="size-4" />}
            >
              إغلاق الوردية
            </Button>
          )
        ) : (
          canOpenShift && (
            <Button
              variant="accent"
              onClick={() => setShiftOpen(true)}
              iconStart={<PlayCircle className="size-4" />}
            >
              فتح وردية
            </Button>
          )
        )}
      </div>

      <CashMovementDialog
        direction={movementOpen}
        onClose={() => setMovementOpen(null)}
      />
      <OpenShiftDialog open={shiftOpen} onClose={() => setShiftOpen(false)} />
      {openShift && (
        <CloseShiftDialog
          open={closeOpen}
          shift={openShift}
          onClose={() => setCloseOpen(false)}
        />
      )}
    </>
  );
}

function CashMovementDialog({
  direction,
  onClose,
}: {
  direction: 'in' | 'out' | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (direction) {
      setAmount(0);
      setReason('');
    }
  }, [direction]);

  if (!direction) return null;

  const submit = () => {
    if (amount <= 0) {
      toast.warning('أدخل مبلغاً أكبر من صفر');
      return;
    }
    if (reason.trim().length < 3) {
      toast.warning('اذكر سبب الحركة');
      return;
    }

    startSave(async () => {
      const response = await recordCashMovementAction({
        direction,
        amount,
        reason: reason.trim(),
      });

      if (!response.ok) {
        toast.error('تعذر تسجيل الحركة', response.error.message);
        return;
      }

      toast.success(
        direction === 'in' ? 'تم الإيداع' : 'تم السحب',
        `الرصيد الجديد ${fmt.money(response.data.balanceAfter)}`,
      );
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={direction === 'in' ? 'إيداع نقدي في الصندوق' : 'سحب نقدي من الصندوق'}
      description={
        direction === 'in'
          ? 'مثل إضافة فكة للصندوق في بداية اليوم'
          : 'مثل إيداع نقدية في البنك أو تسليمها لصاحب المحل'
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            تسجيل الحركة
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">المبلغ</span>
          <MoneyInput size="lg" value={amount} onValueChange={setAmount} />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">السبب</span>
          <Textarea
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              direction === 'in' ? 'مثال: إضافة فكة للصندوق' : 'مثال: إيداع في البنك'
            }
          />
        </label>
      </div>
    </Modal>
  );
}

function OpenShiftDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [openingCash, setOpeningCash] = useState(0);
  const [note, setNote] = useState('');
  const [saving, startSave] = useTransition();

  useEffect(() => {
    if (open) {
      setOpeningCash(0);
      setNote('');
    }
  }, [open]);

  const submit = () => {
    startSave(async () => {
      const response = await openShiftAction({ openingCash, note: note.trim() || null });
      if (!response.ok) {
        toast.error('تعذر فتح الوردية', response.error.message);
        return;
      }
      toast.success('تم فتح الوردية', response.data.number);
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="فتح وردية جديدة"
      description="أدخل المبلغ النقدي الموجود في الدرج الآن"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="accent" loading={saving} onClick={submit}>
            فتح الوردية
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">النقدية الافتتاحية</span>
          <MoneyInput size="lg" value={openingCash} onValueChange={setOpeningCash} />
          <span className="block text-[12px] text-tertiary">
            عُدّ الفكة الموجودة في الدرج قبل بدء البيع — هذا الرقم أساس تسوية نهاية الوردية.
          </span>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[13px] font-semibold text-primary">ملاحظة</span>
          <Textarea
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="اختياري"
          />
        </label>
      </div>
    </Modal>
  );
}

function CloseShiftDialog({
  open,
  shift,
  onClose,
}: {
  open: boolean;
  shift: { id: string; number: string };
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();
  const [totals, setTotals] = useState<ShiftTotals | null>(null);
  const [loading, setLoading] = useState(false);
  const [actualCash, setActualCash] = useState(0);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, startSave] = useTransition();
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setReason('');
    setNote('');

    void (async () => {
      const response = await getShiftTotalsAction(shift.id);
      setLoading(false);
      if (response.ok) {
        setTotals(response.data);
        setActualCash(response.data.expectedCash);
      }
    })();
  }, [open, shift.id]);

  const difference = totals ? actualCash - totals.expectedCash : 0;

  const submit = () => {
    if (difference !== 0 && reason.trim().length < 3) {
      toast.warning('يوجد فرق في النقدية', 'اذكر سبب الفرق قبل الإغلاق.');
      return;
    }

    startSave(async () => {
      const response = await closeShiftAction({
        idempotencyKey,
        shiftId: shift.id,
        actualCash,
        differenceReason: reason.trim() || null,
        note: note.trim() || null,
      });

      if (!response.ok) {
        toast.error('تعذر إغلاق الوردية', response.error.message);
        return;
      }

      toast.success(
        'تم إغلاق الوردية',
        response.data.difference === 0
          ? 'النقدية مطابقة تماماً'
          : `فرق ${fmt.money(response.data.difference, { signed: true })}`,
      );
      setIdempotencyKey(newIdempotencyKey());
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`إغلاق الوردية ${shift.number}`}
      description="عُدّ النقدية في الدرج وأدخل المبلغ الفعلي"
      size="md"
      dismissible={!saving}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            إلغاء
          </Button>
          <Button variant="accent" loading={saving} disabled={!totals} onClick={submit}>
            إغلاق الوردية
          </Button>
        </>
      }
    >
      {loading || !totals ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin-slow text-tertiary" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-[var(--radius-md)] border border-line-subtle bg-sunken/60 px-4 py-3">
            <dl className="space-y-1.5 text-[13px]">
              <Row label="النقدية الافتتاحية" value={fmt.money(totals.openingCash)} />
              <Row label="مبيعات نقدية" value={`+ ${fmt.money(totals.cashSales)}`} tone="success" />
              {totals.collections > 0 && (
                <Row label="تحصيل ديون" value={`+ ${fmt.money(totals.collections)}`} tone="success" />
              )}
              {totals.cashIn > 0 && (
                <Row label="إيداعات نقدية" value={`+ ${fmt.money(totals.cashIn)}`} tone="success" />
              )}
              {totals.expenses > 0 && (
                <Row label="مصاريف نقدية" value={`− ${fmt.money(totals.expenses)}`} tone="danger" />
              )}
              {totals.refunds > 0 && (
                <Row label="مرتجعات" value={`− ${fmt.money(totals.refunds)}`} tone="danger" />
              )}
              {totals.payouts > 0 && (
                <Row label="مدفوعات للموردين" value={`− ${fmt.money(totals.payouts)}`} tone="danger" />
              )}
              {totals.cashOut > 0 && (
                <Row label="سحوبات نقدية" value={`− ${fmt.money(totals.cashOut)}`} tone="danger" />
              )}
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <dt className="font-bold text-primary">المتوقع في الدرج</dt>
                <dd className="num text-[18px] font-bold text-primary">
                  {fmt.money(totals.expectedCash)}
                </dd>
              </div>
            </dl>

            {totals.cardSales > 0 && (
              <p className="mt-2 border-t border-line-subtle pt-2 text-[12px] text-tertiary">
                مبيعات غير نقدية (شبكة/تحويل):{' '}
                <span className="num font-semibold">{fmt.money(totals.cardSales)}</span> — لا تدخل في
                عدّ الدرج.
              </p>
            )}
          </div>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold text-primary">النقدية الفعلية بعد العدّ</span>
            <MoneyInput size="lg" value={actualCash} onValueChange={setActualCash} />
          </label>

          <div
            className={cn(
              'rounded-[var(--radius-md)] px-4 py-3 text-center',
              difference === 0
                ? 'bg-success-soft'
                : difference > 0
                  ? 'bg-info-soft'
                  : 'bg-danger-soft',
            )}
          >
            <p className="text-[12.5px] text-secondary">
              {difference === 0 ? 'النقدية مطابقة' : difference > 0 ? 'زيادة' : 'عجز'}
            </p>
            <p
              className={cn(
                'num mt-0.5 text-[22px] font-bold',
                difference === 0 ? 'text-success' : difference > 0 ? 'text-info' : 'text-danger',
              )}
            >
              {fmt.money(Math.abs(difference))}
            </p>
          </div>

          {difference !== 0 && (
            <label className="block space-y-1.5">
              <span className="text-[13px] font-semibold text-primary">سبب الفرق</span>
              <Textarea
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="مثال: فكة ناقصة، أو خطأ في تسجيل فاتورة"
              />
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-[13px] font-semibold text-primary">ملاحظة الإغلاق</span>
            <Textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="اختياري"
            />
          </label>

          <Alert tone="info" compact>
            بعد الإغلاق لا يمكن تعديل الوردية. ستُحفظ التسوية باسمك في سجل النشاط.
          </Alert>
        </div>
      )}
    </Modal>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger';
}) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-secondary">{label}</dt>
      <dd
        className={cn(
          'num font-semibold',
          tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-primary',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Cash drawer ledger. */
export function CashMovementsTable({ rows }: { rows: CashMovementRow[] }) {
  const fmt = useFormat();

  const referenceHref = (row: CashMovementRow): string | null => {
    if (!row.referenceId) return null;
    if (row.referenceType === 'payment') return null;
    if (row.referenceType === 'expense') return '/expenses';
    if (row.referenceType === 'shift') return `/cashbox/shifts/${row.referenceId}`;
    return null;
  };

  const columns: Column<CashMovementRow>[] = [
    {
      id: 'type',
      header: 'نوع الحركة',
      priority: 1,
      cell: (row) => (
        <span className="min-w-0">
          <span className="block font-semibold text-primary">
            {CASH_TYPE_LABEL[row.type] ?? row.type}
          </span>
          {row.description && (
            <span className="block truncate text-[11.5px] text-tertiary">{row.description}</span>
          )}
        </span>
      ),
    },
    {
      id: 'amount',
      header: 'المبلغ',
      align: 'end',
      priority: 1,
      cell: (row) => (
        <span className={cn('num font-bold', row.amount >= 0 ? 'text-success' : 'text-danger')}>
          {fmt.money(row.amount, { signed: true })}
        </span>
      ),
    },
    {
      id: 'balance',
      header: 'الرصيد بعدها',
      align: 'end',
      priority: 2,
      cell: (row) => <span className="num text-secondary">{fmt.money(row.balanceAfter)}</span>,
    },
    {
      id: 'user',
      header: 'المستخدم',
      priority: 3,
      cell: (row) => <span className="text-secondary">{row.userName}</span>,
    },
    {
      id: 'date',
      header: 'التاريخ',
      sortKey: 'occurredAt',
      align: 'end',
      priority: 2,
      cell: (row) => <span className="num text-secondary">{fmt.dateTime(row.occurredAt)}</span>,
    },
    {
      id: 'ref',
      header: '',
      align: 'end',
      priority: 3,
      hideable: false,
      cell: (row) => {
        const href = referenceHref(row);
        return href ? (
          <Link
            href={href}
            onClick={(event) => event.stopPropagation()}
            className="text-[12px] font-semibold text-accent-strong hover:underline"
          >
            عرض
          </Link>
        ) : null;
      },
    },
  ];

  return (
    <DataTable
      tableId="cash-movements"
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      density="compact"
      empty={
        <EmptyState
          icon={<Wallet className="size-6" />}
          title="لا توجد حركات نقدية"
          description="ستظهر هنا كل حركات الصندوق: المبيعات النقدية، التحصيل، المصاريف والسحوبات."
        />
      }
    />
  );
}
