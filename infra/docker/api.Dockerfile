# syntax=docker/dockerfile:1
# The api image, also used for the worker (APP_ROLE=worker) and the migration job (SPEC §12 D10).
# Build from the repo root: docker build -f infra/docker/api.Dockerfile -t toasthub-api .

# Node is the runtime; Bun only installs and runs scripts (SPEC §12 D5). Keep in step with .node-version and
# package.json → packageManager.
FROM oven/bun:1.4.4-slim AS bun

FROM node:24.22.2-slim AS base
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
# Every workspace manifest, so `--frozen-lockfile` sees the same workspaces as bun.lock.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/

FROM base AS build
# --ignore-scripts skips the root `prepare` (lefthook needs a git checkout).
RUN bun install --frozen-lockfile --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN bun run --filter @toasthub/shared build && bun run --filter @toasthub/api build

FROM base AS prod-deps
# --omit peer: Bun installs optional peers too, and Better Auth's (React, Vite, Vitest, drizzle-kit, …) would
# double the image. Required peers must therefore be direct dependencies (`@opentelemetry/api` for pg-boss).
RUN bun install --frozen-lockfile --ignore-scripts --production --omit peer --filter @toasthub/api

FROM node:24.22.2-slim
ENV NODE_ENV=production
WORKDIR /app
# Same paths as in the earlier stages, so the workspace symlinks in node_modules stay valid.
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/apps/api/node_modules apps/api/node_modules
COPY --from=prod-deps /app/packages/shared/node_modules packages/shared/node_modules
COPY packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
# The migrator reads the SQL files from src (src/db/migrate.ts).
COPY apps/api/src/db/migrations apps/api/src/db/migrations

WORKDIR /app/apps/api
USER node
EXPOSE 3000
# Override for the other roles: `node dist/db/migrate.js`, `node dist/modules/admin/promote-admin.js <email>`.
CMD ["node", "--enable-source-maps", "dist/main.js"]
