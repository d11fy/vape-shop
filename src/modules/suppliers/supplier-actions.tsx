'use client';

import { useState } from 'react';
import { Banknote } from 'lucide-react';

import { Button } from '@/ui/primitives/button';
import { PaySupplierDialog } from './pay-dialog';

/** The pay button on a supplier's page, with its dialog. */
export function SupplierActions({
  supplier,
  paymentMethods,
  canPay,
}: {
  supplier: { id: string; name: string; balance: number };
  paymentMethods: Array<{ id: string; name: string; affectsCashbox: boolean }>;
  canPay: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!canPay || supplier.balance <= 0) return null;

  return (
    <>
      <Button
        variant="accent"
        onClick={() => setOpen(true)}
        iconStart={<Banknote className="size-4" />}
      >
        سداد دفعة
      </Button>

      <PaySupplierDialog
        open={open}
        supplier={supplier}
        paymentMethods={paymentMethods}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
