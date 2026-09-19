import type { Metadata } from 'next';

import { requirePermission } from '@/core/auth/context';
import { getPosBootstrap } from '@/modules/pos/queries';
import { PosScreen } from '@/modules/pos/pos-screen';

export const metadata: Metadata = { title: 'نقطة البيع' };

/** The till is always live data — never served from a cache. */
export const dynamic = 'force-dynamic';

export default async function PosPage() {
  const { store, user } = await requirePermission('sales.create');

  const bootstrap = await getPosBootstrap(store.id, store.branch.id, user.id);

  return (
    <PosScreen
      bootstrap={bootstrap}
      branchId={store.branch.id}
      branchName={store.branch.name}
      permissions={{
        canDiscount: store.isOwner || store.permissions.has('sales.discount'),
        canEditPrice: store.isOwner || store.permissions.has('sales.price_edit'),
        canSellOnCredit: store.isOwner || store.permissions.has('sales.credit'),
        canCreateCustomer: store.isOwner || store.permissions.has('customers.create'),
      }}
      // Shifts matter for cashiers; owners and managers often ring up a sale
      // without opening one, so it is a nudge rather than a hard block.
      requireShift={store.roleKey === 'cashier'}
    />
  );
}
