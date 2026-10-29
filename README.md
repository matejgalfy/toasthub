# Toasthub

A mobile-first web app where friends track and compete over who eats the most toasts. Log toasts, keep
streaks, earn achievements, join clans, climb leaderboards.

- What we build: [`docs/SPEC.md`](docs/SPEC.md)
- Build order and status: [`docs/PLAN.md`](docs/PLAN.md)
- How we work (conventions, commands): [`docs/AGENTS.md`](docs/AGENTS.md)

## Quick start

Prerequisites: **Node 24** (see `.node-version`) and **Bun** (version in `package.json` → `packageManager`).
Bun is only the package manager. The apps run on Node.

```sh
bun install       # installs all workspaces and the pre-commit hook
bun run dev       # web → http://localhost:5173, api → http://localhost:3000/healthz
```

Checks (the same ones CI runs):

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

## Layout

| Path              | What                                        |
| ----------------- | ------------------------------------------- |
| `apps/web`        | React 19 + Vite SPA                         |
| `apps/api`        | NestJS 11 on Fastify                        |
| `packages/shared` | Zod schemas and types shared by web and api |
| `e2e`             | Playwright end-to-end tests                 |
| `docs`            | Spec, plan, contributor guide               |

## License

See [LICENSE](LICENSE).
