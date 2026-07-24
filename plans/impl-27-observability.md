---
title: "Implementation plan — #27 Observability & resilience — Sentry, uptime, backups"
status: draft
updated: 2026-07-24
---

# Implementation plan — #27 Observability & resilience — Sentry, uptime, backups

## Goal

Ship the MVP non-functional observability items from [pm_ux/plans/11-mvp-scope.md](../pm_ux/plans/11-mvp-scope.md) ("Sentry-style error tracking", "Uptime monitoring + status page", "Backups + point-in-time restore for DB") per the observability section of [pm_ux/plans/13-tech-architecture.md](../pm_ux/plans/13-tech-architecture.md) (Sentry on frontend and backend; Better Stack for uptime + status page; daily Firestore exports to Cloud Storage, restore-tested quarterly).

**Hard constraint for this ticket:** no external credentials are available right now — no Sentry account, no uptime-monitor account, no GCP console access for backup scheduling. The work is therefore split:

- **Part A (implement now, zero secrets):** React error boundaries on all three web surfaces, a pluggable `reportError()` abstraction that is a local-log no-op until `VITE_SENTRY_DSN` exists, global `window.onerror`/`unhandledrejection` capture, codified structured-logging conventions for Cloud Functions (already largely followed — see findings), a backup/PITR helper script wrapping the exact `gcloud` commands, and a runbook covering Sentry/Better Stack/status-page setup and the restore drill.
- **Part B (requires user):** create the Sentry org + DSNs and wire the SDK, create the uptime-monitor account + public status page, enable PITR + the scheduled backup on the billing-enabled GCP project, and execute + record the restore drill.

Part A is designed so Part B is configuration, not code: once DSNs exist, wiring Sentry is one dependency + one file touch per tier.

## Acceptance criteria mapping

| Issue criterion | Part A (now) | Part B (requires user) |
|---|---|---|
| Sentry (or equivalent) on all three frontends + API | Error boundaries on apex/dashboard/admin; `reportError()` abstraction + global handlers; API already emits structured pino errors via `errorHandler` | Sentry account, per-surface DSNs, `@sentry/react` / `@sentry/node` wiring behind env guards |
| Uptime monitoring + public status page | Runbook with exact monitor targets + status-page steps; API `/health` endpoint (already exists) | Better Stack account, monitors, `status.siapp.app` CNAME |
| Firestore backups + PITR verified by restore drill | `scripts/firestore-backup.mjs` command helper + restore-drill runbook | Enable PITR + daily backup schedule on `siapp-prod`; run and record the drill |

## Context — research findings

- **Three web surfaces, one Vite app** ([apps/web/vite.config.ts](../apps/web/vite.config.ts)): `apex.html` / `dashboard.html` / `admin.html`, built per `--mode`, each with its own entry in [apps/web/src/entries/](../apps/web/src/entries/). All three entries are identical minimal bootstraps: `createRoot(...).render(<StrictMode><RouterProvider router={...} /></StrictMode>)` — **no error boundary, no `errorElement`, no global error handlers anywhere** in `apps/web/src` today. An uncaught render error blank-screens the client portal.
- **Bundle isolation (D-036)** is enforced by [scripts/check-bundle-isolation.mjs](../scripts/check-bundle-isolation.mjs): the apex bundle must contain no `src/surfaces/(firm|admin)/` module, and `/p` (portal) and `/t` (collab) must stay separate lazy chunks (see [apps/web/src/routes/apexRouter.tsx](../apps/web/src/routes/apexRouter.tsx)). Any error-reporting module shared across surfaces must therefore live in the neutral zones — `apps/web/src/lib/` and `apps/web/src/components/` (where `LoadingFallback` already lives).
- **Env conventions**: [apps/web/.env](../apps/web/.env) is committed (public client identifiers only), loaded in every mode; `.env.local` (gitignored) overrides locally. Vite also supports mode-specific files (`.env.apex`, `.env.dashboard`, `.env.admin`) — the natural home for per-surface Sentry DSNs later. Config is read via `import.meta.env.VITE_*` in [apps/web/src/lib/firebaseConfig.ts](../apps/web/src/lib/firebaseConfig.ts).
- **backend/functions** (`@siapp/functions`, Functions v2, NodeNext ESM, region `asia-southeast1` via [backend/functions/src/globalOptions.ts](../backend/functions/src/globalOptions.ts), **cannot import `@siapp/shared`**): already uses `import { logger } from 'firebase-functions'` consistently — 30+ call sites all pass structured context objects (`logger.error('onTaskWrite: … failed', { workspaceId, error })`). Structured-logging convention is *de facto* in place; this ticket codifies it and tightens the error-payload shape so **Google Cloud Error Reporting** auto-groups exceptions (it keys off a stack trace in the payload — a free, zero-credential "Sentry-equivalent" for the backend).
- **backend/api** (`@siapp/api`, Express 5): exists as a skeleton — `createApp()` with `helmet`/`cors`/`pino-http` structured JSON logging, a `/health` route ([backend/api/src/routes/health.ts](../backend/api/src/routes/health.ts)) returning `{ status, timestamp, service }`, and a central `errorHandler`. **It is not yet deployed** (no Dockerfile, no Cloud Run service, nothing routes to it in [firebase.json](../firebase.json)). The issue's "API" criterion is satisfiable now only as: structured logs + a Sentry wiring point in `errorHandler` behind `SENTRY_DSN`; the uptime monitor for the API is deferred until it's deployed.
- **firebase.json**: three hosting targets (`apex`, `dashboard`, `admin`) serving `apps/web/dist/<target>`; one functions codebase; full emulator suite (functions on 5001) — structured logs are observable locally via `firebase emulators:start`.
- **Tech-architecture intent** (13-tech-architecture § Observability): Pino → Cloud Logging; Sentry frontend+backend; Better Stack for uptime + status page; backups = daily Firestore exports to Cloud Storage, Coldline after 30 days, restore-tested quarterly. No D-0nn decision covers observability tooling — the tech-arch doc is guidance, not a logged decision, so provider choices below are recommendations, not constraints.
- **Repo conventions**: pnpm + turbo (`pnpm build|lint|typecheck|test` at root; root `test` also runs `node --test scripts/check-bundle-isolation.test.mjs`). "No console.log in committed code." All non-code docs go under `/plans/` per [.github/instructions/plans-folder.instructions.md](../.github/instructions/plans-folder.instructions.md) — the runbook lands there.

## Decisions needed

### D1 — Error-tracking approach

| Option | Notes |
|---|---|
| (a) Sentry SDKs everywhere, now | Blocked: no DSN, no account. Dead code + bundle weight until Part B. |
| (b) GCP Error Reporting only | Free and already ~working for functions (structured `logger.error` with stacks), but has **no frontend story** without extra plumbing, and tech-arch names Sentry. |
| (c) **Pluggable abstraction first** — `reportError()` no-op sink now; GCP Error Reporting covers backend in the interim; Sentry wired in Part B | Ships everything possible today; Part B becomes config. |

**Recommended: (c).** Frontend gets boundaries + a stable `reportError()` call-site contract immediately; backend exceptions already reach Cloud Error Reporting via structured logs; Sentry slots in later without touching call sites.

### D2 — Error-boundary granularity

| Option | Notes |
|---|---|
| (a) One root boundary per surface entry | Catches everything incl. errors outside the router; coarse fallback. |
| (b) Per-route `errorElement` everywhere | Fine-grained but ~15+ route touches; premature. |
| (c) **Root boundary per entry + router-level `errorElement` on each router root and on the `/p` and `/t` lazy trees** | Two cheap layers: router errors get an in-app fallback (and `/p`//`/t` errors never show marketing/firm-flavored UI); the class boundary is the last-resort net. |

**Recommended: (c).** Per-route boundaries can be added later where UX demands it.

### D3 — Add `@sentry/react` dependency now (env-guarded) or defer entirely

| Option | Notes |
|---|---|
| (a) Add dep now, init behind `VITE_SENTRY_DSN` guard | ~30 KB gz in every bundle (incl. the mobile-first client portal) doing nothing; can't be verified end-to-end without a DSN anyway. |
| (b) **Defer the dep; build only the abstraction with a documented dynamic-import wiring point** | Zero dead weight; Part B adds the dep + a ~15-line `initSentry` that registers itself as the `reportError` sink via dynamic `import()` (keeps it out of the critical chunk). |

**Recommended: (b).** The issue's Sentry criterion cannot be *verified* without credentials regardless; carrying an inert SDK buys nothing.

### D4 — Uptime provider (docs only in this ticket)

| Option | Notes |
|---|---|
| (a) **Better Stack** (free tier: 10 monitors, status page) | Named in tech-arch; monitors + status page + alerting in one product; `status.siapp.app` CNAME support. |
| (b) UptimeRobot free | 50 monitors at 5-min interval, public status page; weaker status-page branding/DX. |

**Recommended: (a) Better Stack**, consistent with 13-tech-architecture. Runbook documents both; the choice is reversible since nothing in code depends on it.

### D5 — Backup approach (docs/scripts only in this ticket)

| Option | Notes |
|---|---|
| (a) PITR only (7-day window) | Covers oops-deletes but not project-level disasters; no long-term retention; no export artifact. |
| (b) Scheduled backups only | Daily granularity; loses up-to-the-minute recovery. |
| (c) **Both: enable PITR (7-day) + daily scheduled Firestore backups (`gcloud firestore backups schedules`) with 14-week weekly retention** | Matches tech-arch intent ("daily exports … restore-tested quarterly"); PITR for fine-grained recovery, scheduled backups for retention + restore drills. Native backup schedules are simpler than the legacy export+Cloud Scheduler pipeline and restore directly into a new database. |

**Recommended: (c).** Note: this uses Firestore *native* scheduled backups rather than the literal "exports to Cloud Storage + Coldline" wording in tech-arch — flagging the (benign) deviation; native backups didn't exist when that doc was drafted and are operationally simpler. If BigQuery-loadable exports are later needed, an export job can be added separately.

## Touched surfaces & files

**Surfaces:** all three web surfaces (marketing apex + `/p` portal + `/t` collab; `dashboard.siapp.app`; `admin.siapp.app`) get boundaries; backend functions get a logging helper; API gets a wiring comment only; scripts + runbook. All new frontend modules live in neutral zones (`src/lib/`, `src/components/`) so `scripts/check-bundle-isolation.mjs` stays green (D-036).

Create (Part A):

- `apps/web/src/lib/reportError.ts` (+ `reportError.test.ts`) — the abstraction (see Design 1).
- `apps/web/src/components/AppErrorBoundary.tsx` (+ `.test.tsx`) — class error boundary, last-resort fallback.
- `apps/web/src/components/RouteErrorFallback.tsx` (+ `.test.tsx`) — `useRouteError()`-based fallback for router `errorElement`/`ErrorBoundary` slots.
- `backend/functions/src/lib/errors.ts` (+ `errors.test.ts`) — `errorPayload(unknown)` normalizer for structured logging (see Design 3).
- `scripts/firestore-backup.mjs` (+ `scripts/firestore-backup.test.mjs`) — gcloud command helper, dry-run by default (see Design 4).
- `plans/runbook-observability.md` — Sentry setup, uptime + status page setup, backup/PITR/restore-drill runbook (the Part B instructions live here verbatim).

Modify (Part A):

- `apps/web/src/entries/apex.tsx`, `dashboard.tsx`, `admin.tsx` — wrap `RouterProvider` in `AppErrorBoundary surface="…"`; call `installGlobalErrorHandlers()` once before render.
- `apps/web/src/routes/apexRouter.tsx` (+ existing test) — `errorElement: <RouteErrorFallback />` on the root routes and on the `/p/:token` and `/t/:token` tree roots.
- `apps/web/src/routes/dashboardRouter.tsx`, `adminRouter.tsx` (+ existing tests) — `errorElement` on the root route.
- `apps/web/.env` — commented `# VITE_SENTRY_DSN=` placeholder + one-line explanation (absent ⇒ reporting is a local no-op).
- `backend/functions/src/index.ts` and existing `logger.error` call sites — normalize error context to `{ err: errorPayload(error), …ids }` (mechanical sweep, ~15 sites).
- `backend/api/src/middleware/errorHandler.ts` — comment marking the Sentry wiring point (`process.env.SENTRY_DSN`); no dep, no behavior change (pino already emits structured JSON that Cloud Logging/Error Reporting parse once deployed).
- `package.json` (root) — append `node --test scripts/firestore-backup.test.mjs` to the root `test` script (same pattern as the bundle-isolation test).

Part B (requires user — no repo changes except the ones listed):

- `apps/web/package.json` + `apps/web/src/lib/initSentry.ts` — `@sentry/react` behind the DSN guard.
- `apps/web/.env.apex` / `.env.dashboard` / `.env.admin` — per-surface `VITE_SENTRY_DSN`.
- `backend/api` — `@sentry/node` in `errorHandler` behind `SENTRY_DSN` (when the API is actually deployed).

## Data model changes

**None.** No Firestore collections, fields, or security-rules changes. Multi-tenant isolation is unaffected — one caveat: `reportError()` must never attach document *data* to error context, only ids (workspaceId/projectId/taskId) and never PII (names/phones), so a future Sentry org never receives tenant data. This is enforced by the `IErrorContext` type (ids + strings only) and stated in the module header.

## Design

### 1. `reportError` abstraction (`apps/web/src/lib/reportError.ts`)

```typescript
export interface IErrorContext {
  surface: 'apex' | 'portal' | 'collab' | 'dashboard' | 'admin';
  source: 'error-boundary' | 'route-error' | 'window' | 'unhandledrejection' | 'manual';
  componentStack?: string;
  [key: string]: string | number | boolean | undefined; // ids only — never doc data / PII
}

export type TErrorSink = (error: unknown, context: IErrorContext) => void;

export function reportError(error: unknown, context: IErrorContext): void;
export function registerErrorSink(sink: TErrorSink): void;   // Part B: Sentry registers here
export function installGlobalErrorHandlers(surface: …): void; // window.onerror + unhandledrejection
```

- No sink registered (today's state): `import.meta.env.DEV` → `console.error` with context (dev visibility); prod → swallow after a single `console.error` (an unreported error must never cascade). This is the one deliberate `console.error` — annotated for the no-console rule.
- Sink registered (Part B): forward; sink exceptions are caught and swallowed (reporting must never crash the app).
- `installGlobalErrorHandlers` is idempotent (guards double-registration under StrictMode/HMR) and dedupes the `window.onerror` echo of errors already reported by a boundary.
- Sentry wiring point documented in the header: Part B creates `initSentry.ts` that dynamic-imports `@sentry/react` when `import.meta.env.VITE_SENTRY_DSN` is truthy and calls `registerErrorSink(Sentry.captureException…)`. Call sites never change.

### 2. Boundaries (D2)

- `AppErrorBoundary` — class component (`componentDidCatch` → `reportError(error, { source: 'error-boundary', surface, componentStack })`), takes `surface` prop. Fallback: minimal, self-contained (no router/firebase imports — it must render when everything else is broken), accessible per [.github/instructions/accessibility.instructions.md](../.github/instructions/accessibility.instructions.md): `role="alert"`, heading, plain-language message, a real `<button>` "Reload page" (`location.reload()`). Neutral styling only (it renders on the client portal too — no firm branding).
- `RouteErrorFallback` — function component using `useRouteError()`; distinguishes 404-ish `isRouteErrorResponse` from thrown errors; reports via `reportError({ source: 'route-error' })` in a `useEffect` (report once). Attached as `errorElement` at: apex root `/`, `/p/:token` tree root, `/t/:token` route, dashboard root, admin root. Putting it *on* the lazy tree roots keeps portal/collab error UX inside their own chunk boundary semantics — verify `check-bundle-isolation.mjs` still sees `/p` and `/t` as dynamic entries after the change.

### 3. Functions structured-logging convention (`backend/functions/src/lib/errors.ts`)

Convention (codified in the module header + runbook): every `logger.error`/`logger.warn` takes a static message prefixed `<fnName>:` plus a context object of ids; error values go under an `err` key normalized by `errorPayload(e)` → `{ name, message, stack }` (handles non-`Error` throws). Rationale: Cloud Error Reporting groups on stack traces in structured payloads — today's `{ error }` spreads serialize inconsistently (an `Error` inside a jsonPayload loses its stack unless explicitly extracted), which breaks grouping. This is a mechanical sweep of existing call sites; no logic changes. No `@siapp/shared` import needed (constraint respected — helper is local to functions).

### 4. Backup helper (`scripts/firestore-backup.mjs`)

Node ESM CLI mirroring `check-bundle-isolation.mjs` conventions. Subcommands (all **print** the exact `gcloud` command; `--execute` actually spawns it — safe-by-default since no credentials exist yet):

- `enable-pitr` → `gcloud firestore databases update --database='(default)' --enable-pitr`
- `create-schedule` → `gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14w`
- `list-backups` / `list-schedules`
- `restore --backup=<name> --target-db=<id>` → `gcloud firestore databases restore --source-backup=… --destination-database=…` (restores to a **new** database — the drill never touches `(default)`)

Project id defaults to `siapp-prod` (from `.env` convention), overridable via `--project`. Command-builder functions are exported pure and unit-tested with `node --test`; no gcloud invocation in tests.

### 5. Runbook (`plans/runbook-observability.md`)

Contains the full Part B instructions (summarized in Steps B1–B4 below) plus: monitor target list, escalation notes, the quarterly restore-drill checklist with a results-log table (date, backup used, target db, verified collections, duration, sign-off), and the PII-free error-context policy.

## Implementation steps

### Part A — now, no credentials

1. **`apps/web/src/lib/reportError.ts` + test** — abstraction per Design 1. Verify: unit tests.
2. **`apps/web/src/components/AppErrorBoundary.tsx` + test** — per Design 2. Verify: unit tests (throwing child → fallback + `reportError` called; healthy child renders).
3. **`apps/web/src/components/RouteErrorFallback.tsx` + test** — per Design 2. Verify: unit tests with a `createMemoryRouter` throwing route.
4. **Wire the three entries** (`apex.tsx`, `dashboard.tsx`, `admin.tsx`): `installGlobalErrorHandlers(surface)` + `AppErrorBoundary` around `RouterProvider`. Verify: `pnpm --filter @siapp/web build` and all three dev modes still boot.
5. **Add `errorElement` to routers** (apex root + `/p` + `/t` tree roots; dashboard root; admin root); extend the existing router tests. Verify: router tests + `node scripts/check-bundle-isolation.mjs` after an apex build (lazy trees still dynamic entries; no firm/admin modules in apex graph).
6. **`apps/web/.env`** — commented `VITE_SENTRY_DSN` placeholder + explanation. Verify: builds unchanged.
7. **`backend/functions/src/lib/errors.ts` + test**, then the mechanical `logger.error` sweep in functions. Verify: `pnpm --filter @siapp/functions build lint test`; spot-check structured output in the emulator (see Test plan).
8. **`backend/api/src/middleware/errorHandler.ts`** — Sentry wiring-point comment only. Verify: `pnpm --filter @siapp/api test` (existing supertest suite).
9. **`scripts/firestore-backup.mjs` + test**; root `package.json` test-script hookup. Verify: `node --test scripts/firestore-backup.test.mjs`; `node scripts/firestore-backup.mjs create-schedule` prints (does not run) the command.
10. **`plans/runbook-observability.md`** — per Design 5.

### Part B — REQUIRES USER (step-by-step, also captured in the runbook)

**B1. Sentry (~30 min + one small PR).**
1. Create a Sentry org (developer plan is fine to start) → four projects: `siapp-apex`, `siapp-dashboard`, `siapp-admin`, `siapp-api`; copy each DSN.
2. Add `VITE_SENTRY_DSN=<dsn>` to `apps/web/.env.apex`, `.env.dashboard`, `.env.admin` (DSNs are publishable, safe to commit — same posture as the Firebase web config).
3. Code (small PR): `pnpm --filter @siapp/web add @sentry/react`; create `apps/web/src/lib/initSentry.ts` (dynamic import guarded by `VITE_SENTRY_DSN`, calls `registerErrorSink`); call it from the three entries. Optionally: `@sentry/node` in `backend/api` `errorHandler` behind `SENTRY_DSN` — only worth doing once the API deploys.
4. Verify: temporarily throw in a page, confirm the event in Sentry, remove the throw. Source-map upload (`@sentry/vite-plugin` + auth token in CI) is a follow-up, not required for acceptance.

**B2. Uptime + status page (~30 min, no code).**
1. Create a Better Stack account (free tier).
2. Monitors (HTTP, 3-min interval, alert to founder email/phone): `https://siapp.app/`, `https://dashboard.siapp.app/`, `https://admin.siapp.app/`. Add the API `/health` URL when Cloud Run deploys.
3. Create a status page listing the three monitors; add `status.siapp.app` CNAME per Better Stack's DNS instructions at the DNS host.

**B3. Backups + PITR (~20 min, needs `datastore.owner`/`roles/owner` on `siapp-prod` with billing enabled).**
1. `node scripts/firestore-backup.mjs enable-pitr --execute`
2. `node scripts/firestore-backup.mjs create-schedule --execute`
3. Confirm: `node scripts/firestore-backup.mjs list-schedules --execute`; after 24 h, `list-backups --execute` shows the first backup.

**B4. Restore drill (~45 min, after the first backup exists).**
1. `node scripts/firestore-backup.mjs restore --backup=<latest> --target-db=drill-$(date +%Y%m%d) --execute`
2. Verify per checklist: database reaches `ACTIVE`; spot-check one workspace's `projects`/`tasks`/`clients` docs against production counts.
3. Delete the drill database (`gcloud firestore databases delete` — command in runbook) to stop billing.
4. Record results in the runbook's drill log. Repeat quarterly per tech-arch.

## Test plan

Unit/component (Vitest + RTL, `@siapp/web`):

- `reportError.test.ts`: no sink → dev console path (spy) and no throw; registered sink receives `(error, context)`; throwing sink is swallowed; `installGlobalErrorHandlers` is idempotent and reports `window` `error` + `unhandledrejection` events with correct `source`.
- `AppErrorBoundary.test.tsx`: renders children when healthy; on child throw renders fallback (`role="alert"`, heading, reload button — assert via accessible queries per testing instructions) and calls `reportError` once with `componentStack`.
- `RouteErrorFallback.test.tsx`: `createMemoryRouter` with a throwing loader/component → fallback renders, `reportError` called once with `source: 'route-error'`; `isRouteErrorResponse` (404) renders the not-found variant without reporting noise (or reports — Builder's call, but test whichever is chosen).
- Router tests (existing files): root render still works; a route that throws shows `RouteErrorFallback` instead of a blank screen, for all three routers.

Functions (`@siapp/functions`):

- `errors.test.ts`: `errorPayload` on `Error`, subclass, string throw, and `undefined` → always `{ name, message, stack? }` strings, never throws.
- Emulator verification (manual, documented in runbook): `firebase emulators:start`, trigger any function (e.g. a task write), confirm the emulator log line is single-line JSON containing `severity`, the message, and `err.stack` for the error path.

Scripts (`node --test`):

- `firestore-backup.test.mjs`: command builders produce the exact expected `gcloud` argv per subcommand/flags; default is dry-run (no spawn).

Rules tests: **none** — no data-model or rules changes.

Bundle isolation: apex build then `node scripts/check-bundle-isolation.mjs` — no firm/admin modules pulled in by the new shared components; `/p` and `/t` remain dynamic entries.

## Verification commands

```bash
pnpm install
pnpm turbo run build lint typecheck test
node scripts/check-bundle-isolation.mjs        # after apps/web build (apex dist present)
node --test scripts/firestore-backup.test.mjs
node scripts/firestore-backup.mjs create-schedule   # prints command, must NOT execute
```

## Out of scope

- Actually creating Sentry / Better Stack / GCP resources (Part B, requires user).
- Sentry source-map upload + release tagging (follow-up after B1).
- OpenTelemetry traces/metrics (tech-arch mentions them; separate ticket).
- Deploying `backend/api` to Cloud Run (its observability wiring point is prepared; deployment is its own ticket).
- Firestore→BigQuery export stream (analytics concern, not backup).
- Alerting policies in Cloud Monitoring (Better Stack covers MVP alerting).
- Per-route error boundaries beyond the roots (D2 option b).

## Risks / open questions

1. **The issue's acceptance criteria cannot be fully closed without Part B** — Sentry events, live monitors, and a recorded restore drill all need accounts/credentials. Recommend keeping #27 open with Part A merged and Part B tracked as a checklist on the issue (runbook has the exact steps).
2. **`backend/api` is undeployed** — "error tracking on the API" is prepared (structured pino + wiring point) but unverifiable in production until the Cloud Run service exists. Flagging in case the issue intended functions (which *are* deployed and covered via Error Reporting) rather than the Express API.
3. **Native backup schedules vs tech-arch's "exports to Cloud Storage + Coldline"** (D5) — benign deviation, flagged above; needs a human nod, and 13-tech-architecture should be updated when Part B lands.
4. **PII in error context** — policy is ids-only; there is no automated enforcement beyond the `IErrorContext` type. A lint rule or Sentry server-side scrubbing (Part B) could harden this later.
5. **StrictMode double-invocation** — error boundaries and global handlers must tolerate React 18 StrictMode double-rendering in dev; tests cover idempotency, but watch for duplicate dev-console noise.
6. **Status-page domain** — assumes `status.siapp.app` is acceptable and DNS is accessible to the user; confirm during B2.

## Approved decisions (auto-approved — user unavailable, recommendations taken)

- **D1**: Pluggable `reportError()` abstraction first; Sentry SDK wiring added later behind env guard when DSNs exist.
- **D2**: Root error boundary per surface (apex, dashboard, admin) + `errorElement` on router roots and the `/p`/`/t` lazy trees.
- **D3**: Defer `@sentry/react` dependency entirely for now — document the dynamic-import wiring point; no new dep without DSN to justify it.
- **D4**: Better Stack recommended for uptime + status page (per tech-arch) — documentation only, requires user account.
- **D5**: PITR + native daily Firestore backup schedules via `gcloud` (documented + scripted); noted as benign deviation from tech-arch's "exports to GCS Coldline" wording.

Part B (Sentry account/DSNs, Better Stack account, GCP backup schedule execution + restore drill) is user-action-gated: issue #27 stays open after Part A merges, with the "Requires user" section as the checklist.

## Decision revision — D3 overridden by user

After Part A landed uncommitted, env-guarded Sentry wiring was added directly in the working tree (user action): `@sentry/vite-plugin` + source-map upload in `apps/web/vite.config.ts` gated on `SENTRY_AUTH_TOKEN`, and the CI build step passes that token only on main-branch builds. Taking this as an override of D3's "defer the dependency": the matching runtime wiring now ships too — `@sentry/react` (dynamic-imported), `apps/web/src/lib/initSentry.ts` (no-op unless a production build has `VITE_SENTRY_DSN`), called from all three entries. Without a DSN and token everything remains a no-op, so Part A's zero-credential posture is preserved; Part B shrinks to "create the Sentry project, set VITE_SENTRY_DSN + SENTRY_AUTH_TOKEN".
