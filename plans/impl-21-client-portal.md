# impl-21 — Client portal (/p): magic link, project page, timespan bar, client upload

> GitHub issue #21. "The wedge. Do not cut." — [11-mvp-scope.md](../pm_ux/plans/11-mvp-scope.md) §Client portal.
> Binding decisions: **D-034** (start date + timespan bar + shared docs + client upload), **D-027** (lifecycle is the single external-access gate), **D-035** (portal is the response surface; no inbound WA), **D-036** (portal lives at `siapp.app/p/{token}/*` on the apex bundle), **D-038/D-039** (tokens/themes from `@siapp/ui`, `portal` theme).

## Goal

Ship the client portal: a client opens a project-scoped magic link (`siapp.app/p/{token}`), lands on a mobile-first branded project page (firm branding, start/target dates, timespan bar with today marker, current phase, % complete, next milestone, updates feed, shared documents), and can upload PDF/image/DOCX files ≤ 10 MB that become visible to the firm and produce `client_document_uploaded` activity events. Expired/invalid links show B1x; fresh projects show B2x/B4x zero/empty states; the footer is tier-dependent ("Powered by Siapp" vs firm-branded). The portal chunk imports nothing from the firm/admin trees (D-036, enforced by `scripts/check-bundle-isolation.mjs`).

## ⚠ Flagged doc conflicts (must be acknowledged before build)

The product docs disagree on the portal access mechanism:

1. [firestore-data-model.md](../pm_ux/plans/firestore-data-model.md) design principle 4: *"Magic-link access is server-mediated. Collaborators and clients never touch Firestore from the client. A Cloud Run endpoint validates the JWT."*
2. [13-tech-architecture.md](../pm_ux/plans/13-tech-architecture.md) L215: *"Client portal sessions are scoped to a single `projectId` + `workspaceId` via a **short-lived custom token**"* and L167: *"Firestore realtime listeners … on the client portal (e.g. milestone status)"* — both imply Firebase Auth custom-token sign-in with direct, rules-gated Firestore reads.
3. [13-tech-architecture.md](../pm_ux/plans/13-tech-architecture.md) L72: *"magic link (Firebase Auth **email link** sign-in)"* — stale; clients receive links via WhatsApp, not email.

This plan follows (2) — see Decision 1. If approved, principle 4 and L72 should be annotated as superseded for the **client** portal (collaborator page #22 can decide independently).

A second, smaller conflict: the comment in [storage.rules](../storage.rules) (from #14) says client uploads *"are written server-side"*. That was an anticipation, not a logged D-0nn decision; Decision 7 proposes direct rules-gated uploads instead.

## Architecture summary (per recommendations below)

```
Firm PM (dashboard)                                    Client (WhatsApp link)
  │ issuePortalLink callable                              │ opens siapp.app/p/{token}
  ▼                                                       ▼
workspaces/{wid}/magicLinks/{linkId}              redeemPortalLink callable (unauthenticated)
  { audience:'client', scopeType:'project',         - collectionGroup lookup by shortCode
    shortCode, secretHash, expiresAt, revoked }     - sha256(secret) constant-time compare
                                                    - lifecycle ∈ {published, completed} gate
                                                    - mints Firebase custom token, uid
                                                      `portal_{wid}_{pid}_{cid}`, claims
                                                      { portal: { wid, pid, cid, linkId } }
                                                    - returns { customToken, firm branding,
                                                      tier, wid, pid }
                                                          │ signInWithCustomToken
                                                          ▼
                                        Direct Firestore listeners + Storage upload,
                                        gated by new `portal` rules (lifecycle re-checked
                                        in rules on every read — D-027 defense in depth)
```

- URL token format: `{shortCode}_{secret}` — `shortCode` 12-char random doc-lookup key (stored plaintext, indexed), `secret` 128-bit base64url (only its SHA-256 stored). No enumeration: one uniform `invalid_or_expired` error; constant-time hash compare; no distinction between "no such code" and "bad secret".
- Firm branding never requires a portal read grant on the workspace doc: the redeem response snapshots `{ firmName, logoUrl, primaryColor, tier }`.
- Updates feed = existing `activity/{aid}` subcollection with a new denormalized `visibleToClient: boolean`, so portal list queries are rules-provable without `get()`s.

## Touched surfaces & files

**Surface:** apex (`siapp.app/p/*` — portal lazy chunk) + firm (`dashboard.siapp.app` — link-issuance affordance only). Admin/marketing untouched. Bundle isolation: all new portal UI lives under `apps/web/src/surfaces/portal/`; nothing there may import from `surfaces/firm|admin` (ESLint zone + CI check).

### Create
| File | Purpose |
|---|---|
| `packages/shared/src/` (extend `constants.ts`, `enums.ts`, `firestoreTypes.ts`, `callableTypes` if separate) | `MAX_CLIENT_DOCUMENT_SIZE_BYTES`, `CLIENT_ALLOWED_DOCUMENT_MIME_TYPES`, `PORTAL_LINK_TTL_DAYS`; `client_document_uploaded` in `TProjectActivityAction`; `IMagicLinkDoc`, `IIssuePortalLinkRequest/Response`, `IRedeemPortalLinkRequest/Response`; `visibleToClient?: boolean` on the activity doc type |
| `backend/functions/src/lib/portalTokens.ts` (+ `.test.ts`) | token generation (shortCode + secret), sha256 hashing, constant-time compare, deterministic portal uid |
| `backend/functions/src/callables/issuePortalLink.ts` (+ `.test.ts`) | firm-authenticated; role + lifecycle gate; one active link per (pid, cid); returns full URL |
| `backend/functions/src/callables/redeemPortalLink.ts` (+ `.test.ts`) | unauthenticated; lookup/verify/gate; mints custom token; returns branding snapshot |
| `apps/web/src/surfaces/portal/usePortalSession.ts` (+ test) | redeem → `signInWithCustomToken` → session state (`loading / ready / expired / not_started / error`); skips redeem if already signed in with matching `portal.pid` claim |
| `apps/web/src/surfaces/portal/PortalProjectPage.tsx` (+ test) | B2: branding header, dates row, timespan bar, current phase, % complete, next milestone, recent updates, documents summary; B2x zero state |
| `apps/web/src/surfaces/portal/TimespanBar.tsx` (+ test) | D-034 bar: start → target, today marker, phase markers, clamped % elapsed; `role="img"` + descriptive `aria-label` |
| `apps/web/src/surfaces/portal/usePortalProject.ts` (+ test) | `onSnapshot` on project doc + phases + milestones (plain-hook convention, mirrors `useDocuments.ts`) |
| `apps/web/src/surfaces/portal/updates/PortalUpdatesPage.tsx` + `usePortalUpdates.ts` (+ tests) | B4 feed (`activity` where `visibleToClient == true` orderBy `at` desc, paged) + B4x empty state |
| `apps/web/src/surfaces/portal/milestones/PortalMilestonesPage.tsx` (+ test) | B3 milestones list |
| `apps/web/src/surfaces/portal/documents/PortalDocumentsSection.tsx` + `usePortalDocuments.ts` (+ tests) | visible-docs list, client upload (10 MB / mime pre-validation, progress, B2y failure states incl. quarantine rendering) |
| `apps/web/src/surfaces/portal/PortalFooter.tsx` (+ test) | tier-based footer per [11-mvp-scope.md](../pm_ux/plans/11-mvp-scope.md) L53 |
| `apps/web/src/surfaces/portal/PortalErrorStates.tsx` (+ test) | B1x expired/invalid, "not started yet" (draft, D-027), generic failure |
| `apps/web/src/surfaces/firm/projects/PortalLinkCard.tsx` (+ test) | firm affordance on ProjectDetailPage Details tab: copy link / reset link / expiry display; disabled with hint when draft or no client linked |
| `backend/rules-tests/src/portal.test.ts` | Firestore portal-claims matrix |
| `backend/rules-tests/src/portalStorage.test.ts` | Storage portal-claims matrix |

### Modify
| File | Change |
|---|---|
| `backend/functions/src/lib/activityDiff.ts` (+ its local mirrored enums) | emit `client_document_uploaded` when `uploaderType == 'client'`; derive `visibleToClient` per event (client-safe action set) |
| `backend/functions/src/lib/activityLog.ts` | persist `visibleToClient` field |
| `backend/functions/src/index.ts` | export the two callables; header comment |
| `firestore.rules` | portal helpers (`isPortalClient(wid,pid)`, lifecycle re-check) + grants: project `get`, phases/milestones `read`, documents `get/list/create` (client-upload validator), activity `get/list` on `visibleToClient == true`; `magicLinks` stays fully server-only |
| `storage.rules` | `client-uploads/{fileName}` create for portal claims (≤ 10 MB, client mime allowlist); portal `read` on the project prefix (uuid-path tradeoff, same as #14's department-gating precedent) |
| `firestore.indexes.json` | collection-group field override on `magicLinks.shortCode`; composite on `activity (visibleToClient ASC, at DESC)` |
| `apps/web/src/surfaces/portal/PortalShell.tsx` | rewrite stub: session bootstrap, branded header, sub-route outlet, footer, skip link retained |
| `apps/web/src/routes/apexRouter.tsx` | nested portal routes: `/p/:token` (overview), `/p/:token/updates`, `/p/:token/milestones` — all inside the existing lazy portal chunk |
| `apps/web/src/lib/callables.ts` | `issuePortalLink` typed wrapper (firm side). `redeemPortalLink` is called from `usePortalSession.ts` to keep the shared lib free of portal-only code |
| `apps/web/src/surfaces/firm/projects/ProjectDetailPage.tsx` | mount `PortalLinkCard` in the Details tab |

## Data model changes (Firestore + Storage + claims)

1. **`workspaces/{wid}/magicLinks/{linkId}`** — first real use of the collection (rules already deny all client access; keep that). Shape per data model, with two deviations flagged in Decision 2: doc id is a random `linkId` (not the shortCode), and a `secretHash` field is added — **raw secrets are never at rest**. Fields: `audience: 'client'`, `scopeType: 'project'`, `scopeId: pid`, `subjectId: cid`, `shortCode`, `secretHash`, `issuedAt`, `expiresAt`, `lastUsedAt`, `useCount`, `revoked`, `revokedAt`, `revokedBy`, `createdBy`. Written exclusively by the Admin SDK.
2. **`activity/{aid}`** gains `visibleToClient: boolean` (denormalized at write time by `activityLog.ts`). Client-safe set: `task_status_changed`/`task_created`/`task_due_date_changed` **only when** the source task's `visibleToClient == true` and `restrictedToDepartments == []`; `doc_added` only when the doc's `visibleToClient == true`; `project_published`, `project_completed`, `client_document_uploaded` always true; everything else (assignment, deletion, dept, lifecycle-internal) false. **No backfill**: rules/list queries reference the field directly, so pre-existing events simply never appear in the portal (acceptable — see Risks).
3. **`documents/{did}`** — no schema change; client creates use the D-034 shape already in the model: `uploaderType: 'client'`, `uploadedBy: cid`, `scope: 'project'`, `visibleToClient: true`, `restrictedToDepartments: []`, `sizeBytes ≤ 10 MB`, `storagePath` under `workspaces/{wid}/projects/{pid}/client-uploads/{uuid}-{name}`.
4. **Custom claims (portal principal):** uid `portal_{wid}_{pid}_{cid}` (deterministic — re-redemption reuses the same Auth user), claims `{ portal: { wid, pid, cid, linkId } }`. No `workspaces` claim → every existing firm rule automatically denies portal principals; new portal rules are additive and **project-scoped, single-workspace by construction** (multi-tenant isolation preserved: `isPortalClient(wid, pid)` string-compares both ids from claims against the match path).
5. **Rules invariants (non-negotiable):**
   - Every portal `read` on project subcollections re-checks `get(project).lifecycle ∈ {published, completed}` (D-027 rows for archived/deleted → deny even for live sessions).
   - Portal principals can never `list` projects, read tasks, members, clients, messages, auditLog, usageCounters, or anything outside `{wid}/{pid}`.
   - Portal document `create` validator pins `uploadedBy == token.portal.cid`, caps 10 MB, and forces the D-034 field values above; `update/delete: false` for portal (client 24 h self-delete deferred — see Out of scope).
   - `magicLinks` remains `read, write: if false` for all client SDKs including portal principals.

## Steps

Each step leaves `pnpm turbo build lint typecheck test` green and is independently verifiable.

1. **Shared contracts.** Add constants (`MAX_CLIENT_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024`, `CLIENT_ALLOWED_DOCUMENT_MIME_TYPES` = pdf, png/jpeg/webp/gif, docx + legacy msword, `PORTAL_LINK_TTL_DAYS = 90`), `client_document_uploaded` action, `IMagicLinkDoc`, callable request/response types, `visibleToClient?` on the activity type. Verify: `pnpm --filter @siapp/shared build test`.
2. **Token library.** `backend/functions/src/lib/portalTokens.ts`: `generatePortalToken()` (shortCode 12 chars + 128-bit secret via `crypto.randomBytes`, base64url), `hashSecret()` (sha256), `verifySecret()` (`crypto.timingSafeEqual`), `portalUid(wid,pid,cid)`, `parsePortalToken(raw)`. Mirror shared constants locally (functions do not import `@siapp/shared`). Unit tests: round-trip, tamper, malformed input.
3. **`issuePortalLink` callable.** Auth: caller has `workspaces[wid].role ∈ {owner, admin, pm}`. Validates project exists, `lifecycle ∈ {published, completed}` (D-027 gate #3), `clientId` non-empty. Returns existing unexpired unrevoked link for `(pid, clientId)` or mints a new one; `reset: true` revokes then mints. Writes an `auditLog` entry (reuse `lib/auditLog.ts`; new `TAuditAction` `'portal_link.issue' | 'portal_link.reset'`). Returns `{ url: 'https://siapp.app/p/{shortCode}_{secret}', expiresAt }`. Register in `index.ts`. Unit tests with emulator.
4. **`redeemPortalLink` callable.** Unauthenticated. Parse token → collectionGroup query `magicLinks` where `shortCode ==` (requires the field-override index, step 6) → verify hash, `revoked == false`, `expiresAt > now`, `audience == 'client'` → load project: if `lifecycle == 'draft'` return `{ status: 'not_started', firmName }`; if `archived/deleted` return uniform `invalid_or_expired`; else mint custom token (deterministic uid, portal claims), bump `useCount`/`lastUsedAt`, and return `{ status: 'ok', customToken, wid, pid, branding: { firmName, logoUrl, primaryColor }, tier }` (tier = workspace `plan`). All failure paths return the single uniform error code. Unit tests: valid, expired, revoked, wrong secret, draft, archived, malformed.
5. **Activity writer changes.** `activityDiff.ts`: add `client_document_uploaded` to the local action mirror; `deriveDocumentActivity` emits it (actor `client`, `actorId = uploadedBy`) when `uploaderType == 'client'`; add `visibleToClient` derivation per the client-safe table above. `activityLog.ts` persists the field. Update existing `activityDiff`/trigger tests + new cases. Verify shared↔functions enum parity in a test (existing pattern).
6. **Firestore rules + indexes.** Add portal helpers and grants (see Data model §5); add `firestore.indexes.json` entries (magicLinks `shortCode` CG override; `activity` composite `visibleToClient ASC, at DESC`). Write `backend/rules-tests/src/portal.test.ts` (matrix below). Verify: `pnpm --filter @siapp/rules-tests test`.
7. **Storage rules.** `client-uploads/{fileName}` create for `isPortalClient(wid, pid)` with 10 MB cap + client mime allowlist (mirrored from shared constants; parity rules-test like #14's); portal read on `workspaces/{wid}/projects/{pid}/{fileName}` and `client-uploads/`; firm read of client-uploads already exists. Update the stale "written server-side" comment. Tests in `portalStorage.test.ts`.
8. **Portal session bootstrap.** `usePortalSession.ts` + `PortalShell.tsx` rewrite + `PortalErrorStates.tsx`: redeem on mount (unless auth already carries matching `portal.pid`), `signInWithCustomToken`, expose `{ status, branding, tier, wid, pid }` via context to sub-routes; render B1x (expired/invalid — "link no longer valid" + "contact your firm" guidance), "not started yet" (draft), loading skeleton, generic error with retry. Mobile-first, warm portal theme (already wired via `useSurfaceTheme('portal')`), safe-area padding per wireframe note #10. Component tests with mocked callable/auth.
9. **Project page (B2 + B2x).** `PortalProjectPage.tsx`, `usePortalProject.ts`, `TimespanBar.tsx`: branding header (logo fallback → firm name text), start/target dates, timespan bar (today marker clamped to [start, target]; phase markers from phases with dates; graceful no-target-date fallback = bar hidden, dates still shown), current phase (first phase `in_progress`, else last `done`/first `todo`), `% complete` from `project.summary.progressPct`, next milestone (earliest incomplete by `targetDate`), last-3 updates preview linking to `/updates`, documents summary linking to section, B2x zero state (0 %, dashed empty milestone/docs cards). Realtime via `onSnapshot`.
10. **Updates feed (B4 + B4x) and milestones (B3).** `usePortalUpdates.ts` (query `visibleToClient == true` orderBy `at desc` limit 30, "load more"), `PortalUpdatesPage.tsx` with B4x empty state; `PortalMilestonesPage.tsx`. Wire nested routes in `apexRouter.tsx` (stay inside the existing lazy chunk import).
11. **Client upload (B2y).** `usePortalDocuments.ts` + `PortalDocumentsSection.tsx`: list visible docs (`visibleToClient == true && deletedAt == null`); upload flow mirroring `useDocuments.ts` (client-side pre-validation of size/mime with inline errors, `uploadBytesResumable` to `client-uploads/{uuid}-{name}`, then metadata batch write), progress UI, failure states: oversized, unsupported type, network/rules failure with retry, and quarantine rendering for `scanStatus == 'infected'` docs. Confirm firm sees the doc + `client_document_uploaded` event (emulator).
12. **Footer per tier.** `PortalFooter.tsx`: `trial`/`standard` → "Powered by Siapp" (links to marketing apex); `business` → firm name/logo only. Reserved plan values degrade to "Powered by Siapp".
13. **Firm-side affordance.** `PortalLinkCard.tsx` on ProjectDetailPage Details tab + `issuePortalLink` wrapper in `apps/web/src/lib/callables.ts`: Copy portal link (clipboard + confirmation), Reset link (confirm dialog), expiry shown; disabled states with reasons (draft → "Publish first", no client → "Link a client"). Component tests.
14. **Verification sweep.** `pnpm turbo build lint typecheck test`; `pnpm --filter @siapp/web build` (all three surface modes) then `node scripts/check-bundle-isolation.mjs` (must still report portal tree as separate lazy chunk, zero firm/admin modules); manual emulator walkthrough: publish project → issue link → open `/p/{token}` → verify B2 → upload file → check firm Documents tab + Activity tab → archive project → verify portal denies.

## Test plan

- **Unit (functions):** `portalTokens` (generation entropy/format, hash verify, timing-safe, parse hardening); `issuePortalLink` (role gate, draft rejection, reuse-vs-reset, audit entry); `redeemPortalLink` (each failure uniform, claims shape, deterministic uid, `useCount`); `activityDiff` (`client_document_uploaded`, `visibleToClient` derivation matrix).
- **Rules tests (Firestore)** — `portal.test.ts`: portal principal **can** get own project (published + completed), read phases/milestones, list activity only with `visibleToClient == true` filter, list/get documents only with `visibleToClient == true` filter, create a valid client document; **cannot** read a draft/archived project or its subcollections, read another project in the same workspace, read anything in another workspace, list projects, read tasks/members/clients/magicLinks/auditLog, create documents violating any pinned field (wrong `uploadedBy`, `uploaderType`, size > 10 MB, `visibleToClient: false`, restricted departments non-empty, path outside `client-uploads/`), update/delete any document, write activity. Firm members still read client uploads.
- **Rules tests (Storage)** — `portalStorage.test.ts`: portal create in `client-uploads/` within cap/allowlist; deny oversized, disallowed mime (incl. SVG), wrong project path, firm-prefix writes; portal read of project files; unauthenticated deny; mime allowlist parity with shared constant.
- **Component (web):** `usePortalSession` state machine (ok/expired/not_started/error, re-use of existing session); `TimespanBar` (today before start / mid / after target clamping, marker positions, aria-label); `PortalProjectPage` (B2 full, B2x zero state, % and next-milestone derivations); `PortalUpdatesPage` (feed rows, B4x); `PortalDocumentsSection` (list, upload happy path, all B2y failures); `PortalFooter` (three tiers); `PortalLinkCard` (copy, reset, disabled reasons); `apexRouter` nested portal routes.
- **CI:** bundle-isolation check must pass unchanged.

## Out of scope

- WhatsApp/SMS delivery of portal links (welcome-on-publish etc. — #18/#22 messaging pipeline; `issuePortalLink` is reusable by it).
- Collaborator `/t` page and its tokens (#22).
- Virus-scan pipeline (`scanStatus` stays `pending`; portal renders quarantine state if the field ever becomes `infected`, but nothing sets it yet).
- Client 24 h self-delete of own uploads (D-034 grace window) — additive rules change later.
- "Message on WhatsApp" deep-link CTA (D-035) — no firm WA-number field exists on the workspace doc yet.
- Firm branding **editor** (logo upload UI); portal consumes `workspaces.branding` if present, falls back to firm name text.
- `expireMagicLinks` scheduled sweep (expiry enforced at redemption + lifecycle rules; sweep is cosmetic cleanup).
- Bahasa Malaysia copy (v1.5), custom domains, PWA install prompts for clients.

## Decisions requiring approval

1. **Magic-link auth mechanism.** (A) **Recommended:** unauthenticated `redeemPortalLink` callable mints a Firebase **custom token** with `portal` claims; portal signs in and uses direct rules-gated Firestore listeners + Storage upload — matches 13-tech-architecture L215/L167, reuses the existing custom-token pattern (`adminImpersonateUser`) and the callable/rules maturity of this repo; **explicitly contradicts data-model principle 4** ("server-mediated via Cloud Run"), which should be annotated as superseded. (B) Fully server-mediated REST on `backend/api` (Cloud Run) per principle 4 — much larger build (the API is a bare skeleton), no realtime, new auth middleware. (C) Firebase email-link sign-in (13-tech L72) — stale, clients are on WhatsApp.
2. **Token format & lifetime.** **Recommended:** URL token `{shortCode}_{secret}`, secret hashed at rest (sha256), 90-day expiry, one active link per (project, client), firm-side "Reset link" revocation; revocation/expiry enforced at redemption, while **live sessions** are bounded by the lifecycle re-check in rules (archived/deleted kills access immediately per D-027). Deviates from the data model's `magicLinks/{shortCode}` doc-id-as-token sketch (6-char code is too weak as a bearer secret). Alternatives: short TTL (7 days — re-send friction for a link clients bookmark from WA); no expiry (weaker hygiene).
3. **Which bundle hosts `/p`.** **Recommended:** the existing apex bundle lazy chunk (`apps/web/src/surfaces/portal/`, already scaffolded; D-036 table places the portal on `siapp.app`; the isolation checker already asserts this shape). Alternative: a fourth Vite entry + Firebase Hosting site — stronger isolation but contradicts D-036's apex-URL choice (would need path rewrites) and adds infra for no MVP gain.
4. **Updates-feed source.** **Recommended:** reuse `activity/{aid}` with a new denormalized `visibleToClient` flag + composite index; no backfill (pre-#21 events never surface to clients — acceptable since no portal existed). Alternative: a separate `clientUpdates` subcollection — duplicate writer, more drift risk.
5. **% complete definition.** **Recommended:** `project.summary.progressPct` as-is (all tasks; already server-maintained). Alternative: client-visible tasks only — more "honest" to the client but needs new counters and a trigger change; can be revisited post-MVP if firms complain.
6. **Firm branding delivery.** **Recommended:** snapshot `{ firmName, logoUrl, primaryColor }` + `tier` in the `redeemPortalLink` response (no portal read grant on the workspace doc; branding staleness bounded by session refresh). Alternatives: portal rules read on the workspace doc (leaks plan/seat/allowance fields) or denormalizing branding onto every project doc (write amplification).
7. **Client upload write path.** **Recommended:** direct client-SDK upload under portal-claims Storage rules + Firestore metadata create (mirrors the firm's #14 flow; progress UI for free), which supersedes the #14-era "written server-side" comment in storage.rules; portal Storage **read** of shared docs relies on unguessable uuid paths within the project prefix — the same accepted tradeoff #14 documented for department gating. Alternative: server-mediated signed URLs — stronger per-object gating, but a new callable + no resumable progress.
8. **Portal information architecture.** **Recommended:** follow the wireframes — `/p/:token` overview (B2) with sub-routes `/updates` (B4) and `/milestones` (B3), all inside the one lazy chunk. Alternative: single scrolling page — fewer files but diverges from the reviewed wireframes.

## Risks / open questions

- **Session longevity after custom-token sign-in.** Firebase refresh tokens outlive link revocation; a revoked link's already-signed-in session persists until lifecycle rules deny it. Mitigation shipped: lifecycle re-check on every portal rule; residual risk (revoked link but still-published project) is accepted for MVP — flag if a hard-revoke (per-request `get(magicLinks)` in rules, +1 read/request, or `revokeRefreshTokens`) is wanted instead.
- **Unauthenticated callable abuse.** `redeemPortalLink` is a public endpoint: uniform errors + hashed secrets resist enumeration, but rate limiting/App Check is not configured in this repo — recommend enabling App Check enforcement as a fast-follow; needs a human call on timing.
- **Doc contradictions** (data-model principle 4; 13-tech L72) must be annotated once Decision 1 is approved, or the collaborator-page team (#22) may build the other pattern.
- **`plan` values vs footer tiers.** Workspace `plan` is `trial | standard | business`; MVP is effectively single-tier (D-030), so the firm-branded footer path will be untestable in production until Business exists — component tests cover it.
- **Branding data may be empty** for all real workspaces (no editor UI); portal must look intentional with text-only branding (frontend-design attention in step 9).
- **Timezone of "today" marker** — computed client-side (client device TZ); acceptable for a day-granularity bar. Confirm nobody expects Asia/Kuala_Lumpur pinning.
- **Milestones have no firm-side authoring UI** (rules are read-only, `write: false`, no editor shipped in #12/#13). "Next milestone" will be empty for every real project until a milestones editor exists — B2 must degrade gracefully (dashed empty card per B2x). Flagging: is a minimal firm-side milestone editor wanted in #21, or does it stay out?

## Approved decisions (auto-approved — user unavailable, recommendations taken)

- D1: Custom-token callable + rules-gated direct Firestore/Storage. Annotate data-model principle 4 as superseded for portal reads.
- D2: Token `{shortCode}_{secret}` (32-byte base64url secret), sha256 at rest, 90-day expiry, one active link per project+client, Reset revokes+reissues.
- D3: Portal lives in the apex bundle as a lazy chunk (`apps/web/src/surfaces/portal/`).
- D4: Updates feed reuses activity subcollection with denormalized `visibleToClient` + composite index. No backfill.
- D5: `%` complete = existing `summary.progressPct` (all tasks).
- D6: Firm branding delivered as snapshot in `redeemPortalLink` response.
- D7: Direct client-SDK Storage upload under portal rules (10MB, PDF/image/DOCX in rules), uuid-path obscurity as in #14.
- D8: Sub-routes per wireframes (B2 overview / B3 documents / B4 updates).
- Q1: Soft revoke — existing session valid ≤1h after Reset; no per-read linkId check.
- Q2: Add minimal firm-side milestones editor (title, date, done) in project Details tab — in scope.
