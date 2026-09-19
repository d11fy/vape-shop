'use client';

import { LinkTabs } from '@/ui/primitives/tabs';

/** Shared tab strip across the settings screens. */
export function SettingsTabs() {
  return (
    <LinkTabs
      className="mb-4"
      items={[
        { href: '/settings', label: 'المحل', exact: true },
        { href: '/settings/branches', label: 'الفروع' },
        { href: '/settings/payment-methods', label: 'طرق الدفع' },
        { href: '/settings/subscription', label: 'الاشتراك' },
        { href: '/settings/audit', label: 'سجل النشاط' },
      ]}
    />
  );
}
