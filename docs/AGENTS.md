# Toasthub — Agent & Contributor Guide

How to work in this repo. `docs/SPEC.md` says **what** to build, `docs/PLAN.md` says **in which order**
(milestones, status, handoff notes). This file says **how**.

## Before you start

1. Read `docs/PLAN.md` → the milestone you are implementing and the **Handoff notes** section.
2. Read only the SPEC sections the milestone lists. Look at existing code only where the milestone touches it.
3. Work directly on an up-to-date `main`. A branch `m<nn>-<slug>` with a PR into `main` is optional: use one for
   parallel milestones or when you want a review first.
4. Before the milestone's final commit (or PR): all checks green (see below), tick the milestone in PLAN **Status**, add 2–5 lines to
   **Handoff notes**, and add new decisions to SPEC §12.

## Toolchain

- **Node 24 LTS** is the runtime (version in `.node-version`). **Bun** is only the package manager and script
  runner (version in `package.json` → `packageManager`). Never run app code with `bun` directly (SPEC §12 D5).
- Versions are pinned exactly. Don't add a dependency that SPEC §5 doesn't list without recording it in SPEC §12.

## Commands

Run from the repo root:

| Command                                      | What it does                                                      |
| -------------------------------------------- | ----------------------------------------------------------------- |
| `bun install`                                | Install all workspaces; also installs the lefthook git hook       |
| `bun run dev`                                | Build `shared`, then watch `shared`, run `api` and `web`          |
| `bun run build`                              | Build every workspace in dependency order                         |
| `bun run lint`                               | ESLint, zero warnings allowed                                     |
| `bun run format` / `bun run format:check`    | Prettier write / check                                            |
| `bun run typecheck`                          | `tsc --noEmit` in every workspace                                 |
| `bun run test`                               | Vitest in every workspace (api integration tests need Docker)     |
| `bun run e2e`                                | Playwright against the dev stack (needs Postgres + Mailpit)       |
| `bun run db:migrate`                         | Apply Drizzle migrations to `DATABASE_URL` (from `apps/api/.env`) |
| `bun run db:seed`                            | Idempotent dev sample data (users, a clan, toasts); not in prod   |
| `bun run openapi`                            | Regenerate `apps/api/openapi.json` + the web client (commit both) |
| `bun run gen:client`                         | Only the web client: `openapi.json` → `web/src/api/schema.gen.ts` |
| `bun run --filter @toasthub/<pkg> <script>`  | Run one workspace's script (`api`, `web`, `shared`, `e2e`)        |
| `bun run --filter @toasthub/api test:unit`   | api unit tests only (no Docker); `test:int` for integration       |
| `bun run --filter @toasthub/api db:generate` | Generate a migration from the Drizzle schema (drizzle-kit)        |
| `bun run --filter @toasthub/api auth:schema` | Print Better Auth's tables to `.generated/` to diff (SPEC D25)    |

Local services: `docker compose -f infra/docker/docker-compose.yml up -d` (Postgres, MinIO + bucket, Mailpit),
then `cp apps/api/.env.example apps/api/.env` once and `bun run db:migrate`.

Dev URLs: web http://localhost:5173, api http://localhost:3000 (`/healthz`, `/readyz`, docs at `/api/v1/docs`),
Mailpit http://localhost:8025, MinIO console http://localhost:9001.

CI (`.github/workflows/ci.yml`) has two jobs: `check` (format → lint → typecheck → build → `openapi.json` is up to
date, uploaded as an artifact) and `test` (all tests, Testcontainers on the runner's Docker). The pre-commit hook
runs Prettier (auto-fix + re-stage) and ESLint on staged files. Don't bypass it with `--no-verify`.

## Repo layout

```
apps/web          React SPA (Vite)            → src/components, src/features/<area>, src/pages, src/api, src/i18n
apps/api          NestJS on Fastify           → src/modules/<area>, src/config, src/db, src/common, src/jobs, test/
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
- Errors: throw `AppError(code, message)` (`src/common/errors/app-error.ts`) or Nest HTTP exceptions. The global
  filter maps them to the SPEC §8 format (rules in SPEC §12 D24). Never leak internal messages, stack traces or
  emails to clients.
- Config: read env only through `ConfigService.get('NAME')`. A new variable goes into `src/config/env.ts` (Zod) and
  `apps/api/.env.example`.
- Database: inject with `@Inject(DB) db: Database` (`src/db/db.module.ts`). Tables are exported from
  `src/db/schema/index.ts`; generate migrations with `db:generate`, never edit an applied one.
- Lists: parse `pageQuerySchema` from `shared`, fetch `limit + 1` rows ordered by a unique keyset, and return
  `toPage(rows, limit, keysetOf)`. Read the cursor with `decodeCursor(cursor, keysetSchema)` (`src/common/pagination.ts`).
- Counts, streaks, stats, leaderboards and achievements filter `toast` with `countableToasts()`
  (`src/modules/toasts/countable-toasts.ts`: not deleted, not rejected, owner not banned). Never re-spell it.
- Photos: store and sign through `StorageService` (`src/modules/storage`). Check visibility before you call
  `presignGet()`. New uploads go through `processPhoto()` (`toasts/photo-pipeline.ts`), never stored raw.
- Any new app instance (scripts, tests) uses `createFastifyAdapter()` + `await configureApp()` from `src/app.setup.ts`.
- Don't log emails, tokens or auth headers (the pino redaction from M1 is a safety net, not a licence).
- Don't use `import type` for classes that Nest injects. DI needs the runtime reference for decorator metadata.
- Every route needs an active session unless marked `@Public()` (global `SessionGuard`). Admin routes add
  `@UseGuards(AdminGuard)`. Get the caller with `@CurrentUser()`. Never return another user's email.

**Web (`apps/web`)**

- Pages in `src/pages`, feature-specific components and hooks in `src/features/<area>`, shared UI in
  `src/components`. Server state goes through TanStack Query hooks around the generated client in `src/api`.
- Mobile-first: design at 360 px, then scale up. Accessibility: labels, keyboard navigation, alt text (jsx-a11y
  lint helps, but doesn't replace checking).
- `@/` is `apps/web/src`. It counts as a relative import: external, then `@toasthub/*`, then `@/…` and `./…`.
- **Styling:** every colour, the radius, the font and the layout widths are tokens in `src/styles/theme.css`
  (light + dark side by side; dark follows the system). Use only the semantic classes (`bg-primary`,
  `text-muted-foreground`, `bg-avatar-3`, `max-w-content`), never raw Tailwind palette colours or hex values, so
  a redesign stays a one-file change. A new token goes into `theme.css` and the `@theme inline` map in
  `src/styles/index.css`. Preview tokens and components at `/dev/ui` (dev builds only).
- shadcn/ui: add components from `apps/web` with `bunx shadcn@4.23.0 add <name>` (they land in
  `src/components/ui`, which we own and may edit). Replace raw colours they ship with (`text-white`) by tokens.
  The main sections live in `src/components/layout/nav-items.ts` (tab bar and top nav both read it).
- i18n: `t()` keys are typed against `en.json`; add every key to `sk.json` too (a test compares them). Dates
  and numbers go through `useFormat()` (`src/i18n/format.ts`): instants are shown in Europe/Bratislava time,
  `LocalDate` strings never shift a day.
- API calls: `unwrap(api.GET('/api/v1/…'))` inside a TanStack Query hook. It throws `ApiError` (`code`,
  `status`, `fields`); show `t(errorMessageKey(error))`. Never hand-write a request or response type.
- Route guards (`src/features/auth/guards.tsx`) are layout routes: `RequireAuth` > `RequireOnboarded` >
  `RequireAdmin`, plus `RedirectIfAuthenticated` for landing and login. Read the user with `useUser()`.
- The session is the `['me']` query (`features/auth/me-query.ts`): `null` = signed out. Any 401 sets it to
  `null`, so the guards send the user to `/login`. Change the own profile with `useUpdateMe()`
  (`features/account`), which writes the response back into that query. Language changes go through
  `useChangeLocale()` (saves to `/me` when signed in), never `changeLocale()` directly from UI.

## Tests

- Unit tests sit next to the code: `foo.ts` → `foo.test.ts`. Build configs exclude `*.test.ts`.
- API integration tests use `*.int.test.ts` next to the module they cover. One Testcontainers Postgres runs per
  test run with migrations applied, and every `public` table except `toast_fact` is truncated before each test.
  Build the app with `createTestApp()` from `apps/api/test/create-app.ts` and call it with `app.inject()`. Get a
  session with `signIn(app, email)` from `test/auth.ts` (real magic link via Mailpit); cookie mutations need
  `origin: WEB_ORIGIN`. A MinIO container with the photo bucket runs alongside (objects are not cleared between
  tests); presigned URLs from responses can be fetched directly.
- Web tests are `*.test.ts(x)` with Vitest + Testing Library in jsdom (config in `apps/web/vite.config.ts`).
  `src/test/setup.ts` starts i18n in English, so assert on English text. Render pages with
  `renderWithApp(ui, { session: testSession('user'), path })` (`src/test/render.tsx`, `src/test/sessions.ts`)
  and fake the API with `mockApi(request => jsonResponse(…))` (`src/test/api.ts`), which records requests.
- E2E tests live in `e2e/tests/*.spec.ts` (Playwright, one `mobile` project = Pixel 7 Chromium). Playwright
  starts the built api and the Vite dev server, or reuses ones already running. Sign up through the UI with
  `uniqueEmail()` and read the link with `magicLinkFor(email)` (`e2e/support/mailpit.ts`); the database is
  not reset between tests, so never rely on it being empty. Use role and label locators with English text.
- Business logic named in SPEC §11 (streaks, ranking, achievements, TOTW draw, visibility) must have unit tests.
  Each endpoint needs an integration test.

## Commits & PRs

- Conventional Commits: `type(scope): summary`, imperative and lowercase, ≤ 72 chars. Types: `feat`, `fix`,
  `refactor`, `test`, `docs`, `build`, `ci`, `chore`. Scope: `web`, `api`, `shared`, `e2e`, `infra`, or
  omit it.
  Example: `feat(api): add GET /healthz`.
- A milestone's main commit ends its summary with `(M<n>)`, e.g. `feat(api): add clan join requests (M11)`.
- PR title (when a branch is used): `M<n>: <milestone name>`. The body lists what changed, how it was verified, and any deviations
  from PLAN (also recorded in Handoff notes).
