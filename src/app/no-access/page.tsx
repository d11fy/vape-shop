import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ShieldOff } from 'lucide-react';

import { getAuthContext } from '@/core/auth/context';
import { signOutAction } from '@/modules/shell/actions';
import { Button } from '@/ui/primitives/button';
import { Wordmark } from '@/ui/brand/logo';

export const metadata: Metadata = { title: 'لا يوجد وصول' };

export default async function NoAccessPage() {
  const context = await getAuthContext();
  if (!context) redirect('/login');
  if (context.memberships.length > 0) redirect('/select-store');
  if (context.isPlatformAdmin) redirect('/platform');

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-center">
      <Wordmark size="md" className="mb-10" />

      <span className="flex size-16 items-center justify-center rounded-full bg-warning-soft text-warning">
        <ShieldOff className="size-8" />
      </span>

      <h1 className="mt-6 text-[22px] font-bold text-primary">حسابك غير مرتبط بأي متجر</h1>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-secondary">
        تم إنشاء حسابك بنجاح، لكن لم يُضَف بعد إلى أي متجر. اطلب من صاحب المحل إضافتك إلى فريق
        العمل، أو أنشئ متجرك الخاص.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            تسجيل الخروج
          </Button>
        </form>
      </div>

      <p className="num mt-8 text-[12.5px] text-tertiary">{context.user.email}</p>
    </div>
  );
}
