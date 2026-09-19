import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getAuthContext } from '@/core/auth/context';
import { getOnboardingSnapshot } from '@/modules/onboarding/queries';
import { OnboardingWizard } from '@/modules/onboarding/wizard';

export const metadata: Metadata = { title: 'تهيئة المتجر' };

/**
 * Setup runs outside the app shell on purpose: no sidebar, no navigation, one
 * path forward. The owner is here once, and anything else on screen is a way to
 * get lost before the first sale.
 */
export default async function OnboardingPage() {
  const context = await getAuthContext();
  if (!context) redirect('/login');
  if (!context.store) redirect(context.isPlatformAdmin ? '/platform' : '/no-access');
  if (context.store.subscription.isBlocked) redirect('/subscription');

  // Staff must not see the wizard; the owner sets the shop up.
  if (!context.store.isOwner) redirect('/dashboard');
  if (context.store.onboarded) redirect('/dashboard');

  const snapshot = await getOnboardingSnapshot();

  return (
    <main className="min-h-dvh bg-canvas">
      <OnboardingWizard snapshot={snapshot} />
    </main>
  );
}
