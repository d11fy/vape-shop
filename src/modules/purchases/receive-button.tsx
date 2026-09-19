'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PackageCheck } from 'lucide-react';

import { Button } from '@/ui/primitives/button';
import { useConfirm } from '@/ui/feedback/confirm';
import { useToast } from '@/ui/feedback/toast';
import { receivePurchaseAction } from '@/modules/suppliers/actions';

/**
 * Approving a draft purchase is the moment stock and cost change, so it asks
 * first and says exactly what will happen.
 */
export function ReceivePurchaseButton({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [pending, startTransition] = useTransition();

  const receive = async () => {
    const approved = await confirm({
      title: 'اعتماد واستلام البضاعة؟',
      tone: 'warning',
      message:
        'ستُضاف الكميات إلى مخزون الفرع، ويُعاد حساب متوسط تكلفة كل صنف، ويُسجَّل المبلغ على حساب المورد.',
      confirmLabel: 'اعتماد واستلام',
    });

    if (!approved) return;

    startTransition(async () => {
      const response = await receivePurchaseAction(purchaseId);
      if (!response.ok) {
        toast.error('تعذر اعتماد الفاتورة', response.error.message);
        return;
      }
      toast.success('تم استلام البضاعة', 'تم تحديث المخزون والتكلفة');
      router.refresh();
    });
  };

  return (
    <Button
      variant="accent"
      loading={pending}
      onClick={receive}
      iconStart={<PackageCheck className="size-4" />}
    >
      اعتماد واستلام
    </Button>
  );
}
