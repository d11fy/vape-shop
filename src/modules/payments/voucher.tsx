import { storeFormatter, type Formatter } from '@/lib/formatter';
import { Logo } from '@/ui/brand/logo';
import type { ReceiptStore } from '@/modules/invoices/queries';
import type { PaymentVoucher } from './queries';

/**
 * The printed voucher for a single payment — the paper a customer takes home
 * after settling part of their tab, or a supplier signs when paid. Same
 * rendering approach as the invoice (browser print, not server PDF) for the
 * same reason: Arabic shaping and bidi are only reliable in the browser.
 */

function titleOf(voucher: PaymentVoucher): string {
  return voucher.direction === 'IN' ? 'سند قبض' : 'سند صرف';
}

function purposeOf(voucher: PaymentVoucher): string {
  switch (voucher.source) {
    case 'CUSTOMER_DEBT':
      return 'تحصيل دفعة من الرصيد المستحق';
    case 'SALE':
      return voucher.saleNumber ? `دفعة على الفاتورة ${voucher.saleNumber}` : 'دفعة على فاتورة بيع';
    case 'SUPPLIER_DEBT':
      return 'سداد من مستحقات المورد';
    case 'PURCHASE':
      return voucher.purchaseNumber
        ? `دفعة على فاتورة الشراء ${voucher.purchaseNumber}`
        : 'دفعة على فاتورة شراء';
    case 'SALE_REFUND':
      return voucher.saleNumber
        ? `إعادة مبلغ عن الفاتورة ${voucher.saleNumber}`
        : 'إعادة مبلغ لعميل';
    case 'PURCHASE_REFUND':
      return 'استرداد مبلغ من مورد';
    default:
      return 'دفعة';
  }
}

function partyLabel(voucher: PaymentVoucher): string {
  if (!voucher.party) return voucher.direction === 'IN' ? 'استلمنا من' : 'صرفنا إلى';
  if (voucher.party.kind === 'customer') return voucher.direction === 'IN' ? 'استلمنا من العميل' : 'صرفنا للعميل';
  return voucher.direction === 'OUT' ? 'صرفنا للمورد' : 'استلمنا من المورد';
}

function balanceLabel(voucher: PaymentVoucher): string {
  return voucher.party?.kind === 'supplier' ? 'المتبقي للمورد بعد الدفعة' : 'المتبقي على العميل بعد الدفعة';
}

export function PaymentVoucherDocument({
  voucher,
  store,
  format,
}: {
  voucher: PaymentVoucher;
  store: ReceiptStore;
  format: 'thermal' | 'a4';
}) {
  const fmt = storeFormatter(store);
  return format === 'thermal' ? (
    <ThermalVoucher voucher={voucher} store={store} fmt={fmt} />
  ) : (
    <A4Voucher voucher={voucher} store={store} fmt={fmt} />
  );
}

function ThermalVoucher({
  voucher,
  store,
  fmt,
}: {
  voucher: PaymentVoucher;
  store: ReceiptStore;
  fmt: Formatter;
}) {
  return (
    <div
      className="receipt-thermal mx-auto bg-white text-black"
      style={{ width: `${store.receiptWidthMm}mm`, padding: '4mm 3mm' }}
    >
      <header className="text-center">
        {store.showLogoOnReceipt && (
          <div className="mb-1.5 flex justify-center">
            <Logo size={34} />
          </div>
        )}
        <h1 className="text-[15px] font-bold leading-tight">{store.name}</h1>
        {store.phone && <p className="num text-[10px]">{store.phone}</p>}
        <p className="mt-1.5 inline-block border border-black px-2 py-0.5 text-[12px] font-bold">
          {titleOf(voucher)}
        </p>
      </header>

      <div className="my-1.5 border-t border-dashed border-black" />

      <div className="space-y-0.5 text-[10.5px]">
        <Row label="المرجع" value={<span className="num">{voucher.reference}</span>} />
        <Row label="التاريخ" value={fmt.dateTime(voucher.paidAt)} />
        {voucher.party && <Row label={partyLabel(voucher)} value={voucher.party.name} />}
        <Row label="البيان" value={purposeOf(voucher)} />
        <Row label="طريقة الدفع" value={voucher.methodName} />
        {voucher.methodReference && (
          <Row label="رقم العملية" value={<span className="num">{voucher.methodReference}</span>} />
        )}
      </div>

      <div className="my-1.5 border-y-2 border-black py-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-bold">المبلغ</span>
          <span className="num text-[16px] font-bold">{fmt.money(voucher.amount)}</span>
        </div>
      </div>

      {voucher.balanceAfter !== null && (
        <div className="text-[10.5px]">
          <Row
            label={balanceLabel(voucher)}
            value={<span className="num font-bold">{fmt.money(voucher.balanceAfter)}</span>}
          />
        </div>
      )}

      {voucher.note && <p className="mt-1.5 text-[10px] leading-snug">{voucher.note}</p>}

      <div className="my-1.5 border-t border-dashed border-black" />

      <footer className="text-center text-[10px] leading-snug">
        <p>الموظف: {voucher.cashierName}</p>
        <p className="mt-1 text-[9px]">
          ڤيب شوب · <span className="num">{voucher.reference}</span>
        </p>
      </footer>
    </div>
  );
}

function A4Voucher({
  voucher,
  store,
  fmt,
}: {
  voucher: PaymentVoucher;
  store: ReceiptStore;
  fmt: Formatter;
}) {
  return (
    <div className="receipt-a4 mx-auto bg-white p-[14mm] text-black" style={{ width: '210mm' }}>
      <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-5">
        <div className="flex items-start gap-3">
          {store.showLogoOnReceipt && <Logo size={52} />}
          <div>
            <h1 className="text-[22px] font-bold leading-tight">{store.name}</h1>
            {store.address && <p className="mt-1 text-[12px]">{store.address}</p>}
            {store.phone && (
              <p className="text-[12px]">
                هاتف: <span className="num">{store.phone}</span>
              </p>
            )}
          </div>
        </div>
        <div className="text-end">
          <p className="text-[20px] font-bold">{titleOf(voucher)}</p>
          <p className="num mt-1 text-[13px] font-bold">{voucher.reference}</p>
          <p className="mt-0.5 text-[12px]">{fmt.dateTime(voucher.paidAt)}</p>
        </div>
      </header>

      <section className="mt-8 space-y-4 text-[14px]">
        <Field label={partyLabel(voucher)} value={voucher.party?.name ?? '—'} />
        {voucher.party?.phone && (
          <Field label="الهاتف" value={<span className="num">{voucher.party.phone}</span>} />
        )}
        <Field
          label="مبلغ وقدره"
          value={<span className="num text-[20px] font-bold">{fmt.money(voucher.amount)}</span>}
        />
        <Field label="وذلك عن" value={purposeOf(voucher)} />
        <Field
          label="طريقة الدفع"
          value={
            <>
              {voucher.methodName}
              {voucher.methodReference && (
                <>
                  {' '}
                  — رقم العملية <span className="num">{voucher.methodReference}</span>
                </>
              )}
            </>
          }
        />
        {voucher.balanceAfter !== null && (
          <Field
            label={balanceLabel(voucher)}
            value={<span className="num font-bold">{fmt.money(voucher.balanceAfter)}</span>}
          />
        )}
        {voucher.note && <Field label="ملاحظات" value={voucher.note} />}
      </section>

      <section className="mt-16 grid grid-cols-2 gap-16 text-[13px]">
        <div>
          <p className="font-bold">{voucher.direction === 'IN' ? 'المستلم' : 'المسلِّم'}</p>
          <p className="mt-1">{voucher.cashierName}</p>
          <div className="mt-10 border-t border-black pt-1 text-[11px]">التوقيع</div>
        </div>
        <div>
          <p className="font-bold">{voucher.direction === 'IN' ? 'الدافع' : 'المستلم'}</p>
          <p className="mt-1">{voucher.party?.name ?? ' '}</p>
          <div className="mt-10 border-t border-black pt-1 text-[11px]">التوقيع</div>
        </div>
      </section>

      <footer className="mt-12 border-t border-[#c9cdd4] pt-3 text-center text-[11px] text-[#555]">
        الفرع: {voucher.branchName} · ڤيب شوب · <span className="num">{voucher.reference}</span>
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0">{label}</span>
      <span className="text-end">{value}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-dotted border-[#9aa0a8] pb-2">
      <span className="w-44 shrink-0 font-bold">{label}:</span>
      <span className="min-w-0 flex-1">{value}</span>
    </div>
  );
}
