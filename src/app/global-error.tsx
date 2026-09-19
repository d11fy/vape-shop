'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for failures in the root layout itself, where the app
 * shell, fonts and stylesheet may not be available — hence plain inline styles.
 * Like every error screen here: one Arabic sentence, no technical detail.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[vape-shop] fatal error', error.digest ?? error.message);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px 16px',
          background: '#f7f8fa',
          color: '#111827',
          fontFamily: "'IBM Plex Sans Arabic', 'Segoe UI', Tahoma, system-ui, sans-serif",
          textAlign: 'center',
        }}
      >
        <main style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>تعذّر تشغيل التطبيق</h1>
          <p style={{ fontSize: 14, lineHeight: 1.8, color: '#6b7280', marginTop: 10 }}>
            حدث خلل غير متوقع. لم تُحفظ أي عملية ناقصة. أعد المحاولة، وإن تكرر الأمر تواصل مع
            الدعم الفني.
          </p>
          {error.digest && (
            <p style={{ fontSize: 12, color: '#9ca3af' }}>
              رقم الخطأ: <span dir="ltr">{error.digest}</span>
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              height: 44,
              padding: '0 24px',
              border: 0,
              borderRadius: 10,
              background: '#161b22',
              color: '#fff',
              fontSize: 15,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            إعادة المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
