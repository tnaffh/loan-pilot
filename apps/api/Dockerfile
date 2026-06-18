# syntax=docker/dockerfile:1
# Build context is the monorepo root (see deploy/docker-compose.yml).

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
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
# Apply pending migrations, then start the compiled server.
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/main"]
