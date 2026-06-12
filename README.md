# LoanPilot

> New to the project? Start with [docs/CONTEXT.md](docs/CONTEXT.md) (what we're
> building and why) and [docs/IMPLEMENTATION.md](docs/IMPLEMENTATION.md)
> (build status, runbook, and next steps).

Multi-tenant micro-lending management platform. One NestJS backend serves
several surfaces: a public marketing/apply site, an authenticated web dashboard
(platform operator, lender staff and borrower), and a mobile app. The first
tenant is **Raccoons Financial Services**, a NAMFISA-regulated Namibian
micro-lender; other lenders subscribe to the platform.

## Stack

| Layer    | Tech                                              |
| -------- | ------------------------------------------------- |
| Monorepo | Turborepo + pnpm workspaces                       |
| API      | NestJS 11 + Prisma 6 + PostgreSQL                 |
| Web      | Next.js 15 (App Router) + Tailwind v4 + shadcn/ui |
| Mobile   | React Native (Expo) — _later phase_               |
| Shared   | `@loan-pilot/domain` — Zod schemas + loan math    |

## Layout

```
apps/
  api/        NestJS API (Prisma, multi-tenant)
  web/        Next.js public marketing + apply site
  dashboard/  Next.js authenticated app (later phase)
  mobile/     React Native app (later phase)
packages/
  domain/             Shared domain model, Zod validation, loan math (cents)
  ui/                 Shared shadcn components (later phase)
  eslint-config/      Shared flat ESLint config
  typescript-config/  Shared strict TypeScript configs
design/               Original Claude design prototypes (reference only)
```

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Start Postgres (Docker)
pnpm db:up

# 3. Configure env files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. Set up the database
pnpm --filter @loan-pilot/api prisma:generate
pnpm --filter @loan-pilot/api prisma:migrate
pnpm --filter @loan-pilot/api db:seed

# 5. Run everything
pnpm dev        # turbo runs api (:4000) + web (:3000)
```

- Web: http://localhost:3000
- API health: http://localhost:4000/api/health

## Useful commands

```bash
pnpm build        # build all packages/apps
pnpm typecheck    # type-check everything
pnpm lint         # lint everything
pnpm test         # run tests
pnpm format       # prettier write
```

## Domain & compliance notes

> Postgres is exposed on host port **5544** (mapped to the container's 5432) to
> avoid clashing with other local Postgres instances. The `DATABASE_URL` in
> `apps/api/.env.example` already reflects this.

- **Multi-tenancy:** every tenant-scoped row carries `tenantId`; services filter
  on it. Platform-operator users are not tied to a tenant.
- **Money:** stored as integer Namibian Dollar (N$) cents everywhere.
- **NAMFISA / Microlending Act 2018:** terms <= 5 months, finance charge <= 30%
  of principal, penalty interest <= 5%/month for <= 3 months, the borrower keeps
  >= 50% of income (affordability), 3-day cooling-off and free early settlement.
  The pricing and affordability logic lives in `@loan-pilot/domain`.
- **Shared validation:** form/DTO schemas live once in `@loan-pilot/domain` and
  are used by both Next.js forms and NestJS request validation.
