import { NextResponse } from 'next/server';

import { getApiStoreContext } from '@/core/auth/context';
import { db } from '@/core/db';

/**
 * Active payment methods for the current store.
 *
 * Exposed as a route handler so dialogs rendered deep inside client tables can
 * fetch the list on demand instead of every parent page passing it down.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const context = await getApiStoreContext();
  if (!context) {
    return NextResponse.json({ methods: [] }, { status: 401 });
  }

  const methods = await db.paymentMethod.findMany({
    where: { storeId: context.store.id, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }],
    select: { id: true, name: true, type: true, affectsCashbox: true, isDefault: true },
  });

  return NextResponse.json({ methods });
}
