import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';

import { ToastProvider } from '@/ui/feedback/toast';
import { ConnectionBanner } from '@/ui/pwa/connection-banner';
import { ServiceWorkerRegistrar } from '@/ui/pwa/service-worker';
import { THEME_COOKIE } from '@/ui/theme';
import './globals.css';

/**
 * IBM Plex Sans Arabic: a humanist Arabic face designed for interfaces and
 * numbers — it keeps long product names legible at 13px and its digits are
 * unambiguous on a receipt.
 */
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
  fallback: ['Segoe UI', 'Tahoma', 'system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: {
    default: 'ڤيب شوب | Vape Shop',
    template: '%s · ڤيب شوب',
  },
  description:
    'نظام احترافي متكامل لإدارة محلات المعسل ومنتجات التدخين — مبيعات، مخزون، ديون، مصاريف وتقارير دقيقة.',
  applicationName: 'ڤيب شوب',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'ڤيب شوب',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0e13' },
  ],
};

/**
 * The theme comes from a cookie and is rendered as `data-theme` on `<html>`,
 * so the very first paint is already the right colour. No inline bootstrap
 * script, no flash. When the cookie is absent the stylesheet falls back to
 * `prefers-color-scheme`.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const stored = cookieStore.get(THEME_COOKIE)?.value;
  const theme = stored === 'dark' || stored === 'light' ? stored : undefined;

  return (
    <html
      lang="ar"
      dir="rtl"
      className={arabic.variable}
      data-theme={theme}
      suppressHydrationWarning
    >
      <body className="min-h-dvh antialiased">
        <ToastProvider>{children}</ToastProvider>
        <ConnectionBanner />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
