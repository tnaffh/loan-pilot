# syntax=docker/dockerfile:1
# Build context is the monorepo root (see deploy/docker-compose.yml).

FROM node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# --- Build: NEXT_PUBLIC_* must be present at build time (inlined into the bundle) ---
FROM base AS build
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm install --frozen-lockfile --filter @loan-pilot/dashboard...
RUN pnpm --filter @loan-pilot/domain build \
  && pnpm --filter @loan-pilot/dashboard build

# --- Runner: minimal Next.js standalone server ---
FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3001
WORKDIR /app
COPY --from=build /app/apps/dashboard/.next/standalone ./
COPY --from=build /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build /app/apps/dashboard/public ./apps/dashboard/public
EXPOSE 3001
CMD ["node", "apps/dashboard/server.js"]
