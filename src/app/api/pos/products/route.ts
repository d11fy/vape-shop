import { NextResponse } from 'next/server';

import { getApiStoreContext } from '@/core/auth/context';
import { enforceRateLimit } from '@/core/rate-limit';
import { findByBarcode, searchPosProducts } from '@/modules/pos/queries';

/**
 * Catalogue search for the till.
 *
 * A route handler rather than a server action because the POS calls it on every
 * keystroke: it needs to be cancellable with `AbortController`, which server
 * actions do not support.
 */

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const context = await getApiStoreContext();
  if (!context) {
    return NextResponse.json({ products: [] }, { status: 401 });
  }

  const { store } = context;
  if (!store.isOwner && !store.permissions.has('sales.create') && !store.permissions.has('products.view')) {
    return NextResponse.json({ products: [] }, { status: 403 });
  }

  try {
    enforceRateLimit('search', `pos:${context.user.id}`);
  } catch {
    return NextResponse.json({ products: [] }, { status: 429 });
  }

  const url = new URL(request.url);
  const barcode = url.searchParams.get('barcode');

  // An exact barcode scan short-circuits: one row, added straight to the cart.
  if (barcode) {
    const product = await findByBarcode(store.id, store.branch.id, barcode.trim());
    return NextResponse.json({ products: product ? [product] : [] });
  }

  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 60);
  const categoryId = url.searchParams.get('category') ?? undefined;

  const products = await searchPosProducts(store.id, store.branch.id, {
    query: query || undefined,
    categoryId: categoryId && categoryId !== 'all' ? categoryId : undefined,
  });

  return NextResponse.json({ products });
}
