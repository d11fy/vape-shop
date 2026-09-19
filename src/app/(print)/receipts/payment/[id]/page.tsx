import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { CHANGE_PASSWORD_PATH, can, getAuthContext } from '@/core/auth/context';
import { getReceiptStore } from '@/modules/invoices/queries';
import { PrintShell } from '@/modules/invoices/print-toolbar';
import { getPaymentVoucher } from '@/modules/payments/queries';
import { PaymentVoucherDocument } from '@/modules/payments/voucher';

export const metadata: Metadata = { title: 'طباعة سند' };

export default async function PaymentVoucherPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthContext();
  if (!context?.store) redirect('/login');
  if (context.user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);

  const { id } = await params;
  const query = await searchParams;

  const [voucher, store] = await Promise.all([
    getPaymentVoucher(context.store.id, id),
    getReceiptStore(context.store.id),
  ]);
  if (!voucher || !store) notFound();

  // A voucher shows a party's balance, so it follows that party's permission.
  const allowed =
    voucher.party?.kind === 'customer'
      ? can(context.store, 'debts.view', 'debts.collect', 'customers.view')
      : voucher.party?.kind === 'supplier'
        ? can(context.store, 'suppliers.view', 'suppliers.pay')
        : can(context.store, 'cashbox.view', 'sales.view');
  if (!allowed) notFound();

  const back = voucher.party
    ? voucher.party.kind === 'customer'
      ? { href: `/customers/${voucher.party.id}`, label: 'رجوع لملف العميل' }
      : { href: `/suppliers/${voucher.party.id}`, label: 'رجوع لملف المورد' }
    : { href: '/cashbox', label: 'رجوع للصندوق' };

  return (
    <PrintShell
      backHref={back.href}
      backLabel={back.label}
      autoPrint={query.auto !== '0'}
      thermal={<PaymentVoucherDocument voucher={voucher} store={store} format="thermal" />}
      a4={<PaymentVoucherDocument voucher={voucher} store={store} format="a4" />}
    />
  );
}
