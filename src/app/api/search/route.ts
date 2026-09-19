import { NextResponse } from 'next/server';

import { getApiStoreContext } from '@/core/auth/context';
import { db } from '@/core/db';
import { enforceRateLimit } from '@/core/rate-limit';
import { normalizeDigits } from '@/core/money';
import { ALL_NAV_ITEMS } from '@/modules/shell/navigation';

/**
 * Global search.
 *
 * Every branch of the query is scoped by `storeId` and filtered by the caller's
 * permissions — a cashier searching for a supplier gets nothing back, not a
 * permission error, because they should not learn that the record exists.
 */

export const dynamic = 'force-dynamic';

interface SearchHit {
  id: string;
  type: 'product' | 'invoice' | 'customer' | 'supplier' | 'employee' | 'page';
  title: string;
  subtitle?: string;
  href: string;
  badge?: string;
}

export async function GET(request: Request) {
  const context = await getApiStoreContext();
  if (!context) {
    return NextResponse.json({ hits: [] }, { status: 401 });
  }

  const { store } = context;
  const url = new URL(request.url);
  const raw = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (raw.length < 2) return NextResponse.json({ hits: [] });

  try {
    enforceRateLimit('search', context.user.id);
  } catch {
    return NextResponse.json({ hits: [] }, { status: 429 });
  }

  const query = normalizeDigits(raw);
  const allow = (permission: string) => store.isOwner || store.permissions.has(permission);
  const hits: SearchHit[] = [];

  // Navigation shortcuts first — typing "مصار" should jump to المصاريف.
  for (const item of ALL_NAV_ITEMS) {
    if (!item.label.includes(query)) continue;
    if (!store.isOwner && !item.permissions.some((permission) => store.permissions.has(permission))) {
      continue;
    }
    hits.push({
      id: item.href,
      type: 'page',
      title: item.label,
      subtitle: item.description,
      href: item.href,
    });
  }

  const tasks: Array<Promise<void>> = [];

  if (allow('products.view')) {
    tasks.push(
      db.productVariant
        .findMany({
          where: {
            storeId: store.id,
            deletedAt: null,
            OR: [
              { sku: { contains: query, mode: 'insensitive' } },
              { barcode: query },
              { name: { contains: query, mode: 'insensitive' } },
              { product: { name: { contains: query, mode: 'insensitive' } } },
            ],
          },
          take: 6,
          orderBy: { product: { name: 'asc' } },
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
            product: { select: { id: true, name: true } },
          },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'product',
              title: `${row.product.name}${row.name !== 'افتراضي' ? ` — ${row.name}` : ''}`,
              subtitle: row.sku,
              href: `/products/${row.product.id}`,
            });
          }
        }),
    );
  }

  if (allow('sales.view')) {
    const seeAll = store.isOwner || store.permissions.has('sales.view_all');
    tasks.push(
      db.sale
        .findMany({
          where: {
            storeId: store.id,
            deletedAt: null,
            number: { contains: query, mode: 'insensitive' },
            ...(seeAll ? {} : { userId: context.user.id }),
          },
          take: 6,
          orderBy: { soldAt: 'desc' },
          select: {
            id: true,
            number: true,
            total: true,
            soldAt: true,
            customer: { select: { name: true } },
          },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'invoice',
              title: row.number,
              subtitle: row.customer?.name ?? 'عميل نقدي',
              href: `/invoices/${row.id}`,
            });
          }
        }),
    );
  }

  if (allow('customers.view')) {
    tasks.push(
      db.customer
        .findMany({
          where: {
            storeId: store.id,
            deletedAt: null,
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query } },
            ],
          },
          take: 6,
          orderBy: { name: 'asc' },
          select: { id: true, name: true, phone: true, balance: true },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'customer',
              title: row.name,
              subtitle: row.phone ?? undefined,
              href: `/customers/${row.id}`,
            });
          }
        }),
    );
  }

  if (allow('suppliers.view')) {
    tasks.push(
      db.supplier
        .findMany({
          where: {
            storeId: store.id,
            deletedAt: null,
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { phone: { contains: query } },
            ],
          },
          take: 4,
          orderBy: { name: 'asc' },
          select: { id: true, name: true, phone: true },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.id,
              type: 'supplier',
              title: row.name,
              subtitle: row.phone ?? undefined,
              href: `/suppliers/${row.id}`,
            });
          }
        }),
    );
  }

  if (allow('employees.view')) {
    tasks.push(
      db.storeUser
        .findMany({
          where: {
            storeId: store.id,
            user: { name: { contains: query, mode: 'insensitive' } },
          },
          take: 4,
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true } },
            role: { select: { nameAr: true } },
          },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: row.user.id,
              type: 'employee',
              title: row.user.name,
              subtitle: row.role.nameAr,
              href: `/employees?member=${row.id}`,
            });
          }
        }),
    );
  }

  await Promise.all(tasks);

  return NextResponse.json({ hits: hits.slice(0, 24) });
}
