# Toasthub — Implementation Plan

> Derived from `docs/SPEC.md` (2026-10-29). SPEC says **what**, this file says **in which order**.
> Conventions and how-to-work rules live in `docs/AGENTS.md` (created in M0).

---

## How to use this plan

Each milestone fits in **one chat** and lands on `main` as one commit (or a short series). The scope is set so that an
agent does not have to read the whole codebase or the whole spec.

**Starting a milestone (new chat):**
```
Implement milestone M<n> from docs/PLAN.md. Read docs/AGENTS.md, the "Handoff notes" section of docs/PLAN.md,
and only the SPEC sections listed for the milestone.
```

**Rules for every milestone**
1. Work directly on an up-to-date `main`; no milestone branch is needed. Use the branch name from the **Status**
   table and open a PR into `main` only when milestones run in parallel or the work needs review first.
2. Read only the SPEC sections listed under **Read**. Look at existing code only where the milestone touches it.
3. Stay inside **Scope**. If something is missing or a choice is needed, write it in Handoff notes. Don't grow the
   milestone.
4. The SPEC §11 Definition of Done applies, scoped to the milestone: tests, lint/format/typecheck green, SK + EN
   strings, OpenAPI regenerated, no stray TODOs. Backend-only milestones have no E2E test; the matching UI
   milestone adds it.
5. Before the milestone's final commit (or before opening the PR, if you used a branch): tick the milestone in the **Status** table, add 2–5 lines to **Handoff notes** (what
   changed, new conventions, gotchas), and add any new decision to SPEC §12.

**Sizing guardrails.** About ≤ 25 files touched and one feature area per milestone. If a milestone is clearly too
big once you start, split it at the marked `✂` point and record the split in Handoff notes.

---

## Status

| # | Milestone | Branch (optional) | Depends on | Status |
|---|-----------|--------|------------|--------|
| M0 | Monorepo scaffold, tooling, CI | `m00-scaffold` | — | ☑ |
| M1 | API foundation and local infra | `m01-api-foundation` | M0 | ☑ |
| M2 | Auth backend (Better Auth) | `m02-auth-api` | M1 | ☑ |
| M3 | Domain schema, time utils, seeds | `m03-domain-schema` | M2 | ☑ |
| M4 | Web shell (UI kit, i18n, API client, layout) | `m04-web-shell` | M1 | ☑ |
| M5 | Auth UI, onboarding, settings, E2E harness | `m05-auth-ui` | M2, M4 | ☑ |
| M6 | Toast logging backend (photos, storage, flags) | `m06-toasts-api` | M3 | ☑ |
| M7 | Streaks, achievements, facts, `/home` | `m07-home-api` | M6 | ☑ |
| M8 | Home screen UI and PWA | `m08-home-ui` | M5, M7 | ☑ |
| M8b | Toast sessions: history and editing (API + UI) | `m08b-toast-sessions` | M8 | ☑ |
| M9 | Profiles, visibility, stats, heatmap (API) | `m09-profiles-api` | M7 | ☑ |
| M10 | Profile UI | `m10-profile-ui` | M8b, M9 | ☑ |
| M11 | Clans backend: lifecycle and join requests | `m11-clans-api` | M7 | ☑ |
| M12 | Clan roles, feed, likes, reports (API) | `m12-clan-social-api` | M8b, M9, M11 | ☑ |
| M13 | Clan UI | `m13-clans-ui` | M10, M12 | ☑ |
| M14 | Leaderboards (API + UI) | `m14-leaderboards` | M12, M8 | ☑ |
| M15 | Worker mode, jobs, Toast of the week (API + UI) | `m15-totw` | M12, M8 | ☑ |
| M16 | Admin backend | `m16-admin-api` | M15 | ☑ |
| M17 | Admin UI | `m17-admin-ui` | M16, M13 | ☑ |
| M18 | Production images, Sentry, CI image build | `m18-containers` | M15 | ☐ |
| M19 | Kubernetes (Kustomize, CNPG, Sealed Secrets) | `m19-k8s` | M18 | ☐ |
| M20 | Launch hardening | `m20-hardening` | all | ☐ |

**Parallel tracks (team of 3).** After M3, backend work (M6 → M7 → M9/M11 → M12) and frontend work
(M4 → M5 → M8 → M8b) run side by side. M18 and M19 depend only on what they deploy and can start once M15 is merged. Two
milestones may run at the same time only if they don't both edit the Drizzle schema. Merge the schema change first,
or keep schema edits in one milestone.

---

## Phase A — Foundations

### M0 — Monorepo scaffold, tooling, CI
**Read:** SPEC §5, §6 (folder structure), §11, §12 D5, D18.
**Scope**
- Bun workspaces: `apps/web`, `apps/api`, `packages/shared`, `e2e`. Root scripts: `dev`, `build`, `lint`, `format`,
  `format:check`, `typecheck`, `test`.
- Check that the majors in SPEC §5 are still current (Node 24, React 19, NestJS 11, Tailwind 4, Postgres 18, …) and
  pin exact versions.
- Shared `tsconfig` base (strict); `.editorconfig`; Prettier with `prettier-plugin-tailwindcss`; ESLint flat config
  with typescript-eslint `strict-type-checked`, plus react-hooks and jsx-a11y for `web`; zero warnings allowed.
- lefthook pre-commit hook: Prettier and ESLint on staged files.
- Minimal app stubs: Vite + React "hello" page; NestJS on the Fastify adapter with `GET /healthz`; `packages/shared`
  exporting one Zod schema that both apps import (proves the workspace wiring works).
- GitHub Actions `ci.yml`: install with cache → format check → lint → typecheck → build.
- `docs/AGENTS.md`: coding conventions (module layout, naming, test placement, error handling, commit style, how to
  run things) and a pointer to this plan. `README.md` with the quick start.

**Done when:** fresh clone → `bun install && bun run lint typecheck build` passes locally and in CI; the web stub
renders a value from `shared`.

### M1 — API foundation and local infra
**Read:** SPEC §6, §8 (header, error format, pagination), §10 (logging, security basics).
**Scope**
- `infra/docker/docker-compose.yml`: Postgres 18, MinIO (bucket auto-created), Mailpit.
- Config module: env validated with Zod at startup, typed config service, `.env.example`.
- Drizzle connection, drizzle-kit config, migration runner script (`bun run db:migrate`), empty first migration.
- nestjs-pino with a request ID, redaction of emails, tokens and auth headers.
- Global exception filter that produces the SPEC §8 error format and codes, with a test for each code.
- nestjs-zod validation pipe; OpenAPI generated from Zod and served at `/api/v1/docs` outside prod;
  `bun run openapi` writes `openapi.json`.
- Global `/api/v1` prefix; `/healthz` and `/readyz` (DB ping) outside the prefix.
- Cursor pagination helper (`?cursor=&limit=` default 20, max 50 → `{items, nextCursor}`) in `shared` and `api`.
- Vitest in `api` and `shared`; Testcontainers Postgres harness (one container per test run, migrations applied,
  truncate between tests); a CI test job; CI uploads `openapi.json` as an artifact.

**Done when:** `docker compose up` + `bun run dev` serves `/readyz`=200; an integration test runs against real
Postgres in CI.

### M2 — Auth backend (Better Auth)
**Read:** SPEC §3, §4.1, §4.2, §7 (auth tables, User), §8 (`/auth/*`, `/me`), §10 Security, §12 D3, D4, D11, D13.
**Scope**
- Mail module: nodemailer SMTP transport (Mailpit in dev), magic-link email template in SK and EN.
- Better Auth with the magic-link (15 min, single use), bearer and Drizzle adapter plugins, mounted on the Fastify
  instance at `/api/v1/auth`. Sessions: 30 days, refreshed at most once a day. Rate limits use DB storage: 5/h per
  email, 20/h per IP.
- Auth tables generated with the Better Auth CLI into the Drizzle schema. `additionalFields`: `avatar_id`, `locale`,
  `profile_visibility`, `role`, `status`; `display_name` maps to `name`; `email` is citext. Migration.
- `SessionGuard` (cookie or bearer, active users only), `AdminGuard`, `@CurrentUser()` decorator, `Origin` check on
  mutating requests, cookie flags `httpOnly`, `Secure`, `SameSite=Lax`, CORS limited to the web origin.
- Banned users: login is refused and their sessions are revoked (the helper is used later by admin).
- `GET /me` (with `onboarded` flag) and `PATCH /me` (Zod schemas in `shared`: display name 2–30 chars, avatar 1–6,
  locale, visibility).
- Integration tests: request link → read the Mailpit API → verify → session; used or expired link fails; unknown
  email still returns success; rate limit; bearer works; banned user is rejected.

**Done when:** a full magic-link login works with curl against the dev stack and the tests pass.

### M3 — Domain schema, time utils, seeds
**Read:** SPEC §4 intro (time zone), §4.11, §4.12, §7 (all non-auth entities), §12 D2, D7, D8, D9.
**Scope**
- Drizzle schema and migration for Toast, Like, Clan, ClanMembership, ClanJoinRequest, UserAchievement,
  ToastOfTheWeek, Flag, ToastFact, AppSetting, with every index, partial unique index and FK from §7 (one owner per
  clan, one pending request per user, unique `(subject_user_id, type, local_date)` on flags, case-insensitive unique
  clan name). UUID v7 IDs.
- `shared`: enums (toast status, clan role, flag type and status, etc.), achievement definitions (code, name key,
  condition metadata).
- Time utils (in `shared` or `api`, unit tested): `localDate(ts)` in Europe/Bratislava, week (Mon–Sun), month and
  year ranges, `dayNumber` for the fact rotation, DST edge cases.
- Settings service: typed getters and setters for `flag_daily_threshold` (8) and `clan_max_members` (10), with
  defaults seeded.
- Seeds: about 10 placeholder SK + EN facts (Q3 is still open, so record it in Handoff notes); a dev seed script
  with sample users and toasts, idempotent.

**Done when:** migrations apply cleanly on an empty DB; time-util and settings tests pass.

---

## Phase B — Web foundation

### M4 — Web shell
**Read:** SPEC §5 (frontend rows), §6 (web folders), §9 (navigation, breakpoints, theme), §10 (a11y, i18n).
**Scope**
- Tailwind 4 + shadcn/ui setup, a warm "toast" palette, light and dark mode following the system setting.
- React Router with the route tree from §9 (placeholder pages); `RequireAuth`, `RequireOnboarded` and
  `RequireAdmin` route guards (wired to `/me` in M5).
- TanStack Query client; an OpenAPI → TypeScript client generator (pick one, note the choice in §12) as a script
  `bun run gen:client` that reads `apps/api` `openapi.json`; the error `code` maps to an i18n message.
- i18next: `sk.json` and `en.json`, initial language from the browser, date and number formatting helpers.
- Layout: bottom tab bar on mobile (Home, Leaderboards, Clan, Profile), top nav from `md` up, max width about
  640 px; initials avatar component.
- Vite dev proxy `/api` → API (no CORS in dev either).
- Vitest + Testing Library set up with one component test.

**Done when:** the app runs at 360 px and desktop widths, switches language, and the generated client typechecks.

### M5 — Auth UI, onboarding, settings, E2E harness
**Read:** SPEC §4.1 acceptance, §4.2, §9 (`/`, `/login`, `/auth/callback`, `/onboarding`, `/settings`).
**Scope**
- Landing, login (email → "check your inbox"), callback (success → onboarding or home; error → "send new link"),
  onboarding (display name, avatar picker with 6 options using the initials fallback, visibility), settings
  (name, avatar, visibility, language persisted to `locale`, logout).
- Wire the route guards to `/me`.
- Playwright project with a mobile viewport, the dev stack started by a script, a helper that fetches the magic link
  from the Mailpit API. E2E: sign up → onboarding → home placeholder; an expired or used link shows the resend
  option. CI job for E2E.

**Done when:** the E2E tests pass in CI.

---

## Phase C — Toasting core

### M6 — Toast logging backend
**Read:** SPEC §4.3, §4.4 (BR-MOD-1), §6 (photos), §7 Toast, §8 (`POST/DELETE /toasts`), §10 Security, §14 Q4.
**Scope**
- Storage module: S3 client (MinIO in dev), put and delete, 1 h presigned GET helper (the visibility check comes in
  M9).
- Image pipeline: 10 MB limit (413), magic-byte check for JPEG/PNG/WebP/HEIC, sharp → WebP, max 1600 px, EXIF
  stripped. Unit test that GPS data is gone.
- `POST /toasts` (multipart, optional photo): `eaten_at` set by the server, `local_date` computed, `clan_id` set to
  the current membership. Rate limit 30/h per user (in-memory for now; Q4 is still open, so record it in Handoff
  notes). Response `{toast, newAchievements: []}` (the evaluation hook comes in M7).
- `DELETE /toasts/:id`: owner only, soft delete, removes likes.
- Count-threshold flag: when the day's count goes over the setting, insert a `count_threshold` flag with
  `ON CONFLICT DO NOTHING`. The toast keeps counting.
- A shared `countableToasts` query fragment (not deleted, not rejected, active user) that every later aggregate
  reuses.

**Done when:** integration tests cover creating with and without a photo, a bad file type, too large, delete by
owner and by someone else, and the flag created exactly once.

### M7 — Streaks, achievements, facts, `/home`
**Read:** SPEC §4.5, §4.11, §4.12, §8 (`/home`), §12 D8, D9.
**Scope**
- Streak service: pure function over a sorted list of distinct local dates → `{current, longest}`, following
  BR-STREAK-2 (unit tested well: gaps, today with no toast yet, DST, a single day). User and clan variants use the
  indexed SQL from D8.
- Achievement service: evaluates the codes from `shared` after a trigger (`toast_logged`, `clan_joined`,
  `totw_won`), inserts idempotently, and returns the newly earned ones. This milestone wires `toast_logged` (first
  bite, shutterbug, streak 7 and 30, 100 and 1,000, early bird before 07:00, midnight snack 00:00–03:59 local).
  Earned achievements survive toast deletion.
- Facts service: `facts[dayNumber mod count]` in the user's locale.
- `GET /home`: `todayCount`, `streak`, `clanStreak?`, `fact`, `toastOfTheWeek: null` (filled in M15).
- `POST /toasts` now returns `newAchievements`.

**Done when:** unit tests for streaks and each achievement condition pass; an integration test for `/home` passes.

### M8 — Home screen UI and PWA
**Read:** SPEC §2 G1, §4.3 acceptance, §9 `/home`, §10 PWA.
**Scope**
- Home: large "+ Toast" button → dialog with the number of toasts (default 1) and an optional photo (pick/take,
  preview) → confirm → upload (optimistic update of the today count and streak); no separate camera button.
  Today's count, streak, clan streak if any, fact card, Toast of the week card placeholder, a toast notification
  for new achievements (shadcn sonner).
- vite-plugin-pwa: manifest, icons (placeholders are fine), app-shell caching, no offline logging.
- E2E: log in → "+ Toast" → confirm → counter is 1 and streak is 1; several toasts with a fixture photo.

**Done when:** the E2E test passes and Lighthouse reports the app as installable.

### M8b — Toast sessions: history and editing (API + UI)
**Read:** SPEC §4.3 (BR-TOAST-3, 5–7, acceptance), §4.4 (BR-MOD-1), §4.12, §7 ToastSession + Toast, §8
(`/toast-sessions`, `/me/toast-sessions`), §9 `/toasts`, §12 D39, D41, D43.
**Scope**
- Schema: `toast_session` table, required `toast.session_id`, and a migration that gives every existing toast its
  own session. Seeds create sessions.
- Session edit policy (pure, unit tested): owner only; the session's `local_date` is today (shared time utils);
  no rejected toast; a hidden photo can be removed but not replaced; count 1–10; lowering removes the newest
  toasts, never the lead toast.
- `POST /toast-sessions` replaces `POST /toasts`: all toasts in one transaction, the photo through
  `processPhoto()` onto the lead toast, the rate limit counts toasts, BR-MOD-1 check, achievements. Remove
  `POST /toasts` and `DELETE /toasts/:id`.
- `GET /me/toast-sessions` (cursor, own photos presigned, `editable`), `PATCH` count, `PUT`/`DELETE` photo,
  `DELETE` session; 409 after the session's day. A replaced or removed photo's object is not deleted at once (an
  open `photo_report` may point at it): record how it is tracked for the M15 cleanup in §12.
- Web: `useLogToasts()` sends one `POST /toast-sessions` (drop the per-toast loop and the partial-failure notice
  from D41). "My toasts" page at `/toasts`: sessions grouped by day with infinite scroll; today's sessions open an
  edit dialog (count stepper and photo picker reused from the M8 log dialog, delete with a confirmation), older
  ones are read-only. Every change invalidates `['home']`. A "My toasts" link on home.
- E2E: log 2 toasts → My toasts shows one session of 2 → raise it to 3 and add a photo → home shows 3 → delete
  the session → home shows 0.

✂ If it is too big: move the web part (page, edit dialog, E2E) into its own milestone right after.

**Done when:** unit tests for the edit policy, integration tests for each endpoint (including 409 on yesterday's
session, 403 on someone else's, and a lowered count that keeps the lead toast and its photo), and the E2E test
pass.

---

## Phase D — Profiles

### M9 — Profiles, visibility, stats, heatmap (API)
**Read:** SPEC §4.2 (visibility), §4.6, §6 (presigned URLs), §8 (`/users/:id/*`), §10 Privacy.
**Scope**
- Visibility policy service (pure and unit tested): viewer × subject × clanmate status × visibility → `full` or
  `reduced`. Also exposes `canSeePhoto(viewer, toast)`, which already handles the clanmate and TOTW-winner
  exceptions (the TOTW rule is a stub until M15).
- `GET /users/:id`: reduced profile = name, avatar and counts; email is never returned.
- `GET /users/:id/toasts` (cursor; photos as presigned URLs only after `canSeePhoto`), `/stats` (total, averages
  per day, week and month since the first toast, best day, streaks), `/heatmap?year=`, `/achievements` (all codes,
  with `earnedAt` where earned).

**Done when:** integration tests cover each endpoint for public, clan-only + clanmate, and clan-only + stranger.

### M10 — Profile UI
**Read:** SPEC §9 `/u/:id`, §10 a11y.
**Scope**
- Profile page: avatar, name, stats cards, year heatmap (accessible, with a year switch), achievement grid (earned
  with date, locked greyed out), photo grid with infinite scroll (alt text), a "My toasts" link on the own profile
  (editing and deleting happen there, M8b), a reduced view for clan-only profiles.
- The Profile tab links to your own profile.
- E2E: log a toast → profile shows total 1, the heatmap cell and the First Bite achievement; delete the session in
  My toasts → total 0, achievement kept.

---

## Phase E — Clans

### M11 — Clans backend: lifecycle and join requests
**Read:** SPEC §3 (clan roles), §4.8, §7 (Clan, ClanMembership, ClanJoinRequest), §8 (clan rows up to
`/me/clan-request`).
**Scope**
- Clan policy service (pure): which role can do which action on whom (unit tested as a matrix).
- `GET /clans` (search, member count, cursor), `POST /clans` (creator becomes Owner, 409 if already in a clan),
  `GET /clans/:id` (members, roles, `streak {current, longest}`, `myRole`), `PATCH` and `DELETE` (Owner; delete is a
  soft delete and removes memberships and pending requests).
- Join requests: `POST /clans/:id/join` (one pending per user, 409 if in a clan), list pending (Officer+),
  approve (in a transaction: fails with 409 when full, cancels other pending requests, awards the `clansman`
  achievement), reject, `DELETE /me/clan-request`.
- `POST /clans/:id/leave` (the Owner gets 409).

✂ If it is too big: move `PATCH`/`DELETE` clan to M12.

**Done when:** integration tests cover the BR-CLAN rules, including clan-full and concurrent approvals.

### M12 — Clan roles, feed, likes, reports (API)
**Read:** SPEC §4.4 (BR-MOD-3), §4.8 (feed), §4.9, §8 (members, transfer, feed, like, report rows), §12 D43.
**Scope**
- `PATCH /clans/:id/members/:userId` (promote and demote, Owner only), `DELETE` (kick; Officers can kick Members
  only), `POST /clans/:id/transfer` (atomic swap that keeps the one-owner index valid).
- `GET /clans/:id/feed` (members only): current members' toast sessions, newest first, one item per session with
  its count and lead toast id, presigned photo (clanmates always see them), like count and `likedByMe`.
- `POST`/`DELETE /toasts/:id/like` on a session's lead toast (idempotent; only if the viewer can see the toast);
  include like counts in the toast list DTOs from M9.
- `POST /toasts/:id/report` (photo toasts only, optional reason, creates a `photo_report` flag, rate limited) → 202.

**Done when:** integration tests for each endpoint and the role matrix pass.

### M13 — Clan UI
**Read:** SPEC §9 (`/clans`, `/clans/new`, `/clans/:id`).
**Scope**
- Clan browser (search, member count, "Create clan"), create form, clan page: header with current and longest
  streak and a join / cancel request / leave button; tabs Feed (with 🍞 like, report photo), Leaderboard
  (placeholder until M14), Members (roles; promote, demote and kick menus by role); requests panel for Officers+;
  Owner settings (edit, transfer, delete).
- The Clan tab goes to your clan or to the browser. The home clan streak links here.
- E2E with two users: A creates a clan, B requests, A approves, B sees the feed and likes A's toast session.

✂ If it is too big: move the Owner settings and member role menus into M17.

---

## Phase F–G — Competition and the weekly draw

### M14 — Leaderboards (API + UI)
**Read:** SPEC §4.7, §8 (`/leaderboards/*`, `/clans/:id/leaderboard`), §9 `/leaderboards`, §12 D8, D9.
**Scope**
- Ranking function (pure): count desc, ties share a rank (1, 1, 3).
- Period ranges come from the M3 time utils. Queries: users (global), clans (by `toast.clan_id`, not deleted
  clans, with `currentStreak`), members within one clan. Exclude deleted and rejected toasts and non-active users.
  Include the `me` / `myClan` row even when it is outside the page.
- Check query plans with `EXPLAIN` on about 500k seeded toasts and note the result (D8).
- UI: Users / Clans tabs, week / month / year switch (Clans default to month), 🔥 streak on clan rows, pinned "me"
  row; the clan page Leaderboard tab.
- E2E: two users with different counts are ranked correctly.

### M15 — Worker mode, jobs, Toast of the week (API + UI)
**Read:** SPEC §4.10, §4.12 (`golden_toast`), §6 (worker), §8 (`/toast-of-the-week`), §9 `/toast-of-the-week`,
§12 D6, D10.
**Scope**
- `APP_ROLE=api|worker` entry point. pg-boss starts only in the worker; a cron every Monday 00:00
  Europe/Bratislava.
- TOTW draw service (unit tested with an injectable RNG): eligible = photo, not deleted, not rejected, photo not
  hidden, active user, in the previous week. Upsert the `ToastOfTheWeek` row (null when nothing is eligible). Award
  `golden_toast`. Redraw is reused in M16.
- Cleanup jobs: expired `verification` rows; S3 photos of toasts soft-deleted, and photos replaced or removed in a
  toast session (M8b), more than 30 days ago (decide the retention and record it in §12).
- `GET /toast-of-the-week` (history with cursor; a deleted winner shows "removed"). `/home` now fills
  `toastOfTheWeek`. `canSeePhoto` allows the winning photo for everyone.
- UI: TOTW card on home, history page.
- `docker-compose` / dev script runs a worker process.

**Done when:** the draw tests pass (no eligible toast, hidden photo excluded, uniform pick); a manually triggered
job fills the home card.

---

## Phase H — Admin

### M16 — Admin backend
**Read:** SPEC §3 (Admin), §4.4, §4.13, §8 (`/admin/*`).
**Scope**
- `GET /admin/flags` (type and status filters, cursor, with subject and toast context);
  `POST /admin/flags/:id/resolve`: `dismiss`, `reject_toasts` (that day's toasts for count flags, the single toast
  for photo flags), `hide_photo`, optional `ban`. Transactional; records `resolved_by` and `resolved_at`.
- `GET /admin/users` (search), `POST /admin/users/:id/status` (ban revokes sessions, using the M2 helper).
- `PATCH`/`DELETE /admin/clans/:id` (including `ownerId` transfer, reusing M11/M12 services).
- `GET`/`PATCH /admin/settings`, `GET /admin/metrics` (users, DAU = distinct toasters today, toasts per day over the
  last 30 days, open flags), `POST /admin/toast-of-the-week/:weekStart/redraw`.
- A CLI script to promote a user to admin (needed to bootstrap).

**Done when:** integration tests per endpoint, including that non-admins get 403.

### M17 — Admin UI
**Read:** SPEC §4.13, §9 `/admin`.
**Scope**
- `/admin` with sub-pages Flags (queue, filters, action dialog), Users (search, ban/unban), Clans (edit, transfer,
  delete), Settings, Metrics (cards + 30-day bar chart), TOTW (history + redraw). Desktop-friendly wide layout.
- E2E: a user exceeds the threshold → admin rejects the toasts → the user's leaderboard count drops.

---

## Phase I — Production

### M18 — Production images, Sentry, CI image build
**Read:** SPEC §5 (Containers, Logging rows), §6, §10 (logging, monitoring), §12 D10, D17.
**Scope**
- Multi-stage Dockerfiles: `api` (Node 24 slim, non-root, one image for both roles) and `web` (Vite build → nginx,
  SPA fallback, `/api` proxy config, cache headers, CSP).
- Sentry SDK in api and web (DSN from env, disabled when not set, no PII).
- Compose profile that runs the production images locally end to end.
- CI: build and push to GHCR on `main` (tags `sha` + `latest`); OpenAPI artifact.

**Done when:** `docker compose --profile prod up` serves the full app.

### M19 — Kubernetes
**Read:** SPEC §6, §10 (Backups), §12 D12, D14, D15, D16, §14 Q2, Q5, Q6.
**Scope**
- `infra/k8s/base`: api Deployment (probes, resources, N replicas), worker Deployment (1 replica), web Deployment,
  Services, Ingress (`/api` → api), ConfigMap; migration Job run before rollout (answers Q5, record in §12).
- CloudNativePG `Cluster` with WAL archive + daily base backup to S3, 14-day retention; `ScheduledBackup`.
- Sealed Secrets: how to create them, committed `SealedSecret` templates.
- Overlays `dev` (local k3d/kind, MinIO + Mailpit in-cluster) and `prod` (cert-manager TLS, Resend SMTP, external
  S3 such as R2).
- `docs/DEPLOY.md`: cluster bootstrap, deploy, restore from backup (PITR).
- Decide Q6 (CD approach) and record it.

**Done when:** the `dev` overlay deploys to a local cluster and the app works through the ingress.

### M20 — Launch hardening
**Read:** SPEC §10, §11, §14.
**Scope**
- Q4: shared rate-limit storage for non-auth routes if more than 1 replica (Postgres-backed).
- Accessibility pass (axe in Playwright on the main pages), check SK/EN completeness (a script fails CI on missing
  keys), check that no PII appears in logs.
- Performance: measure API p95 under k6 or autocannon load with seeded data; LCP on a throttled mobile profile.
- Test the backup restore once and write it up in `docs/DEPLOY.md`.
- Final pass on README, AGENTS.md and SPEC §12/§14; confirm every BR-* has a test (a simple checklist in this file).

---

## Handoff notes

_Append-only. Each milestone adds 2–5 lines: what exists now, conventions introduced, open issues for later
milestones._

- **M0** — Bun workspaces (`apps/web`, `apps/api`, `packages/shared`, `e2e` = empty stub until M5), root scripts,
  ESLint/Prettier/lefthook, CI (`format:check → lint → typecheck → test → build`). `/healthz` exists at the root
  (no `/api/v1` prefix yet, that's M1). The web stub renders a value parsed by `shared`'s `healthSchema`.
- Versions are held back where the ecosystem lags: NestJS 11, TypeScript 6.0, Node 24 (SPEC §12 D19). ESLint is 10
  with `eslint-plugin-jsx-a11y-x` (D20). Before bumping a major, check the peer ranges of nestjs-zod,
  typescript-eslint and @nestjs/swagger.
- `shared` is resolved from source through the `@toasthub/source` export condition (typecheck, lint, Vite, Vitest).
  The api builds against `shared/dist` and runs as CommonJS on Node, loading ESM `shared` via `require(esm)` (D21).
  The api has no Nest CLI: `tsc` builds it, and dev = `tsc --watch` + `node --watch`.
- Vitest is already set up in `shared` (one schema test) so that `bun run test` runs something. M1 adds it to `api`
  plus Testcontainers and can split the CI test step into its own job.
- `docs/SPEC.md` and `docs/PLAN.md` are in `.prettierignore` (hand-wrapped; Prettier would realign every table).
  The root `AGENTS.md` is a pointer to `docs/AGENTS.md`.
- **M1** — Cross-cutting api code lives outside `modules/`: `src/config` (Zod env → `ConfigService.get()`), `src/db`
  (`DB` token → Drizzle on `pg`, `casing: 'snake_case'`, schema entry `src/db/schema/index.ts`, migrations in
  `src/db/migrations`), `src/common` (`AppError`, error filter, pino options, cursor helpers). `configureApp()` +
  `createFastifyAdapter()` in `app.setup.ts` are shared by `main.ts`, `bun run openapi` and tests: use them for
  any new app instance. Services throw `AppError(code, message)`; the filter maps it (D24).
- Tests: `*.test.ts` = unit project (no Docker), `*.int.test.ts` = int project (one Testcontainers Postgres per
  run, migrated in `test/global-setup.ts`, every `public` table truncated before each test, files run serially).
  `test/create-app.ts` → `createTestApp(envOverrides)` builds the full app for `app.inject()`. If M3 seeds
  reference rows (settings, facts) in a migration, exclude those tables from the truncate in `test/setup-int.ts`.
- `apps/api/openapi.json` is committed and CI fails if it is stale: run `bun run openapi` after changing routes or
  DTOs. DTO classes (`createZodDto(sharedSchema)`) are named after the schema they should have in the client.
  Health probes are not logged (nestjs-pino `exclude`). Request IDs come from Fastify's `genReqId` and are echoed
  in `x-request-id`.
- Not done here (left to the milestone that needs it): CORS, `trustProxy`, S3/SMTP env vars. Local S3 uses the
  `pgsty/minio` image because upstream MinIO images are gone (D23); compose creates the `toasthub-photos` bucket.
- Gotcha (Windows): if `bun add` ends in `EEXIST ... failed to symlink`, delete every `node_modules` folder and run
  `bun install` again.
- **M2** — Better Auth lives in `src/modules/auth`: `auth.config.ts` (plain factory, also loaded by the CLI via
  `auth.cli.ts`), `auth.handler.ts` (Fastify route at `/api/v1/auth/*`, allowlist of 4 endpoints, D26), global
  `SessionGuard` + `@Public()`, `@UseGuards(AdminGuard)`, `@CurrentUser()` (Better Auth user; read fresh rows from
  the DB when you need typed fields). `AuthService.setStatus(userId, status, tx?)` bans + revokes sessions (for M16).
  Mail is `src/modules/mail` (nodemailer, SK/EN template). New env: `BETTER_AUTH_SECRET` (required),
  `BETTER_AUTH_URL`, `WEB_ORIGIN`, `SMTP_URL`, `MAIL_FROM`; `configureApp()` now needs `ConfigService` in the app
  (unit tests: `testConfigProvider()` from `test/config-provider.ts`).
- Int tests also get a Mailpit container (inbox cleared before each test). `signIn(app, email)` in `test/auth.ts`
  runs the real magic-link flow and returns `{ userId, cookie }`; cookie mutations need `origin: WEB_ORIGIN`.
- For M4/M5: magic links point at `BETTER_AUTH_URL` + `/api/v1/auth/magic-link/verify`. Once the Vite proxy exists,
  set `BETTER_AUTH_URL` to the web origin (http://localhost:5173) so the session cookie is first-party on the web
  origin, and pass absolute `callbackURL`/`errorCallbackURL` on the web origin (verify redirects there with
  `?error=INVALID_TOKEN` for used/expired links). Auth errors use the §8 shape, so prefer plain fetch over
  `better-auth/client`. `locale` starts as `en`; onboarding should PATCH the browser language.
- For M19: Fastify `trustProxy` is still off, so behind the ingress `request.ip` (and the per-IP auth limit) would
  be the proxy's IP. Set `trustProxy` in `createFastifyAdapter()` when deploying. Prod needs `SMTP_URL` (Resend),
  an https `BETTER_AUTH_URL` (cookies become `__Secure-`) and a real secret.
- **M3** — Domain tables live in `src/db/schema/` by area (`toasts`, `clans`, `moderation`, `achievements`,
  `reference-data`), with shared column helpers in `columns.ts` (`id()`, `createdAt()`, `enumValues()`). No Drizzle
  `relations()` for them yet: add them when a milestone wants `db.query`. `toast.local_date` is generated by
  Postgres (D29), so inserts only set `eaten_at`. Integrity rules and FK delete policy: D31.
- `shared` now has the enums (`ToastStatus`, `ClanRole`, `JoinRequestStatus`, `FlagType`, `FlagStatus`), `ACHIEVEMENTS`
  (+ `achievementsFor(trigger)`, condition metadata for M7's evaluator, i18n keys `achievements.<code>.name|description`
  for M4), `AppSettings` + defaults, and the time utils in `time.ts` (`localDate`, `localHour`, `weekRange`,
  `periodRange`, `dayNumber`, …; half-open `[start, end)` ranges of `YYYY-MM-DD` strings).
- `SettingsService` (`src/modules/settings`, import `SettingsModule`): `get(key, tx?)`, `getAll(tx?)`, `set(patch, tx?)`
  (400 on bad values). M16's `/admin/settings` can pass its body straight to `set`. Reference data (settings, 10
  placeholder facts) comes from migration `0004`; **Q3 is still open**, so replace the facts in a new migration.
  Int tests keep `toast_fact` across the truncate; `app_setting` is emptied, which reads as the defaults.
- `bun run db:seed`: 5 onboarded sample users (`ann|bob|cyril|dana|emil@example.com`), clan "Breakfast Club"
  (Ann owner) and ~60 days of toasts without photos. Idempotent; sign in with the magic link via Mailpit.
- **M4** — Web shell: route tree from §9 in `src/routes.tsx` (one `PlaceholderPage` per route until its milestone),
  `AppLayout` (header + `md` top nav, bottom tab bar on mobile, `wide` for admin) and `PublicLayout`. Sections are
  configured once in `components/layout/nav-items.ts`. Look and feel = tokens in `src/styles/theme.css` (D34);
  `/dev/ui` (dev only) previews them and lets you switch the fake session. Conventions: AGENTS.md → Web.
- **For M5:** the session is a stand-in. `PreviewSessionProvider` (`features/auth/preview-session.tsx`, used in
  `app.tsx`) fakes a user; replace it with a provider that maps `GET /me` (TanStack Query) to `Session` and delete
  the file (also its controls on `/dev/ui`). Guards are already tested against all session kinds. `changeLocale()`
  only stores the locale in `localStorage`: PATCH `/me` too, and apply `me.locale` after login.
- API client: `unwrap(api.GET('/api/v1/me'))` (D32); `bun run openapi` now also regenerates
  `web/src/api/schema.gen.ts`. Vite proxies `/api` to `API_PROXY_TARGET` (default http://localhost:3000), and
  `apps/api/.env.example` now has `BETTER_AUTH_URL=http://localhost:5173`: **update your local `.env`** too.
- Production JS is 534 kB (165 kB gzip; Zod via `shared` is a large share) and Vite warns about chunk size. Look at
  it in M20's LCP check (route-level `lazy`, or `zod/mini` for the web). Achievement names/descriptions are in
  both locale files already (`achievements.<code>.name|description`).
- **M5** — Auth UI is live: `/login` + `/auth/callback` (`features/auth`: `auth-api.ts` = plain fetch to Better Auth,
  `magic-link-form.tsx`), `/onboarding` and `/settings` share `ProfileForm` (`features/account`). The session is
  the `['me']` query read by `ApiSessionProvider` (D36); `preview-session.tsx` is gone, tests use
  `src/test/{render,sessions,api}.ts(x)`. Header has a settings (gear) link; new shadcn `input`, `label`, `radio-group`.
- `shared` gained `emailSchema`. shadcn's CLI wrote `import { cn } from "cn"` and added an npm `cn` package:
  after `shadcn add`, point imports back to `@/lib/utils` and drop that dependency.
- E2E (D37): `bun run e2e` needs `docker compose … up -d postgres mailpit` and a migrated DB; first run
  `bunx playwright install chromium` in `e2e/`. Specs: sign-up → onboarding → home, used link → resend,
  logout. Not covered: an *expired* link (same `INVALID_TOKEN` path as a used one; the api int test covers it).
- For M8: the E2E CI job starts only Postgres and Mailpit; add `minio` to its `docker compose up` for the photo
  test. `/home` is still a placeholder, the onboarding E2E asserts only its heading.
- **M6** — `POST /toasts` (no body, or multipart with one `photo` part) and `DELETE /toasts/:id` live in
  `src/modules/toasts`. `countableToasts()` (`countable-toasts.ts`) is the `WHERE` fragment every later aggregate
  must use. `StorageModule` (`put`, `delete`, `presignGet` for 1 h) signs without a visibility check; M9 adds it.
  The image pipeline is `photo-pipeline.ts`. HEIC goes through `heic-decode` because prebuilt sharp has no HEVC (D38).
- New env: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` (required),
  `S3_FORCE_PATH_STYLE`. **Update your local `.env`** from `.env.example`. Int tests start a MinIO container too.
  `configureApp()` is now async (it registers `@fastify/multipart`), so `await` it. The api Vitest config dropped
  Vite's `module` resolve condition, which picked the AWS SDK's bundler-only build.
- The 30/h limit (every attempt counts) is the in-memory `RateLimiter` in `src/common`, one per replica, so
  **Q4 is still open**: decide shared storage before running more than one api replica. M12's report limit can
  reuse the class.
- For M7: `ToastsService.create` returns `newAchievements: []`; call the evaluator after the insert transaction.
  For M8: the generated client types the multipart body, but openapi-fetch needs a `FormData` `bodySerializer`.
  Soft-deleted toasts keep their photo object (D7, D39); nothing removes orphaned photos yet.
- **M7** — New api modules: `streaks` (`StreaksService.forUser/forClan`, read-time over the distinct `local_date`s,
  pure `computeStreak()` in `streak.ts`), `achievements` (`AchievementsService.evaluate(userId, event)`, pure
  rules in `achievement-rules.ts`, no routes) and `home` (`GET /home` + `FactsService`). `shared` has
  `streakSchema` (reuse it for M9 stats and M11 clan detail) and `homeResponseSchema` (D40).
- For M11 / M15: call `achievements.evaluate(userId, { trigger: 'clan_joined' })` (or `'totw_won'`) after the
  transaction commits, like `ToastsService.create` does; it returns only codes this call inserted. For M15:
  `toastOfTheWeek` is `z.null()` in `homeResponseSchema` for now; replace it and run `bun run openapi`.
- For M8: optimistic "+ Toast" = `todayCount + 1`; if `todayCount` was 0, `streak.current + 1` (and `longest`
  at least that), since the current streak already counts up to yesterday. `clanStreak` works the same way.
- Int tests can't pick the hour `eaten_at` gets (Postgres `now()`), so toast tests drop `early_bird` and
  `midnight_snack` (`withoutTimeOfDay`); the unit tests cover them. Past toasts are inserted directly at
  `<date>T10:00:00Z` (midday in Bratislava, DST-proof).
- **M8** — `/home` is live: `pages/home-page.tsx` + `features/home` (`homeQueryOptions` = `['home']`,
  `withLoggedToasts(home, n)` for the optimistic update, `useLogToasts()` = n × `POST /toasts` in sequence
  with the optional photo as `FormData` on the first, `LogToastButton` with the count + photo dialog,
  `HomeCards`) (BR-TOAST-5, D41). The 1–10 cap is `MAX_TOASTS_PER_LOG`, client-side only. New shadcn
  `dialog` and `sonner` (`<Toaster>` in `app.tsx`); new token `--overlay`; `app.close` key. Any later
  mutation that changes counts or streaks (M10 delete, M16 reject) should invalidate `['home']`.
- PWA via vite-plugin-pwa (D42): placeholder icons in `apps/web/public` (rendered from `favicon.svg` with
  sharp; replace with real artwork, keeping the maskable one inside the 80 % safe zone). The service worker
  exists only in `vite build` output, so check PWA changes with `vite preview`, not `bun run dev`.
- For M15: openapi-fetch's response type drops properties typed as just `null`, so `homeQueryOptions`
  adds `toastOfTheWeek: null` itself. Remove that line when `toastOfTheWeek` gets a real schema, then
  replace the placeholder card in `home-cards.tsx`. For M13: the clan streak card doesn't link to the clan
  yet (`/home` has no clan id); add one to the response or read it from the clan query.
- E2E: CI now also starts MinIO (+ `minio-init`); locally run `docker compose … up -d minio` once too. New
  helpers `signUp(page)` and `openMagicLink(page, link)` (AGENTS.md → Tests): Better Auth's magic-link plugin
  limits `/magic-link/verify` to 5/min per IP, which the 5-test suite already reached. jsdom gets a
  `matchMedia` stub in `src/test/setup.ts` (sonner needs it).
- **M8b** — Toasts are logged only as sessions: `src/modules/toast-sessions` (`POST /toast-sessions`,
  `GET /me/toast-sessions`, `PATCH`, `PUT`/`DELETE …/photo`, `DELETE`); pure rules in `toast-sessions.policy.ts`.
  `POST`/`DELETE /toasts` and the `ToastsModule` are gone; `toasts/` keeps `countableToasts()`, the photo pipeline and
  `readPhotoUpload()` (now returns `{fields, photo}`). Every toast row needs `session_id`: tests insert past toasts
  with `insertToasts(db, rows)` (`test/toasts.ts`, one session each). Details and limits: SPEC §12 D44.
- For M12: likes and reports stay per toast (on the lead toast, D43). For M15: delete the objects in `discarded_photo`
  once no open `photo_report` on their `toast_id` needs them, then the row. For M16: rejecting a toast makes its session
  read-only; lock the `toast_session` row (`FOR UPDATE`) when changing its toasts, as the edit endpoints do.
- Web: `features/toast-sessions` (`toastSessionsQueryOptions` = infinite `['toast-sessions']`, mutation hooks that
  invalidate `['home']` and the list, `CountStepper`, `PhotoPicker` + `usePickedPhoto()` shared with the home log
  dialog, `EditSessionDialog`, `SessionList`), page `/toasts`. `useLogToasts()` is one request; the partial-failure
  notice and `MAX_TOASTS_PER_LOG` are gone (`TOAST_SESSION_MAX_COUNT` in `shared`). For M10: link the own profile to `/toasts`.
- Gotchas: `pageSchema`'s `nextCursor` is `z.string().min(1).nullable()` because a bare nullable string at a DTO's top
  level comes out of @nestjs/swagger as an array. jsdom's `File` reaches undici's `Request` as text, so web tests check
  multipart bodies with `request.text()`. Run `bun run db:migrate` for 0005. To run E2E next to another api on :3000:
  `PORT=3100 E2E_API_URL=http://localhost:3100 API_PROXY_TARGET=http://localhost:3100 bun run e2e`.
- **M9** — `src/modules/users`: `GET /users/:id` plus `/toasts`, `/stats`, `/heatmap`, `/achievements`. Pure rules in
  `users.policy.ts` (`profileAccess()`, `canSeePhoto()`, `isClanmate()`) and `stats.ts` (`computeStats()`, reuses
  `computeStreak()`). Schemas in `shared/profile.ts`. Rules and shapes: SPEC §12 D45. Unknown, banned and
  not-onboarded users are 404 on every route; `reduced` access is a 403 on all but the profile itself.
- For M10: `/users/:id/toasts` lists only visible photos (one per session, the lead toast) for the photo grid; the
  own hidden photos are only in My toasts. `profile.access === 'reduced'` → render the reduced view and don't call
  the other four routes. Heatmap `days` are sparse (only days with toasts); fill the rest with 0 client-side.
- For M12 / M14 / M15: call `canSeePhoto()` before signing a photo in the feed, leaderboards or TOTW. Its TOTW rule
  is not a stub: `/users/:id/toasts` already reads `toast_of_the_week`. `UsersModule` exports nothing yet; export
  `UsersService` (and make `resolveAccess()` public) if another module needs it.
- Gotcha: `migrate.int.test.ts`'s fresh-database tests got slower as more int files ran before them (over 5 s in a
  full run after this milestone's tests), so they now have a 30 s timeout.
- **M10** — `/u/:id` is live: `pages/profile-page.tsx` + `features/profile` (`profile-api.ts` = query options under
  `usersQueryKey` `['users', id, …]`, pure `heatmap.ts` (`heatmapMonths()`, `heatLevel()`), `YearHeatmap`,
  `ProfileStats`, `AchievementGrid`, `PhotoGrid`, `ProfileSummary`). Layout and colour rules: SPEC §12 D46; new tokens
  `--heat-1…4`. A reduced profile calls only `GET /users/:id`; a bad id or a 404 shows "couldn't find this profile".
- Shared UI moved to `src/components`: `StatCard` (was in home), `LoadMore` (was in `session-list.tsx`, now takes a
  `label`), `QueryError` (error + retry card, used by home, My toasts and the profile); `PageSpinner` takes a
  `className` for section-sized spinners. `renderWithApp()` has a `routePath` option for pages that read `useParams()`.
- Any mutation that changes toasts must also invalidate `usersQueryKey` (M16 reject/ban, M13 clan join changes a
  clan-only profile's `access`: invalidate `['users']` there too). For M13: link member names to `/u/:id`.
- **M11** — `src/modules/clans`: `GET`/`POST /clans`, `GET`/`PATCH`/`DELETE /clans/:id`, `/join`, `/leave`, `/requests`
  (+ `approve`, `reject`) and `DELETE /me/clan-request`. Pure role rules in `clans.policy.ts` (`canActOnClan`,
  `canActOnMember`, `assertCanActOnClan`, `assertHasRoom`); the matrix already covers M12's kick, role change and
  transfer. Schemas in `shared/clan.ts`, plus `userSummarySchema` (`{id, displayName, avatarId}`) in `shared/profile.ts`
  for any list of users. Shapes, locks and error order: SPEC §12 D47.
- For M12: lock the clan row (`FOR UPDATE`) in transfer, role change and kick, as approve does, and reuse
  `ClansService`'s `loadClan()`/`roleIn()`. `uniqueViolation(error)` (`src/db/pg-error.ts`) names the violated index,
  so a race lost on `clan_membership_one_owner` can become a 409. For M13: `GET /clans/:id` has `myRole` and
  `myRequest` (both nullable); joining or leaving changes clan-only profile access, so invalidate `['users']` too.
- For M16: a banned member keeps the membership, is listed and counts toward the limit; decide whether a ban
  removes it. Gotcha: parallel `app.inject()` calls only race once the pool has open connections (otherwise the
  first commits while the others connect), so concurrency tests call `warmPool()` first (`clans.int.test.ts`).
- **M12** — Clans: `PATCH`/`DELETE /clans/:id/members/:userId`, `POST /clans/:id/transfer` (in `ClansService`, behind
  `lockTarget()`; policy asserts `assertMayActOnMembers` + `assertCanActOnMember`) and `GET /clans/:id/feed`
  (`clan-feed.service.ts`, lead toast via a lateral join). `ClansService.authorize(userId, clanId, action)` is the
  public 404/403 check for other clan services (M14's clan leaderboard). Rules and shapes: SPEC §12 D48.
- `ToastsModule` is back for reactions only: `POST`/`DELETE /toasts/:id/like`, `POST /toasts/:id/report` (pure rules
  in `toasts.policy.ts`; `canSeeToast()` joined `canSeePhoto()` in `users.policy.ts`). `likeStats(db, viewerId, ids)`
  (`toasts/like-stats.ts`) gives `likeCount`/`likedByMe` for any list of lead toasts: use it for TOTW (M15).
- For M13: feed items carry `toastId` (the lead toast) for like and report; `likedByMe` is per viewer, so update it
  optimistically and invalidate `['users']` too (profile photos show likes now). A transfer answers with both new
  memberships; refetch the clan detail after any member change. For M16: a report's flag has `toast_id`,
  `reporter_id` and `reason` (`null` when empty); a banned member's sessions already leave the feed.
- Gotcha: a Drizzle `alias()` inside a raw `sql` template renders only its name, so write
  `FROM ${toast} AS ${earlier}` (see `ToastsService.load()`). `/me/toast-sessions` items still have no like counts.
- **M13** — Clan UI: pages `/clans` (`clans-page.tsx`, debounced search), `/clans/new` and `/clans/:id` (`clan-page.tsx`),
  parts in `features/clans` (`clans-api.ts` = query options under `clansQueryKey` `['clans']` + mutation hooks,
  `ClanHeader`, `JoinRequests`, `ClanFeed` with likes and the report dialog, `ClanMembers` with role menus,
  `ClanSettings`, `ClanForm`). Shapes and choices: SPEC §12 D49. New shadcn `tabs`, `dropdown-menu`, `textarea`
  (the `cn` import fix again) and `components/confirm-dialog.tsx` for any "are you sure" step; `app.cancel` key.
- `GET /me` now has `clanId` (`Me` in `shared`, `toMe(row, clanId)`); web test sessions have `clanId: null`. The clan
  role tables moved to `shared/clan-policy.ts` (`canActOnClan`, `canActOnMember`, `mayActOnMembers`); the api policy
  keeps only the `assert*` wrappers and re-exports the rest. Deviation: transfer is the "Make owner" member menu item.
- For M14: replace the Leaderboard tab's placeholder in `clan-page.tsx`. For M17: the admin clan views can reuse
  `ClanForm` and `ConfirmDialog`. A Radix `DropdownMenu` that opens a dialog must be `modal={false}` (otherwise the
  page can stay unclickable).
- E2E `clans.spec.ts` uses two browser contexts (`browser.newContext()` inherits the config's `use`). With 10
  sign-ups per run, verifies hit Better Auth's 5/min limit (429) or a 500 even after the reset, so `openMagicLink()`
  now resets and reopens the link up to 3 times on a 429 or 5xx (the token isn't used by then).
- **M14** — `src/modules/leaderboards`: `GET /leaderboards/users`, `/leaderboards/clans` and `GET /clans/:id/leaderboard`
  (in the leaderboards controller; `ClansModule` now exports `ClansService`, which gained `assertExists()`). Pure
  `rankByCount()` in `ranking.ts`; schemas in `shared/leaderboard.ts`. `StreaksService.currentForClans()` gives the
  current streak of many clans at once. Shapes, defaults and access: SPEC §12 D50.
- `EXPLAIN ANALYZE` on 500k toasts over one year (1,000 users, 100 clans of 10, PG 18, one session per toast): users
  week 25 ms (bitmap scan), users year 121 ms (parallel seq scan, as the year is most of the table), clans month
  47 ms, clan members 3 ms. Reading every day of the 50 listed clans for their streaks took 367 ms. A partial
  covering index on `(clan_id, local_date)` only got that to 231 ms, so no migration; the first 64-day window takes
  80–120 ms. Worst case: every listed clan has a year-long run, and the windows read it all again (~370 ms).
- Web: `/leaderboards` (`pages/leaderboards-page.tsx`) and the clan page's Leaderboard tab use `features/leaderboards`
  (`leaderboards-api.ts` = query options under `leaderboardsQueryKey` `['leaderboards']`, `UserBoard`, `ClanBoard`,
  `ClanMemberBoard`, `RankList` / `PinnedRank` / `PeriodSwitch`). Toast and clan mutations now also invalidate
  `['leaderboards']`; do the same for M16's reject and ban. For M15: Toast of the week isn't on any board.
- E2E `leaderboards.spec.ts` compares the two users' pinned "You" ranks on the global board, because other runs'
  users share it; the exact order is checked on their own clan's board.
- **M15** — Worker: `APP_ROLE=worker` (`main.ts` → `WorkerModule`, a Nest application context with no HTTP) runs
  `src/jobs` (`JobsService` starts pg-boss, one queue + handler + Europe/Bratislava cron per `JobName`). `bun run dev`
  now also starts `dev:worker`; `bun run --filter @toasthub/api job <name>` queues a job for it (`totw-draw`,
  `cleanup-verifications`, `cleanup-photos`). The api never imports `JobsModule`. Logger config is `AppLoggerModule`.
- `src/modules/totw`: `TotwService.draw(weekStart, {replace, drawnBy})` (pure `pickWinner()` + week helpers in
  `totw-draw.ts`, RNG via `TOTW_RANDOM`), `forWeek()`, `lastWeek()` (home) and `GET /toast-of-the-week`. Schemas in
  `shared/toast-of-the-week.ts`; `/home`'s `toastOfTheWeek` is that item or `null`. `src/modules/cleanup` deletes
  expired `verification` rows and photo objects after 30 days (D51). Shapes, retention and locks: SPEC §12 D51.
- For M16: the redraw endpoint is `draw(weekStart, { replace: true, drawnBy: adminId })` then `forWeek()`; it
  already answers 400 (not a Monday) and 409 (week not over). Hiding or rejecting a winner turns it `removed`
  without a redraw. After 30 days a deleted toast's `photo_key` is null, so admin views must cope with no photo.
  For M18/M19: the worker is the same image with `APP_ROLE=worker`, one replica, no port and no HTTP probes.
- Web: `features/toast-of-the-week` (`totwHistoryQueryOptions` = infinite `['toast-of-the-week']`, `TotwEntry` for
  one week) on the home card (+ "All winners" link) and the page `/toast-of-the-week`. TOTW items have no likes yet.
  Test helper `objectExists(key)` moved to `test/s3.ts`. E2E `toast-of-the-week.spec.ts` writes last week's winner
  straight into the dev database (the UI can't backdate a toast), replacing whatever that week had.
- Gotcha (CI was red since M2): Vitest loads `globalSetup` through its own Vite environment, which ignored
  `resolve.conditions`, so the int setup resolved `shared` to `dist`, absent on a fresh checkout (locally an old
  build hid it; Vite then masked the error as `code.charCodeAt is not a function`). The api `vitest.config.mts`
  now sets the conditions on every environment. Reproduce CI in a Linux container without `shared/dist`.
- **M16** — `src/modules/admin`: one `AdminController` (`@UseGuards(AdminGuard)` on the class) over `AdminFlagsService`
  (queue + resolve, pure `planResolution()` in `admin-flags.policy.ts`), `AdminUsersService`, `AdminMetricsService`,
  `ClansService.adminUpdate/adminDelete` (share `edit()`/`remove()`/`handOver()` with the Owner routes),
  `SettingsService` and `TotwService.redraw()`. Schemas in `shared/admin.ts`. Shapes, check order and choices: SPEC §12 D52.
- Bootstrap: `bun run --filter @toasthub/api admin:promote <email>` (`promote-admin.ts`; in a container
  `node dist/modules/admin/promote-admin.js <email>`). Int tests make admins with `promoteToAdmin(db, email)`.
  `escapeLike` moved to `src/common/like-pattern.ts` (`containsPattern()`).
- For M17: resolve answers the updated flag; after a reject or ban invalidate `['home']`, `['users']`,
  `['leaderboards']`, `['toast-of-the-week']` and the clan queries. `/admin/users` items are the only ones with an
  email. A ban keeps the membership; to free a banned Owner's clan use `PATCH /admin/clans/:id` with `ownerId`.
  Count flags don't link to sessions; the UI can show `day.active`/`day.rejected` and the subject's profile.
- **M17** — Admin UI: `pages/admin/` (`AdminPage` = section nav + `<Outlet>`, one page per section, `/admin`
  redirects to `flags`) and `features/admin` (`admin-api.ts` = query options under `adminQueryKey` `['admin']` +
  mutation hooks, `FlagCard` with the resolve dialog, pure `flagActionChoices()`/`canBanSubject()`, `ToastsChart`).
  Shield link in the header for admins. Choices: SPEC §12 D53. `PlaceholderPage` and `placeholder.body` are gone.
- Shared bits moved or added: `useDebouncedValue()` + `SEARCH_DELAY_MS` in `lib/use-debounced-value.ts` (was in
  `clans-page.tsx`), `components/native-select.tsx` (a styled `<select>`; no shadcn `select` yet), `useWeekLabel()`
  from `totw-entry.tsx`; `clans-api.ts` exports `useClanMutation()` and `clanKey()` for the admin clan hooks.
- E2E `admin.spec.ts` makes its admin with `UPDATE "user" SET role` in the dev database and relies on the default
  threshold of 8 (it logs 10, the most one session takes): with a dev threshold of 10 or more it fails.
- Sizing: ~30 files touched (7 pages + 6 page tests, the rest shared pieces), over the ~25 guideline, kept as one
  milestone because every page is small and they share one API module.
