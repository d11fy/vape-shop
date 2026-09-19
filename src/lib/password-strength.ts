/**
 * The password policy, in one place.
 *
 * Both the strength meter in the sign-up form and the Zod schema the server
 * action validates against call this, so what the bar shows and what the server
 * accepts can never drift apart.
 *
 * This file must never be `'use client'` — a server action imports it too.
 */

export interface PasswordStrength {
  valid: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  message: string;
}

const COMMON_PASSWORDS = new Set([
  '12345678', 'password', 'qwerty123', '123456789', 'password1',
  'admin123', '11111111', 'abc12345', 'iloveyou', '1q2w3e4r',
]);

export function checkPasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) {
    return { valid: false, score: 0, message: 'كلمة المرور يجب ألا تقل عن 8 أحرف' };
  }
  if (password.length > 128) {
    return { valid: false, score: 0, message: 'كلمة المرور طويلة جداً' };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, score: 0, message: 'كلمة المرور شائعة جداً وسهلة التخمين' };
  }

  let score = 0;
  if (password.length >= 10) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^\w\s]/.test(password)) score += 1;

  const messages = [
    'كلمة مرور ضعيفة',
    'كلمة مرور ضعيفة',
    'كلمة مرور متوسطة',
    'كلمة مرور جيدة',
    'كلمة مرور قوية',
  ] as const;

  const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
  return { valid: true, score: clamped, message: messages[clamped] };
}
