# LoanPilot — Product Context

_Read this first. It explains what we are building and why, for any agent or developer joining the project._

## What is LoanPilot?

LoanPilot is a **multi-tenant SaaS loan-management platform** for micro-lenders (cash loan businesses). It is being built by and for **Raccoons Financial Services CC** — a real, NAMFISA-registered Namibian micro-lender — and will then be offered to other Namibian cash-loan businesses on a subscription basis.

Think of it as "Shopify for Namibian micro-lenders": Raccoons is the first tenant, other lenders sign up on a plan (Starter N$499 / Growth N$1,499 / Pro N$3,999 per month) and get their own branded loan-management workspace.

## The business: Raccoons Financial Services

- Established 2019, fully operational since 2 October 2023; based in Windhoek (Erf 863, Otjomuise Lifestyle, Stockholm Street)
- Registered microlender, regulated by **NAMFISA** (Namibia Financial Institutions Supervisory Authority)
- Gives **payday/short-term cash loans** to individuals with stable employment — typical 1–2 month terms, no collateral
- Loan requirements: recent payslip, certified ID copy, 3 months of bank statements
- Key people: Eufemia Nghifenwa (Principal Officer), Naftal Timotheus (IT lead — that's the user you're working with)

## Product surfaces (one backend, four clients)

1. **Public marketing/apply site** (`apps/web`, port 3000) — Raccoons-branded marketing site with a payday-loan calculator and a 4-step loan application form. Anonymous visitors apply here; applications land in the lender's review queue.
2. **Management dashboard** (`apps/dashboard`, port 3001) — authenticated app with three role-based experiences:
   - **Platform operator** (LoanPilot staff): manages tenants, subscriptions, invoices, platform KPIs (MRR, total book)
   - **Lender staff/admin** (e.g. Raccoons staff): reviews applications, manages borrowers, originates and disburses loans, captures repayments, chases arrears
   - **Borrower**: sees their loans, repayment schedule, statements
3. **API** (`apps/api`, port 4000) — NestJS backend, single source of truth, multi-tenant Postgres via Prisma
4. **Mobile app** (`apps/mobile`, future) — Expo React Native borrower app

## Regulatory constraints (Namibian Microlending Act 2018 / NAMFISA)

These are hard product rules, encoded in `@loan-pilot/domain` — do not violate them:

| Rule | Value | Where enforced |
|---|---|---|
| Max loan term (this product) | **5 months** | `loan-math.ts` `MAX_TERM_MONTHS`, Zod schema |
| Max finance charge | **30% of principal** | `loan-math.ts` `MAX_FINANCE_CHARGE_RATE` (quote caps any higher rate) |
| Max penalty interest | **5%/month, max 3 months** | `loan-math.ts` `penaltyInterest()` |
| Affordability | Borrower keeps **≥50% of income** after obligations | `affordability.ts` (pass ≤50%, review ≤60%, fail >60%) |
| Cooling-off | Borrower may cancel within 3 business days | To be implemented (loan lifecycle, Phase 3) |
| Early settlement | No penalties, pro-rata finance charges | To be implemented (repayments, Phase 3) |
| Statements | Written/electronic statement of charges, payments, balance | To be implemented (`GET /api/loans/:id/statement`, Phase 3) |
| Disclosure | Pre-contract schedule of principal, charges, total, instalments in N$ | Quote object already carries all components |

Reference documents are in `design/uploads/`:
- `Raccoons Financial Services CC - agreement.pdf` — the actual loan agreement (borrower fields, charges table, T&Cs, NAMFISA complaints procedure)
- `RACOONS_COMPANY_PROFILE_REVISED.pdf` — company profile (philosophy, loan offerings, team)

## Domain model (summary)

- **Tenant** — a lender on the platform (slug, plan, status, accent color, town). Raccoons = slug `rfs`.
- **User** — login identity with role: `platform` (no tenant), `lender_admin`, `lender_staff`, `borrower` (linked to a Borrower record)
- **Borrower** — a lender's customer (personal, employment, bank details)
- **LoanApplication** — submitted from the public site; carries the server-computed quote + affordability result; lender approves/declines
- **Loan** — an originated loan: principal, finance charge, total, instalment, balance, status (`active`/`arrears`/`settled`/`closed`), optional collateral
- **RepaymentScheduleItem** — one instalment row per month (`paid`/`due`/`overdue`)
- **Invoice** — platform subscription billing per tenant

Loan types: `payday` (30% charge), `business` (30%), `collateral` (25%, secured).

## Non-negotiable engineering conventions

- **Money is integer N$ cents** everywhere (DB, API, domain logic). Display via `formatNad()`.
- **Multi-tenancy**: every tenant-scoped query must filter by `tenantId`. Public routes resolve tenant via `x-tenant` header / `DEFAULT_TENANT_SLUG`; authenticated routes from the JWT user.
- **Shared validation**: Zod schemas live once in `@loan-pilot/domain`, used by both Next.js forms and the NestJS `ZodValidationPipe`.
- **Strict TypeScript**; **no `let`**, **no `as` casts** (except `as const`), **arrow functions** for React components.
- TypeScript string `enum`s for domain enums (matching Prisma enum values).
- Tests are `.test.ts` (Jest). Scaffold NestJS artifacts with the **Nest CLI**, Next apps with **create-next-app**, UI with **shadcn** (Base UI / Base Vega style).
- Never create or edit `.env` files (they're untracked); use `.env.example` as documentation.
- Don't auto-commit; the user commits when ready.

## Design references

`design/` contains the original Claude-generated HTML/JSX prototypes:
- `design/site/` — marketing site look (already rebuilt in `apps/web`)
- `design/dashboard/` — lender staff + borrower dashboard prototype (reference for Phase 3/5 pages)
- `design/loanpilot/` — platform operator dashboard prototype (reference for Phase 4 pages)
- `design/screenshots/` — PNG previews of all of the above

They are **inspiration, not specification** — match the spirit (trustworthy, regulated, clean), keep shadcn defaults where they're better, and let the Prisma domain model lead.

## Current status & next steps

See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the detailed build status, runbook, seed credentials, and the phase-by-phase task list. Short version: Phases 0–1 are done and verified end-to-end (site + API + DB), Phase 2 is mostly done (auth + dashboard shell), and the next work item is the dashboard interior pages (overview, applications review, borrowers, loans).
