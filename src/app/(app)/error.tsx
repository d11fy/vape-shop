'use client';

import { useEffect } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

import { Button, ButtonLink } from '@/ui/primitives/button';

/**
 * The user-facing failure screen. It never shows a stack trace or a database
 * message — those go to the server log. What the shopkeeper gets is a plain
 * sentence and a way forward.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The digest is the only handle that ties this screen to the server log.
    console.error('[vape-shop] unhandled error', error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertOctagon className="size-7" />
      </span>

      <h1 className="mt-5 text-[19px] font-bold text-primary">تعذر عرض هذه الصفحة</h1>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-secondary">
        حدث خلل غير متوقع ولم تُحفظ أي بيانات ناقصة. جرّب إعادة المحاولة، وإذا تكرر الأمر تواصل مع
        الدعم الفني.
      </p>

      {error.digest && (
        <p className="num-mixed mt-3 rounded-[var(--radius-sm)] bg-sunken px-2.5 py-1 text-[11.5px] text-tertiary">
          رقم الخطأ: {error.digest}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={reset} iconStart={<RefreshCw className="size-4" />}>
          إعادة المحاولة
        </Button>
        <ButtonLink href="/dashboard" variant="outline">العودة للرئيسية</ButtonLink>
      </div>
    </div>
  );
}
