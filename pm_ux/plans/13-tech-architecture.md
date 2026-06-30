---
title: "Tech Architecture Decisions"
status: living
updated: 2026-06-27
---

# Tech Architecture Decisions

Stack baseline closed on 2026-06-17. See [decisions-log.md](./decisions-log.md) D-001 through D-007 for the binding decisions. This doc captures the *current* picture; treat it as living, not historical.

## North-star principles

1. **Boring tech where it doesn't matter; sharp tech where it does.** The wedge is product + messaging, not infra.
2. **Optimize for change at the wedge, accept lock-in at the foundation.** We picked Firebase/GCP for speed — that's a real bet, not a default.
3. **Multi-tenant from day 1.** Hard to retrofit later.
4. **Observability before scale.** Logs, traces, audit trail are P0 features, not nice-to-have.
5. **Security & PDPA are default-on**, not future workstreams.

## Stack overview

```
            ┌──────────────────────────────────────────────┐
 Browser →  │  React + TS PWA (single repo, monorepo)      │
            │   ├── Firm routes (dense, table-heavy)       │
            │   └── Client portal routes (light, mobile)   │
            └──────────────────────────────────────────────┘
                       │ Firebase ID tokens (bearer)
                       ▼
            ┌──────────────────────────────────────────────┐
            │  Cloud Run / Cloud Functions (Node + TS)     │
            │   ├── HTTP API                               │
            │   ├── Webhooks (Twilio)                       │
            │   └── Task handlers (invoked by Cloud Tasks) │
            └──────────────────────────────────────────────┘
              │           │              │             │
              ▼           ▼              ▼             ▼
        Firestore    Firebase Auth   Cloud Storage  Cloud Tasks
        (data)       (identity)      (files)        (queue)
                                                       │
                                       ┌───────────────┼─────────────┐
                                       ▼               ▼             ▼
                                   Twilio (WA+SMS)   Pub/Sub
                                                                    (fan-out)
```

Region: **`asia-southeast1` (Singapore)** for every GCP service we provision (D-004).

## Decisions

### Frontend stack

- **Decision:** React + TypeScript + Vite. Single app, single repo (D-005).
- **Routing:** Two route trees — `/app/*` (firm) and `/p/*` (client portal). Each is its own lazy-loaded bundle; the client portal must not pull in firm-side components.
- **Why:** Hiring pool, ecosystem maturity, alignment with `.github/copilot-instructions.md`.
- **PWA:** installable, web push where supported. No native apps in v1.

### Auth

- **Decision:** **Firebase Auth** (D-002).
- **Firm users:** email + password with optional Google sign-in; TOTP MFA for owner/admin roles at Business+.
- **Client portal:** **magic link** (Firebase Auth email link sign-in). One-tap from a WhatsApp link → short-TTL session → revisit re-sends.
- **Authorization (roles):** stored in **custom claims** (small) + a `members/{userId}` doc per workspace (rich).
- **Bearer tokens (D-007):** Firebase ID tokens, ~1h TTL, refreshed by the Firebase Web SDK. Held in memory; refresh token managed by the SDK. Strict CSP; no third-party scripts on `/p/*`.

### Backend stack

- **Decision:** Node.js + TypeScript on **Cloud Run** for the HTTP API and webhook handlers; **Cloud Functions (2nd gen)** for Firestore triggers (`onWrite` for pre-aggregation, audit log capture).
- **Framework: Express 5** (D-022). Industry standard, broadest hiring pool, deepest LLM/SO coverage. Express 5 supports native async error propagation and built-in body parsing, eliminating the historical Express 4 papercuts.
- **One service at v1.** Split only when a domain proves a different scaling profile (likely: outbound messaging worker first).
- **Cold-start mitigation:** set `min-instances=1` on the API Cloud Run service once paying customers exist (~USD $5/mo) to keep p95 webhook latency predictable.

#### Standard library layer (`apps/api/src/lib/`)

Built once, used by every route. Documented in [decisions-log D-022](./decisions-log.md):

| Helper | Purpose |
|---|---|
| `asyncHandler` | Wraps async route handlers — single error middleware catches everything |
| `validate({ body, params, query })` | Zod-backed request validation; rejects with `ValidationError` |
| `requireFirebaseAuth()` | Verifies Firebase ID token; attaches `req.auth = { kind: 'firm', uid, workspaceId, role }` |
| `requireMagicLinkJWT()` | Verifies magic-link JWT via `jose`; attaches `req.auth = { kind: 'collaborator' \| 'client', subjectId, taskId \| projectId, workspaceId }` |
| `requireTwilioSignature()` | Validates `X-Twilio-Signature` header before any business logic |
| `AppError` hierarchy | `ValidationError`, `NotFoundError`, `ForbiddenError`, `QuotaExceededError` — mapped to status codes + structured Pino logs by a single error middleware |

#### Package set (locked)

**Runtime:** `express@^5`, `zod`, `helmet`, `cors`, `pino`, `pino-http`, `firebase-admin`, `twilio`, `jose`.

**Dev:** `@types/express@^5`, `@types/cors`, `tsx`, `typescript`, `vitest`, `supertest`, `@types/supertest`.

**Not used (and why):** `body-parser` (built into Express 5), `morgan` (replaced by `pino-http` — Cloud Logging parses JSON natively), `jsonwebtoken` (replaced by `jose` — modern, typed), `winston` (replaced by `pino` — structured by default), `express-async-errors` (Express 5 handles async natively).

### Database

- **Decision:** **Firestore (Native mode)** as primary store (D-003).
- **Multi-tenancy:** every business document carries `workspaceId`. Access enforced two ways:
  1. **Firestore Security Rules** at the wire (defense in depth) — every read/write checks `request.auth.token.workspaceId == resource.data.workspaceId` or membership lookup.
  2. **Backend code path** (Cloud Run handlers) always filters by `workspaceId` derived from the auth context; no client trust.
- **Honest tradeoffs (and what we do about them):**
  | Tradeoff | Mitigation |
  |---|---|
  | No joins | Denormalize on write; pre-shape documents for read paths |
  | Expensive aggregations | Pre-aggregate via `onWrite` Cloud Functions; never compute counts in a query |
  | Limited query expressiveness | Composite-index discipline; reject features that need ad-hoc filters |
  | Weak full-text search | Add Algolia or Typesense if a search UX demands it (Q50) |
  | Reporting / BI difficulty | Stream to BigQuery via the Firestore→BigQuery extension from Day 1 |
  | Vendor lock-in | Accepted. Documented in [decisions-log](./decisions-log.md) D-003 |
- **Backups:** scheduled Firestore exports to Cloud Storage daily; lifecycle to Coldline after 30 days; restore-tested quarterly.

### Data modeling principles for Firestore

- **Collections vs subcollections:**
  - Top-level: `workspaces`, `users`.
  - Workspace-scoped subcollections: `workspaces/{wsId}/projects`, `workspaces/{wsId}/clients`, `workspaces/{wsId}/members`.
  - Project-scoped subcollections: `workspaces/{wsId}/projects/{projId}/tasks`, `.../documents`, `.../notes`, `.../activity`.
  - **Why:** subcollections enforce the security boundary lexically; rules are simpler.
- **Audit log:** dedicated `workspaces/{wsId}/audit` subcollection, append-only via security rules + Cloud Function trigger.
- **Pre-aggregation pattern:** `workspaces/{wsId}/projects/{projId}/_metrics` doc updated by `onWrite` triggers on tasks (e.g. `tasksTotal`, `tasksOverdue`, `percentComplete`). Dashboards read the metrics doc, not the task collection.
- **Composite indexes:** declared in `firestore.indexes.json` in the repo, deployed via CI. No unindexed `where` chains in production code.
- **Cost discipline:** every new screen has a "reads/writes per render" budget reviewed before merge.

> **Action: Q44** — review and freeze the v1 data model before sprint 1. Get a second pair of eyes.

### File storage

- **Decision:** **Cloud Storage** in the same region.
- **Access:** signed URLs only (short TTL). Buckets are private. Path scheme: `gs://{bucket}/workspaces/{wsId}/projects/{projId}/{uuid}-{filename}`.
- **Limits:** per-tier upload caps enforced in the backend before signing.

### Messaging (the differentiator)

- **Decision:** **Twilio** for both **WhatsApp Business API** and **SMS fallback** (D-001).
- **No client email** in Phase 1 (D-013). See Q49 for firm-side transactional email choice.
- **Abstraction:** thin `MessageProvider` interface in our backend with a `TwilioProvider` impl. Never call the Twilio SDK from business logic.
- **Templates:** WhatsApp templates managed centrally per language (EN, BM), approved by Meta via Twilio Content Templates API; localized.
- **Outbound pipeline:**
  1. Business event (e.g. task status → done) → check `project.lifecycle` (D-027). If `!= 'published'`, write to `outbox` with `suppressed: true, suppressedReason: 'lifecycle:<state>'` and **stop**. No Twilio call. If `== 'published'`, write a live `outbox` entry.
  2. `onWrite` Cloud Function on live entries enqueues a **Cloud Tasks** task. Re-checks lifecycle at enqueue time (race-safety) and respects workspace quiet hours by setting `scheduleTime` accordingly.
  3. Cloud Run handler sends via Twilio with idempotency key.
  4. Twilio status callback → webhook → updates the message doc with delivery + read state.
- **Lifecycle transitions trigger one-time messages:** `draft → published` fires a welcome WA to the client + first-assignment WA to pre-assigned collaborators; `published → completed` fires a handover WA. Idempotent on `project.publishedAt` / `project.completedAt` so re-runs are safe.
- **Inbound:** Twilio webhook → match to workspace via sender number → append to the task's note thread → realtime push to firm UI via Firestore listener.
- **Quality monitoring:** per-workspace sender quality metric stored daily from Twilio's reporting; auto-throttle on downgrade signal.

### Background jobs

- **Decision:** **Cloud Tasks** for one-off / retried work; **Pub/Sub** for fan-out (audit, analytics, pre-aggregation); **Cloud Scheduler** for cron (D-006).
- All handlers are Cloud Run services with idempotency.

### Realtime

- **Decision:** **Firestore realtime listeners** on the firm app (e.g. project board updates) and on the client portal (e.g. milestone status). No separate WebSocket/SSE layer.
- **Discipline:** listeners are scoped (single project or single doc) — never workspace-wide. Listener cost is part of the read budget.

### Billing & payments

- **Decision (MVP — D-019):** **Manual billing.** Customers pay founder directly via FPX bank transfer or invoice link. Founder upgrades workspace through the admin panel (`/admin/workspaces/:id`). No Stripe integration at MVP.
- **Subscription model:** per-seat (D-009). Plan, seat count, expiry date, and overage allowance stored on the `workspace` document.
- **Overage tracking:** WhatsApp conversation count incremented on each Twilio webhook delivery; reset monthly via scheduled Cloud Function. Surfaced in admin panel; manual overage invoices for now.
- **Admin panel requirements:**
  - Workspace list with plan, seats, MRR, expiry date
  - One-click plan change (Trial → Standard → Business)
  - One-click seat count + renewal date adjustment
  - Audit log of all admin actions
- **Migration to Stripe:** triggered at ≥ 20 paying customers, OR billing > 4 hrs/week, OR first auto-renewal request. Future architecture: Stripe + FPX gateway (Curlec / iPay88), webhook handlers on Cloud Run, idempotent invoice events back-write to Firestore.

### Search

- **Decision (v1):** Firestore equality + range queries with composite indexes for known UX.
- **Defer (Q50):** Algolia or Typesense if a free-text search UX is required across projects/tasks.

### Caching

- **Decision:** none at v1 beyond browser/HTTP caching and Firestore's own client cache.

### Observability

- **Logs:** structured JSON via Pino → Cloud Logging.
- **Errors:** Sentry on frontend and backend.
- **Metrics & traces:** OpenTelemetry → Cloud Trace / Cloud Monitoring.
- **Uptime + status page:** Better Stack (vendor-agnostic; better DX than GCP's offering at small scale).
- **Audit log:** Firestore `audit` subcollection per workspace, append-only via security rules and Cloud Function fan-out.

### Security baseline (v1)

- TLS everywhere; HSTS on.
- Secrets in **Google Secret Manager**, accessed via Cloud Run service identities. Never in `.env` committed.
- Dependency scanning: Dependabot, `npm audit` in CI.
- SAST: GitHub CodeQL.
- Rate limiting on auth + write endpoints (Cloud Armor or app-layer).
- CSP + standard security headers via `helmet`.
- Periodic external pen test before Scale tier launch.
- **Firestore Security Rules** treated like code: peer-reviewed, unit-tested with the emulator, deployed via CI.

### Multi-tenancy & data isolation rules

- Every business document carries `workspaceId NOT NULL` (enforced in code + tests).
- Security rules enforce: `request.auth != null && request.auth.token.workspaceId == resource.data.workspaceId`. For documents under `workspaces/{wsId}/...`, the lexical scope handles isolation.
- Cloud Run handlers always derive `workspaceId` from the verified ID token (custom claim) — never from a request body parameter.
- Client portal sessions are scoped to a single `projectId` + `workspaceId` via a short-lived custom token; cannot enumerate other projects.
- Security-rule test suite runs in CI against the Firestore emulator on every PR.

### Internationalization (i18n)

- **Launch scope (D-026):** v1 ships **English only**. BM UI is deferred to v1.5. The i18n library and scaffolding still land in v1 so v1.5 is a content add, not a refactor.
- **Library:** **i18next** (D-023), used via `react-i18next` in the React app and the same `i18next` core in the backend for outbound message rendering. Translation files are JSON, namespaced per feature (`common`, `tasks`, `messages`, `portal`, `collaborator`). Locale stored per user + per workspace default; `en` is the only accepted value at v1 (`ms` rejected by validator until v1.5).
- **Plugins used:**
  - `react-i18next` — React bindings. Every UI string passes through `t()` from day one.
  - `i18next-browser-languagedetector` — installed but pinned to `en` at v1; full URL/cookie/`navigator.language` order activates at v1.5.
  - `i18next-http-backend` — lazy-loads namespace JSON. `ms` namespace files exist as empty placeholders at v1 so the loader contract doesn't change for v1.5.
- **ICU MessageFormat:** enabled via `i18next-icu` at v1 (cheap, removes a v1.5 migration). Matters for BM noun forms once strings land.
- **WhatsApp templates** are managed in Twilio Content Templates per locale (not in i18next JSON) — Meta requires pre-approved templates. EN templates submitted for v1; BM templates submitted alongside the v1.5 UI release. i18next handles only in-app strings and dynamic message body composition for non-template messages (e.g. session reply bodies).
- WhatsApp templates duplicated per locale once BM ships; messages routed by the recipient's preferred language.

### Accessibility

- WCAG 2.1 AA target on both firm app and client portal — see `.github/instructions/accessibility.instructions.md`.
- `axe` checks in component test suite.

### Testing strategy

- Unit + component (Vitest + RTL).
- **Firestore rules tests** via `@firebase/rules-unit-testing` against the emulator — every PR.
- Integration tests against the Firebase emulator suite (Firestore + Auth + Functions).
- E2E: Playwright on critical paths (signup → create project → send WhatsApp → client opens portal).
- Contract tests for the `MessageProvider` (recorded Twilio fixtures).

### CI/CD

- **GitHub Actions.**
- PR preview deploys to per-PR Firebase Hosting + Cloud Run preview revisions.
- Firestore rules + indexes deployed from CI, not manually.
- Database migrations: Firestore is schemaless, but **data migrations** (e.g. backfilling a new field) ship as a Cloud Function invoked once per workspace with idempotency.

### Documentation

- ADRs go in `/plans/rfcs/` (per the plans-folder rule).
- API & contributor docs in `/docs/` (when we have any).

## Build vs. buy quick log

| Capability | Decision | Why |
|---|---|---|
| Auth | Buy (Firebase Auth) | D-002 |
| WhatsApp + SMS delivery | Buy (Twilio) | D-001; not our moat |
| Payments | Defer (manual at MVP, Stripe + FPX gateway later) | Save build time; founder handles directly until volume justifies |
| Email transactional (firm-side) | Buy — provider TBD (Q49) | Deliverability is hard |
| Search | Built-in Firestore queries v1; Algolia/Typesense later if needed (Q50) | YAGNI until proven |
| Notification rules engine | **Build** | Part of the wedge |
| Project template engine (customer-facing) | **Defer** (D-031) | MVP uses Siapp-Admin-seeded starter project + firm Duplicate; build a real template engine only after firms ask for one |
| Client portal UI | **Build** | Brand-critical surface |
| Mobile apps | Defer (PWA) | Premature |

## Open decisions

| Decision | Owner | Due | Tracked in |
|---|---|---|---|
| Firestore data model v1 freeze | Founder + first engineer | Pre-sprint 1 | Q44 |
| Transactional email provider (firm-side) | Founder | Pre-sprint 1 | Q49 |
| Search infra at v1 | First engineer | Month 3 | Q50 |
| BSP secondary (dual-route) | Founder | Phase 2 | post-D-001 |
| Logging vendor (sticking with Cloud Logging or paid layer) | Founder | Month 2 | — |

## ADR template (for future decisions)

```markdown
---
adr: 0001
title: "Choose Twilio Content Template structure for utility vs marketing"
status: proposed   # proposed | accepted | superseded
date: 2026-07-01
deciders: [founder]
---

## Context
…what problem and constraints…

## Options considered
- A: …
- B: …
- C: …

## Decision
We choose **B** because …

## Consequences
- + …
- − …
- Reversal cost: …
```
