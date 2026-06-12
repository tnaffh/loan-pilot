# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

LoanPilot is a multi-tenant SaaS for Namibian micro-lenders. Turborepo + pnpm workspaces. Three apps consume one shared domain package; the domain package holds all business logic, validation, and regulatory rules.

## Commands

All run from the repo root. Package manager is **pnpm 10** (Node >= 20).

```bash
pnpm install
pnpm db:up                  # start Postgres 16 (Docker, localhost:5544)
pnpm dev                    # all apps: api :4000, web :3000, dashboard :3001
pnpm build                  # turbo build (respects ^build dependency graph)
pnpm lint
pnpm typecheck
pnpm test
pnpm format                 # prettier --write
```

Scope a command to one workspace with `--filter`:

```bash
pnpm --filter @loan-pilot/api dev
pnpm --filter @loan-pilot/domain test
```

Single test (Jest, only `api` and `domain` have tests; test files are `*.test.ts`):

```bash
pnpm --filter @loan-pilot/domain test -- affordability.test.ts
pnpm --filter @loan-pilot/api test -- applications.service.test.ts
pnpm --filter @loan-pilot/api test:e2e
```

Prisma (in `apps/api`):

```bash
pnpm --filter @loan-pilot/api prisma:generate
pnpm --filter @loan-pilot/api prisma:migrate     # migrate dev
pnpm --filter @loan-pilot/api db:seed            # seed users have password "password123"
pnpm --filter @loan-pilot/api prisma:studio
```

## Layout

- `packages/domain` (`@loan-pilot/domain`) — framework-free business logic. Only dependency is `zod`. Source of truth for enums, money math, loan pricing, affordability, and Zod schemas. Must build (`tsc`) before dependents; `pnpm dev` handles this via `^build`.
- `apps/api` (`@loan-pilot/api`) — NestJS 11 + Prisma 6 + Passport JWT. Global route prefix `/api`.
- `apps/web` (`@loan-pilot/web`) — Next.js 16 public marketing + loan application site.
- `apps/dashboard` (`@loan-pilot/dashboard`) — Next.js 16 authenticated management portal (shell built; interior pages are in progress).
- `packages/typescript-config`, `packages/eslint-config` — shared configs, inherited by every workspace.
- `docs/CONTEXT.md`, `docs/IMPLEMENTATION.md` — product/regulatory context and build status/roadmap.

Dependencies flow inward: apps depend on `domain`; `domain` depends on nothing internal.

## Cross-cutting conventions (the non-obvious parts)

**Money is integer Namibian Dollar cents everywhere** — DB (`Int` columns), API payloads, and domain math. Convert at the edges with `toCents()` / `fromCents()` and display with `formatNad()` (all in `packages/domain/src/money.ts`). Never do float arithmetic on money.

**One Zod schema, two consumers.** Schemas in `packages/domain/src/schemas.ts` (e.g. `createApplicationSchema`, `loginSchema`) are used by Next.js forms (via `zodResolver`) AND by the NestJS `ZodValidationPipe` (`apps/api/src/common/zod-validation.pipe.ts`). Add or change validation there, not in app code.

**Multi-tenancy is mandatory.** Every tenant-scoped table carries `tenantId` and every service query must filter by it. Public routes resolve the tenant from the `x-tenant` header or `DEFAULT_TENANT_SLUG` (`apps/api/src/tenants/tenants.service.ts`); authenticated routes read `tenantId` from `@CurrentUser()`. Platform-operator users have `tenantId = null`.

**Regulatory caps live in the domain, not the UI or API.** NAMFISA / Microlending Act rules are hard-coded in `packages/domain/src/loan-math.ts` (`quote()`: ≤30% finance charge, ≤5-month term, penalty caps) and `affordability.ts` (`assessAffordability()`: borrower keeps ≥50% of take-home income). Enforce product rules by going through these functions.

**Auth.** JWT (7-day) issued by `POST /api/auth/login`, carrying a `SessionUser` (`packages/domain/src/auth.ts`). Guard routes with `JwtAuthGuard` + `@Roles(...)` / `RolesGuard`; read the user with `@CurrentUser()`. Frontends store the token in `localStorage` (`lp_token`) via the dashboard's `AuthProvider`.

**String enums** in `packages/domain/src/enums.ts` mirror the Prisma enum values exactly, so a value flows unchanged from HTTP → Zod → DB. Keep them in sync.

## Code style (enforced by shared ESLint config)

- `const` only — `let` and `var` are flagged.
- No `as` casts except `as const`; avoid `any`.
- Strict TypeScript (`noUncheckedIndexedAccess`, `noImplicitOverride`).
- shadcn/ui components under `src/components/ui/**` are generated and excluded from lint — don't hand-edit them to satisfy the linter.
