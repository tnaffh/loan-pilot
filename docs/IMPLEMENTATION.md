# LoanPilot — Implementation Status & Handoff

_Last updated: 12 June 2026. Use this as the working brief when continuing in Claude Code or another Cursor window._

---

## What has been built

### Monorepo root (`~/Code/loan-pilot`)

- **Turborepo + pnpm workspaces** — `turbo.json`, `pnpm-workspace.yaml`, `.nvmrc` (Node 22), `.npmrc`, `.prettierrc`, `.editorconfig`
- **Docker Compose** — Postgres 16 on **host port 5544** (to avoid clashing with other local instances), container name `loanpilot-postgres`, credentials `loanpilot / loanpilot`
- **`design/`** — copy of the Claude design prototypes (reference only, not consumed by code)

### `packages/domain` — `@loan-pilot/domain`

Shared by all apps. Built with `tsc`, tested with Jest (19 tests, all passing).

| Module | Contents |
|---|---|
| `enums.ts` | String TypeScript `enum`s: `LoanType`, `LoanStatus`, `ApplicationStatus`, `AffordabilityResult`, `RepaymentStatus`, `InvoiceStatus`, `EmploymentType`, `PlanId`, `TenantStatus`, `UserRole` |
| `money.ts` | `toCents`, `fromCents`, `formatNad`, `splitInstalments` — all monetary values are **integer N$ cents** |
| `loan-math.ts` | `quote(principalCents, termMonths, type)` → `LoanQuote` (total, instalment, schedule); NAMFISA caps enforced (≤30% finance charge, ≤5-month term) |
| `affordability.ts` | `assessAffordability({income, obligations, instalment})` → pass/review/fail using ≥50% take-home rule |
| `schemas.ts` | Zod schemas: `createApplicationSchema`, `loginSchema` — used by both Next.js forms and NestJS pipes |
| `auth.ts` | `SessionUser` interface, `isPlatform`, `isLender`, `isBorrower` helpers |

### `apps/api` — `@loan-pilot/api` (NestJS 11, port 4000)

**Runs at** `http://localhost:4000/api`

All modules generated via the official **Nest CLI**. Fully typechecked, built, 2 unit tests passing.

| Module | Endpoints |
|---|---|
| `HealthModule` | `GET /api/health` — DB connectivity check |
| `ApplicationsModule` | `POST /api/applications` — submit a loan application (Zod-validated, runs affordability, persists with references); `GET /api/applications` — tenant-scoped list |
| `AuthModule` | `POST /api/auth/login` → `{ accessToken, user: SessionUser }`; `GET /api/auth/me` (requires Bearer JWT) |
| `TenantsModule` | `TenantsService.resolveForPublicRequest(slug?)` — used internally for tenant resolution |

**Prisma schema** is complete: `Tenant`, `User`, `Borrower`, `Loan`, `RepaymentScheduleItem`, `LoanApplication`, `ApplicationReference`, `Document`, `Invoice`. First migration (`20260612092800_init`) is applied.

**Seed** (`prisma/seed.ts`) — run with `pnpm db:seed`:
- 3 tenants: RFS (Growth), Kalahari Cash (Pro), Namib Microloans (Starter/Trial)
- Users: `ops@loanpilot.na` (platform), `admin@raccoons.na` (lender_admin), `helena@email.na` (borrower, linked to borrower record)
- Password for all seed users: **`password123`**
- 4 borrowers, 4 loans (active, arrears, settled, collateral), 3 applications

**Auth** — JWT (7-day expiry), `JwtAuthGuard`, `RolesGuard`, `@CurrentUser()` decorator, `@Roles(...)` decorator.

**Multi-tenancy** — tenant resolved from `x-tenant` header (public site) or from the authenticated user (authenticated routes, Phase 3+).

### `apps/web` — `@loan-pilot/web` (Next.js 16, port 3000)

Public marketing + apply site for Raccoons Financial Services.

| Route | Page |
|---|---|
| `/` | Home: hero, payday calculator (live domain math), loan products, how it works, CTA |
| `/loans` | Loan product detail cards |
| `/about` | Company values, vision |
| `/contact` | Contact channels + CTA |
| `/apply` | 4-step apply form wired to the API |

- Fonts: **Spectral** (headings) + **IBM Plex Sans** (body) + **IBM Plex Mono** (mono)
- Brand primary: Raccoons navy `oklch(0.38 0.11 268)` — single accent on shadcn/ui defaults
- shadcn/ui **Base Vega** style (Vega preset, `@base-ui/react ^1.5.0`)
- All 6 pages build static, typecheck clean, lint clean
- The 4-step apply form was **browser-tested end-to-end** and submits successfully

### `apps/dashboard` — `@loan-pilot/dashboard` (Next.js 16, port 3001)

Authenticated management dashboard — **shell is in place, interior pages are the next step.**

| File | What it does |
|---|---|
| `src/app/layout.tsx` | Root layout: IBM Plex + Spectral fonts, wraps `AuthProvider`, `Toaster` |
| `src/app/login/page.tsx` | Login form (react-hook-form + `loginSchema`), redirects to `/` on success |
| `src/app/(app)/layout.tsx` | Auth guard (redirects to `/login` if unauthenticated), role-aware sidebar + topbar |
| `src/lib/auth-context.tsx` | `AuthProvider` + `useAuth()` — token stored in `localStorage`, auto-validated on mount |
| `src/lib/api.ts` | `apiFetch` helper, `login()`, `fetchMe()` |
| `src/lib/nav.ts` | `navForRole(role)` — returns the correct nav items for platform / lender / borrower |

**Sidebar nav items by role:**
- Platform: Overview, Tenants, Billing
- Lender (admin/staff): Overview, Applications, Borrowers, Loans
- Borrower: Overview, My loans, Statements

**No interior dashboard pages yet** — the `(app)` group layout is the shell; individual route pages are the next step (Phase 3–5).

---

## What is NOT yet built

### Phase 2 — Dashboard interior pages (in progress)

The shell exists. Still needed:

1. **`apps/dashboard/src/app/(app)/page.tsx`** — Overview/home page (KPI cards: active loans, book value, applications pending, arrears; differs per role)
2. Route group pages for each role — all under `src/app/(app)/`

### Phase 3 — Lender operations (API + dashboard pages)

**API (`apps/api/src/`)**

Generate with Nest CLI then implement:
```bash
nest g module borrowers
nest g service borrowers --no-spec
nest g controller borrowers --no-spec
nest g module loans
nest g service loans --no-spec
nest g controller loans --no-spec
```

- `BorrowersModule`: `GET /api/borrowers`, `POST /api/borrowers`, `GET /api/borrowers/:id`, `PATCH /api/borrowers/:id` — all tenant-scoped, JWT-guarded
- `LoansModule`:
  - `POST /api/loans/quote` — preview a loan quote (uses `@loan-pilot/domain` `quote()`)
  - `POST /api/loans` — create/disburse a loan from an approved application
  - `GET /api/loans`, `GET /api/loans/:id`
  - `POST /api/loans/:id/repayments` — record a repayment, mark schedule item paid, update balance
  - `GET /api/loans/:id/statement` — NAMFISA-compliant statement (all charges, payments, balance)
- `ApplicationsModule` additions:
  - `PATCH /api/applications/:id/status` — approve or decline (role: lender_admin / lender_staff); approve auto-creates a loan record
  - Applications are currently only accessible via the public (unauthenticated) route. The lender dashboard needs an authenticated version that resolves tenantId from `@CurrentUser()`.

**Dashboard pages**

- `/applications` — table: id, name, type, amount, date, affordability badge, status actions (approve/decline)
- `/borrowers` — table + new borrower form
- `/borrowers/[id]` — profile: personal details, loan history, active loan schedule
- `/loans` — table: borrower, type, principal, balance, instalment, next due, status badge
- `/loans/[id]` — loan detail: schedule grid, repayment capture button

### Phase 4 — Platform admin

**API**
```bash
nest g module platform --no-spec
```
- `GET /api/platform/tenants` — platform role only
- `PATCH /api/platform/tenants/:id` — update status/plan
- `GET /api/platform/invoices`
- `GET /api/platform/stats` — MRR, total book, total borrowers, active tenants

**Dashboard pages** (platform role only)
- `/tenants` — tenant table with plan badge, status, book, joined date
- `/billing` — invoice list per tenant

### Phase 5 — Borrower portal

Dashboard pages (borrower role):
- `/loans` — borrower's active/settled loans
- `/loans/[id]` — loan detail with repayment schedule
- `/statements` — downloadable/viewable statement per loan
- Apply top-up: link through to `apps/web`

### Phase 6 — Mobile (Expo React Native)

- `apps/mobile` — Expo app, reuses `@loan-pilot/domain`
- Borrower-focused: view loans, schedule, apply

### Phase 7 — Hardening

- GitHub Actions CI: `.github/workflows/ci.yml` — `pnpm install`, `turbo typecheck lint test build`
- Dockerfiles for API and web/dashboard (multi-stage)
- Nest e2e tests that spin up a test database
- `prisma migrate deploy` vs `migrate dev` documentation

---

## How to run locally

```bash
# 1. Start Postgres
cd ~/Code/loan-pilot
pnpm db:up          # starts loanpilot-postgres on localhost:5544

# 2. Set environment variables (or copy .env.example to .env.local in each app)
# apps/api needs: DATABASE_URL, PORT=4000, JWT_SECRET, DEFAULT_TENANT_SLUG=rfs
# apps/web needs: NEXT_PUBLIC_API_URL=http://localhost:4000/api
# apps/dashboard needs: NEXT_PUBLIC_API_URL=http://localhost:4000/api

# 3. Run the migration and seed (first time only, or after docker volume reset)
pnpm --filter @loan-pilot/api prisma:migrate   # uses DATABASE_URL from env
pnpm --filter @loan-pilot/api db:seed

# 4. Start everything
pnpm dev            # turbo: api on :4000, web on :3000, dashboard on :3001

# One-shot verification:
pnpm typecheck && pnpm lint && pnpm test
```

**Seed user credentials (password: `password123`):**
| Email | Role |
|---|---|
| `ops@loanpilot.na` | Platform operator |
| `admin@raccoons.na` | Lender admin (RFS) |
| `helena@email.na` | Borrower (Helena Kapenda, RFS) |

---

## Architecture notes

- **Money**: every monetary value in code, DB and API is **integer N$ cents**. `toCents(5000)` = 650000 (after 30% charge). Use `formatNad(cents)` for display.
- **Multi-tenancy**: every tenant-scoped Prisma model has a `tenantId` field. Services must always filter on it. Public routes resolve the tenant from `x-tenant` header or `DEFAULT_TENANT_SLUG` env. Authenticated routes should resolve it from `@CurrentUser().tenantId`.
- **Enums**: domain enums (`LoanType.Payday`, etc.) are string TypeScript enums. Prisma schema uses the same string values. Zod schemas use `z.nativeEnum(LoanType)`.
- **No `let` / no `as` casts**: project rule. Use `const`. The ESLint rule for `as` permits `as const` (type annotation name = `const`).
- **Arrow functions** for React components.
- **Test files** use `.test.ts` (not `.spec.ts`).
- **shadcn/ui** is Base Vega style. UI components live in `src/components/ui/` — do not lint them (they are generated).
- The `apps/dashboard` `(app)` route group is the authenticated shell. All dashboard content pages go under `src/app/(app)/`.

---

## Prisma schema location

```
apps/api/prisma/schema.prisma   — source of truth
apps/api/prisma/seed.ts         — dev seed (truncates + re-inserts on every run)
apps/api/prisma/migrations/     — committed migrations
```

To regenerate the client after a schema change:
```bash
pnpm --filter @loan-pilot/api prisma:generate
pnpm --filter @loan-pilot/api prisma:migrate   # creates a new migration
```

---

## Key file index

```
loan-pilot/
├── packages/domain/src/
│   ├── enums.ts             — TypeScript string enums
│   ├── money.ts             — toCents, fromCents, formatNad, splitInstalments
│   ├── loan-math.ts         — quote(), penaltyInterest()
│   ├── affordability.ts     — assessAffordability()
│   ├── schemas.ts           — Zod: createApplicationSchema, loginSchema
│   └── auth.ts              — SessionUser interface, role helpers
│
├── apps/api/src/
│   ├── main.ts              — global prefix /api, CORS, port 4000
│   ├── app.module.ts        — root module
│   ├── prisma/              — PrismaService (global)
│   ├── common/zod-validation.pipe.ts
│   ├── health/              — GET /api/health
│   ├── tenants/             — TenantsService.resolveForPublicRequest()
│   ├── applications/        — POST/GET /api/applications
│   └── auth/                — POST /api/auth/login, GET /api/auth/me
│                              JwtAuthGuard, RolesGuard, @CurrentUser, @Roles
│
├── apps/web/src/
│   ├── app/                 — /, /loans, /about, /contact, /apply
│   ├── components/site/     — SiteHeader, SiteFooter, PaydayCalculator, ApplyForm
│   ├── lib/api.ts           — submitApplication()
│   └── lib/site-data.ts     — COMPANY, NAV_LINKS, PRODUCTS, TRUST_STATS
│
└── apps/dashboard/src/
    ├── app/layout.tsx        — root (AuthProvider, fonts)
    ├── app/login/page.tsx    — /login
    ├── app/(app)/layout.tsx  — auth guard + sidebar shell  ← NEXT: add pages here
    ├── lib/api.ts            — apiFetch, login(), fetchMe()
    ├── lib/auth-context.tsx  — AuthProvider, useAuth()
    └── lib/nav.ts            — navForRole(role)
```
