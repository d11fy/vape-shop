import { describe, expect, it } from 'vitest';

import { generateTemporaryPassword } from '@/core/auth/password';
import { ALL_PERMISSIONS } from '@/core/rbac/permissions';
import { SYSTEM_ROLES, resolveTemplatePermissions } from '@/core/rbac/roles';
import { countAr, NOUNS } from '@/lib/arabic-count';
import { formatAuditValue } from '@/lib/audit-fields';
import { checkPasswordStrength } from '@/lib/password-strength';
import { describeUserAgent } from '@/lib/user-agent';
import { passwordSchema } from '@/modules/auth/validation';
import { visibleNotificationKinds } from '@/modules/notifications/audience';

const role = (key: string) => {
  const template = SYSTEM_ROLES.find((entry) => entry.key === key);
  if (!template) throw new Error(`no role ${key}`);
  return new Set<string>(resolveTemplatePermissions(template));
};

describe('role templates', () => {
  it('gives the owner every permission, including future ones', () => {
    expect(role('owner').size).toBe(ALL_PERMISSIONS.length);
  });

  it('keeps profit, settings and staff management away from a cashier', () => {
    const cashier = role('cashier');
    for (const permission of [
      'reports.profit',
      'products.view_cost',
      'settings.manage',
      'employees.manage',
      'sales.cancel',
      'cashbox.manage',
    ]) {
      expect(cashier.has(permission), permission).toBe(false);
    }
    expect(cashier.has('sales.create')).toBe(true);
  });

  it('only grants permissions that exist', () => {
    const known = new Set<string>(ALL_PERMISSIONS);
    for (const template of SYSTEM_ROLES) {
      for (const permission of resolveTemplatePermissions(template)) {
        expect(known.has(permission), `${template.key}: ${permission}`).toBe(true);
      }
    }
  });
});

describe('notification audience', () => {
  it('hides cash shortfalls and supplier balances from a cashier', () => {
    const kinds = visibleNotificationKinds(role('cashier'), false);
    expect(kinds).not.toContain('CASH_MISMATCH');
    expect(kinds).not.toContain('SUPPLIER_DUE');
    expect(kinds).not.toContain('SUBSCRIPTION_EXPIRING');
    expect(kinds).toContain('PLATFORM_ANNOUNCEMENT');
    expect(kinds).toContain('LOW_STOCK');
  });

  it('shows the owner everything', () => {
    expect(visibleNotificationKinds(new Set(), true)).toContain('CASH_MISMATCH');
  });
});

describe('passwords', () => {
  it('rejects short and common passwords, on the client and the server alike', () => {
    for (const password of ['short', '12345678', 'password']) {
      expect(checkPasswordStrength(password).valid).toBe(false);
      expect(passwordSchema.safeParse(password).success).toBe(false);
    }
    expect(passwordSchema.safeParse('Nakhla-2026!').success).toBe(true);
  });

  it('generates temporary passwords that pass the policy and avoid look-alikes', () => {
    const seen = new Set<string>();
    for (let index = 0; index < 50; index += 1) {
      const password = generateTemporaryPassword();
      expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}-[A-HJ-NP-Za-km-z2-9]{4}$/);
      expect(checkPasswordStrength(password).valid).toBe(true);
      seen.add(password);
    }
    expect(seen.size).toBe(50);
  });
});

describe('Arabic counting', () => {
  it('picks the grammatical form for each count', () => {
    expect(countAr(1, NOUNS.product)).toBe('منتج واحد');
    expect(countAr(2, NOUNS.product)).toBe('منتجان');
    expect(countAr(3, NOUNS.product)).toBe('3 منتجات');
    expect(countAr(11, NOUNS.product)).toBe('11 منتجاً');
    expect(countAr(100, NOUNS.product)).toBe('100 منتج');
  });
});

describe('audit values', () => {
  const money = (minor: number) => `${(minor / 100).toFixed(2)} ر.س`;

  it('shows money fields as money, not raw minor units', () => {
    expect(formatAuditValue('amount', 5000, money).text).toBe('50.00 ر.س');
    expect(formatAuditValue('taxRateBps', 1500, money).text).toBe('15%');
    expect(formatAuditValue('taxEnabled', true, money).text).toBe('نعم');
    expect(formatAuditValue('reason', 'جرد', money)).toEqual({ text: 'جرد', numeric: false });
  });
});

describe('device names', () => {
  it('names common devices in Arabic', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      ),
    ).toEqual({ label: 'Safari على iPhone', kind: 'mobile' });
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
      ),
    ).toEqual({ label: 'Chrome على Windows', kind: 'desktop' });
    expect(describeUserAgent(null).label).toBe('جهاز غير معروف');
  });
});
