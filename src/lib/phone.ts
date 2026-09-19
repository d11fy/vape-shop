import { normalizeDigits } from '@/core/money';

/**
 * Phone numbers identify a customer at the till — "0551234567", "055 123 4567"
 * and "٠٥٥١٢٣٤٥٦٧" are the same person. Normalised to ASCII digits with an
 * optional leading "+". Isomorphic: the till validates with it too.
 */
export function normalizePhone(input: string): string {
  const text = normalizeDigits(input).trim();
  const plus = text.startsWith('+') ? '+' : '';
  return plus + text.replace(/\D/g, '');
}

export function isValidPhone(input: string): boolean {
  const digits = normalizePhone(input).replace('+', '');
  return digits.length >= 7 && digits.length <= 15;
}
