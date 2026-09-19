import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { CHANGE_PASSWORD_PATH, can, getAuthContext } from '@/core/auth/context';
import { getInvoice, getReceiptStore } from '@/modules/invoices/queries';
import { Receipt } from '@/modules/invoices/receipt';
import { PrintShell } from '@/modules/invoices/print-toolbar';

export const metadata: Metadata = { title: 'طباعة الفاتورة' };

export default async function PrintInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getAuthContext();
  if (!context?.store) redirect('/login');
  if (context.user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  if (!can(context.store, 'sales.view')) notFound();

  const { id } = await params;
  const query = await searchParams;

  const [invoice, store] = await Promise.all([
    getInvoice(context.store.id, id),
    getReceiptStore(context.store.id),
  ]);

  if (!invoice || !store) notFound();

  // Staff without `sales.view_all` may only print their own invoices.
  if (!can(context.store, 'sales.view_all') && invoice.cashier.id !== context.user.id) notFound();

  // A reprint is flagged on the document itself, so a duplicate can never be
  // mistaken for the original.
  const reprint = query.reprint === '1';
  const autoPrint = query.auto !== '0';

  return (
    <PrintShell
      backHref={`/invoices/${invoice.id}`}
      autoPrint={autoPrint}
      thermal={<Receipt invoice={invoice} store={store} format="thermal" reprint={reprint} />}
      a4={<Receipt invoice={invoice} store={store} format="a4" reprint={reprint} />}
    />
  );
}
