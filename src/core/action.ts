import 'server-only';

import { normalizeError } from '@/core/errors';
import { logger } from '@/core/logger';
import { fail, ok, type ActionResult } from '@/core/result';

/**
 * The single entry point for every server action body.
 *
 * It converts thrown errors into the `ActionResult` union the client expects,
 * keeps technical detail out of the user's face, and makes sure nothing fails
 * silently: anything unexpected is logged with its stack before the generic
 * Arabic message goes back over the wire.
 */
export async function runAction<T>(
  name: string,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (error) {
    // `redirect()` and `notFound()` throw control-flow signals Next must see.
    if (isFrameworkSignal(error)) throw error;

    const appError = normalizeError(error);

    if (appError.code === 'INTERNAL') {
      logger.error(`action ${name} failed`, { detail: appError.detail, error });
    } else {
      logger.debug(`action ${name} rejected`, { code: appError.code, message: appError.message });
    }

    return fail(appError.code, appError.message, {
      fieldErrors: appError.fieldErrors,
      meta: appError.meta,
    });
  }
}

function isFrameworkSignal(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === 'string' && (digest.startsWith('NEXT_') || digest === 'DYNAMIC_SERVER_USAGE');
}
