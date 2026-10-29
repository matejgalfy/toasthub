# Toasthub

A mobile-first web app where friends track and compete over who eats the most toasts. Log toasts, keep
streaks, earn achievements, join clans, climb leaderboards.

- What we build: [`docs/SPEC.md`](docs/SPEC.md)
- Build order and status: [`docs/PLAN.md`](docs/PLAN.md)
- How we work (conventions, commands): [`docs/AGENTS.md`](docs/AGENTS.md)

## Quick start

Prerequisites: **Node 24** (see `.node-version`), **Bun** (version in `package.json` → `packageManager`) and
**Docker**. Bun is only the package manager. The apps run on Node.

```sh
bun install                                            # all workspaces + the pre-commit hook
docker compose -f infra/docker/docker-compose.yml up -d # Postgres, MinIO, Mailpit
cp apps/api/.env.example apps/api/.env                 # once
bun run db:migrate
bun run dev       # web → http://localhost:5173, api → http://localhost:3000/readyz
```

API docs (outside production): http://localhost:3000/api/v1/docs. Mailpit: http://localhost:8025.

Logging in locally: enter any email at http://localhost:5173/login, open the email in Mailpit and click the
link (it is valid for 15 minutes and works once). `bun run db:seed` adds onboarded sample users
(`ann|bob|cyril|dana|emil@example.com`) that sign in the same way.

Checks (the same ones CI runs):

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

End-to-end tests (Playwright, needs the Docker services and a migrated database; installs Chromium once):

```sh
cd e2e && bunx playwright install chromium && cd ..
bun run e2e       # builds the api, starts api + web unless already running
```

## Layout

| Path              | What                                        |
| ----------------- | ------------------------------------------- |
| `apps/web`        | React 19 + Vite SPA                         |
| `apps/api`        | NestJS 11 on Fastify                        |
| `packages/shared` | Zod schemas and types shared by web and api |
| `e2e`             | Playwright end-to-end tests                 |
| `infra/docker`    | Docker Compose for local services           |
| `docs`            | Spec, plan, contributor guide               |

## License

See [LICENSE](LICENSE).
