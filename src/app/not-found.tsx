import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';

import { Wordmark } from '@/ui/brand/logo';
import { ButtonLink } from '@/ui/primitives/button';

export const metadata: Metadata = { title: 'الصفحة غير موجودة' };

/**
 * Shown for any unknown address and for records that do not exist — or that
 * belong to another store, which is deliberately indistinguishable: a tenant
 * must not learn that someone else's invoice id is real.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-5 py-12 text-center">
      <Wordmark size="sm" className="mb-10" />
      <span className="flex size-16 items-center justify-center rounded-full bg-sunken text-secondary">
        <SearchX className="size-7" aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-[21px] font-bold text-primary">الصفحة غير موجودة</h1>
      <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-secondary">
        الرابط غير صحيح، أو أن السجل الذي تبحث عنه حُذف أو لا تملك صلاحية الوصول إليه.
      </p>
      <ButtonLink href="/" variant="primary" className="mt-6">
        العودة للرئيسية
      </ButtonLink>
    </div>
  );
}
