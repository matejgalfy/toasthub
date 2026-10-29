# Toasthub — Agent & Contributor Guide

How to work in this repo. `docs/SPEC.md` says **what** to build, `docs/PLAN.md` says **in which order**
(milestones, status, handoff notes). This file says **how**.

## Before you start

1. Read `docs/PLAN.md` → the milestone you are implementing and the **Handoff notes** section.
2. Read only the SPEC sections the milestone lists. Look at existing code only where the milestone touches it.
3. Branch `m<nn>-<slug>` from an up-to-date `main`. One milestone = one branch = one PR.
4. Before opening the PR: all checks green (see below), tick the milestone in PLAN **Status**, add 2–5 lines to
   **Handoff notes**, and add new decisions to SPEC §12.

## Toolchain

- **Node 24 LTS** is the runtime (version in `.node-version`). **Bun** is only the package manager and script
  runner (version in `package.json` → `packageManager`). Never run app code with `bun` directly (SPEC §12 D5).
- Versions are pinned exactly. Don't add a dependency that SPEC §5 doesn't list without recording it in SPEC §12.

## Commands

Run from the repo root:

| Command                                     | What it does                                                |
| ------------------------------------------- | ----------------------------------------------------------- |
| `bun install`                               | Install all workspaces; also installs the lefthook git hook |
| `bun run dev`                               | Build `shared`, then watch `shared`, run `api` and `web`    |
| `bun run build`                             | Build every workspace in dependency order                   |
| `bun run lint`                              | ESLint, zero warnings allowed                               |
| `bun run format` / `bun run format:check`   | Prettier write / check                                      |
| `bun run typecheck`                         | `tsc --noEmit` in every workspace                           |
| `bun run test`                              | Vitest in every workspace that has tests                    |
| `bun run --filter @toasthub/<pkg> <script>` | Run one workspace's script (`api`, `web`, `shared`, `e2e`)  |

Dev URLs: web http://localhost:5173, api http://localhost:3000 (`/healthz`).

CI (`.github/workflows/ci.yml`) runs format check → lint → typecheck → test → build. The pre-commit hook runs
Prettier (auto-fix + re-stage) and ESLint on staged files. Don't bypass it with `--no-verify`.

## Repo layout

```
apps/web          React SPA (Vite)            → src/components, src/features/<area>, src/pages, src/api, src/i18n
apps/api          NestJS on Fastify           → src/modules/<area>, src/db, src/jobs
packages/shared   Zod schemas, DTO types, enums, achievement definitions — imported by web and api
e2e               Playwright tests (from M5)
infra             docker/ and k8s/ (from M1 / M19)
docs              SPEC.md, PLAN.md, AGENTS.md
```

### How `@toasthub/shared` is consumed

- `shared` is ESM and builds to `dist/` with `tsc`. Its `exports` has a custom condition `@toasthub/source` that
  points at `src/index.ts`.
- Typecheck, ESLint, Vite and Vitest use that condition (`customConditions` in `tsconfig.base.json`,
  `resolve.conditions` in Vite), so they read `shared` source directly with no build step.
- The api **build** (`apps/api/tsconfig.build.json`) turns the condition off and compiles against `shared/dist`.
  The api is CommonJS and loads the ESM `shared` through Node's `require(esm)`. So build `shared` before running
  the api. `bun run dev` and `bun run build` already do this.
- Inside `shared`, relative imports use the `.js` extension (`./health.js`), as NodeNext requires. Only
  erasable TypeScript syntax is allowed there (no `enum`, no `namespace`). Use `as const` objects with Zod enums.

## Code conventions

**General**

- TypeScript strict everywhere, plus `noUncheckedIndexedAccess`. No `any`, no non-null `!` (lint enforces most of
  this). Prefer `unknown` + Zod parsing at boundaries.
- File names are `kebab-case` (`health.controller.ts`, `toast-card.tsx`). React components are `PascalCase` named
  exports. No default exports, except where a tool requires one (config files).
- Import order: external packages, then `@toasthub/*`, then relative imports, with a blank line between groups.
- Comments explain _why_, not _what_. No TODO without a linked issue.
- All user-facing text goes through i18n with both `sk` and `en` keys (from M4). Day boundaries are always
  Europe/Bratislava (SPEC §12 D2). Use the shared time utils (from M3), never raw `Date` math.

**API (`apps/api`)**

- One NestJS module per feature area in `src/modules/<area>/`: `<area>.module.ts`, `<area>.controller.ts`,
  `<area>.service.ts`, plus `<area>.policy.ts` for pure permission logic where needed.
- Controllers stay thin: parse input, call a service, return a DTO. Business rules live in services or in pure
  functions, which are easy to unit test.
- Request and response shapes are Zod schemas in `packages/shared`. The api never defines its own copy of a DTO.
- Errors: throw Nest HTTP exceptions or domain errors that the global filter maps to the SPEC §8 error format and
  codes (filter from M1). Never leak internal messages, stack traces or emails to clients.
- Don't log emails, tokens or auth headers (the pino redaction from M1 is a safety net, not a licence).
- Don't use `import type` for classes that Nest injects. DI needs the runtime reference for decorator metadata.

**Web (`apps/web`)**

- Pages in `src/pages`, feature-specific components and hooks in `src/features/<area>`, shared UI in
  `src/components`. Server state goes through TanStack Query hooks around the generated client in `src/api`.
- Mobile-first: design at 360 px, then scale up. Accessibility: labels, keyboard navigation, alt text (jsx-a11y
  lint helps, but doesn't replace checking).

## Tests

- Unit tests sit next to the code: `foo.ts` → `foo.test.ts`. Build configs exclude `*.test.ts`.
- API integration tests (Testcontainers Postgres, from M1) use `*.int.test.ts` next to the module they cover.
- E2E tests live in `e2e/` (Playwright, mobile viewport, from M5).
- Business logic named in SPEC §11 (streaks, ranking, achievements, TOTW draw, visibility) must have unit tests.
  Each endpoint needs an integration test.

## Commits & PRs

- Conventional Commits: `type(scope): summary`, imperative and lowercase, ≤ 72 chars. Types: `feat`, `fix`,
  `refactor`, `test`, `docs`, `build`, `ci`, `chore`. Scope: `web`, `api`, `shared`, `e2e`, `infra`, or
  omit it.
  Example: `feat(api): add GET /healthz`.
- PR title: `M<n>: <milestone name>`. The body lists what changed, how it was verified, and any deviations
  from PLAN (also recorded in Handoff notes).
