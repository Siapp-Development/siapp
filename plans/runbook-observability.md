---
title: "Runbook — Observability & resilience (#27)"
status: active
updated: 2026-07-24
---

# Runbook — Observability & resilience (#27)

Operational companion to [impl-27-observability.md](impl-27-observability.md). Part A (shipped, no credentials) is summarized first; every **Part B** section below requires user accounts/credentials and is the open checklist on issue #27.

## What is already in place (Part A)

- **Frontend error capture** — all three surfaces (apex incl. `/p` portal + `/t` collab, dashboard, admin) have:
  - a root `AppErrorBoundary` around each entry's `RouterProvider` (accessible fallback, `role="alert"`, reload button);
  - `RouteErrorFallback` as `errorElement` on each router root **and** on the `/p`/`/t` lazy tree roots (external users never see a blank screen or firm-flavored UI);
  - `installGlobalErrorHandlers()` capturing `window.onerror` + `unhandledrejection`;
  - a pluggable `reportError()` sink in `apps/web/src/lib/reportError.ts` — currently a guarded console fallback; Sentry registers here in Part B without touching call sites.
- **Backend error grouping (zero credential)** — Cloud Functions log errors as structured JSON with `err: { name, message, stack }` (`backend/functions/src/lib/errors.ts`). Google Cloud **Error Reporting** groups on the stack in the payload, giving a free Sentry-equivalent for deployed functions today.
- **API** — `backend/api` emits structured pino JSON via `errorHandler`; the Sentry wiring point is marked in `backend/api/src/middleware/errorHandler.ts`. Not deployed yet; uptime/Sentry for the API waits for its Cloud Run ticket.
- **Backup tooling** — `scripts/firestore-backup.mjs` prints (or with `--execute`, runs) the exact `gcloud` commands for PITR, the daily backup schedule, and restore drills.

### Logging convention (functions — keep following this)

- Static message prefixed `<fnName>:` — e.g. `onTaskWrite: notification enqueue failed`.
- Context object of **ids only** (workspaceId/projectId/taskId…), never document data or PII.
- Caught errors go under `err: errorPayload(error)` — never spread a raw `Error`.
- Emulator check: `firebase emulators:start`, trigger a function (e.g. write a task), confirm the log line is single-line JSON with `severity` and `err.stack` on error paths.

### PII-free error-context policy (all tiers)

Error context may contain **ids and enum-ish strings only** — workspaceId, projectId, taskId, surface, source. Never: client/collaborator names, phone numbers, document data, message bodies. This keeps tenant data out of any future Sentry org. Enforced by convention + the `IErrorContext` type; re-check at code review.

---

## Part B1 — Sentry (REQUIRES USER, ~30 min + one small PR)

1. Create a Sentry org (developer plan is fine) → four projects: `siapp-apex`, `siapp-dashboard`, `siapp-admin`, `siapp-api`. Copy each DSN.
2. Add `VITE_SENTRY_DSN=<dsn>` to `apps/web/.env.apex`, `.env.dashboard`, `.env.admin` (DSNs are publishable — same commit posture as the Firebase web config).
3. Small PR:
   - `pnpm --filter @siapp/web add @sentry/react`
   - Create `apps/web/src/lib/initSentry.ts`: when `import.meta.env.VITE_SENTRY_DSN` is truthy, dynamic-`import('@sentry/react')` (keeps the SDK out of the critical chunk), `Sentry.init({ dsn })`, then `registerErrorSink((error, context) => Sentry.captureException(error, { extra: context }))`.
   - Call `void initSentry()` from the three entries in `apps/web/src/entries/`.
   - Optional (once the API deploys): `@sentry/node` in `backend/api`'s `errorHandler` behind `SENTRY_DSN` — the wiring point is commented in the file.
4. Verify: temporarily throw inside a page, confirm the event in Sentry (with surface/source tags), remove the throw. Source-map upload (`@sentry/vite-plugin` + CI auth token) is a follow-up, not required for acceptance.

## Part B2 — Uptime + status page (REQUIRES USER, ~30 min, no code)

Provider: **Better Stack** (per tech-architecture; UptimeRobot free is the fallback — nothing in code depends on the choice).

1. Create a Better Stack account (free tier: 10 monitors + status page).
2. Create HTTP monitors, 3-minute interval, alerts to founder email/phone:

   | Monitor | URL | Notes |
   |---|---|---|
   | Apex / marketing + portal | `https://siapp.app/` | Serves `/p` + `/t` too |
   | Firm dashboard | `https://dashboard.siapp.app/` | |
   | Admin panel | `https://admin.siapp.app/` | |
   | API health | `https://<cloud-run-url>/health` | Add when the API deploys |

3. Create a status page listing the three web monitors; add the `status.siapp.app` CNAME at the DNS host per Better Stack's instructions.
4. Escalation: alerts go to the founder (sole operator at MVP). When on-call rotation exists, revisit.

## Part B3 — Backups + PITR (REQUIRES USER, ~20 min)

Needs `roles/owner` or `roles/datastore.owner` on `siapp-prod` with billing enabled. Decision D5: **both** PITR (7-day window, fine-grained recovery) and daily native backups (14-week retention, restore artifacts). This deviates benignly from tech-architecture's "exports to GCS Coldline" wording — native scheduled backups didn't exist when that doc was drafted; update 13-tech-architecture when this lands.

```bash
node scripts/firestore-backup.mjs enable-pitr --execute
node scripts/firestore-backup.mjs create-schedule --execute     # daily, 14w retention
node scripts/firestore-backup.mjs list-schedules --execute      # confirm
# after 24h:
node scripts/firestore-backup.mjs list-backups --execute        # first backup exists
```

## Part B4 — Quarterly restore drill (REQUIRES USER, ~45 min)

Run after the first backup exists, then **quarterly** (tech-architecture requirement).

1. Restore into a NEW database (never `(default)`):

   ```bash
   node scripts/firestore-backup.mjs list-backups --execute
   node scripts/firestore-backup.mjs restore \
     --backup=projects/siapp-prod/locations/<loc>/backups/<id> \
     --target-db=drill-$(date +%Y%m%d) --execute
   ```

2. Verify (checklist):
   - [ ] Restored database reaches state `ACTIVE` (`gcloud firestore databases describe --database=drill-…`).
   - [ ] Spot-check one workspace: `projects`, `tasks`, `clients` doc counts match production expectations.
   - [ ] Note restore duration.
3. Delete the drill database to stop billing:

   ```bash
   gcloud firestore databases delete --database=drill-<YYYYMMDD> --project=siapp-prod
   ```

4. Record the result below.

### Restore-drill log

| Date | Backup used | Target db | Verified collections | Duration | Sign-off |
|---|---|---|---|---|---|
| _(none yet)_ | | | | | |
