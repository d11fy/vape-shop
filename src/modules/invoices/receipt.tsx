import { buildFormatter } from '@/lib/formatter';
import { Logo } from '@/ui/brand/logo';
import type { InvoiceDetail, ReceiptStore } from './queries';

/**
 * The printed invoice.
 *
 * Rendered as HTML and printed by the browser rather than generated as a PDF
 * server-side — and that is a deliberate choice, not a shortcut. Arabic needs
 * bidirectional layout and contextual letter shaping; the browser's text engine
 * does both perfectly, while every lightweight PDF library mangles them. The
 * shopkeeper gets a correct receipt on a thermal printer and, via "print to
 * PDF", a correct PDF as well.
 */

export interface ReceiptProps {
  invoice: InvoiceDetail;
  store: ReceiptStore;
  /** 80mm/58mm thermal roll, or a full A4 page. */
  format: 'thermal' | 'a4';
  /** Marks a duplicate so a reprint cannot be passed off as an original. */
  reprint?: boolean;
}

export function Receipt({ invoice, store, format, reprint = false }: ReceiptProps) {
  const fmt = buildFormatter({
    currency: store.currency,
    decimals: store.currencyDecimals,
    timezone: store.timezone,
    locale: store.locale,
  });

  return format === 'thermal' ? (
    <ThermalReceipt invoice={invoice} store={store} fmt={fmt} reprint={reprint} />
  ) : (
    <A4Invoice invoice={invoice} store={store} fmt={fmt} reprint={reprint} />
  );
}

type Fmt = ReturnType<typeof buildFormatter>;

// ── Thermal ──────────────────────────────────────────────────────────────────

function ThermalReceipt({
  invoice,
  store,
  fmt,
  reprint,
}: {
  invoice: InvoiceDetail;
  store: ReceiptStore;
  fmt: Fmt;
  reprint: boolean;
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
        {store.address && <p className="mt-0.5 text-[10px] leading-snug">{store.address}</p>}
        {store.phone && <p className="num text-[10px]">{store.phone}</p>}
        {store.taxEnabled && store.taxNumber && (
          <p className="text-[10px]">
            الرقم الضريبي: <span className="num">{store.taxNumber}</span>
          </p>
        )}
      </header>

      <Divider />

      <div className="space-y-0.5 text-[10.5px]">
        <Line label="رقم الفاتورة" value={invoice.number} mono />
        <Line label="التاريخ" value={fmt.dateTime(invoice.soldAt)} mono />
        <Line label="الكاشير" value={invoice.cashier.name} />
        {invoice.customer && <Line label="العميل" value={invoice.customer.name} />}
      </div>

      <Divider />

      <table className="w-full text-[10.5px]">
        <thead>
          <tr className="border-b border-dashed border-black">
            <th className="pb-1 text-start font-bold">الصنف</th>
            <th className="pb-1 text-center font-bold">كمية</th>
            <th className="pb-1 text-end font-bold">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="py-1 pe-1">
                <span className="block leading-snug">{item.productName}</span>
                {item.variantName !== 'افتراضي' && (
                  <span className="block text-[9.5px] leading-snug">{item.variantName}</span>
                )}
                <span className="block text-[9.5px]">
                  <span className="num">{fmt.money(item.unitPrice)}</span> / {item.unitLabel}
                </span>
              </td>
              <td className="num py-1 text-center">
                {item.saleUnits.toLocaleString('en-US', { maximumFractionDigits: 3 })}
              </td>
              <td className="num py-1 text-end font-semibold">{fmt.money(item.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Divider />

      <div className="space-y-0.5 text-[10.5px]">
        <Line label="المجموع" value={fmt.money(invoice.subtotal)} mono />
        {invoice.discountTotal > 0 && (
          <Line label="الخصم" value={`- ${fmt.money(invoice.discountTotal)}`} mono />
        )}
        {invoice.taxTotal > 0 && (
          <Line
            label={store.taxInclusive ? 'ضريبة مشمولة' : 'الضريبة'}
            value={fmt.money(invoice.taxTotal)}
            mono
          />
        )}
      </div>

      <div className="my-1 border-y-2 border-black py-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[12px] font-bold">الإجمالي</span>
          <span className="num text-[15px] font-bold">{fmt.money(invoice.total)}</span>
        </div>
      </div>

      <div className="space-y-0.5 text-[10.5px]">
        {invoice.payments
          .filter((payment) => payment.direction === 'IN')
          .map((payment) => (
            <Line key={payment.id} label={payment.methodName} value={fmt.money(payment.amount)} mono />
          ))}
        {invoice.dueTotal > 0 && (
          <div className="mt-1 border border-black px-1 py-0.5">
            <Line label="المتبقي (آجل)" value={fmt.money(invoice.dueTotal)} mono bold />
          </div>
        )}
      </div>

      {invoice.note && (
        <>
          <Divider />
          <p className="text-[10px] leading-snug">{invoice.note}</p>
        </>
      )}

      <Divider />

      <footer className="text-center text-[10px] leading-snug">
        {reprint && <p className="mb-1 font-bold">— نسخة مكررة —</p>}
        <p>{store.receiptFooterAr}</p>
        {store.ageVerificationEnabled && (
          <p className="mt-1 font-bold">{store.ageNoticeAr}</p>
        )}
        <p className="mt-1.5 text-[9px]">
          ڤيب شوب · <span className="num">{invoice.number}</span>
        </p>
      </footer>
    </div>
  );
}

function Divider() {
  return <div className="my-1.5 border-t border-dashed border-black" />;
}

function Line({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${bold ? 'font-bold' : ''}`}>
      <span>{label}</span>
      <span className={mono ? 'num' : undefined}>{value}</span>
    </div>
  );
}

// ── A4 ───────────────────────────────────────────────────────────────────────

function A4Invoice({
  invoice,
  store,
  fmt,
  reprint,
}: {
  invoice: InvoiceDetail;
  store: ReceiptStore;
  fmt: Fmt;
  reprint: boolean;
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
            {store.taxEnabled && store.taxNumber && (
              <p className="text-[12px]">
                الرقم الضريبي: <span className="num">{store.taxNumber}</span>
              </p>
            )}
          </div>
        </div>

        <div className="text-end">
          <p className="text-[18px] font-bold">فاتورة ضريبية مبسطة</p>
          <p className="num mt-1 text-[14px] font-bold">{invoice.number}</p>
          <p className="num mt-0.5 text-[12px]">{fmt.dateTime(invoice.soldAt)}</p>
          {reprint && <p className="mt-1 text-[11px] font-bold">— نسخة مكررة —</p>}
        </div>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-6 text-[12px]">
        <div>
          <p className="mb-1 font-bold">بيانات العميل</p>
          {invoice.customer ? (
            <>
              <p>{invoice.customer.name}</p>
              {invoice.customer.phone && <p className="num">{invoice.customer.phone}</p>}
            </>
          ) : (
            <p>عميل نقدي</p>
          )}
        </div>
        <div className="text-end">
          <p className="mb-1 font-bold">بيانات البيع</p>
          <p>الكاشير: {invoice.cashier.name}</p>
          <p>الفرع: {invoice.branch.name}</p>
        </div>
      </section>

      <table className="mt-5 w-full border-collapse text-[12px]">
        <thead>
          <tr className="bg-[#f1f3f6]">
            <th className="border border-[#c9cdd4] px-2 py-2 text-start font-bold">#</th>
            <th className="border border-[#c9cdd4] px-2 py-2 text-start font-bold">الصنف</th>
            <th className="border border-[#c9cdd4] px-2 py-2 text-center font-bold">الكمية</th>
            <th className="border border-[#c9cdd4] px-2 py-2 text-end font-bold">سعر الوحدة</th>
            <th className="border border-[#c9cdd4] px-2 py-2 text-end font-bold">الخصم</th>
            <th className="border border-[#c9cdd4] px-2 py-2 text-end font-bold">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, index) => (
            <tr key={item.id}>
              <td className="num border border-[#c9cdd4] px-2 py-2">{index + 1}</td>
              <td className="border border-[#c9cdd4] px-2 py-2">
                <span className="block">{item.productName}</span>
                {item.variantName !== 'افتراضي' && (
                  <span className="block text-[10.5px]">{item.variantName}</span>
                )}
                <span className="num block text-[10.5px]">{item.sku}</span>
              </td>
              <td className="border border-[#c9cdd4] px-2 py-2 text-center">
                <span className="num">
                  {item.saleUnits.toLocaleString('en-US', { maximumFractionDigits: 3 })}
                </span>{' '}
                {item.unitLabel}
              </td>
              <td className="num border border-[#c9cdd4] px-2 py-2 text-end">
                {fmt.money(item.unitPrice)}
              </td>
              <td className="num border border-[#c9cdd4] px-2 py-2 text-end">
                {item.discount > 0 ? fmt.money(item.discount) : '—'}
              </td>
              <td className="num border border-[#c9cdd4] px-2 py-2 text-end font-semibold">
                {fmt.money(item.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="mt-5 flex justify-between gap-8">
        <div className="max-w-[90mm] text-[12px]">
          {invoice.note && (
            <>
              <p className="font-bold">ملاحظات</p>
              <p className="mt-1 leading-relaxed">{invoice.note}</p>
            </>
          )}
          <p className="mt-4 font-bold">طرق الدفع</p>
          <ul className="mt-1 space-y-0.5">
            {invoice.payments
              .filter((payment) => payment.direction === 'IN')
              .map((payment) => (
                <li key={payment.id}>
                  {payment.methodName}: <span className="num">{fmt.money(payment.amount)}</span>
                </li>
              ))}
            {invoice.payments.length === 0 && <li>لم تُسجَّل مدفوعات</li>}
          </ul>
        </div>

        <table className="w-[75mm] text-[12px]">
          <tbody>
            <A4Row label="المجموع" value={fmt.money(invoice.subtotal)} />
            {invoice.discountTotal > 0 && (
              <A4Row label="الخصم" value={`- ${fmt.money(invoice.discountTotal)}`} />
            )}
            {invoice.taxTotal > 0 && (
              <A4Row
                label={
                  store.taxInclusive
                    ? `الضريبة المشمولة (${store.taxRateBps / 100}%)`
                    : `الضريبة (${store.taxRateBps / 100}%)`
                }
                value={fmt.money(invoice.taxTotal)}
              />
            )}
            <tr className="border-y-2 border-black">
              <td className="py-2 font-bold">الإجمالي المستحق</td>
              <td className="num py-2 text-end text-[16px] font-bold">{fmt.money(invoice.total)}</td>
            </tr>
            <A4Row label="المدفوع" value={fmt.money(invoice.paidTotal)} />
            {invoice.dueTotal > 0 && (
              <A4Row label="المتبقي" value={fmt.money(invoice.dueTotal)} bold />
            )}
          </tbody>
        </table>
      </section>

      <footer className="mt-10 border-t border-[#c9cdd4] pt-4 text-center text-[11px]">
        <p>{store.receiptFooterAr}</p>
        {store.ageVerificationEnabled && <p className="mt-1 font-bold">{store.ageNoticeAr}</p>}
        <p className="num-mixed mt-2 text-[10px]">
          صدرت بواسطة ڤيب شوب · {fmt.dateTime(new Date())}
        </p>
      </footer>
    </div>
  );
}

function A4Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr className={bold ? 'font-bold' : undefined}>
      <td className="py-1.5">{label}</td>
      <td className="num py-1.5 text-end">{value}</td>
    </tr>
  );
}
