# ڤيب شوب | Vape Shop — notes for Claude

Multi-tenant SaaS for shisha / smoking-goods shops. Next.js 16 (App Router) + TypeScript +
Tailwind v4 + PostgreSQL + Prisma 7 + Zod. Arabic, right-to-left, mobile-first, PWA.
`README.md` is the source of truth for setup, scripts and the architecture rules — read its
"Rules the code relies on" section before changing money, stock, auth or UI code.

## Working with the owner

- Reply in Arabic. Every user-facing message in the app is clear Arabic, never a raw error.
- The project is worked on from two machines through GitHub (`d11fy/vape-shop`, branch
  `main`). Start a session with `git pull`; when a piece of work is done and verified,
  commit and `git push` so the other machine can pick it up.
- `npm run db:seed` wipes the whole database. Never run it without asking first, and never
  against a production database.

## Non-negotiables (from the original specification)

- Tenant isolation: every store-scoped query filters by the session's `storeId`.
- Permissions are enforced on the server (`requirePermission` / `requireWritePermission`),
  not only by hiding buttons. Platform support access into a store goes through Support
  Mode and is audit-logged.
- Money is integer minor units (BigInt in the DB) — no floats. Quantities are base units
  ×1000, costs minor units per base unit ×1e6; combine them only via `src/core/quantity.ts`.
- Balances change only through ledger entries; financial records are cancelled or
  reversed (soft delete), never deleted. Financial writes carry idempotency keys.
- Profit = revenue excl. tax − COGS − expenses; sales are not profit.
- Nothing that helps bypass age verification or legal restrictions.
- Client components must not import `server-only` modules (checked by `tests/static`).

## Before calling something done

```bash
npm run typecheck
```

```bash
npm test
```

Then check the change in the browser at phone width (375px) and on desktop.
