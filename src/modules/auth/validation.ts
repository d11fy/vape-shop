import { z } from 'zod';

import { checkPasswordStrength } from '@/lib/password-strength';

/**
 * Arabic-first validation messages. Every schema here is shared by the client
 * form and the server action, so the rules can never drift apart.
 */

export const identifierSchema = z
  .string()
  .trim()
  .min(1, 'أدخل البريد الإلكتروني أو رقم الهاتف')
  .max(120, 'القيمة طويلة جداً');

/**
 * Delegates to the shared policy so a password the strength meter rejects is
 * rejected by the server too — the meter is not decoration.
 */
export const passwordSchema = z.string().superRefine((value, ctx) => {
  const strength = checkPasswordStrength(value);
  if (!strength.valid) {
    ctx.addIssue({ code: 'custom', message: strength.message });
  }
});

export const signInSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, 'أدخل كلمة المرور'),
  remember: z.boolean().optional().default(true),
});

export type SignInInput = z.infer<typeof signInSchema>;

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+]?[\d\s-]{7,20}$/, 'رقم هاتف غير صالح');

export const registerSchema = z.object({
  ownerName: z.string().trim().min(2, 'أدخل اسمك').max(80, 'الاسم طويل جداً'),
  email: z.email('بريد إلكتروني غير صالح').trim().toLowerCase(),
  phone: phoneSchema.optional().or(z.literal('')),
  password: passwordSchema,
  storeName: z.string().trim().min(2, 'أدخل اسم المحل').max(80, 'اسم المحل طويل جداً'),
  country: z.string().trim().length(2).default('SA'),
  acceptTerms: z.literal(true, { message: 'يجب الموافقة على شروط الاستخدام' }),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: z.email('بريد إلكتروني غير صالح').trim().toLowerCase(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'أدخل كلمة المرور الحالية'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'كلمتا المرور غير متطابقتين',
    path: ['confirmPassword'],
  });

/** Flatten a Zod error into the `fieldErrors` shape `AppError` carries. */
export function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const output: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    (output[key] ??= []).push(issue.message);
  }
  return output;
}
