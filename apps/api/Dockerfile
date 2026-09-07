# syntax=docker/dockerfile:1
# Build context is the monorepo root (see deploy/docker-compose.yml).

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Corepack fetches pnpm on first use and, from 0.31, asks for confirmation first.
# It skips that prompt when CI=true, so builds pass and only the runtime hangs.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# OpenSSL is required by Prisma at build and runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app

# --- Build: install the API subtree, build domain + api, generate Prisma client ---
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter @loan-pilot/api...
RUN pnpm --filter @loan-pilot/domain build \
  && pnpm --filter @loan-pilot/api exec prisma generate \
  && pnpm --filter @loan-pilot/api build

# --- Runner: carry the built workspace (incl. Prisma CLI for migrate deploy) ---
FROM base AS runner
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/api
EXPOSE 4000
# Apply pending migrations, then start the compiled server. Invoke Prisma through the
# hoisted binary rather than `pnpm exec`: pnpm is not in the runner stage, so corepack
# would try to fetch it over the network on every container start — a boot-time
# dependency on registry.npmjs.org that took the API down when corepack began
# prompting before downloads.
CMD ["sh", "-c", "/app/node_modules/.bin/prisma migrate deploy && node dist/main"]
