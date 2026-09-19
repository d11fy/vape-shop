import 'server-only';

/**
 * Validated server environment. Importing this module fails fast and loudly at
 * boot rather than letting a missing secret surface as a runtime 500 later.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `متغير البيئة ${name} غير معرّف. انسخ ملف .env.example إلى .env وأكمل القيم.`,
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const authSecret = required('AUTH_SECRET');
if (authSecret.length < 32 && process.env.NODE_ENV === 'production') {
  throw new Error('AUTH_SECRET يجب أن يكون 32 حرفاً على الأقل في بيئة الإنتاج.');
}

export const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  DATABASE_URL: required('DATABASE_URL'),
  AUTH_SECRET: authSecret,
  APP_URL: optional('NEXT_PUBLIC_APP_URL', 'http://localhost:3000'),
  SESSION_DAYS: integer('SESSION_DAYS', 30),
  ALLOW_PUBLIC_SIGNUP: optional('ALLOW_PUBLIC_SIGNUP', '1') === '1',
  /** Shown on the help and subscription pages. */
  SUPPORT_EMAIL: optional('SUPPORT_EMAIL', 'support@vapeshop.app'),
  /** Optional — the phone link is only rendered when this is set. */
  SUPPORT_PHONE: optional('SUPPORT_PHONE', ''),
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
} as const;
