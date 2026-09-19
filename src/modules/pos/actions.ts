'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { runAction } from '@/core/action';
import { requirePermission, requireWritePermission } from '@/core/auth/context';
import { transaction } from '@/core/db';
import { businessRule, validation } from '@/core/errors';
import { claimIdempotencyKey, completeIdempotencyKey, hashRequest } from '@/core/idempotency';
import type { ActionResult } from '@/core/result';
import { isValidPhone, normalizePhone } from '@/lib/phone';
import { createSale, type SaleLineRequest } from '@/modules/sales/service';
import { resolveDebtCustomer } from '@/modules/customers/service';
import { toFieldErrors } from '@/modules/auth/validation';
import { searchPosCustomers, type PosCustomerOption } from './queries';

/**
 * Point-of-sale actions.
 *
 * Completing a sale is the single most important write in the product, so it
 * carries three guards: the permission check, an idempotency claim, and one
 * database transaction that either does everything or nothing.
 */

const cartLineSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive('الكمية يجب أن تكون أكبر من صفر'),
  unitPrice: z.number().int().min(0).optional(),
  discount: z.number().int().min(0).optional(),
});

const tenderSchema = z.object({
  methodId: z.string().min(1),
  amount: z.number().int().positive(),
  reference: z.string().max(80).optional().nullable(),
});

const completeSaleSchema = z.object({
  idempotencyKey: z.string().min(8).max(80),
  customerId: z.string().min(1).nullable().optional(),
  /**
   * "دين": record the sale against the customer with this phone number,
   * creating them if they are new. Takes the place of `customerId`.
   */
  debtCustomer: z
    .object({
      name: z.string().trim().min(2, 'أدخل اسم العميل').max(80, 'الاسم طويل جداً'),
      phone: z.string().trim().refine(isValidPhone, 'أدخل رقم هاتف صحيح'),
    })
    .nullable()
    .optional(),
  lines: z.array(cartLineSchema).min(1, 'أضف صنفاً واحداً على الأقل').max(200),
  invoiceDiscount: z.number().int().min(0).default(0),
  tenders: z.array(tenderSchema).max(6).default([]),
  note: z.string().max(500).optional().nullable(),
});

export type CompleteSaleInput = z.input<typeof completeSaleSchema>;

export interface CompleteSaleOutput {
  saleId: string;
  number: string;
  total: number;
  paidTotal: number;
  dueTotal: number;
  change: number;
  duplicate: boolean;
  /** Whose account the sale is on — the name on file, not necessarily the one typed. */
  customerName: string | null;
}

export async function completeSaleAction(
  input: CompleteSaleInput,
): Promise<ActionResult<CompleteSaleOutput>> {
  return runAction('pos.completeSale', async () => {
    const context = await requireWritePermission('sales.create');
    const { store, user } = context;

    const parsed = completeSaleSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات الفاتورة', toFieldErrors(parsed.error));
    }
    const data = parsed.data;

    const permissions = {
      canDiscount: store.isOwner || store.permissions.has('sales.discount'),
      canEditPrice: store.isOwner || store.permissions.has('sales.price_edit'),
      canSellOnCredit: store.isOwner || store.permissions.has('sales.credit'),
    };

    const requestHash = hashRequest({
      lines: data.lines,
      tenders: data.tenders,
      customerId: data.customerId ?? null,
      debtCustomer: data.debtCustomer ?? null,
      invoiceDiscount: data.invoiceDiscount,
    });

    const result = await transaction(
      async (tx) => {
        // A replayed request — the cashier double-tapped, or the PWA flushed a
        // queued sale twice — returns the original invoice instead of a second
        // one. The unique index makes concurrent replays wait, not duplicate.
        const claim = await claimIdempotencyKey(tx, {
          storeId: store.id,
          scope: 'sale.create',
          key: data.idempotencyKey,
          requestHash,
        });

        if (claim.status === 'duplicate') {
          if (!claim.resultId) {
            throw businessRule('هذه العملية قيد التنفيذ بالفعل. انتظر لحظة ثم تحقق من الفواتير.');
          }
          const existing = await tx.sale.findUniqueOrThrow({
            where: { id: claim.resultId },
            select: {
              id: true,
              number: true,
              total: true,
              paidTotal: true,
              dueTotal: true,
              customer: { select: { name: true } },
            },
          });
          return {
            saleId: existing.id,
            number: existing.number,
            total: Number(existing.total),
            paidTotal: Number(existing.paidTotal),
            dueTotal: Number(existing.dueTotal),
            change: 0,
            duplicate: true,
            customerName: existing.customer?.name ?? null,
          } satisfies CompleteSaleOutput;
        }

        // "دين" with a name and phone: find or create the customer first, in
        // this same transaction, so a failed sale leaves no stray customer.
        const debtCustomer = data.debtCustomer
          ? await resolveDebtCustomer(tx, {
              storeId: store.id,
              userId: user.id,
              name: data.debtCustomer.name,
              phone: data.debtCustomer.phone,
              canCreate: store.isOwner || store.permissions.has('customers.create'),
            })
          : null;
        const customerId = debtCustomer?.id ?? data.customerId ?? null;

        // Attach the sale to the cashier's open shift, if they have one.
        const shift = await tx.shift.findFirst({
          where: {
            storeId: store.id,
            branchId: store.branch.id,
            userId: user.id,
            status: 'OPEN',
          },
          select: { id: true },
        });

        const lines: SaleLineRequest[] = data.lines.map((line) => ({
          variantId: line.variantId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
        }));

        const sale = await createSale(tx, {
          storeId: store.id,
          branchId: store.branch.id,
          userId: user.id,
          shiftId: shift?.id ?? null,
          customerId,
          lines,
          invoiceDiscount: data.invoiceDiscount,
          tenders: data.tenders.map((tender) => ({
            methodId: tender.methodId,
            amount: tender.amount,
            reference: tender.reference ?? null,
          })),
          note: data.note ?? null,
          permissions,
        });

        await completeIdempotencyKey(tx, {
          storeId: store.id,
          scope: 'sale.create',
          key: data.idempotencyKey,
          resultId: sale.saleId,
        });

        const customerName =
          debtCustomer?.name ??
          (customerId
            ? ((
                await tx.customer.findUnique({ where: { id: customerId }, select: { name: true } })
              )?.name ?? null)
            : null);

        return { ...sale, duplicate: false, customerName } satisfies CompleteSaleOutput;
      },
      { timeoutMs: 20_000 },
    );

    revalidatePath('/dashboard');
    revalidatePath('/invoices');
    if (result.dueTotal > 0) {
      revalidatePath('/debts');
      revalidatePath('/customers');
    }
    return result;
  });
}

// ── Customer helpers used inside the POS ─────────────────────────────────────

export async function searchCustomersAction(
  query: string,
): Promise<ActionResult<PosCustomerOption[]>> {
  return runAction('pos.searchCustomers', async () => {
    const { store } = await requirePermission('customers.view', 'sales.create');
    return searchPosCustomers(store.id, query.slice(0, 60));
  });
}

const quickCustomerSchema = z.object({
  name: z.string().trim().min(2, 'أدخل اسم العميل').max(80),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[\d\s-]{7,20}$/, 'رقم هاتف غير صالح')
    .optional()
    .or(z.literal('')),
});

/** Add a customer without leaving the till — a requirement of the sales flow. */
export async function quickCreateCustomerAction(
  input: z.input<typeof quickCustomerSchema>,
): Promise<ActionResult<PosCustomerOption>> {
  return runAction('pos.quickCreateCustomer', async () => {
    const context = await requireWritePermission('customers.create');
    const parsed = quickCustomerSchema.safeParse(input);
    if (!parsed.success) {
      throw validation('تحقق من بيانات العميل', toFieldErrors(parsed.error));
    }

    const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) || null : null;

    if (phone) {
      const existing = await transaction(async (tx) =>
        tx.customer.findFirst({
          where: { storeId: context.store.id, phone, deletedAt: null },
          select: { id: true, name: true, phone: true, balance: true, debtLimit: true },
        }),
      );
      if (existing) {
        throw validation('هذا الرقم مسجل لعميل آخر', {
          phone: [`الرقم مسجل باسم ${existing.name}`],
        });
      }
    }

    const customer = await transaction(async (tx) =>
      tx.customer.create({
        data: {
          storeId: context.store.id,
          name: parsed.data.name,
          phone,
        },
        select: { id: true, name: true, phone: true, balance: true, debtLimit: true },
      }),
    );

    revalidatePath('/customers');

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      balance: Number(customer.balance),
      debtLimit: Number(customer.debtLimit),
    };
  });
}
