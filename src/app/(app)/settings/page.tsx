import type { Metadata } from 'next';

import { requirePermission } from '@/core/auth/context';
import { db } from '@/core/db';
import { peekNextNumber } from '@/core/numbering';
import { hasFinancialActivity } from '@/modules/settings/currency-guard';
import { StoreSettingsForm } from '@/modules/settings/settings-form';
import { SettingsTabs } from '@/modules/settings/settings-tabs';
import { Alert } from '@/ui/feedback/alert';
import { PageHeader } from '@/ui/layout/page-header';

export const metadata: Metadata = { title: 'الإعدادات' };

export default async function SettingsPage() {
  const { store } = await requirePermission('settings.view');

  const [record, settings, currencyLocked] = await Promise.all([
    db.store.findUniqueOrThrow({
      where: { id: store.id },
      select: { name: true, phone: true, email: true, address: true, city: true, logoUrl: true },
    }),
    db.storeSettings.findUniqueOrThrow({ where: { storeId: store.id } }),
    hasFinancialActivity(db, store.id),
  ]);

  const nextInvoice = await peekNextNumber(db, store.id, 'SALE', {
    prefix: settings.invoicePrefix,
    padding: settings.invoicePadding,
    timezone: settings.timezone,
  });

  const canEdit = store.isOwner || store.permissions.has('settings.manage');

  return (
    <>
      <PageHeader
        title="الإعدادات"
        description="إعدادات المحل والعملة والضريبة والطباعة"
      />

      <SettingsTabs />

      {!canEdit ? (
        <Alert tone="info">
          لديك صلاحية عرض الإعدادات فقط. تواصل مع صاحب المحل لتعديلها.
        </Alert>
      ) : (
        <StoreSettingsForm
          currencyLocked={currencyLocked}
          invoicePreview={nextInvoice}
          settings={{
            name: record.name,
            phone: record.phone ?? '',
            email: record.email ?? '',
            address: record.address ?? '',
            city: record.city ?? '',
            logoUrl: record.logoUrl ?? '',
            currency: settings.currency,
            timezone: settings.timezone,
            taxEnabled: settings.taxEnabled,
            taxRatePercent: settings.taxRateBps / 100,
            taxInclusive: settings.taxInclusive,
            taxNumber: settings.taxNumber ?? '',
            invoicePrefix: settings.invoicePrefix,
            invoicePadding: settings.invoicePadding,
            receiptWidthMm: settings.receiptWidthMm,
            receiptFooterAr: settings.receiptFooterAr,
            showLogoOnReceipt: settings.showLogoOnReceipt,
            lowStockAlerts: settings.lowStockAlerts,
            negativeStockAllowed: settings.negativeStockAllowed,
            debtEnabled: settings.debtEnabled,
            defaultDebtLimit: Number(settings.defaultDebtLimit),
            debtOverdueDays: settings.debtOverdueDays,
            ageVerificationEnabled: settings.ageVerificationEnabled,
            minimumCustomerAge: settings.minimumCustomerAge,
            ageNoticeAr: settings.ageNoticeAr,
            requireAgeCheckAtSale: settings.requireAgeCheckAtSale,
          }}
        />
      )}
    </>
  );
}
