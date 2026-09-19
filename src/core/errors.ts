/**
 * Application errors.
 *
 * Rule: the user never sees a technical message. Every error that reaches the
 * UI carries a clear Arabic sentence; the stack and the database detail go to
 * the log instead.
 */

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'PLAN_LIMIT'
  | 'SUBSCRIPTION'
  | 'READ_ONLY'
  | 'RATE_LIMIT'
  | 'INTERNAL';

export interface FieldErrors {
  [field: string]: string[] | undefined;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors?: FieldErrors;
  readonly meta?: Record<string, unknown>;
  /** Technical detail kept out of the user-facing message. */
  readonly detail?: string;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      status?: number;
      fieldErrors?: FieldErrors;
      meta?: Record<string, unknown>;
      detail?: string;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? defaultStatus(code);
    this.fieldErrors = options.fieldErrors;
    this.meta = options.meta;
    this.detail = options.detail;
  }
}

function defaultStatus(code: ErrorCode): number {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 401;
    case 'FORBIDDEN':
    case 'READ_ONLY':
    case 'PLAN_LIMIT':
    case 'SUBSCRIPTION':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'VALIDATION':
      return 422;
    case 'CONFLICT':
      return 409;
    case 'BUSINESS_RULE':
      return 400;
    case 'RATE_LIMIT':
      return 429;
    default:
      return 500;
  }
}

export const unauthenticated = (message = 'انتهت الجلسة. يرجى تسجيل الدخول مرة أخرى.') =>
  new AppError('UNAUTHENTICATED', message);

export const forbidden = (message = 'ليس لديك صلاحية للقيام بهذا الإجراء.') =>
  new AppError('FORBIDDEN', message);

export const notFound = (what = 'السجل المطلوب') =>
  new AppError('NOT_FOUND', `${what} غير موجود.`);

export const validation = (message: string, fieldErrors?: FieldErrors) =>
  new AppError('VALIDATION', message, { fieldErrors });

export const conflict = (message: string) => new AppError('CONFLICT', message);

export const businessRule = (message: string, meta?: Record<string, unknown>) =>
  new AppError('BUSINESS_RULE', message, { meta });

export const planLimit = (message: string, meta?: Record<string, unknown>) =>
  new AppError('PLAN_LIMIT', message, { meta });

export const readOnly = (
  message = 'الاشتراك منتهي. النظام يعمل حالياً بوضع القراءة فقط.',
) => new AppError('READ_ONLY', message);

export const rateLimited = (message = 'محاولات كثيرة جداً. حاول مرة أخرى بعد قليل.') =>
  new AppError('RATE_LIMIT', message);

/** Known Prisma error codes we can translate into something a human understands. */
const PRISMA_MESSAGES: Record<string, string> = {
  P2002: 'هذه القيمة مستخدمة من قبل. جرّب قيمة أخرى.',
  P2003: 'لا يمكن إتمام العملية لأن السجل مرتبط بسجلات أخرى.',
  P2025: 'السجل المطلوب غير موجود أو تم حذفه.',
  P2034: 'تعارض في العمليات المتزامنة. يرجى المحاولة مرة أخرى.',
};

interface PrismaLikeError {
  code?: string;
  meta?: { target?: string[] | string };
  message?: string;
}

/**
 * Normalise anything thrown anywhere in the stack into an `AppError`.
 * Unknown failures collapse to a single generic Arabic sentence.
 */
export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as PrismaLikeError;
    const known = prismaError.code ? PRISMA_MESSAGES[prismaError.code] : undefined;
    if (known) {
      const target = prismaError.meta?.target;
      return new AppError(prismaError.code === 'P2025' ? 'NOT_FOUND' : 'CONFLICT', known, {
        detail: `${prismaError.code} ${Array.isArray(target) ? target.join(',') : (target ?? '')}`,
      });
    }
  }

  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return new AppError('INTERNAL', 'تعذر إتمام العملية. يرجى المحاولة مرة أخرى.', {
    detail,
    cause: error,
  });
}
