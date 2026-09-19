import { redirect } from 'next/navigation';

import { getAuthContext } from '@/core/auth/context';

/**
 * The root is a router, not a page: there is no marketing site here, only the
 * product. Where you land depends on who you are.
 */
export default async function RootPage() {
  const context = await getAuthContext();

  if (!context) redirect('/login');
  if (context.store) redirect('/dashboard');
  if (context.memberships.length > 1) redirect('/select-store');
  if (context.isPlatformAdmin) redirect('/platform');
  redirect('/no-access');
}
