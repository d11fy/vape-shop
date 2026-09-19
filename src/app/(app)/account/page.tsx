import type { Metadata } from 'next';

import { AccountView } from '@/modules/account/account-view';
import { getAccountOverview } from '@/modules/account/queries';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'حسابي' };

export default async function AccountPage() {
  const overview = await getAccountOverview();

  return (
    <>
      <PageHeader title="حسابي" description="بياناتك الشخصية، كلمة المرور، والأجهزة المتصلة" />
      <AccountView overview={overview} />
    </>
  );
}
