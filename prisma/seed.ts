/**
 * Development seed.
 *
 * Builds a believable shisha shop: real Arabic product names, a team with
 * different roles, ninety days of purchases and sixty days of sales, customer
 * debts, expenses and closed shifts.
 *
 * Crucially it goes through the SAME services the application uses — so running
 * it is also an end-to-end exercise of stock movement, weighted-average
 * costing, the ledgers and the cash drawer. If the seed produces a balanced
 * book, the engine works.
 *
 *   node --conditions=react-server --import tsx prisma/seed.ts
 */

import path from 'node:path';

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* optional */
  }
}

const { db, transaction } = await import('../src/core/db.ts');
const { hashPassword } = await import('../src/core/auth/password.ts');
const { provisionStore } = await import('../src/modules/store/provisioning.ts');
const { createPurchase } = await import('../src/modules/purchases/service.ts');
const { createSale } = await import('../src/modules/sales/service.ts');
const { recordPayment } = await import('../src/modules/payments/service.ts');
const { postCustomerEntry } = await import('../src/modules/ledger/service.ts');
const { getBranchCashbox, postCashMovement } = await import('../src/modules/cashbox/service.ts');
const { nextDocumentNumber } = await import('../src/core/numbering.ts');
const { ALL_PERMISSIONS } = await import('../src/core/rbac/permissions.ts');

// ── Deterministic randomness ────────────────────────────────────────────────
// A fixed seed means two developers looking at "yesterday's sales" see the same
// numbers, which makes screenshots and bug reports comparable.
let randomState = 0x2f6e2b1;
function random(): number {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return ((randomState >>> 0) % 1_000_000) / 1_000_000;
}
function randomInt(min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)]!;
}
function chance(probability: number): boolean {
  return random() < probability;
}

const SAR = 100; // minor units per riyal
const money = (riyals: number) => Math.round(riyals * SAR);
/** Quantities are stored as integer thousandths of a base unit. */
const QTY_SCALE = 1000;

const DAY = 24 * 60 * 60 * 1000;
const now = new Date();
/** A wall-clock time `days` ago — may land later today than now. */
function atDay(days: number, hour = 12, minute = 0): Date {
  const date = new Date(now.getTime() - days * DAY);
  date.setHours(hour, minute, randomInt(0, 59), 0);
  return date;
}

/** Same, but never in the future: a slot later than now becomes "a little while ago". */
function daysAgo(days: number, hour = 12, minute = 0): Date {
  const date = atDay(days, hour, minute);
  return date.getTime() <= now.getTime()
    ? date
    : new Date(now.getTime() - randomInt(10, 120) * 60 * 1000);
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 بدء تهيئة البيانات التجريبية…\n');

  await resetDatabase();
  const plans = await seedPlans();
  const admin = await seedPlatformAdmin();
  const { storeId, branchId, ownerId } = await seedStore(plans.professional);
  const staff = await seedStaff(storeId);
  const catalog = await seedCatalog(storeId);
  const suppliers = await seedSuppliers(storeId);
  await seedPurchases(storeId, branchId, ownerId, catalog, suppliers);
  const customers = await seedCustomers(storeId);
  const methods = await seedLookups(storeId);
  await seedSales(storeId, branchId, catalog, customers, staff, methods);
  await seedDebtCollections(storeId, branchId, customers, staff, methods);
  await seedExpenses(storeId, branchId, staff, methods);
  await seedShifts(storeId, branchId, staff);
  await seedNotifications(storeId);

  await summarise(storeId, admin.email, ownerId);
}

// ── Reset ────────────────────────────────────────────────────────────────────

async function resetDatabase() {
  console.log('  ↺ مسح البيانات السابقة…');

  // Row-by-row deletes would trip the RESTRICT foreign keys that protect
  // financial history (a branch cannot be removed while invoices reference it).
  // TRUNCATE … CASCADE clears the whole graph in one statement instead.
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (tables.length === 0) return;

  const list = tables.map((table) => `"public"."${table.tablename}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

// ── Plans ────────────────────────────────────────────────────────────────────

async function seedPlans() {
  console.log('  ✦ خطط الاشتراك');

  const definitions = [
    {
      code: 'starter',
      nameAr: 'الأساسية',
      nameEn: 'Starter',
      descriptionAr: 'لمحل واحد يبدأ التنظيم: مبيعات ومخزون وعملاء.',
      monthlyPrice: money(79),
      yearlyPrice: money(790),
      maxEmployees: 3,
      maxBranches: 1,
      maxProducts: 400,
      maxMonthlyInvoices: 1500,
      features: ['pos', 'inventory', 'customers', 'debts', 'expenses', 'basic_reports'],
      sortOrder: 1,
    },
    {
      code: 'professional',
      nameAr: 'الاحترافية',
      nameEn: 'Professional',
      descriptionAr: 'للمحلات النشطة: تقارير أرباح، موردون، ورديات وصلاحيات.',
      monthlyPrice: money(149),
      yearlyPrice: money(1490),
      maxEmployees: 10,
      maxBranches: 2,
      maxProducts: 3000,
      maxMonthlyInvoices: 10_000,
      features: [
        'pos', 'inventory', 'customers', 'debts', 'expenses', 'basic_reports',
        'profit_reports', 'suppliers', 'purchases', 'shifts', 'custom_roles', 'export',
      ],
      sortOrder: 2,
    },
    {
      code: 'business',
      nameAr: 'الأعمال',
      nameEn: 'Business',
      descriptionAr: 'لسلاسل المحلات: فروع متعددة، نقل مخزون وتحليلات متقدمة.',
      monthlyPrice: money(299),
      yearlyPrice: money(2990),
      maxEmployees: null,
      maxBranches: null,
      maxProducts: null,
      maxMonthlyInvoices: null,
      features: [
        'pos', 'inventory', 'customers', 'debts', 'expenses', 'basic_reports',
        'profit_reports', 'suppliers', 'purchases', 'shifts', 'custom_roles', 'export',
        'multi_branch', 'transfers', 'advanced_analytics', 'priority_support',
      ],
      sortOrder: 3,
    },
  ];

  const created: Record<string, string> = {};
  for (const definition of definitions) {
    const plan = await db.plan.create({
      data: {
        ...definition,
        monthlyPrice: BigInt(definition.monthlyPrice),
        yearlyPrice: BigInt(definition.yearlyPrice),
        currency: 'SAR',
        trialDays: 14,
        graceDays: 7,
      },
      select: { id: true, code: true },
    });
    created[plan.code] = plan.id;
  }

  return created as { starter: string; professional: string; business: string };
}

// ── Platform admin ───────────────────────────────────────────────────────────

async function seedPlatformAdmin() {
  console.log('  ✦ حساب إدارة المنصة');
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@vapeshop.app';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

  await db.user.create({
    data: {
      name: 'إدارة ڤيب شوب',
      email,
      passwordHash: await hashPassword(password),
      platformRole: 'SUPER_ADMIN',
      status: 'ACTIVE',
    },
  });

  return { email, password };
}

// ── Store ────────────────────────────────────────────────────────────────────

async function seedStore(planId: string) {
  console.log('  ✦ المتجر التجريبي');
  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@vapeshop.demo';
  const password = process.env.SEED_OWNER_PASSWORD ?? 'Owner@12345';

  const plan = await db.plan.findUniqueOrThrow({ where: { id: planId }, select: { code: true } });

  const result = await transaction(async (tx) => {
    const owner = await tx.user.create({
      data: {
        name: 'خالد العتيبي',
        email,
        phone: '0551234567',
        passwordHash: await hashPassword(password),
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const provisioned = await provisionStore(tx, {
      name: 'محل الليالي للمعسل والفيب',
      ownerId: owner.id,
      country: 'SA',
      phone: '0112345678',
      email: 'info@allayali.sa',
      planCode: plan.code,
      paidDays: 240,
    });

    await tx.store.update({
      where: { id: provisioned.store.id },
      data: {
        status: 'ACTIVE',
        onboardedAt: new Date(now.getTime() - 120 * DAY),
        address: 'طريق الملك عبدالعزيز، حي النزهة',
        city: 'الرياض',
      },
    });

    await tx.storeSettings.update({
      where: { storeId: provisioned.store.id },
      data: {
        taxEnabled: true,
        taxRateBps: 1500,
        taxInclusive: true,
        taxNumber: '310123456700003',
        defaultDebtLimit: BigInt(money(3000)),
        debtOverdueDays: 30,
        receiptFooterAr: 'شكراً لزيارتكم — محل الليالي',
      },
    });

    return { storeId: provisioned.store.id, branchId: provisioned.branchId, ownerId: owner.id };
  });

  console.log(`     ↳ ${email} / ${password}`);
  return result;
}

// ── Staff ────────────────────────────────────────────────────────────────────

interface StaffMember {
  id: string;
  name: string;
  roleKey: string;
}

async function seedStaff(storeId: string): Promise<StaffMember[]> {
  console.log('  ✦ فريق العمل');

  const people = [
    { name: 'سعود الحربي', email: 'saud@vapeshop.demo', phone: '0552223344', roleKey: 'manager' },
    { name: 'ماجد القحطاني', email: 'majed@vapeshop.demo', phone: '0553334455', roleKey: 'cashier' },
    { name: 'عبدالله الشمري', email: 'abdullah@vapeshop.demo', phone: '0554445566', roleKey: 'cashier' },
    { name: 'نورة السالم', email: 'noura@vapeshop.demo', phone: '0555556677', roleKey: 'accountant' },
    { name: 'فهد الدوسري', email: 'fahad@vapeshop.demo', phone: '0556667788', roleKey: 'inventory' },
  ];

  const passwordHash = await hashPassword('Staff@12345');
  const roles = await db.role.findMany({
    where: { storeId },
    select: { id: true, key: true },
  });
  const roleIndex = new Map(roles.map((role) => [role.key, role.id]));

  const owner = await db.store.findUniqueOrThrow({
    where: { id: storeId },
    select: { ownerId: true, owner: { select: { name: true } } },
  });

  const staff: StaffMember[] = [
    { id: owner.ownerId!, name: owner.owner!.name, roleKey: 'owner' },
  ];

  for (const person of people) {
    const user = await db.user.create({
      data: {
        name: person.name,
        email: person.email,
        phone: person.phone,
        passwordHash,
        status: 'ACTIVE',
        lastLoginAt: daysAgo(randomInt(0, 4), randomInt(8, 20)),
      },
      select: { id: true },
    });

    await db.storeUser.create({
      data: {
        storeId,
        userId: user.id,
        roleId: roleIndex.get(person.roleKey)!,
        status: 'ACTIVE',
        joinedAt: daysAgo(randomInt(60, 110)),
        lastActiveAt: daysAgo(randomInt(0, 3), randomInt(9, 21)),
      },
    });

    staff.push({ id: user.id, name: person.name, roleKey: person.roleKey });
  }

  // One custom role, to show the feature is real.
  await db.role.create({
    data: {
      storeId,
      key: 'custom-evening',
      nameAr: 'كاشير المسائية',
      nameEn: 'Evening Cashier',
      description: 'كاشير بصلاحية خصم محدودة وبدون بيع آجل',
      isSystem: false,
      permissions: ALL_PERMISSIONS.filter((permission) =>
        [
          'dashboard.view',
          'sales.view',
          'sales.create',
          'sales.discount',
          'products.view',
          'inventory.view',
          'customers.view',
          'customers.create',
          'shifts.open',
          'shifts.close',
          'cashbox.view',
        ].includes(permission),
      ),
    },
  });

  return staff;
}

// ── Catalogue ────────────────────────────────────────────────────────────────

interface SeedVariant {
  id: string;
  productName: string;
  variantName: string;
  factor: number;
  sellingPrice: number;
  cost: number;
  categorySlug: string;
}

async function seedCatalog(storeId: string): Promise<SeedVariant[]> {
  console.log('  ✦ التصنيفات والماركات والمنتجات');

  const categories = [
    { name: 'معسل', slug: 'moassel', color: '#10B981', icon: 'Flame' },
    { name: 'فحم', slug: 'charcoal', color: '#6B7280', icon: 'Flame' },
    { name: 'شيشة وأدواتها', slug: 'shisha', color: '#8B5CF6', icon: 'Wind' },
    { name: 'أجهزة فيب', slug: 'vape-devices', color: '#3B82F6', icon: 'Zap' },
    { name: 'نكهات فيب', slug: 'vape-liquids', color: '#EC4899', icon: 'Droplet' },
    { name: 'إكسسوارات', slug: 'accessories', color: '#F59E0B', icon: 'Package' },
  ];

  const categoryIds = new Map<string, string>();
  for (const [index, category] of categories.entries()) {
    const created = await db.category.create({
      data: { storeId, ...category, sortOrder: index },
      select: { id: true, slug: true },
    });
    categoryIds.set(created.slug, created.id);
  }

  const brands = ['مزايا', 'الفاخر', 'ناخلة', 'الوزير', 'ستارباز', 'أفضل', 'تايتن', 'فوكو'];
  const brandIds = new Map<string, string>();
  for (const name of brands) {
    const created = await db.brand.create({
      data: { storeId, name, slug: name.replace(/\s+/g, '-') },
      select: { id: true, name: true },
    });
    brandIds.set(created.name, created.id);
  }

  interface ProductSpec {
    name: string;
    categorySlug: string;
    brand?: string;
    unitKind: 'COUNT' | 'WEIGHT' | 'VOLUME';
    minimumStock: number;
    variants: Array<{
      name: string;
      unitLabel: string;
      /** Base units in one sale unit. */
      factorUnits: number;
      fractional?: boolean;
      price: number;
      cost: number;
      barcode?: string;
    }>;
  }

  const specs: ProductSpec[] = [
    // ── معسل — pack sizes are variants, each with its own sale unit ─────────
    {
      name: 'معسل مزايا تفاحتين',
      categorySlug: 'moassel',
      brand: 'مزايا',
      unitKind: 'WEIGHT',
      minimumStock: 2000,
      variants: [
        { name: 'علبة 50 جرام', unitLabel: 'علبة', factorUnits: 50, price: 12, cost: 7.5, barcode: '6281000000011' },
        { name: 'علبة 250 جرام', unitLabel: 'علبة', factorUnits: 250, price: 48, cost: 31, barcode: '6281000000028' },
        { name: 'بالوزن', unitLabel: 'كيلو', factorUnits: 1000, fractional: true, price: 165, cost: 112 },
      ],
    },
    {
      name: 'معسل الفاخر عنب توت',
      categorySlug: 'moassel',
      brand: 'الفاخر',
      unitKind: 'WEIGHT',
      minimumStock: 2000,
      variants: [
        { name: 'علبة 50 جرام', unitLabel: 'علبة', factorUnits: 50, price: 13, cost: 8, barcode: '6281000000035' },
        { name: 'علبة 250 جرام', unitLabel: 'علبة', factorUnits: 250, price: 52, cost: 34, barcode: '6281000000042' },
        { name: 'بالوزن', unitLabel: 'كيلو', factorUnits: 1000, fractional: true, price: 178, cost: 120 },
      ],
    },
    {
      name: 'معسل ناخلة دبل آبل',
      categorySlug: 'moassel',
      brand: 'ناخلة',
      unitKind: 'WEIGHT',
      minimumStock: 1500,
      variants: [
        { name: 'علبة 50 جرام', unitLabel: 'علبة', factorUnits: 50, price: 14, cost: 9, barcode: '6281000000059' },
        { name: 'علبة 250 جرام', unitLabel: 'علبة', factorUnits: 250, price: 56, cost: 37 },
      ],
    },
    {
      name: 'معسل الوزير ليمون نعناع',
      categorySlug: 'moassel',
      brand: 'الوزير',
      unitKind: 'WEIGHT',
      minimumStock: 1000,
      variants: [
        { name: 'علبة 250 جرام', unitLabel: 'علبة', factorUnits: 250, price: 45, cost: 29, barcode: '6281000000066' },
        { name: 'بالوزن', unitLabel: 'كيلو', factorUnits: 1000, fractional: true, price: 158, cost: 105 },
      ],
    },
    {
      name: 'معسل أفضل ميكس فواكه',
      categorySlug: 'moassel',
      brand: 'أفضل',
      unitKind: 'WEIGHT',
      minimumStock: 800,
      variants: [
        { name: 'علبة 250 جرام', unitLabel: 'علبة', factorUnits: 250, price: 42, cost: 27, barcode: '6281000000073' },
      ],
    },

    // ── فحم ────────────────────────────────────────────────────────────────
    {
      name: 'فحم طبيعي صنوبر',
      categorySlug: 'charcoal',
      brand: 'تايتن',
      unitKind: 'WEIGHT',
      minimumStock: 5000,
      variants: [
        { name: 'كيس 1 كيلو', unitLabel: 'كيس', factorUnits: 1000, price: 28, cost: 17, barcode: '6281000000080' },
        { name: 'كرتون 10 كيلو', unitLabel: 'كرتون', factorUnits: 10_000, price: 250, cost: 158 },
      ],
    },
    {
      name: 'فحم سريع الاشتعال',
      categorySlug: 'charcoal',
      unitKind: 'COUNT',
      minimumStock: 20,
      variants: [
        { name: 'علبة 10 أقراص', unitLabel: 'علبة', factorUnits: 1, price: 6, cost: 3.2, barcode: '6281000000097' },
      ],
    },

    // ── شيشة وأدواتها ──────────────────────────────────────────────────────
    {
      name: 'شيشة خليجي متوسطة',
      categorySlug: 'shisha',
      unitKind: 'COUNT',
      minimumStock: 3,
      variants: [
        { name: 'قياس متوسط', unitLabel: 'قطعة', factorUnits: 1, price: 195, cost: 124, barcode: '6281000000103' },
      ],
    },
    {
      name: 'خرطوم شيشة سيليكون',
      categorySlug: 'shisha',
      unitKind: 'COUNT',
      minimumStock: 8,
      variants: [
        { name: 'قطعة', unitLabel: 'قطعة', factorUnits: 1, price: 38, cost: 21, barcode: '6281000000110' },
      ],
    },
    {
      name: 'رأس شيشة فخار',
      categorySlug: 'shisha',
      unitKind: 'COUNT',
      minimumStock: 10,
      variants: [
        { name: 'قطعة', unitLabel: 'قطعة', factorUnits: 1, price: 18, cost: 9, barcode: '6281000000127' },
      ],
    },
    {
      name: 'قصدير شيشة مثقّب',
      categorySlug: 'shisha',
      unitKind: 'COUNT',
      minimumStock: 25,
      variants: [
        { name: 'لفة', unitLabel: 'لفة', factorUnits: 1, price: 9, cost: 4.5, barcode: '6281000000134' },
      ],
    },

    // ── فيب ────────────────────────────────────────────────────────────────
    {
      name: 'جهاز ستارباز بود',
      categorySlug: 'vape-devices',
      brand: 'ستارباز',
      unitKind: 'COUNT',
      minimumStock: 4,
      variants: [
        { name: 'أسود', unitLabel: 'قطعة', factorUnits: 1, price: 245, cost: 168, barcode: '6281000000141' },
        { name: 'فضي', unitLabel: 'قطعة', factorUnits: 1, price: 245, cost: 168, barcode: '6281000000158' },
      ],
    },
    {
      name: 'سحبة مزاج 8000 نفس',
      categorySlug: 'vape-devices',
      brand: 'فوكو',
      unitKind: 'COUNT',
      minimumStock: 12,
      variants: [
        { name: 'نعناع بارد', unitLabel: 'قطعة', factorUnits: 1, price: 55, cost: 36, barcode: '6281000000165' },
        { name: 'مانجو ثلج', unitLabel: 'قطعة', factorUnits: 1, price: 55, cost: 36, barcode: '6281000000172' },
        { name: 'عنب أحمر', unitLabel: 'قطعة', factorUnits: 1, price: 55, cost: 36, barcode: '6281000000189' },
      ],
    },
    {
      name: 'كويل مقاومة 0.6 أوم',
      categorySlug: 'vape-devices',
      unitKind: 'COUNT',
      minimumStock: 20,
      variants: [
        { name: 'علبة 5 حبات', unitLabel: 'علبة', factorUnits: 1, price: 42, cost: 26, barcode: '6281000000196' },
      ],
    },

    // ── نكهات فيب ──────────────────────────────────────────────────────────
    {
      name: 'نكهة فيب مانجو آيس',
      categorySlug: 'vape-liquids',
      unitKind: 'VOLUME',
      minimumStock: 6,
      variants: [
        { name: '30 مل', unitLabel: 'قارورة', factorUnits: 30, price: 45, cost: 28, barcode: '6281000000202' },
        { name: '60 مل', unitLabel: 'قارورة', factorUnits: 60, price: 78, cost: 49 },
      ],
    },
    {
      name: 'نكهة فيب توت بارد',
      categorySlug: 'vape-liquids',
      unitKind: 'VOLUME',
      minimumStock: 6,
      variants: [
        { name: '30 مل', unitLabel: 'قارورة', factorUnits: 30, price: 45, cost: 28, barcode: '6281000000219' },
      ],
    },

    // ── إكسسوارات ──────────────────────────────────────────────────────────
    {
      name: 'ولاعة غاز',
      categorySlug: 'accessories',
      unitKind: 'COUNT',
      minimumStock: 30,
      variants: [
        { name: 'قطعة', unitLabel: 'قطعة', factorUnits: 1, price: 5, cost: 2, barcode: '6281000000226' },
      ],
    },
    {
      name: 'ملقط فحم ستانلس',
      categorySlug: 'accessories',
      unitKind: 'COUNT',
      minimumStock: 10,
      variants: [
        { name: 'قطعة', unitLabel: 'قطعة', factorUnits: 1, price: 15, cost: 7, barcode: '6281000000233' },
      ],
    },
    {
      name: 'شاحن سريع Type-C',
      categorySlug: 'accessories',
      unitKind: 'COUNT',
      minimumStock: 8,
      variants: [
        { name: 'قطعة', unitLabel: 'قطعة', factorUnits: 1, price: 35, cost: 18, barcode: '6281000000240' },
      ],
    },
  ];

  const result: SeedVariant[] = [];
  let sku = 1000;

  for (const spec of specs) {
    const product = await db.product.create({
      data: {
        storeId,
        categoryId: categoryIds.get(spec.categorySlug)!,
        brandId: spec.brand ? brandIds.get(spec.brand)! : null,
        name: spec.name,
        unitKind: spec.unitKind,
        trackInventory: true,
        hasVariants: spec.variants.length > 1,
        isAgeRestricted: spec.categorySlug !== 'accessories',
        status: 'ACTIVE',
        createdAt: daysAgo(randomInt(95, 120)),
      },
      select: { id: true },
    });

    for (const [index, variant] of spec.variants.entries()) {
      sku += 1;
      const created = await db.productVariant.create({
        data: {
          storeId,
          productId: product.id,
          name: variant.name,
          sku: `VS-${sku}`,
          barcode: variant.barcode ?? null,
          isDefault: index === 0,
          unitLabel: variant.unitLabel,
          displayFactor: variant.factorUnits.toFixed(3),
          allowsFractional: variant.fractional ?? false,
          sellingPrice: BigInt(money(variant.price)),
          wholesalePrice: BigInt(money(variant.price * 0.9)),
          purchasePrice: BigInt(money(variant.cost)),
          minimumStock: spec.minimumStock.toFixed(3),
          sortOrder: index,
        },
        select: { id: true },
      });

      result.push({
        id: created.id,
        productName: spec.name,
        variantName: variant.name,
        factor: variant.factorUnits,
        sellingPrice: money(variant.price),
        cost: money(variant.cost),
        categorySlug: spec.categorySlug,
      });
    }
  }

  console.log(`     ↳ ${specs.length} منتج · ${result.length} صنف`);
  return result;
}

// ── Suppliers ────────────────────────────────────────────────────────────────

async function seedSuppliers(storeId: string) {
  console.log('  ✦ الموردون');

  const suppliers = [
    { name: 'مؤسسة الشرق للتوزيع', company: 'الشرق', phone: '0114567890', address: 'المستودعات، الرياض' },
    { name: 'شركة النخيل للمعسل', company: 'النخيل', phone: '0113456789', address: 'الصناعية الثانية' },
    { name: 'مستودع الخليج للفحم', company: 'الخليج', phone: '0126789012', address: 'جدة — الصناعية' },
    { name: 'وكيل ستارباز السعودية', company: 'ستارباز', phone: '0505556666', address: 'الرياض' },
  ];

  const created = [];
  for (const supplier of suppliers) {
    const row = await db.supplier.create({
      data: { storeId, ...supplier, createdAt: daysAgo(randomInt(100, 130)) },
      select: { id: true, name: true },
    });
    created.push(row);
  }
  return created;
}

// ── Purchases ────────────────────────────────────────────────────────────────

async function seedPurchases(
  storeId: string,
  branchId: string,
  userId: string,
  catalog: SeedVariant[],
  suppliers: Array<{ id: string; name: string }>,
) {
  console.log('  ✦ فواتير الشراء (بناء المخزون والتكلفة)');

  const cashMethod = await db.paymentMethod.findFirstOrThrow({
    where: { storeId, type: 'CASH' },
    select: { id: true },
  });
  const transferMethod = await db.paymentMethod.findFirstOrThrow({
    where: { storeId, type: 'TRANSFER' },
    select: { id: true },
  });

  // Opening stock 90 days ago, then regular top-ups. Costs drift upward a few
  // percent each round so the weighted-average has something real to average,
  // and the last round is recent enough that the shelves are not bare today.
  const rounds = [
    { daysBack: 92, multiplier: 1.6, scale: 0.86, payRatio: 1 },
    { daysBack: 61, multiplier: 1.1, scale: 0.88, payRatio: 1 },
    { daysBack: 34, multiplier: 1.2, scale: 0.9, payRatio: 0.6 },
    { daysBack: 12, multiplier: 1.0, scale: 0.92, payRatio: 0.35 },
    { daysBack: 4, multiplier: 0.8, scale: 0.94, payRatio: 0.5 },
  ];

  let count = 0;

  for (const round of rounds) {
    // Split the catalogue across suppliers, roughly by category.
    for (const supplier of suppliers) {
      const items = catalog.filter((_, index) => index % suppliers.length === suppliers.indexOf(supplier));
      if (items.length === 0) continue;

      const lines = items
        .filter(() => chance(round.daysBack === 92 ? 1 : 0.85))
        .map((variant) => {
          const packs = Math.max(1, Math.round(basePackCount(variant) * round.multiplier));
          return {
            variantId: variant.id,
            // Qty is base units ×1000, and `factor` is base units per pack.
            quantity: packs * variant.factor * QTY_SCALE,
            unitCost: Math.round(variant.cost * round.scale),
          };
        });

      if (lines.length === 0) continue;

      const purchasedAt = daysAgo(round.daysBack + randomInt(0, 3), randomInt(9, 16));

      await transaction(
        async (tx) => {
          const receipt = await createPurchase(tx, {
            storeId,
            branchId,
            userId,
            supplierId: supplier.id,
            reference: `INV-${randomInt(10_000, 99_999)}`,
            lines,
            extraCosts: money(randomInt(0, 120)),
            purchasedAt,
            receiveNow: true,
          });

          // Settle part (or all) of the invoice on the spot.
          const payable = Math.round(receipt.total * round.payRatio);
          if (payable > 0) {
            await recordPayment(tx, {
              storeId,
              branchId,
              userId,
              direction: 'OUT',
              source: 'PURCHASE',
              amount: payable,
              methodId: round.payRatio >= 1 ? transferMethod.id : cashMethod.id,
              purchaseId: receipt.purchaseId,
              supplierId: supplier.id,
              paidAt: purchasedAt,
              postToLedger: true,
              ledgerDescription: `سداد فاتورة شراء ${receipt.number}`,
            });
            await tx.purchase.update({
              where: { id: receipt.purchaseId },
              data: {
                paidTotal: BigInt(payable),
                dueTotal: BigInt(receipt.total - payable),
              },
            });
          }
        },
        { timeoutMs: 60_000 },
      );

      count += 1;
    }
  }

  // Partial payments on the newer invoices, so suppliers carry a balance.
  const openInvoices = await db.purchase.findMany({
    where: { storeId, dueTotal: { gt: 0 } },
    select: { id: true, supplierId: true, dueTotal: true, number: true },
    take: 5,
  });

  for (const invoice of openInvoices) {
    if (!chance(0.6)) continue;
    const due = Number(invoice.dueTotal);
    const amount = Math.round(due * (0.3 + random() * 0.4));
    if (amount <= 0) continue;

    await transaction(async (tx) => {
      await recordPayment(tx, {
        storeId,
        branchId,
        userId,
        direction: 'OUT',
        source: 'SUPPLIER_DEBT',
        amount,
        methodId: transferMethod.id,
        supplierId: invoice.supplierId,
        purchaseId: invoice.id,
        paidAt: daysAgo(randomInt(1, 10), randomInt(10, 17)),
        postToLedger: true,
        ledgerDescription: `دفعة على فاتورة ${invoice.number}`,
      });
      await tx.purchase.update({
        where: { id: invoice.id },
        data: { paidTotal: { increment: BigInt(amount) }, dueTotal: { decrement: BigInt(amount) } },
      });
    });
  }

  console.log(`     ↳ ${count} فاتورة شراء`);
}

/** How many sale units of this variant a shop would stock per re-order. */
function basePackCount(variant: SeedVariant): number {
  if (variant.categorySlug === 'moassel') return variant.factor >= 1000 ? 18 : 60;
  if (variant.categorySlug === 'charcoal') return variant.factor >= 10_000 ? 5 : 40;
  if (variant.categorySlug === 'shisha') return 10;
  if (variant.categorySlug === 'vape-devices') return 18;
  if (variant.categorySlug === 'vape-liquids') return 20;
  return 45;
}

// ── Customers ────────────────────────────────────────────────────────────────

async function seedCustomers(storeId: string) {
  console.log('  ✦ العملاء');

  const names = [
    'عبدالرحمن الزهراني', 'تركي المطيري', 'يوسف الغامدي', 'بندر العنزي',
    'مشعل الرشيد', 'راكان البقمي', 'سلطان الحارثي', 'وليد العمري',
    'أحمد السبيعي', 'ناصر الشهري', 'زياد الخالدي', 'إبراهيم الجهني',
    'معاذ الثبيتي', 'هاني الصاعدي', 'عمر البلوي', 'كافيه الركن الهادئ',
    'استراحة الواحة', 'مقهى ليالي الشرق',
  ];

  const created: Array<{ id: string; name: string; isBusiness: boolean }> = [];

  for (const name of names) {
    const isBusiness = /كافيه|استراحة|مقهى/.test(name);
    const customer = await db.customer.create({
      data: {
        storeId,
        name,
        phone: `05${randomInt(10, 59)}${randomInt(100_000, 999_999)}`,
        address: isBusiness ? pick(['حي النزهة', 'حي الملقا', 'حي الياسمين']) : null,
        note: isBusiness ? 'عميل جملة — يشتري بكميات' : null,
        debtLimit: isBusiness ? BigInt(money(8000)) : BigInt(0),
        ageVerified: true,
        ageVerifiedAt: daysAgo(randomInt(30, 90)),
        createdAt: daysAgo(randomInt(20, 110)),
      },
      select: { id: true, name: true },
    });
    created.push({ id: customer.id, name: customer.name, isBusiness });
  }

  return created;
}

async function seedLookups(storeId: string) {
  const methods = await db.paymentMethod.findMany({
    where: { storeId, isActive: true },
    select: { id: true, name: true, type: true, affectsCashbox: true },
  });
  return {
    cash: methods.find((method) => method.type === 'CASH')!,
    card: methods.find((method) => method.type === 'CARD')!,
    transfer: methods.find((method) => method.type === 'TRANSFER')!,
    wallet: methods.find((method) => method.type === 'WALLET')!,
  };
}

// ── Sales ────────────────────────────────────────────────────────────────────

async function seedSales(
  storeId: string,
  branchId: string,
  catalog: SeedVariant[],
  customers: Array<{ id: string; name: string; isBusiness: boolean }>,
  staff: StaffMember[],
  methods: Awaited<ReturnType<typeof seedLookups>>,
) {
  console.log('  ✦ المبيعات (60 يوماً)');

  const cashiers = staff.filter((member) =>
    ['cashier', 'manager', 'owner'].includes(member.roleKey),
  );

  let created = 0;
  let failed = 0;

  for (let dayOffset = 59; dayOffset >= 0; dayOffset -= 1) {
    const date = new Date(now.getTime() - dayOffset * DAY);
    const weekday = date.getDay(); // 4 = Thursday, 5 = Friday
    const busy = weekday === 4 || weekday === 5;
    const invoices = busy ? randomInt(9, 16) : randomInt(4, 10);

    // Draw the day's times first and sell in time order, so invoice numbers
    // rise with the clock exactly as they do in a real shop. Today's evening
    // slots that have not happened yet are dropped — no invoice from the future.
    const times = Array.from({ length: invoices }, () =>
      atDay(dayOffset, randomInt(15, 23), randomInt(0, 59)),
    )
      .filter((time) => time.getTime() < now.getTime())
      .sort((a, b) => a.getTime() - b.getTime());

    for (const soldAt of times) {
      const cashier = pick(cashiers);

      // Most sales are walk-in; regulars and wholesale buyers are named.
      const withCustomer = chance(0.38);
      const customer = withCustomer ? pick(customers) : null;
      const wholesale = customer?.isBusiness ?? false;

      const paymentMethod = chance(0.55)
        ? methods.cash
        : chance(0.7)
          ? methods.card
          : methods.transfer;
      const isCash = paymentMethod.type === 'CASH';
      // Wholesale customers often take credit.
      const credit = Boolean(customer) && (wholesale ? chance(0.55) : chance(0.12));

      // Only cash can be over-tendered, so discounts (which make the preview
      // total approximate) are reserved for cash and credit invoices.
      const allowDiscounts = isCash || credit;

      const lineCount = wholesale ? randomInt(3, 6) : randomInt(1, 4);
      const chosen = new Set<string>();
      const lines: Array<{ variantId: string; quantity: number; discount?: number }> = [];

      for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
        const variant = pick(catalog);
        if (chosen.has(variant.id)) continue;
        chosen.add(variant.id);

        // Loose tobacco is sold in fractions of a kilo; everything else in packs.
        const quantity =
          variant.variantName === 'بالوزن'
            ? pick([250, 500, 750, 1000]) * QTY_SCALE
            : (wholesale ? randomInt(2, 6) : randomInt(1, 3)) * variant.factor * QTY_SCALE;

        lines.push({
          variantId: variant.id,
          quantity,
          discount: allowDiscounts && chance(0.08) ? money(randomInt(1, 5)) : undefined,
        });
      }

      if (lines.length === 0) continue;

      const invoiceDiscount = allowDiscounts && chance(0.06) ? money(randomInt(2, 10)) : 0;

      try {
        await transaction(
          async (tx) => {
            // Estimate the total so the tender looks like what a real customer
            // would hand over. Exact for undiscounted, tax-inclusive invoices.
            const preview = await previewTotal(tx, storeId, lines);
            const paid = credit
              ? Math.round(preview * (random() * 0.6))
              : isCash
                ? roundUpToNote(preview)
                : preview;

            await createSale(tx, {
              storeId,
              branchId,
              userId: cashier.id,
              customerId: customer?.id ?? null,
              lines,
              invoiceDiscount,
              tenders: paid > 0 ? [{ methodId: paymentMethod.id, amount: paid }] : [],
              soldAt,
              permissions: { canDiscount: true, canEditPrice: true, canSellOnCredit: true },
              // Honour the stock check: a basket that cannot be filled is
              // skipped, which keeps quantities in the demo internally
              // consistent instead of drifting negative.
              allowNegativeStock: false,
            });
          },
          { timeoutMs: 30_000 },
        );
        created += 1;
      } catch {
        // A randomly generated basket can hit a genuine constraint — skip it.
        failed += 1;
      }
    }
  }

  console.log(`     ↳ ${created} فاتورة (${failed} تخطّي)`);
}

/** Rough total, used only to decide how much cash the customer hands over. */
async function previewTotal(
  tx: Parameters<Parameters<typeof transaction>[0]>[0],
  storeId: string,
  lines: Array<{ variantId: string; quantity: number }>,
): Promise<number> {
  const variants = await tx.productVariant.findMany({
    where: { id: { in: lines.map((line) => line.variantId) }, storeId },
    select: { id: true, sellingPrice: true, displayFactor: true },
  });
  const index = new Map(variants.map((variant) => [variant.id, variant]));

  let total = 0;
  for (const line of lines) {
    const variant = index.get(line.variantId);
    if (!variant) continue;
    const factor = Math.round(Number(variant.displayFactor) * 1000) || 1000;
    total += Math.round((Number(variant.sellingPrice) * line.quantity) / factor);
  }
  return total;
}

/** Customers pay with notes, not exact change. */
function roundUpToNote(amount: number): number {
  const notes = [money(5), money(10), money(20), money(50), money(100), money(200), money(500)];
  for (const note of notes) {
    if (amount <= note) return note;
  }
  return Math.ceil(amount / money(100)) * money(100);
}

// ── Debt collection ──────────────────────────────────────────────────────────

async function seedDebtCollections(
  storeId: string,
  branchId: string,
  customers: Array<{ id: string }>,
  staff: StaffMember[],
  methods: Awaited<ReturnType<typeof seedLookups>>,
) {
  console.log('  ✦ تحصيل الديون');

  const indebted = await db.customer.findMany({
    where: { storeId, balance: { gt: 0 } },
    select: { id: true, balance: true, name: true },
  });

  const collector = staff.find((member) => member.roleKey === 'accountant') ?? staff[0]!;
  let count = 0;

  for (const customer of indebted) {
    if (!chance(0.55)) continue;
    const balance = Number(customer.balance);
    const amount = Math.round(balance * (0.25 + random() * 0.5));
    if (amount <= 0) continue;

    await transaction(async (tx) => {
      await recordPayment(tx, {
        storeId,
        branchId,
        userId: collector.id,
        direction: 'IN',
        source: 'CUSTOMER_DEBT',
        amount,
        methodId: chance(0.7) ? methods.cash.id : methods.transfer.id,
        customerId: customer.id,
        paidAt: daysAgo(randomInt(0, 20), randomInt(16, 22)),
        postToLedger: true,
        ledgerDescription: 'تحصيل دفعة من الرصيد',
      });
    });
    count += 1;
  }

  // One written-off balance, so the adjustment path has data too.
  const first = indebted[0];
  if (first) {
    await transaction(async (tx) => {
      await postCustomerEntry(tx, first.id, {
        storeId,
        type: 'ADJUSTMENT',
        amount: -money(25),
        description: 'تسوية فرق تقريب بالاتفاق مع العميل',
        userId: collector.id,
        occurredAt: daysAgo(6, 19),
      });
    });
  }

  console.log(`     ↳ ${count} دفعة`);
}

// ── Expenses ─────────────────────────────────────────────────────────────────

async function seedExpenses(
  storeId: string,
  branchId: string,
  staff: StaffMember[],
  methods: Awaited<ReturnType<typeof seedLookups>>,
) {
  console.log('  ✦ المصاريف');

  const categories = await db.expenseCategory.findMany({
    where: { storeId },
    select: { id: true, name: true },
  });
  const byName = new Map(categories.map((category) => [category.name, category.id]));
  const manager = staff.find((member) => member.roleKey === 'manager') ?? staff[0]!;
  const accountant = staff.find((member) => member.roleKey === 'accountant') ?? staff[0]!;

  const recurring = [
    { category: 'إيجار', amount: money(4200), description: 'إيجار المحل الشهري' },
    { category: 'رواتب', amount: money(6800), description: 'رواتب الموظفين' },
    { category: 'كهرباء ومياه', amount: money(640), description: 'فاتورة الكهرباء' },
  ];

  const occasional = [
    { category: 'نقل وشحن', range: [80, 350], description: 'أجرة توصيل بضاعة' },
    { category: 'صيانة', range: [120, 600], description: 'صيانة مكيّف المحل' },
    { category: 'تسويق وإعلان', range: [200, 900], description: 'إعلان ممول على انستقرام' },
    { category: 'مستلزمات المحل', range: [45, 260], description: 'أكياس وأدوات تغليف' },
    { category: 'أخرى', range: [30, 180], description: 'مصروف نثري' },
  ];

  let count = 0;

  // Two months of fixed costs, matching the 60-day sales window.
  for (let monthsBack = 1; monthsBack >= 0; monthsBack -= 1) {
    for (const item of recurring) {
      const spentAt = daysAgo(monthsBack * 30 + randomInt(0, 3), randomInt(9, 13));
      await transaction(async (tx) => {
        await tx.expense.create({
          data: {
            storeId,
            branchId,
            categoryId: byName.get(item.category)!,
            methodId: methods.transfer.id,
            amount: BigInt(item.amount),
            description: item.description,
            userId: accountant.id,
            spentAt,
          },
        });
      });
      count += 1;
    }
  }

  for (let dayOffset = 55; dayOffset >= 0; dayOffset -= 1) {
    if (!chance(0.22)) continue;
    const item = pick(occasional);
    const amount = money(randomInt(item.range[0]!, item.range[1]!));
    const spentAt = daysAgo(dayOffset, randomInt(10, 20));
    const cash = chance(0.7);

    await transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          storeId,
          branchId,
          categoryId: byName.get(item.category)!,
          methodId: cash ? methods.cash.id : methods.transfer.id,
          amount: BigInt(amount),
          description: item.description,
          userId: manager.id,
          spentAt,
        },
        select: { id: true },
      });

      if (cash) {
        const cashbox = await getBranchCashbox(tx, storeId, branchId);
        await postCashMovement(tx, {
          storeId,
          cashboxId: cashbox.id,
          type: 'EXPENSE',
          amount: -amount,
          referenceType: 'expense',
          referenceId: expense.id,
          userId: manager.id,
          description: item.description,
          occurredAt: spentAt,
        });
      }
    });
    count += 1;
  }

  console.log(`     ↳ ${count} مصروف`);
}

// ── Shifts ───────────────────────────────────────────────────────────────────

async function seedShifts(storeId: string, branchId: string, staff: StaffMember[]) {
  console.log('  ✦ الورديات');

  const cashiers = staff.filter((member) => member.roleKey === 'cashier');
  if (cashiers.length === 0) return;

  const settings = await db.storeSettings.findUniqueOrThrow({
    where: { storeId },
    select: { invoicePrefix: true, invoicePadding: true, timezone: true },
  });

  for (let dayOffset = 5; dayOffset >= 0; dayOffset -= 1) {
    const cashier = cashiers[dayOffset % cashiers.length]!;
    const openedAt = daysAgo(dayOffset, 15, 0);
    const closedAt = dayOffset === 0 ? null : daysAgo(dayOffset, 23, 30);

    await transaction(async (tx) => {
      const cashbox = await getBranchCashbox(tx, storeId, branchId);
      const number = await nextDocumentNumber(tx, storeId, 'SHIFT', {
        prefix: settings.invoicePrefix,
        padding: 4,
        timezone: settings.timezone,
        now: openedAt,
      });

      const openingCash = money(randomInt(300, 700));

      const salesAggregate = await tx.sale.aggregate({
        where: {
          storeId,
          userId: cashier.id,
          soldAt: { gte: openedAt, lt: closedAt ?? new Date() },
          deletedAt: null,
        },
        _sum: { total: true, paidTotal: true },
        _count: true,
      });

      const cashPayments = await tx.payment.aggregate({
        where: {
          storeId,
          userId: cashier.id,
          direction: 'IN',
          paidAt: { gte: openedAt, lt: closedAt ?? new Date() },
          method: { affectsCashbox: true },
        },
        _sum: { amount: true },
      });

      const cashSales = Number(cashPayments._sum.amount ?? 0n);
      const expected = openingCash + cashSales;
      // A small, believable drawer discrepancy on some days.
      const difference = closedAt && chance(0.4) ? money(randomInt(-15, 10)) : 0;

      const shift = await tx.shift.create({
        data: {
          storeId,
          branchId,
          cashboxId: cashbox.id,
          userId: cashier.id,
          number,
          status: closedAt ? 'CLOSED' : 'OPEN',
          openingCash: BigInt(openingCash),
          expectedCash: BigInt(expected),
          actualCash: closedAt ? BigInt(expected + difference) : null,
          difference: BigInt(difference),
          salesTotal: salesAggregate._sum.total ?? 0n,
          cashSalesTotal: BigInt(cashSales),
          invoiceCount: salesAggregate._count,
          openedAt,
          closedAt,
          differenceReason: difference !== 0 ? 'فرق تقريب في الفكة' : null,
        },
        select: { id: true },
      });

      // Attach that day's invoices to the shift for the shift report.
      await tx.sale.updateMany({
        where: {
          storeId,
          userId: cashier.id,
          soldAt: { gte: openedAt, lt: closedAt ?? new Date() },
        },
        data: { shiftId: shift.id },
      });
    });
  }
}

// ── Notifications ────────────────────────────────────────────────────────────

async function seedNotifications(storeId: string) {
  const lowStock = await db.inventoryItem.findMany({
    where: { storeId },
    select: {
      quantity: true,
      variant: {
        select: { name: true, minimumStock: true, product: { select: { id: true, name: true } } },
      },
    },
    take: 60,
  });

  const alerts = lowStock
    .filter((item) => Number(item.quantity) <= Number(item.variant.minimumStock))
    .slice(0, 4);

  for (const alert of alerts) {
    await db.notification.create({
      data: {
        storeId,
        kind: Number(alert.quantity) <= 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
        severity: Number(alert.quantity) <= 0 ? 'DANGER' : 'WARNING',
        title: Number(alert.quantity) <= 0 ? 'نفد المخزون' : 'مخزون منخفض',
        body: `${alert.variant.product.name} — ${alert.variant.name}`,
        entityType: 'product',
        entityId: alert.variant.product.id,
        link: `/products/${alert.variant.product.id}`,
        createdAt: daysAgo(randomInt(0, 3), randomInt(10, 20)),
      },
    });
  }

  await db.notification.create({
    data: {
      storeId,
      kind: 'PLATFORM_ANNOUNCEMENT',
      severity: 'INFO',
      title: 'تحديث جديد في ڤيب شوب',
      body: 'أصبح بإمكانك الآن تصدير تقرير الأرباح إلى Excel مباشرة من مركز التقارير.',
      createdAt: daysAgo(2, 11),
    },
  });
}

// ── Summary ──────────────────────────────────────────────────────────────────

async function summarise(storeId: string, adminEmail: string, ownerId: string) {
  const [sales, salesSum, customers, debt, products, stockValue, expenses, cashbox] =
    await Promise.all([
      db.sale.count({ where: { storeId, deletedAt: null } }),
      db.sale.aggregate({
        where: { storeId, deletedAt: null, status: { not: 'CANCELED' } },
        _sum: { total: true, profitTotal: true },
      }),
      db.customer.count({ where: { storeId } }),
      db.customer.aggregate({ where: { storeId, balance: { gt: 0 } }, _sum: { balance: true } }),
      db.product.count({ where: { storeId } }),
      db.inventoryItem.count({ where: { storeId } }),
      db.expense.aggregate({ where: { storeId }, _sum: { amount: true } }),
      db.cashbox.findFirst({ where: { storeId }, select: { balance: true } }),
    ]);

  const owner = await db.user.findUniqueOrThrow({
    where: { id: ownerId },
    select: { email: true },
  });

  const riyals = (value: bigint | null | undefined) =>
    ((Number(value ?? 0n) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }));

  console.log('\n✅ اكتملت التهيئة\n');
  console.log('   ┌─────────────────────────────────────────────┐');
  console.log(`   │ الفواتير        ${String(sales).padStart(10)}                │`);
  console.log(`   │ إجمالي المبيعات ${riyals(salesSum._sum.total).padStart(10)} ر.س        │`);
  console.log(`   │ صافي الربح      ${riyals(salesSum._sum.profitTotal).padStart(10)} ر.س        │`);
  console.log(`   │ المصاريف        ${riyals(expenses._sum.amount).padStart(10)} ر.س        │`);
  console.log(`   │ ديون العملاء    ${riyals(debt._sum.balance).padStart(10)} ر.س        │`);
  console.log(`   │ رصيد الصندوق    ${riyals(cashbox?.balance).padStart(10)} ر.س        │`);
  console.log(`   │ العملاء         ${String(customers).padStart(10)}                │`);
  console.log(`   │ المنتجات        ${String(products).padStart(10)}                │`);
  console.log(`   │ أصناف المخزون   ${String(stockValue).padStart(10)}                │`);
  console.log('   └─────────────────────────────────────────────┘\n');
  console.log('   تسجيل الدخول:');
  console.log(`     صاحب المحل   ${owner.email}  /  ${process.env.SEED_OWNER_PASSWORD ?? 'Owner@12345'}`);
  console.log(`     إدارة المنصة ${adminEmail}  /  ${process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345'}`);
  console.log('     الموظفون     saud@vapeshop.demo · majed@vapeshop.demo  /  Staff@12345\n');
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error('\n❌ فشلت التهيئة:', error);
    await db.$disconnect();
    process.exit(1);
  });
