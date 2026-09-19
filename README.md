# ڤيب شوب | Vape Shop

نظام SaaS متعدد المتاجر لإدارة محلات المعسل ومنتجات التدخين المسموح بها: نقطة بيع، مخزون بالعدد
والوزن، مشتريات وموردون، عملاء وديون، مصاريف، صندوق وورديات، موظفون وصلاحيات، تقارير أرباح
حقيقية، ولوحة إدارة للمنصة.

A multi-tenant SaaS for shisha and smoking-goods retail: POS, stock by count and by weight,
purchasing, customers and debts, expenses, cash drawer and shifts, staff and granular
permissions, real profit reporting (COGS, not sales), and a platform console.

---

## Quick start (local)

Requirements: **Node.js 20.11+** and npm. No Docker needed — Prisma runs a local Postgres.

```bash
npm install
```

```bash
cp .env.example .env
```

Generate a real `AUTH_SECRET` and put it in `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Start the local database (keep this terminal open) and copy the `DATABASE_URL` and
`SHADOW_DATABASE_URL` it prints into `.env`:

```bash
npm run db:dev
```

In a second terminal, create the schema, load the demo shop, and start the app:

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open <http://localhost:3000>.

### Demo accounts (from `.env`)

| Role | Email | Password |
| --- | --- | --- |
| Store owner — «محل الليالي للمعسل والفيب» | `owner@vapeshop.demo` | `Owner@12345` |
| Platform super admin | `admin@vapeshop.app` | `Admin@12345` |
| Manager / cashiers / accountant / inventory | `saud@`, `majed@`, `abdullah@`, `noura@`, `fahad@vapeshop.demo` | `Staff@12345` |

`npm run db:seed` **wipes every table** and rebuilds the demo shop (90 days of purchases,
60 days of sales, debts, expenses, closed shifts). Do not run it against a database you
want to keep.

A new shop can also be created from `/register`; the owner is taken through a 7-step setup
wizard (store details → currency & VAT → first employee → categories → first product →
payment methods → ready).

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server (Turbopack) |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit, static and database tests (Vitest) |
| `npm run db:dev` | Local Prisma Postgres |
| `npm run db:migrate` | Create a migration from `prisma/schema.prisma` (development) |
| `npm run db:deploy` | Apply migrations (CI / production) |
| `npm run db:seed` | Reset and load demo data |
| `npm run db:studio` | Browse the database |

---

## Tests

```bash
npm test
```

- `tests/unit` — money, quantity and cost arithmetic, invoice pricing and tax, tender and
  change, role templates, notification audiences, password policy, Arabic counting.
- `tests/static` — repository rules the type checker cannot see: no client component
  reaches a `server-only` module, every internal link resolves to a route, no
  left-to-right `.num` wrapper around Arabic words, no float scale factors in money code.
- `tests/integration` — sale, weight sale, partial payment and debt limit, «دين» sale on a
  customer found or created by phone, debt collection, return, cancellation, expenses and shift close, permission and stock
  enforcement, weighted-average cost. **Each scenario runs inside a transaction that is
  rolled back**, against the database in `DATABASE_URL`, so they leave nothing behind.
  They are skipped when `DATABASE_URL` is not set.

---

## Architecture

```
src/
  app/        Routes only: (app) store screens, (platform) console, (auth), (print), api
  core/       Cross-cutting, framework-free where possible: auth context & sessions,
              money, quantity, datetime, errors, audit, RBAC, idempotency, db
  modules/    One folder per business area: queries.ts (reads, server-only),
              actions.ts ('use server' entry points), service.ts (transactional
              domain logic), *-view.tsx / *-form.tsx (client UI)
  ui/         Design-system primitives, forms, data table, layout, feedback
  lib/        Isomorphic helpers (formatter, table query, Arabic counting…)
prisma/       schema.prisma, migrations, seed.ts
tests/        unit, static, integration
```

### Rules the code relies on

- **Tenancy.** Every store-scoped row carries `storeId`; every query filters by the
  session's store, and ids coming from the browser are re-checked against it. A record
  from another store behaves exactly like a missing one (404).
- **Permissions on the server.** Actions and pages call `requirePermission` /
  `requireWritePermission`; services receive what the actor may do (discount, price edit,
  credit). Hiding a button is a courtesy, never the control.
- **Money is integer minor units** (`BigInt` in the database, `number` in memory, never a
  float), with currency decimals from the currency itself (SAR 2, KWD 3). Quantities are
  thousandths of a base unit (grams, millilitres, pieces); cost is minor units per base
  unit ×1e6. Combine them only through `core/quantity` (`lineAmount`, `costAmount`,
  `unitCostFromSaleUnitPrice`…), which use BigInt.
- **Profit is revenue excluding tax minus COGS minus expenses.** COGS is taken at the
  weighted-average cost at the moment of sale and stored on the invoice line.
- **Ledgers, not edits.** Stock, cash drawer and customer/supplier balances change only
  through append-only movements (`applyStockMovement`, `postCashMovement`,
  `postCustomerEntry`…). Financial records are cancelled or reversed, never deleted.
- **Idempotency.** Financial actions carry an idempotency key, so a retry after a dropped
  connection cannot create a second sale or payment.
- **Audit.** Sensitive changes write an audit entry with before/after values;
  platform support access into a store is explicit (Support Mode) and logged.
- **Temporary passwords.** Passwords set by someone else (new employee, admin reset) are
  flagged, and the user must replace them before reaching any store or API route.
- **Arabic, right-to-left first.** Use `.num` for pure numbers and amounts, `.num-mixed`
  for text mixing figures and Arabic words. Plural forms come from `countAr()`.
- **Server/client boundary.** Nothing a client component imports may import
  `server-only` code; shared constants live in isomorphic files (checked by
  `tests/static`).

### Offline

The service worker (`public/sw.js`, production only) caches build assets and serves an
offline page. It never caches pages (they contain one store's data) and never queues
sales offline — a sale recorded on a disconnected device while stock moves elsewhere is
how a shop sells what it does not have. An on-screen banner tells staff the moment the
connection drops.

---

## Production notes

- Use a managed PostgreSQL and set `DATABASE_URL`; run `npm run db:deploy` on release.
- `AUTH_SECRET` must be at least 32 characters; the app refuses to start otherwise.
- Set `NEXT_PUBLIC_APP_URL`, `SUPPORT_EMAIL` and optionally `SUPPORT_PHONE`.
- Set `ALLOW_PUBLIC_SIGNUP=0` to create stores only from the platform console.
- Do not run `npm run db:seed` in production.
