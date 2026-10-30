# Toasthub — Specification

> Status: Approved | Last updated: 2026-10-29
> This file defines WHAT to build and WHY. Coding conventions and HOW-to-work rules live in `AGENTS.md`.

---

## 1. Overview
Toasthub is a mobile-first web app where users track and compete over who eats the most toasts. Users log toasts
in sessions (how many they ate in one sitting, optionally with a photo), build daily streaks, earn achievements, join clans, compete on leaderboards and see personal
statistics. Every week a random photo toast is picked as **Toast of the week**, and every day the app shows a
**toast fact of the day**.

Audience: a group of friends, growing to ~300 daily users (50–1,000 users in year one), Slovak and English speaking.
The project is built by a team of 3 with AI coding agents (Claude, Codex, pi). Clean
architecture, tests and documentation are first-class requirements.

## 2. Goals & Non-goals
**Goals**
- G1: Logging a toast takes ≤ 2 taps from the home screen on a phone.
- G2: Friendly competition via leaderboards — users globally, clan vs clan, and members within a clan — for the current week, month and year.
- G3: Daily engagement through streaks, achievements, the toast fact of the day and Toast of the week.
- G4: Clans are the social unit: join, roles, clan feed, 🍞 likes.
- G5: Portfolio-quality engineering: clean architecture, tests, docs. API-first (versioned JSON API) so future native apps can reuse it.
- G6: Containerized, runs on Kubernetes, hosting-provider agnostic.

**Non-goals (explicitly out of scope for v1)**
- Native iOS / Android apps (the API must be ready for them, see §12 D3)
- Emails other than the magic-link login ( Wrapped, reminders, digests, notifications)
- Wrapped summaries (monthly / yearly), in any form
- Push notifications
- AI moderation (planned for a later version, see §13)
- Toast details (topping, bread type, caption) and backdating toasts
- Comments, global feed, friends / follow system
- Membership in more than one clan
- All-time leaderboards
- Self-service account deletion and data export (accepted GDPR risk, see §14)
- Passwords or social login
- Monetization

## 3. Users & Roles
| Role | Description | Can do |
|------|-------------|--------|
| Guest | Not logged in | See the landing page, request a magic link |
| User | Registered, active | Log toast sessions, view own past sessions, edit / delete own sessions on the day they were logged, upload photos, like toasts, report photos, see leaderboards / stats / profiles (subject to visibility), create / join / leave one clan, edit own profile |
| Admin | Internal (app-wide role) | Everything a User can, plus: review flags, hide photos, reject toasts, ban / unban users, manage any clan, edit app settings, see app metrics, re-run the Toast of the week draw |

**Clan roles** (scoped to one clan, held by Users):

| Clan role | Can do |
|-----------|--------|
| Owner | Everything an Officer can, plus: edit clan, promote / demote officers, transfer ownership, delete clan. Exactly one per clan. |
| Officer | Approve / reject join requests, kick Members |
| Member | See clan feed and clan leaderboard, leave clan |

**User account status:** `active`, `banned`. Banned users cannot log in,
their sessions are revoked, and their toasts are excluded from all leaderboards while not active.

## 4. Features & Business Rules
Times and dates below are in **Europe/Bratislava**. A "day" is a calendar day in that zone; a "week" is Monday–Sunday.

### 4.1 Authentication (magic link)
Implemented with Better Auth (magic-link plugin, Drizzle adapter, bearer plugin), not hand-written (§12 D13).
- BR-AUTH-1: User enters an email; the API always answers success (no account enumeration) and sends a login link.
- BR-AUTH-2: Link token is single-use, valid 15 minutes, stored only as a hash.
- BR-AUTH-3: First successful login creates the account and sends the user to onboarding (display name required, avatar optional).
- BR-AUTH-4: Session = opaque random token stored in the DB, valid 30 days, sliding (refreshed at most once a day on use). Web: `httpOnly` cookie. Future mobile: `Authorization: Bearer` (bearer plugin).
- BR-AUTH-5: Rate limit magic-link requests: 5 / hour per email and 20 / hour per IP (Better Auth rate limiter, database storage).
- The magic-link email is the **only** email the app sends.

**Acceptance:** a new email receives a link → clicking it logs in and shows onboarding; a used or expired link shows an error and a "send new link" button.

### 4.2 Profile
- Email (unique, private — never shown to other users), display name (not unique, 2–30 chars), avatar chosen from 6 preset options (assets to be added later; until then, initials fallback).
- Language: `sk` or `en` (default from browser, changeable in settings).
- **Profile visibility** setting: `public` (default — any logged-in user sees profile, stats, achievements, photos) or `clan` (only clanmates see that; others see display name, avatar and leaderboard counts only).

### 4.3 Logging toasts
- BR-TOAST-1: A toast is a timestamp set by the server at creation. No backdating, no extra fields.
- BR-TOAST-2: A photo is optional. Upload limit 10 MB (JPEG/PNG/WebP/HEIC). Server re-encodes to WebP, max 1600 px longest side, strips EXIF (incl. GPS).
- BR-TOAST-3: Toasts are deleted per session (BR-TOAST-7), never one by one by their owner. Deletion is a soft delete; streaks, stats and leaderboards recompute; likes on the session are removed.
- BR-TOAST-4: Achievements already earned are kept even if the toasts that triggered them are deleted.
- BR-TOAST-5: One log from the home screen is a **toast session**: 1–10 toasts eaten in one sitting, created together. Each is its own toast; the optional photo belongs to the session's first toast (its *lead toast*).
- BR-TOAST-6: A user can view their own past sessions, newest first: date and time, toast count and photo.
- BR-TOAST-7: On the session's own day (its `local_date`, Europe/Bratislava) the owner can change its toast count (1–10), add, replace or remove its photo, and delete it. Raising the count adds toasts at the current server time (so they fall on the same day, BR-TOAST-1); lowering it soft-deletes the newest toasts, never the lead toast. Added toasts count toward the creation rate limit and the BR-MOD-1 threshold and trigger achievements like a new log; so does adding a photo (`shutterbug`). After that day ends, the session is read-only. A session with an admin-rejected toast is read-only, and a photo an admin has hidden can be removed but not replaced.

**Acceptance:** from the home screen, "+ Toast" opens a dialog with the number of toasts (default 1) and an optional photo (pick / take); confirming logs them, so one toast is two taps (G1), and the today-counter and streak update immediately. There is no separate camera button. "My toasts" lists past sessions; today's sessions open an edit dialog (count, photo, delete with a confirmation) and the home counters follow the change; older sessions show no edit controls.

### 4.4 Anti-cheat & moderation (trust-based, admin only)
- BR-MOD-1: When a user's toast count for a day exceeds the threshold (app setting, default **8**), a `count_threshold` flag is created for admin review (once per user per day).
- BR-MOD-2: Flagged toasts **keep counting** until an admin rejects them.
- BR-MOD-3: Any user can report a photo (optional reason). Creates a `photo_report` flag. The photo stays visible until an admin hides it.
- BR-MOD-4: Admin flag actions: dismiss, reject toast(s) (removed from counts), hide photo, and optionally ban the user.
- AI moderation is a non-goal for v1; design the flag model so an AI moderator can later create flags.

### 4.5 Streaks
- BR-STREAK-1: A streak is the number of consecutive days with ≥ 1 non-deleted, non-rejected toast.
- BR-STREAK-2: The current streak stays alive through today until midnight: it counts back from today if today has a toast, otherwise from yesterday.
- BR-STREAK-3: Track current and longest streak per user.
- BR-STREAK-4: Track current and longest streak per clan. A day counts for a clan if at least one toast credited to that clan (§12 D9) was logged that day; BR-STREAK-2 applies the same way.
- Clan streaks are shown in the clan page header, on clan leaderboard rows and on the home screen ("your clan's streak").

### 4.6 Statistics (per user)
- Totals: all-time total, average per day / week / month (since first toast), best day (date + count).
- Current and longest streak.
- Calendar heatmap: toasts per day for a selected year.

### 4.7 Leaderboards
- Three boards: **users** (global), **clans** (clan vs clan, by total toasts), **clan members** (within one clan).
- Periods: **this week**, **this month**, **this year**. No all-time board. The clan board defaults to **this month** (the main clan metric).
- Ranking: by toast count desc; ties share a rank (1, 1, 3). Excluded: deleted / rejected toasts, non-active users.
- Visible to logged-in users only. Users with `clan` visibility still appear (name, avatar, count).
- Clan board counts toasts toward the clan the user was a member of **when the toast was logged** (see §12 D9).

### 4.8 Clans
- BR-CLAN-1: A user is in at most one clan. Any user not in a clan can create one and becomes its Owner.
- BR-CLAN-2: Clan has a unique name (3–40 chars) and description (≤ 280 chars). Joining always works by request: an Officer or the Owner approves it.
- BR-CLAN-3: Max members is an app setting, default **10**. Joining / approving fails when full.
- BR-CLAN-4: The Owner cannot leave without transferring ownership or deleting the clan.
- BR-CLAN-5: A user may have at most one pending join request at a time; joining a clan cancels it, or they can cancel it themselves.
- **Clan feed:** toast sessions of current members, newest first, one entry per session with its count, photo and 🍞 likes. Clanmates always see each other's photos regardless of profile visibility.
- **Clan page:** info, member list with roles, inner leaderboard, feed.

### 4.9 Likes
- One reaction type: 🍞. A user can like a toast session once and unlike it; the like is stored on the session's lead toast. Sessions show the like count.

### 4.10 Toast of the week
- BR-TOTW-1: Drawn every Monday 00:00 for the previous Monday–Sunday week by a scheduled job.
- BR-TOTW-2: Uniform random pick among photo toasts of that week that are not deleted, not rejected, whose photo is not hidden, from active users. **All users enter**, regardless of profile visibility; the winning photo becomes visible to all logged-in users.
- BR-TOTW-3: No eligible toast → no winner that week.
- BR-TOTW-4: Admin can re-run the draw for a week (e.g. after hiding the winning photo). If the winning toast is removed later (deleted or rejected), the slot shows "removed". The owner can't delete or change it any more: the draw runs after its day has ended (BR-TOAST-7).
- Winner is shown on the home screen for the following week and in a history list; the winner earns the "Golden Toast" achievement.

### 4.11 Toast fact of the day
- Seeded list of facts in SK and EN stored in the DB. The fact for a day is `facts[dayNumber mod count]` (deterministic, same for everyone). Shown on the home screen.

### 4.12 Achievements (fixed list in code)
| Code | Name | Condition |
|------|------|-----------|
| `first_bite` | First Bite | Log your first toast |
| `shutterbug` | Shutterbug | First toast with a photo |
| `week_warrior` | Week Warrior | 7-day streak |
| `toast_devotee` | Toast Devotee | 30-day streak |
| `centurion` | Centurion | 100 toasts total |
| `toastmaster` | Toastmaster | 1,000 toasts total |
| `clansman` | Clansman | Join a clan |
| `golden_toast` | Golden Toast | Win Toast of the week |
| `early_bird` | Early Bird | Toast before 07:00 |
| `midnight_snack` | Midnight Snack | Toast between 00:00 and 03:59 |

- Evaluated synchronously after the triggering action (toasts logged or added to a session, a photo added to a session, clan joined, TOTW drawn). Earned once, kept forever (BR-TOAST-4).
- Profile shows all achievements, earned ones with the date.

### 4.13 Admin
- Flag queue (filter by type / status) with actions from BR-MOD-4.
- Users: search, view, ban, unban.
- Clans: rename, edit, delete, transfer ownership.
- Settings: flag daily threshold, clan max members.
- Metrics: total users, daily active users, toasts per day (last 30 days), open flags.
- Toast of the week: view history, re-run draw.

## 5. Tech Stack
| Layer | Choice | Reason |
|-------|--------|--------|
| Monorepo / package manager | Bun workspaces (Bun as PM + script runner only) | Fast installs; Node stays the runtime for safety |
| Runtime | Node.js 24 LTS | Stable; NestJS ecosystem is tested on Node |
| Language | TypeScript (strict) everywhere | Shared types between web and API |
| Frontend | React 19 + Vite + React Router + TanStack Query | Mobile-first SPA; skills transfer to React Native later |
| Styling | Tailwind CSS 4 + shadcn/ui | Mobile-first utilities, accessible components |
| PWA | vite-plugin-pwa | Installable to home screen |
| i18n | i18next / react-i18next (SK + EN) | Standard, supports lazy-loaded namespaces |
| Backend | NestJS 11 (Fastify adapter) | Modules / DI / guards give clear boundaries for 3 people + agents |
| Validation / contracts | Zod schemas in `packages/shared`, `nestjs-zod`, OpenAPI generated from them | One source of truth for web, API, future mobile |
| Database | PostgreSQL 18, run in-cluster by the CloudNativePG operator | Relational data, strong aggregates; operator gives backups + PITR for free |
| ORM / migrations | Drizzle ORM + drizzle-kit migrations | Typed, SQL-like, good for aggregate queries |
| Background jobs | pg-boss | Queue + cron inside Postgres, no extra infra |
| Object storage | S3-compatible API (MinIO locally) | Provider chosen at deploy time |
| Image processing | sharp | Resize, WebP, EXIF strip |
| Auth | Better Auth: magic-link + bearer plugins, Drizzle adapter, mounted on the Fastify instance and wrapped in a NestJS guard | Maintained library instead of custom security code; DB sessions work for web cookie and mobile bearer |
| Email | SMTP via nodemailer: Resend (prod), Mailpit (dev) | One transport for both environments |
| Logging / errors | nestjs-pino (JSON logs), Sentry (web + API) | Structured logs, error tracking on free tier |
| Testing | Vitest (unit + integration), Testcontainers (Postgres), Playwright (E2E) | Fast, real DB in integration tests |
| CI | GitHub Actions | Lint, typecheck, tests, image build |
| Containers / deploy | Docker images (GHCR), Kubernetes with Kustomize (base + overlays `dev`, `prod`); Docker Compose for local dev | Provider-agnostic; k8s as required |
| Secrets | Sealed Secrets | Encrypted secrets can live in git; no external vault |
| Formatting | Prettier + `prettier-plugin-tailwindcss`, `.editorconfig` | Industry standard; consistent Tailwind class order |
| Linting | ESLint (flat config) + typescript-eslint `strict-type-checked`, plus React hooks and jsx-a11y rules for `web` | Type-aware rules catch async bugs (e.g. unawaited promises) |
| Git hooks | lefthook (pre-commit: Prettier + ESLint on staged files) | Fast, single config for the monorepo |

Pin exact major versions in `package.json` at scaffold time and verify they are current. Don't add dependencies not
listed here without noting it in Decisions (§12).

## 6. Architecture
```
Browser (React SPA / PWA) ──HTTPS──▶ Ingress ──▶ api (NestJS, stateless, N replicas)
                                                  │        │            │
                                                  ▼        ▼            ▼
                                            PostgreSQL   S3 storage   SMTP (Resend)
                                            (data + pg-boss jobs)
                                                  ▲
                                         worker (same image, WORKER mode):
                                         TOTW draw, flag checks, cleanup jobs
```
- `web` is built to static files and served by an nginx container (same domain, `/api` routed to the API → no CORS in prod).
- `api` and `worker` are the same image; the role is chosen by env var. Only the worker runs cron jobs.
- Photos are served via short-lived (1 h) presigned GET URLs. The API checks visibility before signing.
- API is versioned: `/api/v1/...`. OpenAPI spec published at `/api/v1/docs` (non-prod) and as an artifact in CI.
- PostgreSQL is a CloudNativePG `Cluster` resource in the same Kubernetes cluster, with continuous backups (WAL archive + base backups) to S3-compatible storage.
- Leaderboards, stats, heatmaps and streaks are computed with direct, indexed queries on `toasts` — no rollup tables (§12 D8).
- Environments: `dev` (local Docker Compose / local cluster) and `prod`.

Folder structure:
```
/apps
  /web                 React app
    /src/components
    /src/features      (toasts, clans, leaderboards, profile, admin, ...)
    /src/pages
    /src/api           generated client + TanStack Query hooks
    /src/i18n          sk.json, en.json
  /api                 NestJS app
    /src/modules       (auth, users, toasts, clans, leaderboards, stats, achievements, totw, facts, moderation, admin, storage, mail)
    /src/db            Drizzle schema (incl. Better Auth tables), migrations, seeds
    /src/jobs          pg-boss workers and cron definitions
/packages
  /shared              Zod schemas, DTO types, enums, achievement definitions
/infra
  /docker              Dockerfiles, docker-compose.yml (Postgres, MinIO, Mailpit)
  /k8s                 Kustomize base + overlays (dev, prod)
/e2e                   Playwright tests
/docs                  SPEC.md, AGENTS.md
```

## 7. Data Model
All tables have `created_at timestamptz default now()`. IDs are `uuid` (v7) unless noted. "Local" = Europe/Bratislava.

### Auth tables (owned by Better Auth)
`user`, `session`, `account`, `verification` follow Better Auth's schema, generated by its CLI into the Drizzle schema.
Don't edit their core columns by hand. App-specific user fields below are declared as Better Auth `additionalFields`
(`display_name` maps to Better Auth's `name`). Magic-link tokens live in `verification`; sessions in `session`.

### Entity: User
| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK |
| email | citext | unique, required |
| display_name | varchar(30) | required (null until onboarding finished) |
| avatar_id | smallint | 1–6, nullable |
| locale | enum(`sk`,`en`) | default `en` |
| profile_visibility | enum(`public`,`clan`) | default `public` |
| role | enum(`user`,`admin`) | default `user` |
| status | enum(`active`,`banned`) | default `active` |

### Entity: ToastSession
One log of 1–10 toasts eaten in one sitting (BR-TOAST-5). Its count is the number of its toasts that are not deleted.

| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK → User |
| local_date | date | local day of logging; the only day the session can be edited or deleted (BR-TOAST-7) |
| deleted_at | timestamptz | nullable (soft delete, together with its toasts) |

Indexes: `(user_id, created_at desc, id)` for the history list.

### Entity: Toast
| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK |
| user_id | uuid | FK → User |
| session_id | uuid | FK → ToastSession, required |
| clan_id | uuid | FK → Clan, nullable — clan at time of logging (§12 D9) |
| eaten_at | timestamptz | server-set, required |
| local_date | date | derived from eaten_at in local zone, indexed |
| photo_key | text | S3 key, nullable; only on a session's lead toast (its first toast, never removed by lowering the count) |
| photo_hidden_at | timestamptz | nullable (set by admin) |
| status | enum(`active`,`rejected`) | default `active` |
| deleted_at | timestamptz | nullable (soft delete) |

Indexes: `(user_id, local_date)`, `(clan_id, local_date)`, `(session_id)`, `(local_date) where photo_key is not null`.

### Entity: Like
| Field | Type | Constraints |
|-------|------|-------------|
| user_id | uuid | PK part, FK → User |
| toast_id | uuid | PK part, FK → Toast, cascade |

### Entity: Clan
| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK |
| name | varchar(40) | unique (case-insensitive) |
| description | varchar(280) | nullable |
| deleted_at | timestamptz | nullable |

### Entity: ClanMembership
| Field | Type | Constraints |
|-------|------|-------------|
| user_id | uuid | PK (enforces one clan per user), FK → User |
| clan_id | uuid | FK → Clan |
| role | enum(`owner`,`officer`,`member`) | partial unique index: one `owner` per clan |
| joined_at | timestamptz | default now |

### Entity: ClanJoinRequest
| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK |
| clan_id | uuid | FK → Clan |
| user_id | uuid | FK → User; partial unique: one `pending` per user |
| status | enum(`pending`,`approved`,`rejected`,`cancelled`) | |
| decided_by | uuid | FK → User, nullable |
| decided_at | timestamptz | nullable |

### Entity: UserAchievement
| Field | Type | Constraints |
|-------|------|-------------|
| user_id | uuid | PK part, FK → User |
| achievement_code | text | PK part, must exist in `packages/shared` list |
| earned_at | timestamptz | |

### Entity: ToastOfTheWeek
| Field | Type | Constraints |
|-------|------|-------------|
| week_start | date | PK (a Monday) |
| toast_id | uuid | FK → Toast, nullable (no eligible toast) |
| drawn_at | timestamptz | |
| drawn_by | uuid | FK → User, nullable (null = scheduled job) |

### Entity: Flag
| Field | Type | Constraints |
|-------|------|-------------|
| id | uuid | PK |
| type | enum(`count_threshold`,`photo_report`) | extensible (e.g. `ai_photo`) |
| subject_user_id | uuid | FK → User |
| toast_id | uuid | FK → Toast, nullable |
| local_date | date | nullable (for count flags; unique with user + type) |
| reporter_id | uuid | FK → User, nullable |
| reason | varchar(280) | nullable |
| status | enum(`open`,`dismissed`,`actioned`) | default `open` |
| resolved_by | uuid | FK → User, nullable |
| resolved_at | timestamptz | nullable |

### Entity: ToastFact
| Field | Type | Constraints |
|-------|------|-------------|
| id | serial | PK, defines rotation order |
| text_sk | text | required |
| text_en | text | required |

### Entity: AppSetting
| Field | Type | Constraints |
|-------|------|-------------|
| key | text | PK (`flag_daily_threshold`, `clan_max_members`) |
| value | jsonb | required |

**Relationships:** User 1—N ToastSession 1—N Toast; User 1—N Toast; User 1—N Session; User 0..1—1 ClanMembership N—1 Clan; Clan 1—N ClanJoinRequest;
Toast 1—N Like; User 1—N UserAchievement; ToastOfTheWeek 0..1—1 Toast; Flag N—1 User (subject) / Toast.

## 8. API
Base path `/api/v1`. Auth: **Session** = cookie or Bearer token, active user. **Admin** = Session + `role=admin`.
Lists use cursor pagination: `?cursor=&limit=` (default 20, max 50) → `{ items[], nextCursor }`.
Mutations from the browser require `SameSite=Lax` cookie + `Origin` check.

| Method | Path | Auth | Request | Response | Notes |
|--------|------|------|---------|----------|-------|
| * | /auth/* | — | Better Auth handler (base path `/api/v1/auth`) | | magic-link sign-in, verify, sign-out, get-session; paths and payloads as defined by Better Auth; rate-limited (BR-AUTH-5) |
| GET | /me | Session | — | `200 {user}` | app profile incl. `onboarded` flag and `clanId` (null when in no clan, D49) |
| PATCH | /me | Session | `{displayName?, avatarId?, locale?, profileVisibility?}` | `200 {user}` | onboarding uses this |
| GET | /home | Session | — | `200 {todayCount, streak, clanStreak?, fact, toastOfTheWeek}` | one call for home screen |
| POST | /toast-sessions | Session | multipart `{count?, photo?}` (count 1–10, default 1) | `201 {session, newAchievements[]}` | one transaction; the 30/hour rate limit counts toasts; photo on the lead toast |
| GET | /me/toast-sessions | Session | cursor | `200 {items: [{id, loggedAt, localDate, count, hasPhoto, photoUrl?, photoHidden, editable}], nextCursor}` | own sessions, newest first |
| PATCH | /toast-sessions/:id | Session (owner) | `{count}` (1–10) | `200 {session, newAchievements[]}` | only on the session's day (BR-TOAST-7), else 409 |
| PUT | /toast-sessions/:id/photo | Session (owner) | multipart `{photo}` | `200 {session, newAchievements[]}` | add or replace; same day rule; 409 if the photo is hidden |
| DELETE | /toast-sessions/:id/photo | Session (owner) | — | `200 {session}` | same day rule |
| DELETE | /toast-sessions/:id | Session (owner) | — | `204` | soft delete with its toasts; same day rule |
| POST | /toasts/:id/like | Session | — | `204` | idempotent; on the lead toast of a session the caller can see (D48) |
| DELETE | /toasts/:id/like | Session | — | `204` | idempotent; needs no access to the toast |
| POST | /toasts/:id/report | Session | `{reason?}` (≤ 280) | `202` | photo toasts only (409 otherwise); 10/hour per user |
| GET | /users/:id | Session | — | `200 {profile}` | reduced if `clan` visibility and not clanmate |
| GET | /users/:id/toasts | Session | cursor | `200 {items[], nextCursor}` | respects visibility; visible photos, one per session (D45) |
| GET | /users/:id/stats | Session | — | `200 {totals, averages, bestDay, streak}` | respects visibility |
| GET | /users/:id/heatmap | Session | `?year=` | `200 {year, days: [{date, count}]}` | respects visibility; only days with toasts |
| GET | /users/:id/achievements | Session | — | `200 {items: [{code, earnedAt?}]}` | respects visibility |
| GET | /leaderboards/users | Session | `?period=week\|month\|year` | `200 {items: [{rank, user, count}], me}` | default `week`; top 50, `me` is the caller's row with its true rank or null (D50) |
| GET | /leaderboards/clans | Session | `?period=week\|month\|year` | `200 {items: [{rank, clan, count, currentStreak}], myClan}` | default `month`; top 50, `myClan` like `me` (D50) |
| GET | /clans | Session | `?search=&cursor=` | `200 {items[], nextCursor}` | |
| POST | /clans | Session | `{name, description?}` | `201 {clan}` | caller must not be in a clan |
| GET | /clans/:id | Session | — | `200 {clan, streak: {current, longest}, members[], myRole?}` | |
| PATCH | /clans/:id | Owner | `{name?, description?}` | `200 {clan}` | |
| DELETE | /clans/:id | Owner | — | `204` | removes all memberships |
| GET | /clans/:id/leaderboard | Session | `?period=` | `200 {items: [{rank, user, count}]}` | every current member, by toasts logged for this clan; default `month` (D50) |
| GET | /clans/:id/feed | Member | cursor | `200 {items: [{sessionId, toastId, user, loggedAt, localDate, count, photoUrl?, likeCount, likedByMe}], nextCursor}` | current members' sessions, newest first (D48) |
| POST | /clans/:id/join | Session | — | `202 {request}` | creates a pending join request |
| POST | /clans/:id/leave | Member | — | `204` | Owner must transfer first |
| GET | /clans/:id/requests | Officer+ | — | `200 {items[]}` | pending only |
| POST | /clans/:id/requests/:rid/approve | Officer+ | — | `200 {membership}` | fails if full |
| POST | /clans/:id/requests/:rid/reject | Officer+ | — | `204` | |
| DELETE | /me/clan-request | Session | — | `204` | cancel own pending request |
| PATCH | /clans/:id/members/:userId | Owner | `{role: officer\|member}` | `200 {membership}` | |
| DELETE | /clans/:id/members/:userId | Officer+ | — | `204` | kick; Officers can kick Members only |
| POST | /clans/:id/transfer | Owner | `{userId}` | `200 {owner, previousOwner}` | the former Owner becomes an Officer |
| GET | /toast-of-the-week | Session | cursor | `200 {items: [{weekStart, status, toast?}], nextCursor}` | history, newest first; `status` = `won`, `none` or `removed` (D51) |
| GET | /admin/flags | Admin | `?type=&status=&cursor=` | `200 {items[], nextCursor}` | |
| POST | /admin/flags/:id/resolve | Admin | `{action: dismiss\|reject_toasts\|hide_photo, ban?}` | `200` | |
| GET | /admin/users | Admin | `?search=&cursor=` | `200 {items[], nextCursor}` | |
| POST | /admin/users/:id/status | Admin | `{status: active\|banned}` | `200` | ban revokes sessions |
| PATCH | /admin/clans/:id | Admin | `{name?, description?, ownerId?}` | `200` | |
| DELETE | /admin/clans/:id | Admin | — | `204` | |
| GET / PATCH | /admin/settings | Admin | `{flagDailyThreshold?, clanMaxMembers?}` | `200 {settings}` | |
| GET | /admin/metrics | Admin | — | `200 {users, dau, toastsPerDay[], openFlags}` | |
| POST | /admin/toast-of-the-week/:weekStart/redraw | Admin | — | `200 {weekStart, toast?}` | |
| GET | /healthz, /readyz | — | — | `200` | k8s probes (outside `/api/v1`) |

Error format (consistent everywhere):
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "…", "fields": {} } }
```
Codes: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409
(e.g. already in a clan, clan full, editing a toast session after its day), `PAYLOAD_TOO_LARGE` 413, `RATE_LIMITED` 429, `INTERNAL` 500.
`message` is English; the web client maps `code` to localized text.

## 9. UI / Pages
| Route | Page | Access | Key elements |
|-------|------|--------|--------------|
| `/` | Landing | Public (logged-in → `/home`) | What Toasthub is, "Log in with email" CTA, language switch |
| `/login` | Login | Public | Email field, "check your inbox" state |
| `/auth/callback` | Verify link | Public | Consumes token, redirects to `/onboarding` or `/home`, error + resend on failure |
| `/onboarding` | Onboarding | User (new) | Display name, avatar picker (6), visibility |
| `/home` | Home | User | Big "+ Toast" button (opens the log dialog: number of toasts, optional photo), "My toasts" link, today's count, current streak, clan streak, fact of the day, Toast of the week card, new-achievement toast |
| `/leaderboards` | Leaderboards | User | Tabs Users / Clans, period switch week / month / year (clans default to month), clan rows show 🔥 streak, "me" row pinned |
| `/clans` | Clan browser | User | Search, list with member count, "Create clan" |
| `/clans/new` | Create clan | User (no clan) | Name, description |
| `/clans/:id` | Clan | User | Header with current / longest clan streak + request to join / cancel request / leave, tabs: Feed (members), Leaderboard, Members; requests panel for Officers+; settings for Owner |
| `/toasts` | My toasts | User | Own toast sessions, newest first, grouped by day (time, count, photo thumbnail); today's sessions open an edit dialog (count stepper, add / replace / remove photo, delete with a confirmation), older ones are read-only. Linked from home and the own profile |
| `/u/:id` | Profile | User | Avatar, name, stats, heatmap, achievements, photo grid (subject to visibility); own profile links to My toasts |
| `/toast-of-the-week` | TOTW history | User | Past winners by week |
| `/settings` | Settings | User | Display name, avatar, visibility, language, logout |
| `/admin` | Admin | Admin | Sub-pages: Flags, Users, Clans, Settings, Metrics, TOTW |

- Navigation: bottom tab bar on mobile (Home, Leaderboards, Clan, Profile); top nav at `md` and up.
- Breakpoints: Tailwind defaults (`sm` 640, `md` 768, `lg` 1024); designed for 360 px wide first; content max-width ~ 640 px on desktop except admin.
- Theme: shadcn/ui with a warm "toast" palette; light + dark following system preference.
- Mockups: none yet.

## 10. Non-functional Requirements
- **Security:** server-side validation of every input (Zod); magic-link tokens stored hashed; `httpOnly`, `Secure`, `SameSite=Lax` cookies + `Origin` check on mutations; CORS limited to the web origin; rate limits (auth, toast creation, reports); uploads checked by content (magic bytes), not extension; EXIF stripped; secrets only in env vars / k8s Secrets, committed only as Sealed Secrets; photos only via presigned URLs after visibility check.
- **Performance:** p95 API < 300 ms; LCP < 2.5 s on 4G mid-range phone.
- **Accessibility:** WCAG 2.1 AA basics (labels, keyboard nav, focus states, contrast, alt text for photos).
- **i18n:** Slovak + English for all UI text; dates and numbers localized; day boundaries always Europe/Bratislava.
- **PWA:** installable (manifest, icons, service worker caching the app shell); no offline toast logging in v1.
- **Logging & monitoring:** JSON logs (pino) with request ID; no emails or tokens in logs; Sentry for web + API errors; `/healthz` (liveness) and `/readyz` (DB reachable) for k8s probes.
- **Backups:** CloudNativePG continuous backup (WAL archiving + daily base backup) to S3-compatible object storage, retention 14 days, point-in-time recovery; restore procedure documented and tested once before launch.
- **Privacy:** email never exposed to other users; no tracking/analytics cookies.

## 11. Quality & Definition of Done
A feature is done when:
- [ ] All acceptance criteria and business rules (§4) for it pass
- [ ] Unit tests for business logic (streaks, ranking, achievements, TOTW draw, visibility, toast session edit rules), integration tests for API endpoints against real Postgres (Testcontainers)
- [ ] E2E test for the main happy path (Playwright, mobile viewport)
- [ ] Prettier check, ESLint (zero warnings) and type check pass, CI green
- [ ] Both SK and EN strings added
- [ ] OpenAPI schema updated (generated) and web client regenerated
- [ ] No TODOs left without a linked issue
- [ ] Docs/README updated if setup or behavior changed; significant choices added to §12

## 12. Decisions
| ID | Decision | Reason |
|----|----------|--------|
| D1 | Trust-based anti-cheat; flags only for admin review | Friends app; low friction |
| D2 | Day boundary fixed to Europe/Bratislava | Users are local; simpler than per-user zones |
| D3 | Opaque DB sessions (via Better Auth), cookie for web + bearer for mobile | Revocable; ready for native apps |
| D4 | Magic link is the only email | Avoids consent management and email infra |
| D5 | Bun as package manager only, Node runtime | Ecosystem safety for NestJS |
| D6 | pg-boss instead of Redis-based queue | No extra infra at this scale |
| D7 | Soft delete for toasts | Keeps TOTW history and moderation trail |
| D8 | No rollup tables; direct indexed queries for leaderboards, stats, streaks. Add rollups / materialized views only if p95 > 300 ms is measured | Data volume is small (~500k toasts/year at most); avoids consistency bugs |
| D9 | Toasts count for the clan the user was in when logging them | Leaving a clan doesn't drain its score; joining doesn't import a score |
| D10 | Same image for API and worker, role by env var | One build, cron runs only in the worker |
| D11 | SMTP transport for email (Resend prod, Mailpit dev) | Same code path in all environments |
| D12 | Kustomize (not Helm) for k8s manifests | Built into kubectl, less templating |
| D13 | Better Auth instead of custom auth code | Maintained, audited-by-use library; magic link, DB sessions, bearer and rate limiting built in. NestJS integration is via a thin custom guard |
| D14 | CloudNativePG in-cluster instead of a managed database | Zero extra cost; production-grade backups and PITR |
| D15 | Sealed Secrets for secret management | Free, GitOps-friendly, no external vault |
| D16 | Only `dev` and `prod` environments | Small team, zero budget; staging can be added as another namespace later |
| D17 | Zero spend apart from hosting and domain | Only open-source tools and permanent free tiers (Sentry, Resend) |
| D18 | Prettier + ESLint (typescript-eslint strict type-checked) over Biome / Oxc | Most standard, strongest type-aware rules, best known to AI agents; enforced in editor, pre-commit (lefthook) and CI |
| D19 | Version pins checked at scaffold (2026-10-29): Node 24 LTS (not 26), NestJS 11 (not 12), TypeScript 6.0 (not 7), Postgres 18 (19 is RC) | Node 26 became LTS the day before. nestjs-zod supports only Nest ≤ 11. typescript-eslint needs TS < 6.1 and @nestjs/swagger needs TS ≤ 6. Revisit when these peer ranges allow it |
| D20 | ESLint 10 with `eslint-plugin-jsx-a11y-x` (maintained fork) instead of ESLint 9 + `eslint-plugin-jsx-a11y` | ESLint 9 is EOL since 2026-08-06. The original jsx-a11y has had no release since 2024 and doesn't support ESLint 10. The fork has the same rules |
| D21 | `@toasthub/shared` is ESM, built with `tsc`, with a `@toasthub/source` export condition for source-level use. The api is CommonJS, built with plain `tsc` (no Nest CLI) | Typecheck, lint, Vite and Vitest need no prior build of `shared`. The api runtime loads `shared/dist` via Node's `require(esm)`. One TypeScript version, no extra build tooling |
| D22 | `pg` (node-postgres) is the Postgres driver for Drizzle, with `casing: 'snake_case'`. Also added beyond §5: `fastify` (types; pinned to the version `@nestjs/platform-fastify` uses), `@fastify/static` (Swagger UI on Fastify), `pino-pretty` (dev-only log output) | pg-boss needs `pg` anyway, so one driver. snake_case columns without naming each one by hand |
| D23 | Local S3 is `pgsty/minio`, a community build of MinIO, pinned to a release tag | MinIO stopped publishing images: `minio/minio` is gone from Docker Hub and `quay.io/minio` needs auth. Same server and `mc` client, so nothing in the app changes. Swap for any S3-compatible image if this one stalls |
| D24 | Error mapping: statuses outside the §8 list keep their HTTP status. Other 4xx are reported as `VALIDATION_ERROR`, other 5xx (e.g. `/readyz` 503) as `INTERNAL`. 5xx messages are always generic. `fields` is `{ "dotted.path": "first message" }` and only appears on `VALIDATION_ERROR`. Page `limit` outside 1–50 is a 400, not clamped | Keeps the closed set of codes from §8. The client must change a request that gets a 4xx, so "validation" is the closest code |
| D25 | User table via Better Auth: `name` is mapped to the `display_name` column (varchar(30), NOT NULL, `''` until onboarding; `/me` returns `displayName: null` and `onboarded: false` for `''`). IDs come from Postgres 18 `uuidv7()` defaults (`generateId: 'uuid'`). Email is citext, timestamps are timestamptz, app fields are Postgres enums / smallint with checks. The CLI output (`auth:schema`) is adapted by hand in `src/db/schema/auth.ts` | Better Auth's `name` can't be null; the SPEC types and v7 IDs matter more than a byte-for-byte generated file |
| D26 | Only four Better Auth endpoints are mounted: `POST /sign-in/magic-link`, `GET /magic-link/verify`, `POST /sign-out`, `GET /get-session`; all others are 404. Their error responses are rewritten to the §8 error format (status kept, `code` by D24) | Other built-in endpoints (update-user, change-email, …) would bypass our validation. One error shape for the web client. The Better Auth browser client's error parsing therefore doesn't apply; the web uses plain fetch for these four |
| D27 | Magic-link rate limits: per IP via Better Auth (database storage, IP taken from Fastify's `request.ip` through an internal header that is overwritten on every request); per email (5/h, key = SHA-256 of the lower-cased email) by our own atomic upsert into Better Auth's `rate_limit` table. A per-email hit is a 429 like a per-IP hit (it reveals nothing about account existence). Banned users get the normal success response but no email | Better Auth has no per-email key. Spoofed `X-Forwarded-For` must not reset the IP limit; which proxies are trusted is Fastify's `trustProxy` |
| D28 | CSRF: a global Fastify hook requires a trusted `Origin` (web origin or the API's own) on non-GET requests that carry a cookie and no `Authorization` header; bearer and cookie-less clients need none. Better Auth's own origin/callback checks are forced on (`disableOriginCheck: false`), since it skips them under `NODE_ENV=test`. `SessionGuard` is global (opt out with `@Public()`); banned or non-active users get 401 | Secure by default; tests see production behaviour |
| D29 | `toast.local_date` is a stored generated column, `(eaten_at AT TIME ZONE 'Europe/Bratislava')::date`; the app never writes it. In code, local days come from the `shared` time utils (`localDate`, `localHour`, `weekRange`, …). A `LocalDate` is a `YYYY-MM-DD` string and ranges are half-open `[start, end)`. `Intl` does the zone math, so there is no date library | The date can never disagree with `eaten_at`, and every insert path (API, seeds, tests) gets it for free. Postgres and Node both use IANA zone data. Strings compare and serialize exactly like Postgres `date` |
| D30 | Reference data that every environment needs (setting defaults, toast facts) is inserted by a migration (`0004_seed_reference_data`). `SettingsService` reads a missing `app_setting` row as its default from `shared` and validates every value with the shared Zod schema. In the API settings are camelCase (`flagDailyThreshold`), in the DB the §7 snake_case keys. The dev sample data is a separate, idempotent `bun run db:seed` that refuses `NODE_ENV=production` | Migrations already run once per deploy (Q5), so no extra seed step in prod. The default fallback keeps the app working on an emptied table, which is also how the int tests reset settings |
| D31 | Schema integrity: user-owned rows (toasts, likes, memberships, requests, achievements, flags about the user) cascade on user delete, references to an acting user (`decided_by`, `resolved_by`, `reporter_id`, `drawn_by`) are set null. Clans are only soft-deleted. Clan names are unique case-insensitively among non-deleted clans. `user_achievement.achievement_code` has a CHECK against the `shared` list. `toast_of_the_week.week_start` must be a Monday. Count flags need `local_date`, photo reports need `toast_id`. Every table has `created_at` | Users are never hard-deleted yet (Q1), but when they are, nothing dangles and moderation history keeps its rows. The DB enforces the rules that a bug in one service could otherwise break |
| D32 | Web API client: `openapi-typescript` generates types only (`apps/web/src/api/schema.gen.ts`, committed, prettier-formatted) and `openapi-fetch` is the runtime; `unwrap()` turns results into data or an `ApiError`. `bun run openapi` regenerates it, CI fails if stale. Its peer range says TS 5, but it works with our TS 6.0 | Smallest option: one generated type file, a ~6 kB runtime, no generated runtime code to review. `@hey-api/openapi-ts` (TS 6 peer, but generates a whole SDK and is still 0.x) is the fallback if the generator breaks on a future TS |
| D33 | Web dependencies beyond §5: `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` (what shadcn/ui components import); `@tailwindcss/vite`; dev: `@testing-library/{react,dom,jest-dom,user-event}`, `jsdom`. No i18next language-detector plugin (a 10-line `detectLocale` does it) | shadcn/ui is copied source, these are its runtime. Fewer moving parts for the rest |
| D34 | Theme: all design values are CSS variables in `apps/web/src/styles/theme.css`, light in `:root`, dark in `@media (prefers-color-scheme: dark)` (Tailwind's default media `dark:` variant, no class toggle, no JS). Components use only semantic token classes. Warm palette: crust-brown primary in light, golden in dark; 6 avatar colours for avatar IDs 1–6 with initials. A dev-only `/dev/ui` page previews them | SPEC §9 asks for system-following light/dark; no flash and nothing to sync. One file to change for a redesign. A manual theme switch would later need the `.dark` class variant |
| D35 | Web i18n: SK and EN JSON bundled (no lazy namespaces yet), keys typed against `en.json`. Initial locale: stored choice (`localStorage`) → first `sk*`/`en*` browser language → `en`. Formatting uses `sk-SK` and `en-GB` (day-month order, 24 h); instants are formatted in Europe/Bratislava, `LocalDate` strings as calendar days | Both files are a few kB. `en-GB` matches Slovak conventions better than `en-US` for local users. Same zone rule as D2/D29 |
| D36 | Web session = TanStack Query `['me']` (`GET /me`, 401 → `null` = signed out); any 401 elsewhere resets it. The magic link's `callbackURL` and `errorCallbackURL` are both `/auth/callback` (plus `?next=` for the page `RequireAuth` bounced from, only same-app paths are followed). The callback page only reads the session. The last email is kept in `localStorage` so "send new link" needs no typing. The UI language goes to `/me` on change and onboarding; after onboarding the saved `locale` wins over the device's choice on load. Logout is `POST /auth/sign-out` + a full reload to `/`. Avatar is optional at onboarding (`null` = neutral initials) | The verify redirect is a full page load, so a fresh `/me` is all the callback needs. One error URL keeps Better Auth's trusted-callback check simple. The reload drops every cached query of the old user without listing them |
| D37 | E2E: Playwright `1.64.1` (one `mobile` project, Pixel 7 Chromium, `en-GB`). Its `webServer` starts the built api (`node dist/main.js` with `apps/api/.env`) and the Vite dev server, reused locally if already running. No database reset: each test signs up with a unique email. A global setup empties Better Auth's `rate_limit` table (e2e devDependency `pg`, same version as the api) so the 20/h per-IP limit doesn't block repeated local runs. CI job `e2e` runs Postgres + Mailpit from compose | Same stack as development, nothing E2E-only in the app. Unique users make tests parallel-safe without truncating shared dev data |
| D38 | Photo dependencies beyond §5: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (S3 API), `@fastify/multipart` (uploads), `heic-decode` (libheif compiled to WebAssembly, LGPL) + `@types/heic-decode`. The type is checked by magic bytes only (HEIC = an `ftyp` box with a HEIC/HEIF brand; AVIF is rejected). HEIC is decoded by `heic-decode`, everything else by sharp. Each photo is rotated by its EXIF orientation, fit inside 1600×1600 without enlarging, encoded as WebP (quality 80) with no metadata and stored at `toasts/<userId>/<random uuid>.webp`. Inputs over 100 MP are rejected. A wrong type or an unreadable image is a 400 `VALIDATION_ERROR` with `fields.photo`; over 10 MB is a 413 | Prebuilt sharp has no HEVC decoder (patents), so it can't read iPhone HEIC files. The official AWS SDK works with any S3-compatible store. The pixel cap stops decompression bombs that fit in 10 MB |
| D39 | Toast API details: the 30/h limit counts every `POST /toasts` attempt (checked before the upload is read) and lives in memory per replica until Q4 is decided. `DELETE` on someone else's toast is a 403; on a missing or already deleted one, a 404. A soft-deleted toast keeps its photo object. A `count_threshold` flag has no `toast_id` (it is about the day) and is created at most once per user and day, even after it is resolved. Countable toasts (`countableToasts()`) = not deleted, `status = active`, and the owner's `status = active` | Counting attempts protects the image pipeline from floods. Toast IDs appear in feeds anyway, so a 403 reveals nothing. One SQL fragment keeps every aggregate consistent |
| D40 | Streaks are computed on read: the distinct countable `local_date`s of a user (or clan, via `toast.clan_id`) go through a pure function; days after today are ignored. Streak achievements check the *longest* streak. Achievements are evaluated after the toast transaction commits; inserts are `ON CONFLICT DO NOTHING RETURNING`, so each code is returned once, even under concurrent requests. If evaluation fails, the toast is still a 201 with `newAchievements: []` and the error is logged. `GET /home`: `clanStreak` is `null` (not omitted) outside a clan, `fact` is `null` only when there are no facts, and the fact rotation runs in `toast_fact.id` order | Per D8 there is no streak table to keep in sync. Using the longest run lets a streak that reached 7 before it was evaluated still earn the badge. A 5xx after the toast is saved would make clients retry and log it twice; count and streak badges catch up with the next toast. Explicit nulls are easier for clients than missing keys |
| D41 | Home UI: "+ Toast" opens one dialog: a stepper for the number of toasts (1–10, a client-side cap; default 1) and an optional photo from a file input without `capture` (camera or gallery) with a preview (HEIC shows a "no preview" note) and a client-side 10 MB check. Confirming sends one `POST /toasts` per toast, one after another; the photo goes as `FormData` with the first, so a bad photo fails before anything is saved. If a later request fails (e.g. the 30/h limit), the toasts already saved stay, the dialog closes and a notice says how many were logged; the rest are not sent. `['home']` is updated optimistically on confirm (`todayCount + n`; the first toast of the day also adds 1 to `streak.current` and raises `longest`), rolled back if nothing was saved and refetched afterwards. The clan streak is not guessed (another member may have toasted today), only refetched. The dialog can't be closed while saving. New achievements and errors are `sonner` toasts (web dependency beyond §5, through shadcn's `sonner` component with `theme="system"` instead of `next-themes`) | One entry point keeps the home screen simple and still meets G1 (two taps for one toast). The API stays one toast per request (BR-TOAST-1, and the rate limit keeps counting toasts), so a batch is a client loop. Meets the §4.3 acceptance without waiting for the server; a wrong guess for the clan would flicker. Picking from the gallery matters as much as the camera. sonner is what shadcn/ui ships for toasts |
| D42 | PWA (vite-plugin-pwa, `generateSW`, `autoUpdate`): precaches the built app shell and icons, `navigateFallback` to `index.html` except `/api/*` (the magic-link verify must reach the server), no runtime caching of API responses, no service worker in dev. Manifest `start_url` is `/home`, colours are the light theme's `--background` / `--primary` as hex. Icons are placeholders rendered from `public/favicon.svg` (192, 512, maskable 512, apple-touch 180). Installability is checked with Chromium's `Page.getInstallabilityErrors` (Lighthouse 12 has no PWA category any more) | SPEC §10: installable, app shell cached, no offline logging. A new deploy takes over on the next load without a prompt |
| D43 | Toast sessions (BR-TOAST-5–7): a `toast_session` row groups the toasts of one log; each toast keeps its own row, so counts, streaks, leaderboards and `countableToasts()` don't change. The photo, likes and reports stay on the session's lead toast (its first toast), so TOTW, `photo_report` flags, hiding and `canSeePhoto` keep working per toast. `POST /toast-sessions` creates all toasts in one transaction and replaces `POST /toasts` and the web's per-toast loop from D41; owners no longer delete single toasts (`DELETE /toasts/:id` goes, D39). Editing is limited to the session's `local_date`, checked on the server (409 after that day); added toasts get the current time, never the session's. The migration gives every existing toast its own session. The name is "toast session" to stay apart from Better Auth's auth `session` | Grouping on top of per-toast rows keeps every aggregate as it is. One day to edit means no backdating (BR-TOAST-1): past days, streaks, leaderboards and TOTW draws never change afterwards, and a winning photo can't be swapped. One request per log makes it atomic, so there are no partly saved logs |
| D44 | Toast session API details (M8b): `toast_session.local_date` is generated from `created_at` like D29, and a session's toasts are inserted in its transaction, so they share its `now()`. The lead toast is the oldest one not deleted, by `(eaten_at, id)`. The migration gives each old toast a session with the same id, `created_at = eaten_at` and its `deleted_at`. The 30/h limit counts toasts: `POST` takes `count` hits after reading the multipart body and before processing the photo, raising a count takes the added toasts, `PUT …/photo` takes one hit before the upload is read (it runs the image pipeline too); lowering, removing and deleting are free. Checks run as 404 (missing or deleted) → 403 (someone else's) → 409 (past its day, or a rejected toast); the day check and the added toasts' `eaten_at` use one server instant. A replaced or removed photo stays in storage and gets a `discarded_photo` row (`key`, `toast_id`); M15's cleanup job deletes objects there once no open `photo_report` on that toast needs them. Removing a hidden photo keeps `photo_hidden_at`, so the session can never get another photo. The list item adds `hasPhoto` and `photoHidden` to §8 so the UI can offer "remove" for a hidden photo. The list keyset is `(created_at, id)` with `created_at` in the cursor at microsecond precision. Web: the edit dialog saves the photo first, then the count, and asks to confirm a delete in the same dialog | A photo upload costs as much as a log, so it shares the flood protection. Keeping `photo_hidden_at` makes "removed but not replaced" hold for a remove and add in two steps. A `Date` cursor would round to milliseconds and skip rows logged in the same millisecond. An unreadable photo then fails before anything else changed |
| D45 | Profiles (M9): `profileAccess(viewer, owner)` is `full` for the own profile, a `public` one, or a `clan` one when both users are in the same clan right now, else `reduced`; admins get no exception here (they use the admin routes). `GET /users/:id` always answers with `access`, name, avatar and the countable toasts of the current week, month and year (the leaderboard counts); `/toasts`, `/stats`, `/heatmap` and `/achievements` are a 403 for `reduced`. Unknown, banned and not yet onboarded users are a 404 on all five. `/toasts` lists only visible photos: one item per session (its lead toast: `id`, `sessionId`, `eatenAt`, `localDate`, the session's countable `count`, `photoUrl`), newest first by `(eaten_at, id)` with a microsecond cursor like D44; hidden, rejected and deleted photos are left out, also on the own profile. `canSeePhoto` = a photo that is not hidden or removed (deleted, rejected, owner banned), seen with `full` access or won a Toast of the week. Stats: averages divide by the calendar days, Mon–Sun weeks and months from the first toast's to today's, both included; the best day is the earliest of equal days; zeros and `null`s before the first toast. Heatmap: `?year=` 2000–2100, default the current Europe/Bratislava year; `{year, days}` lists only days with toasts. Achievements: every code in display order, `earnedAt` is `null` (not omitted) when not earned | The profile page shows a photo grid, and counts come from stats and the heatmap, so a list of photo-less toasts would only page through empty tiles. Calendar periods make "per week" something a user can check, and the current, partial period counts as one, so a new user isn't extrapolated. A 403 reveals nothing the reduced profile doesn't already show. A user without a display name has nothing to show |
| D46 | Profile UI (M10): the year heatmap is twelve small Monday-first month calendars (3 per row on a phone, 4 from `sm`), not one 53-week strip, and each day is a `role="img"` named "<date>: <n> toasts". Colour levels are fixed steps, 0 / 1 / 2 / 3 / 4+ toasts (`bg-muted`, `bg-heat-1…4`), not relative to the busiest day. The year switch goes back to the first toast's year and forward to the current one. Profile queries live under `['users', id, …]`; logging and every session change invalidate `['users']`, saving `/me` invalidates `['users', me.id]`. Locked achievements use the muted surface and text, not lowered opacity | A 53-column strip needs horizontal scrolling at 360 px, while month blocks fit and read like a calendar. Fixed steps mean a colour means the same count in every year and on every profile. Muted colours keep AA contrast that opacity would lose. The 30 s `staleTime` would otherwise show the old total after a delete in My toasts |
| D47 | Clans API (M11): `GET /clans` sorts by `lower(name)`, then `id` (keyset cursor); `search` matches part of the name case-insensitively and literally (`%` and `_` escaped), blank = all; items carry `memberCount`. Creating a clan makes the creator its Owner, cancels their pending join request and awards `clansman` (founding counts as joining), so `POST /clans` returns `{clan, newAchievements}`. Creating and joining need a finished onboarding (403), because members and requests show display names. `GET /clans/:id` is open to every signed-in user: members owner → officers → members, each by join time; `myRole` and `myRequest` (the caller's pending request to this clan) are `null`, not omitted. An empty description is stored as `null`. Joining is a 409 when already in a clan, with a pending request to any clan (it is not replaced) or when the clan is full. Checks run 404 (unknown or deleted clan) → 403 (not a member, or the role may not) → 404 (a request of another clan) → 409. `DELETE /me/clan-request` is an idempotent 204. A cancelled request records who cancelled it in `decided_by` (the user, or the Owner who deleted the clan). Approve, edit and delete lock the clan row `FOR UPDATE`; join, reject and leave `FOR SHARE`. A unique violation that loses a race becomes the same 409 the checks give. The pure policy already covers M12's kick, role change and transfer | Locking the clan row serializes approvals per clan, so concurrent approvals can't overfill it and a join can't slip in beside a delete. The badge on create keeps "join a clan" true for founders. An idempotent cancel makes a double tap no error. Name order is a stable list to browse; member counts change too often to page by |
| D48 | Clan social API (M12): role change, kick and transfer lock the clan row `FOR UPDATE` and the target's membership; checks run 404 (clan) → 403 (not a member, or the role can't do this to anyone) → 404 (target not in this clan) → 403 (not to this target, or to oneself). `owner` is not a valid role for `PATCH …/members` (400); a transfer demotes the Owner to Officer before it promotes the target, so the one-owner index holds after each statement. The feed lists every non-deleted session of the current members (also those logged before joining, D9 applies only to scores), newest first by `(created_at, id)` with a microsecond cursor like D44; a session whose lead toast is not countable (rejected, or the member is banned) is left out. Likes go only on a lead toast (another toast id is a 404) of a session the caller can see: `canSeeToast()` = not removed and (full profile access or a Toast of the week), so a session without a photo or with a hidden one can be liked, and so can the own one. `DELETE …/like` needs no access and is a 204 even for an unknown id. Like counts count every like (they are deleted with their toast, D44); `/users/:id/toasts` items carry `likeCount` and `likedByMe` too. A report needs `canSeeToast()` and a visible photo (409 without one or when hidden); 10 attempts per user and hour in memory (Q4), counted before any check; a second report by the same user while theirs is open adds no flag; reporting the own photo is allowed. The body may be left out, an empty `reason` is stored as `null` | One lock order per clan keeps role changes, kicks and transfers from interleaving; a lost transfer race is a 403, since the loser is no longer the Owner. Clanmates see every log in the feed, and a rejected session shouldn't be liked into view. Taking back a like must keep working after access is gone. Deduplicating open reports keeps the admin queue short without a schema change |
| D49 | Clan UI (M13): `GET /me` carries `clanId` (null when in no clan), so the Clan tab and the home clan streak link to `/clans/:id`, and `/clans/new` sends a member there. The clan page refetches `/me` when its `myRole` disagrees with `me.clanId` (someone else approved or kicked the caller). Tabs: Feed (members only, their default), Leaderboard (placeholder until M14), Members (everyone else's default), Settings (Owner: edit and delete). Ownership is handed over from a member's menu ("Make owner") on Members, next to promote / demote / remove, not in Settings. The menus come from the role tables, which moved to `shared` (`clan-policy.ts`) so web and api can't disagree. Every clan mutation refetches all `['clans']`, `['me']`, `['home']` and `['users']` queries; a like is shown at once and put back on failure. The browser searches 300 ms after typing stops. Destructive steps (leave, remove, make owner, delete) and reports go through one `ConfirmDialog` | The Clan tab needs the caller's clan on every page, and `/me` is already loaded everywhere; a separate call would delay the nav. A transfer is about one member, so it sits with the other per-member actions. One shared rule table keeps a menu from offering what the api refuses. Refetching broadly is cheap at clan sizes and keeps counts, streaks and profile access right without per-mutation bookkeeping |
| D50 | Leaderboards (M14): the api ranks each board as a whole with `rankByCount()` (competition ranking: 1, 1, 3; ties ordered by name, then id) and lists the top 50 (`LEADERBOARD_SIZE`), with no cursor. `me` / `myClan` is the caller's row with its true rank, also below the top; it is `null` without a countable toast in the period, and `myClan` also outside a clan. Periods default to `week` for users and to `month` for both clan boards (also the clan page tab). Users board: onboarded users with a countable toast in the period, whatever their visibility. Clans board: toasts by `toast.clan_id` (D9), deleted clans left out; `currentStreak` is read backwards from today in windows of 64, 128, … days until each listed clan's run starts inside one. Clan member board: every current member who isn't banned, also with 0, counting only the toasts logged for this clan; any signed-in user may look, a deleted or unknown clan is a 404. The UI pins the caller's (or their clan's) row above the board and marks it in the list; each tab keeps its own period | Counts are public anyway (every profile shows them, D45), so only the feed needs membership. Ranking in one place gives `me` an exact rank without a second query, and a board has at most one row per user with a toast in the period. A board shows only the current streak, and long runs are rare, so the windows keep the clans board under D8's 300 ms without a rollup (measurements: M14 handoff notes) |
| D51 | Worker, jobs and Toast of the week (M15): `APP_ROLE=worker` boots a Nest application context (`WorkerModule`: config, logger, database, `JobsModule`) with no HTTP server, and only it starts pg-boss (own `pgboss` schema, installed on start, pool of 4). Queues `totw-draw` (Monday 00:00), `cleanup-verifications` (03:15) and `cleanup-photos` (03:30), cron in Europe/Bratislava with `missed: 'once'`, 5 retries with backoff from 1 minute; `bun run --filter @toasthub/api job <name>` queues one for the running worker. The draw takes the lead toasts with a photo that is not hidden, countable (D39) and with `local_date` in the week, orders them by id and picks one `crypto.randomInt` index (the RNG is injectable). It runs in a transaction under an advisory lock per week. The scheduled draw keeps a week that is already drawn, `replace` (M16's redraw) overwrites it and sets `drawn_by`; a week that hasn't ended is a 409, a `weekStart` that isn't a Monday a 400. `golden_toast` is evaluated after the commit, also for a week drawn before, and a failure fails the job. `GET /toast-of-the-week` lists drawn weeks newest first (cursor on `week_start`); an item is `{weekStart, status: won\|none\|removed, toast}`, `removed` when the winner is deleted, rejected, hidden or its owner banned, `toast` = `{id, user, eatenAt, photoUrl}` only for `won`, no likes. `/home` shows last week's item, `null` until it is drawn. Retention: 30 days. The photo object of a toast deleted, and of a `discarded_photo` row created, more than 30 days ago is deleted, then the deleted toast's `photo_key` becomes null (or the row goes), unless an open `photo_report` is on that toast. Expired `verification` rows are deleted nightly. Dependency beyond §5: `pg-boss` 12 (ESM, loaded by the CommonJS api through `require(esm)`), which needs `@opentelemetry/api` as a peer (a no-op without an SDK) | A retried or doubled job must never change a winner people have already seen, and the lock keeps a redraw from interleaving with it. Without HTTP the worker can't serve a route by accident (`TotwModule` has a controller). `once` still draws a Monday the worker slept through. 30 days gives an admin time for a late report and keeps storage from growing with photos nobody can see; deleted toasts can't be restored anyway |

## 13. Future (post-v1)
- AI moderation of photos and counts (creates `ai_*` flags)
- Native Android / iOS apps on the same API
- Possibly: Wrapped summaries, notifications, comments

## 14. Open Questions
- [ ] Q1: GDPR — account deletion and privacy policy are out of scope. Revisit before opening registration beyond friends.
- [ ] Q2: Hosting provider and domain (k8s cluster where? managed or self-hosted k3s?). Candidates under the zero-spend rule (D17): k3s on one 8 GB VPS; Cloudflare R2 for photos and backups; cert-manager + Let's Encrypt with Cloudflare DNS; public GitHub repo (free Actions minutes and GHCR storage); Uptime Kuma for uptime monitoring.
- [ ] Q3: Source of the toast facts (who writes the SK + EN list, how many at launch).
- [ ] Q4: Rate limiting across API replicas (non-auth routes) — shared counter storage needed once there is more than one replica.
- [ ] Q5: How DB migrations run during a deploy (must run once, before new pods start).
- [ ] Q6: CD pipeline (GitOps with Argo CD / Flux, or deploy from GitHub Actions).
