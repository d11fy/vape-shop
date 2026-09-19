/**
 * Onboarding constants shared by the wizard (browser) and the server.
 *
 * This file must never import server-only code — the wizard is a client
 * component and imports it directly.
 */

/** Category names offered as one-tap chips — what a real shisha shop actually stocks. */
export const SUGGESTED_CATEGORIES = [
  'معسل',
  'فيب وسحبة',
  'نكهات إلكترونية',
  'شيش وأراجيل',
  'فحم',
  'إكسسوارات',
  'قطع غيار',
  'مشروبات',
  'ولاعات وأدوات',
] as const;
