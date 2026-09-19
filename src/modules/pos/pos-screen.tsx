'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, Package, ScanLine, Search, ShoppingCart, Timer, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useToast } from '@/ui/feedback/toast';
import { Alert } from '@/ui/feedback/alert';
import { Button } from '@/ui/primitives/button';
import { ChipBar } from '@/ui/primitives/tabs';
import { Modal } from '@/ui/overlays/modal';
import { useFormat } from '@/ui/format';
import type { TaxConfig } from '@/modules/sales/pricing';
import { completeSaleAction } from './actions';
import { CartPanel } from './cart-panel';
import { CustomerPicker } from './customer-picker';
import { PaymentSheet, SaleSuccessDialog, type PaymentConfirmation } from './payment-sheet';
import { ProductGrid } from './product-grid';
import type { PosBootstrap, PosCustomerOption, PosProduct } from './queries';
import { useCart } from './use-cart';

export interface PosScreenProps {
  bootstrap: PosBootstrap;
  branchId: string;
  branchName: string;
  permissions: {
    canDiscount: boolean;
    canEditPrice: boolean;
    canSellOnCredit: boolean;
    canCreateCustomer: boolean;
  };
  requireShift: boolean;
}

/**
 * The till.
 *
 * Desktop splits into catalogue and cart side by side; a phone shows the
 * catalogue full-width with a sticky summary bar that opens the cart as a
 * sheet. The same state and the same components drive both — there is no
 * separate "mobile POS" to keep in sync.
 */
export function PosScreen({
  bootstrap,
  branchId,
  branchName,
  permissions,
  requireShift,
}: PosScreenProps) {
  const router = useRouter();
  const toast = useToast();
  const fmt = useFormat();

  const tax: TaxConfig = {
    enabled: bootstrap.settings.taxEnabled,
    rateBps: bootstrap.settings.taxRateBps,
    inclusive: bootstrap.settings.taxInclusive,
  };

  const cart = useCart(branchId, tax);

  const [products, setProducts] = useState<PosProduct[]>(bootstrap.products);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [success, setSuccess] = useState<{
    saleId: string;
    number: string;
    total: number;
    change: number;
    dueTotal: number;
    customerName: string | null;
  } | null>(null);

  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomerOption | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Catalogue search ──────────────────────────────────────────────────────
  const fetchProducts = useCallback(
    async (term: string, categoryId: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoadingProducts(true);

      try {
        const params = new URLSearchParams();
        if (term) params.set('q', term);
        if (categoryId !== 'all') params.set('category', categoryId);

        const response = await fetch(`/api/pos/products?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('failed');
        const payload = (await response.json()) as { products: PosProduct[] };
        setProducts(payload.products);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          toast.error('تعذر تحميل المنتجات', 'تحقق من الاتصال وحاول مرة أخرى.');
        }
      } finally {
        setLoadingProducts(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    const term = query.trim();
    if (term === '' && category === 'all') {
      setProducts(bootstrap.products);
      return;
    }
    const timer = setTimeout(() => void fetchProducts(term, category), 240);
    return () => clearTimeout(timer);
  }, [query, category, bootstrap.products, fetchProducts]);

  // ── Barcode ───────────────────────────────────────────────────────────────
  const addByBarcode = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;

      try {
        const response = await fetch(`/api/pos/products?barcode=${encodeURIComponent(trimmed)}`);
        const payload = (await response.json()) as { products: PosProduct[] };
        const product = payload.products[0];

        if (!product) {
          toast.warning('لم يتم العثور على المنتج', `الباركود ${trimmed} غير مسجل.`);
          return;
        }
        cart.add(product);
        toast.success('تمت الإضافة', product.label);
        setQuery('');
      } catch {
        toast.error('تعذر قراءة الباركود');
      }
    },
    [cart, toast],
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;

      if (event.key === 'F4') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (event.key === 'F8') {
        event.preventDefault();
        if (cart.cart.lines.length > 0) setPaymentOpen(true);
        return;
      }
      if (event.key === 'F2') {
        event.preventDefault();
        if (!typing) {
          cart.clear();
          setSelectedCustomer(null);
        }
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart]);

  // ── Checkout ──────────────────────────────────────────────────────────────
  const submit = ({ tenders, debtCustomer }: PaymentConfirmation) => {
    startSubmit(async () => {
      const response = await completeSaleAction({
        idempotencyKey: cart.cart.idempotencyKey,
        customerId: debtCustomer ? null : cart.cart.customerId,
        debtCustomer,
        lines: cart.cart.lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
        })),
        invoiceDiscount: cart.cart.invoiceDiscount,
        tenders: tenders.map((tender) => ({
          methodId: tender.methodId,
          amount: tender.amount,
          reference: tender.reference || null,
        })),
        note: cart.cart.note || null,
      });

      if (!response.ok) {
        toast.error('تعذر إتمام الفاتورة', response.error.message);
        return;
      }

      const sale = response.data;
      setPaymentOpen(false);
      setCartOpen(false);
      setSuccess({
        saleId: sale.saleId,
        number: sale.number,
        total: sale.total,
        change: sale.change,
        dueTotal: sale.dueTotal,
        customerName: sale.customerName,
      });

      cart.clear();
      setSelectedCustomer(null);
      setQuery('');
      // Stock changed — pull fresh quantities for the visible grid.
      void fetchProducts(query.trim(), category);
      router.refresh();
    });
  };

  const categoryOptions = [
    { value: 'all', label: 'الكل' },
    ...bootstrap.categories.map((entry) => ({
      value: entry.id,
      label: entry.name,
      color: entry.color,
      count: entry.count,
    })),
  ];

  const blockedByShift = requireShift && !bootstrap.openShift;

  return (
    <div className="-mx-3 -mt-4 flex min-h-[calc(100dvh-var(--header-height))] flex-col sm:-mx-5 sm:-mt-5 lg:flex-row">
      {/* ── Catalogue ──────────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-[var(--header-height)] z-10 border-b border-line-subtle bg-canvas/95 px-3 py-3 backdrop-blur sm:px-5">
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute inset-y-0 start-0 flex w-10 items-center justify-center text-tertiary">
                {loadingProducts ? (
                  <Loader2 className="size-4 animate-spin-slow" />
                ) : (
                  <Search className="size-4" />
                )}
              </span>
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  // A barcode scanner types fast and ends with Enter.
                  if (event.key === 'Enter' && query.trim().length >= 6 && /^\d+$/.test(query.trim())) {
                    event.preventDefault();
                    void addByBarcode(query);
                  }
                }}
                placeholder="ابحث بالاسم أو الكود، أو امسح الباركود…"
                className="h-12 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card ps-10 pe-10 text-[15px] text-primary placeholder:text-tertiary focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="مسح البحث"
                  className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-tertiary hover:text-primary"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>

            <Button
              variant="outline"
              size="icon-lg"
              onClick={() => setScanOpen(true)}
              aria-label="إدخال باركود"
              className="shrink-0"
            >
              <ScanLine className="size-5" />
            </Button>
          </div>

          {bootstrap.categories.length > 0 && (
            <ChipBar
              className="mt-2.5"
              options={categoryOptions}
              value={category}
              onChange={setCategory}
            />
          )}
        </div>

        <div className="flex-1 px-3 pb-36 pt-3 sm:px-5 lg:pb-6">
          {blockedByShift && (
            <Alert tone="warning" className="mb-3" title="لا توجد وردية مفتوحة">
              <span className="flex flex-wrap items-center gap-2">
                افتح وردية أولاً حتى تُحتسب مبيعاتك ونقدية الصندوق بشكل صحيح.
                <Link
                  href="/cashbox/shifts"
                  className="font-bold text-accent-strong underline-offset-4 hover:underline"
                >
                  فتح وردية
                </Link>
              </span>
            </Alert>
          )}

          {bootstrap.openShift && (
            <p className="mb-3 flex items-center gap-1.5 text-[12px] text-tertiary">
              <Timer className="size-3.5" />
              وردية <span className="num font-semibold">{bootstrap.openShift.number}</span> مفتوحة منذ{' '}
              {fmt.time(bootstrap.openShift.openedAt)}
            </p>
          )}

          <ProductGrid
            products={products}
            loading={loadingProducts && products.length === 0}
            searching={query.trim() !== '' || category !== 'all'}
            onSelect={(product) => {
              if (product.trackInventory && product.stock <= 0 && !bootstrap.settings.negativeStockAllowed) {
                toast.warning('الصنف غير متوفر', `${product.label} نفد من المخزون.`);
                return;
              }
              cart.add(product);
            }}
          />
        </div>
      </section>

      {/* ── Cart: side panel on desktop ────────────────────────────────── */}
      <aside className="hidden w-[380px] shrink-0 border-s border-line-subtle bg-card lg:block xl:w-[420px]">
        <div className="sticky top-[var(--header-height)] h-[calc(100dvh-var(--header-height))]">
          <CartPanel
            cart={cart.cart}
            totals={cart.totals}
            lineTotals={cart.lineTotals}
            taxEnabled={tax.enabled}
            taxInclusive={tax.inclusive}
            canDiscount={permissions.canDiscount}
            canEditPrice={permissions.canEditPrice}
            onQuantity={cart.setQuantity}
            onIncrement={cart.increment}
            onPrice={cart.setPrice}
            onDiscount={cart.setDiscount}
            onRemove={cart.remove}
            onInvoiceDiscount={cart.setInvoiceDiscount}
            onPickCustomer={() => setCustomerOpen(true)}
            onClearCustomer={() => {
              cart.setCustomer(null, null);
              setSelectedCustomer(null);
            }}
            onClear={() => {
              cart.clear();
              setSelectedCustomer(null);
            }}
            onCheckout={() => setPaymentOpen(true)}
          />
        </div>
      </aside>

      {/* ── Cart: sticky bar + sheet on phones ─────────────────────────── */}
      {cart.cart.lines.length > 0 && (
        <div className="safe-bottom fixed inset-x-0 bottom-[var(--bottom-nav-height)] z-30 border-t border-line bg-card/95 px-3 py-2.5 backdrop-blur-md lg:hidden">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="flex w-full items-center gap-3 rounded-[var(--radius-md)] bg-ink px-4 py-3 text-on-inverse"
          >
            <span className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10">
              <ShoppingCart className="size-4" />
              <span className="num absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-on-accent">
                {cart.totals.itemCount}
              </span>
            </span>
            <span className="min-w-0 flex-1 text-start">
              <span className="block text-[11.5px] opacity-70">الإجمالي</span>
              <span className="num block text-[17px] font-bold">{fmt.money(cart.totals.total)}</span>
            </span>
            <span className="shrink-0 rounded-[var(--radius-sm)] bg-accent px-3.5 py-2 text-[13.5px] font-bold text-on-accent">
              متابعة الدفع
            </span>
          </button>
        </div>
      )}

      <Modal
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        title="السلة"
        description={`${cart.totals.itemCount} صنف · ${branchName}`}
        size="md"
        className="lg:hidden"
      >
        <div className="-mx-5 -mb-5">
          <CartPanel
            embedded
            cart={cart.cart}
            totals={cart.totals}
            lineTotals={cart.lineTotals}
            taxEnabled={tax.enabled}
            taxInclusive={tax.inclusive}
            canDiscount={permissions.canDiscount}
            canEditPrice={permissions.canEditPrice}
            onQuantity={cart.setQuantity}
            onIncrement={cart.increment}
            onPrice={cart.setPrice}
            onDiscount={cart.setDiscount}
            onRemove={cart.remove}
            onInvoiceDiscount={cart.setInvoiceDiscount}
            onPickCustomer={() => setCustomerOpen(true)}
            onClearCustomer={() => {
              cart.setCustomer(null, null);
              setSelectedCustomer(null);
            }}
            onClear={() => {
              cart.clear();
              setSelectedCustomer(null);
              setCartOpen(false);
            }}
            onCheckout={() => setPaymentOpen(true)}
          />
        </div>
      </Modal>

      {/* ── Dialogs ────────────────────────────────────────────────────── */}
      <CustomerPicker
        open={customerOpen}
        recent={bootstrap.recentCustomers}
        canCreate={permissions.canCreateCustomer}
        onClose={() => setCustomerOpen(false)}
        onSelect={(customer) => {
          cart.setCustomer(customer.id, customer.name);
          setSelectedCustomer(customer);
        }}
      />

      <PaymentSheet
        open={paymentOpen}
        total={cart.totals.total}
        methods={bootstrap.paymentMethods}
        customer={
          cart.cart.customerId && cart.cart.customerName
            ? {
                name: cart.cart.customerName,
                phone: selectedCustomer?.phone ?? null,
                balance: selectedCustomer?.balance ?? null,
              }
            : null
        }
        debtEnabled={bootstrap.settings.debtEnabled}
        canSellOnCredit={permissions.canSellOnCredit}
        note={cart.cart.note}
        submitting={submitting}
        onNote={cart.setNote}
        onClose={() => setPaymentOpen(false)}
        onConfirm={submit}
      />

      {success && (
        <SaleSuccessDialog
          open
          number={success.number}
          total={success.total}
          change={success.change}
          dueTotal={success.dueTotal}
          customerName={success.customerName}
          saleId={success.saleId}
          onClose={() => setSuccess(null)}
          onPrint={() => {
            window.open(`/invoices/${success.saleId}/print`, '_blank', 'noopener');
          }}
        />
      )}

      <BarcodeDialog
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onSubmit={(code) => {
          setScanOpen(false);
          void addByBarcode(code);
        }}
      />
    </div>
  );
}

function BarcodeDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState('');

  useEffect(() => {
    if (!open) setCode('');
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="إدخال الباركود"
      description="امسح الباركود بالقارئ أو اكتب الرقم يدوياً"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={!code.trim()} onClick={() => onSubmit(code)}>
            إضافة للسلة
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-3">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-accent-strong">
          <Package className="size-6" />
        </span>
        <input
          data-autofocus
          inputMode="numeric"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && code.trim()) onSubmit(code);
          }}
          placeholder="6281000000011"
          className="num h-12 w-full rounded-[var(--radius-sm)] border border-line-strong bg-card px-3 text-center text-[17px] font-bold focus:border-accent-strong focus:shadow-[var(--ring-accent)] focus:outline-none"
        />
      </div>
    </Modal>
  );
}
