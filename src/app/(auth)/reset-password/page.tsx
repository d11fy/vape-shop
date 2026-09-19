import type { Metadata } from 'next';

import { firstParam } from '@/lib/table-query';
import { ResetPasswordForm } from '@/modules/auth/password-forms';
import { ButtonLink } from '@/ui/primitives/button';

export const metadata: Metadata = { title: 'إعادة تعيين كلمة المرور' };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = firstParam(params, 'token');

  if (!token) {
    return (
      <div className="text-center">
        <h1 className="text-[22px] font-bold text-primary">رابط غير صالح</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-secondary">
          الرابط الذي فتحته غير مكتمل أو منتهي الصلاحية. اطلب رابطاً جديداً.
        </p>
        <ButtonLink href="/forgot-password" variant="primary" className="mt-6">
          طلب رابط جديد
        </ButtonLink>
      </div>
    );
  }

  return <ResetPasswordForm token={token} />;
}
