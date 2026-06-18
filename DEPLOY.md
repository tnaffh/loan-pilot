# Deploying LoanPilot

LoanPilot ships as three Docker images — **api** (NestJS), **web** (public site),
**dashboard** (lender portal) — plus **Postgres**, orchestrated by
[`deploy/docker-compose.yml`](deploy/docker-compose.yml). Uploaded documents are stored in
**S3-compatible object storage** (AWS S3 or Cloudflare R2) in production.

## Architecture

```
browser ──► web        (Next.js :3000)  ─┐
browser ──► dashboard  (Next.js :3001)  ─┼─► api (NestJS :4000) ──► Postgres
                                          │                     └──► S3 / R2 (documents)
```

Put a reverse proxy / TLS terminator (Caddy, Nginx, Traefik, or your platform's load
balancer) in front, mapping your domains to the three container ports.

## Prerequisites

- A host with Docker + Docker Compose v2.
- Three DNS records, e.g. `loanpilot.example.com` (web), `app.loanpilot.example.com`
  (dashboard), `api.loanpilot.example.com` (api).
- An S3 or R2 bucket plus an access key/secret scoped to it.

## One-time setup

1. **Create the env file** and fill in every `CHANGE_ME`:
   ```bash
   cp deploy/.env.example deploy/.env
   # edit deploy/.env
   ```
   Critical values: `JWT_SECRET` (long random string — the API refuses to boot in
   production with the default), `POSTGRES_PASSWORD` + matching `DATABASE_URL`,
   `CORS_ORIGINS` and `NEXT_PUBLIC_API_URL` (must point at your public API domain, with the
   `/api` suffix), and the `S3_*` credentials.

   > `NEXT_PUBLIC_API_URL` is **baked into the web/dashboard images at build time** — if you
   > change it, rebuild those images.

2. **Provision the bucket** (R2 example): create a bucket named to match `S3_BUCKET`, an API
   token with object read/write, and set `S3_ENDPOINT` to your account's R2 endpoint. Leave
   `S3_PUBLIC_URL` blank to serve documents via short-lived presigned URLs (recommended for
   sensitive docs), or set it to a public bucket base URL.

## Build & run

From the repo root:

```bash
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

- The **api** container runs `prisma migrate deploy` automatically on startup, then serves on
  `:4000`. Health: `GET /api/health`.
- **web** → `:3000`, **dashboard** → `:3001`.

## Seeding data (one-off, optional)

The production start does **not** seed. To load demo data or the real register, run inside the
api container:

```bash
# Demo seed (login users get password "password123" — change before real use):
docker compose -f deploy/docker-compose.yml exec api pnpm db:seed

# Import the Raccoons register fixtures:
docker compose -f deploy/docker-compose.yml exec api pnpm db:import
```

## Updating / redeploying

```bash
git pull
docker compose -f deploy/docker-compose.yml --env-file deploy/.env up -d --build
```

New migrations apply automatically when the api container restarts.

## Local development (unchanged)

```bash
pnpm install
pnpm db:up        # local Postgres on :5544
pnpm dev          # api :4000, web :3000, dashboard :3001
```

Locally, document storage defaults to `STORAGE_DRIVER=local` (files on disk, served from
`/uploads`) — no S3 needed. See [`apps/api/.env.example`](apps/api/.env.example).

## Deploy checklist

- [ ] `deploy/.env` filled — no `CHANGE_ME` left.
- [ ] `JWT_SECRET` is a strong random value.
- [ ] `DATABASE_URL` password matches `POSTGRES_PASSWORD`.
- [ ] `CORS_ORIGINS` lists the web + dashboard domains (https).
- [ ] `NEXT_PUBLIC_API_URL` points at the public API (`https://…/api`).
- [ ] S3/R2 bucket + credentials work (`STORAGE_DRIVER=s3`).
- [ ] DNS → reverse proxy → container ports (3000 / 3001 / 4000), with TLS.
- [ ] First boot applied migrations (`docker compose logs api`).
