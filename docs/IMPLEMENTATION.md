# LoanPilot — Implementation Status & Handoff

_Last updated: 12 June 2026 (Phases 2–3 complete). Use this as the working brief when continuing in Claude Code or another Cursor window._

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
| `ApplicationsModule` | `POST /api/applications` (public, x-tenant header) — submit application; `GET /api/applications` (JWT, lender roles) — tenant-scoped list; `PATCH /api/applications/:id/status` (JWT, lender roles) — approve/decline; approve upserts the borrower (on `tenantId+idNumber`) and disburses the quoted loan in one transaction, returns `{ application, loanId }` |
| `BorrowersModule` | `GET/POST /api/borrowers`, `GET/PATCH /api/borrowers/:id` — tenant-scoped, lender roles; duplicate ID number → 409 |
| `LoansModule` | `POST /api/loans/quote` (preview, no write); `POST /api/loans` (disburse to existing borrower); `GET /api/loans`, `GET /api/loans/:id` (lender roles + borrower, borrower sees only own); `POST /api/loans/:id/repayments` — transactional: marks next instalment paid, updates balance/status/nextDueAt/daysLate, settles at zero; `GET /api/loans/:id/statement` — NAMFISA statement with running balance + penalty accrual |
| `StatsModule` | `GET /api/stats/overview` — role-branched KPIs (`kind: lender \| platform \| borrower`), all money in cents |
| `AuthModule` | `POST /api/auth/login` → `{ accessToken, user: SessionUser }`; `GET /api/auth/me` (requires Bearer JWT) |
| `TenantsModule` | `TenantsService.resolveForPublicRequest(slug?)` — internal tenant resolution; `GET /api/tenants/me` (JWT) → `TenantBranding` (slug/name/short/accent/plan) or `null` for platform users, used for white-label dashboard theming |

New shared helper: `src/common/tenant.ts` `requireTenantId(user)` — throws 403 for platform users on tenant-bound routes.

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

Authenticated management dashboard — shell **and lender operations pages** are built,
**restyled to match the `design/` prototypes** (15 June 2026).

**White-label theming.** `src/lib/tenant-theme.tsx` fetches `GET /api/tenants/me` and sets
`--brand` (+ a `data-tenant` attribute) on `<html>`; shades derive via CSS `color-mix()` in
`globals.css`. A pre-paint script in `src/app/layout.tsx` applies the persisted accent before
hydration to avoid a colour flash. Lender/borrower users get their tenant accent (Raccoons
navy) with a **dark accent sidebar** (`html[data-tenant]` block) and Spectral serif headings;
platform users get the LoanPilot indigo theme with a **white sidebar**. Design tokens
(`--ok/--warn/--bad` + `-soft` variants, `--brand-soft/-deep`) and matching utilities
(`bg-ok-soft`, `bg-brand-soft text-brand-deep`, …) live in `globals.css`.

**Shell.** shadcn `sidebar` (`src/components/app-sidebar.tsx`: brand row, tenant workspace
card, grouped nav with a pending-applications badge, user footer) + `src/components/app-topbar.tsx`
(blurred sticky bar, serif page title, search, bell, logout). Borrower role uses a topbar-only
`src/components/borrower/portal-shell.tsx` instead (no sidebar). The shell branches in
`src/app/(app)/layout.tsx`.

**Shared UI.** `stat-card.tsx` (KPI card w/ icon chip), `status-badge.tsx` (dot pill),
`type-chip.tsx`, `filter-segments.tsx`, `initials-avatar.tsx`, `kv.tsx`. Added shadcn
components: `sidebar avatar tabs progress separator tooltip` (+ generated `sheet`,
`hooks/use-mobile`). The borrower home (`src/components/borrower/home.tsx`) has a gradient
hero balance card, quick actions, and Overview/Schedule tabs.

| File | What it does |
|---|---|
| `src/app/layout.tsx` | Root layout: IBM Plex + Spectral fonts, wraps `AuthProvider`, `Toaster` |
| `src/app/login/page.tsx` | Login form (react-hook-form + `loginSchema`), redirects to `/` on success |
| `src/app/(app)/layout.tsx` | Auth guard (redirects to `/login` if unauthenticated), role-aware sidebar + topbar |
| `src/app/(app)/page.tsx` | Overview: role-aware KPI cards (lender: active loans, book value, pending applications, arrears; platform & borrower variants) from `/stats/overview` |
| `src/app/(app)/applications/page.tsx` | Applications table with affordability/status badges; approve/decline confirm dialogs (approve disburses the loan) |
| `src/app/(app)/borrowers/page.tsx` | Borrowers table + "New borrower" dialog form (`createBorrowerSchema`) |
| `src/app/(app)/borrowers/[id]/page.tsx` | Borrower profile: personal details, loan history, active-loan schedule |
| `src/app/(app)/loans/page.tsx` | Loan book table (also serves borrower role — API scopes it) |
| `src/app/(app)/loans/[id]/page.tsx` | Loan detail: stat cards, schedule grid, capture-repayment dialog (lender only) |
| `src/lib/auth-context.tsx` | `AuthProvider` + `useAuth()` — token stored in `localStorage`, auto-validated on mount |
| `src/lib/api.ts` | `apiFetch` helper, `login()`, `fetchMe()` |
| `src/lib/use-api.ts` | `useApi<T>(path)` — token-aware fetch hook with `refresh()` |
| `src/lib/types.ts` | Response interfaces for authenticated endpoints (all money in cents) |
| `src/lib/format.ts` | `formatDate()` |
| `src/lib/nav.ts` | `navForRole(role)` — returns the correct nav items for platform / lender / borrower |
| `src/components/status-badge.tsx` | `<StatusBadge value>` — tone-mapped badge for loan/application/affordability/repayment statuses |
| `src/components/page-header.tsx` | Page title + action slot |

**Sidebar nav items by role:**
- Platform: Overview, Tenants, Billing
- Lender (admin/staff): Overview, Applications, Borrowers, Loans
- Borrower: Overview, My loans, Statements

shadcn/ui components now also include `table`, `badge`, `dialog`, `skeleton`.

---

## What is NOT yet built

> Phases 2 and 3 (dashboard overview + lender operations) were completed on
> 12 June 2026: Borrowers/Loans/Stats API modules, application approve/decline
> with transactional loan disbursement, and all lender dashboard pages. All
> verified end-to-end against the seed data (approve → borrower upsert + loan
> with correct quote math; repayments through to settlement; statements
> reconcile; role scoping incl. borrower-only loan visibility; 401/403/409
> cases). Note: `GET /api/applications` is now JWT-guarded (lender roles) —
> the public route is only `POST /api/applications`.

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
│   ├── common/              — zod-validation.pipe.ts, tenant.ts (requireTenantId)
│   ├── health/              — GET /api/health
│   ├── tenants/             — TenantsService.resolveForPublicRequest()
│   ├── applications/        — POST (public) / GET (lender) /api/applications,
│   │                          PATCH /api/applications/:id/status (approve → loan)
│   ├── borrowers/           — CRUD /api/borrowers (lender roles, tenant-scoped)
│   ├── loans/               — quote/create/list/detail/repayments/statement
│   ├── stats/               — GET /api/stats/overview (role-branched KPIs)
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
    ├── app/(app)/layout.tsx  — auth guard + sidebar shell
    ├── app/(app)/page.tsx    — overview (role-aware KPI cards)
    ├── app/(app)/applications/page.tsx  — review + approve/decline
    ├── app/(app)/borrowers/{page,[id]/page}.tsx — table + form, profile
    ├── app/(app)/loans/{page,[id]/page}.tsx     — book, detail + repayments
    ├── components/{status-badge,page-header}.tsx
    ├── lib/api.ts            — apiFetch, login(), fetchMe()
    ├── lib/use-api.ts        — useApi<T>() fetch hook
    ├── lib/types.ts          — authenticated API response shapes (cents)
    ├── lib/auth-context.tsx  — AuthProvider, useAuth()
    └── lib/nav.ts            — navForRole(role)
```
