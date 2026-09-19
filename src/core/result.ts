import type { ErrorCode, FieldErrors } from '@/core/errors';

/**
 * The single shape every server action returns. Actions never throw across the
 * network boundary — they resolve with a discriminated union the client can
 * narrow without try/catch.
 */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: {
        code: ErrorCode;
        message: string;
        fieldErrors?: FieldErrors;
        meta?: Record<string, unknown>;
      };
    };

export function ok(): ActionResult<void>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(
  code: ErrorCode,
  message: string,
  extra?: { fieldErrors?: FieldErrors; meta?: Record<string, unknown> },
): ActionResult<never> {
  return { ok: false, error: { code, message, ...extra } };
}
