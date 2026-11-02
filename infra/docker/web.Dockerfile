# syntax=docker/dockerfile:1
# The web image: the Vite build served by nginx (SPA fallback, /api proxy, cache headers, CSP).
# Build from the repo root: docker build -f infra/docker/web.Dockerfile -t toasthub-web .

# Keep in step with .node-version and package.json → packageManager.
FROM oven/bun:1.4.4-slim AS bun

FROM node:24.22.2-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
# Every workspace manifest, so `--frozen-lockfile` sees the same workspaces as bun.lock.
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY e2e/package.json e2e/
RUN bun install --frozen-lockfile --ignore-scripts --filter @toasthub/web
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
# Vite reads `shared` from source (the `@toasthub/source` condition), so it needs no build first.
RUN bun run --filter @toasthub/web build

# Runs as an unprivileged user and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.30.6-alpine
# The image's entrypoint fills ${…} in templates/*.template into conf.d at start.
ENV API_UPSTREAM=http://api:3000 \
    PHOTO_ORIGIN=""
COPY infra/docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY infra/docker/nginx/security-headers.conf /etc/nginx/templates/snippets/security-headers.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
