---
title: "Support multiple clients per project (WhatsApp notifications to all)"
status: draft
updated: 2026-09-08
issue: Siapp-Development/siapp#157
type: "Implementation plan (read-only planner — writes no code)"
---

# impl-157 — Multiple clients per project (WhatsApp fan-out to all)

**Issue:** Siapp-Development/siapp#157 · **Surfaces:** firm app (`dashboard.siapp.app`) + client portal (`siapp.app/p/*`) + backend (Cloud Functions) + `firestore.rules`.

> Note: `gh issue view 157` could not be executed from the planning sandbox (no shell access from the planner or its subagents). This plan is written against the feature description supplied in the task brief plus first-hand code research. **Before build starts, a human should confirm the issue body/acceptance criteria match §Goal below.** (Open question OQ-0.)

---

## Goal

Today a project links to exactly **one** client via `IProjectDoc.clientId: string` + `clientNameDenorm: string` (paired-field rule, #16). Issue #157 asks that a project may be associated with **multiple** clients, and that **every** associated client receives the same WhatsApp notifications — portal magic-links (D-142/D-042 durable link) and task/activity notifications (#18, D-027 lifecycle gate) — **each respecting its own `waConsent` + `notificationsOptOut`** (D-035, #26). This touches the data model, `firestore.rules`, the portal-link + notification fan-out in Cloud Functions, and the firm project forms/lists + portal display. Bundle isolation per surface (D-036/D-037) and the draft/publish notification gate (D-027) are unchanged.

Design pivot that keeps the change small: **the portal principal stays single-client by construction.** Portal claims already scope one `cid` per magic-link token (`portalUid = portal_{wid}_{pid}_{cid}`, anchor keyed on the `(wid,pid,cid)` triple). "Multiple clients" therefore means (a) the project stores a **list** of client ids, (b) the rules grant a portal principal access when *its* `cid` is a **member** of that list, and (c) the backend **fans out** issuance/notification **once per client id**, reusing the existing per-client primitives. No change to the portal claim shape or `portalUid`.

---

## Touched surfaces & files

### `packages/shared` (types — the contract both sides read)
- `packages/shared/src/firestoreTypes.ts` — `IProjectDoc`: add the multi-client fields; keep legacy fields for backward compat (see §Data model).

### `firestore.rules` + rules-tests
- `firestore.rules` — `validProjectFields()` (~L314), project `create` key allow-list (~L809), project `update` affectedKeys allow-list (~L845), project `get` portal clause (~L804), `portalProjectLive()` (~L191), and (verify) `validPortalDocumentCreate()` (~L383).
- `backend/rules-tests/src/projects.test.ts` — client-linking validation (~L276–L316).
- `backend/rules-tests/src/portal.test.ts` — portal project + subcollection access, clientId mismatch test (~L179–L198, L613–L621), seed helpers (~L30–L60, `dbAsPortal` ~L139).

### `backend/functions` (fan-out)
- `backend/functions/src/callables/issuePortalLink.ts` — reads single `project.clientId` (L365, L379); `getOrCreateClientPortalLink(...)` primitive is already per-client. Fan out issuance across `clientIds`.
- `backend/functions/src/callables/sendPortalLink.ts` — reads single `clientId` (L98), single client fetch + consent/optOut/phone gates (L100–L122), single enqueue (L144–L146). Fan out to all clients; return per-client statuses.
- `backend/functions/src/lib/enqueueNotifications.ts` — `resolveRecipients()` client branch (L118–L137) and `enqueueTaskEvent()` (L308–L356) read single `clientId`/`clientData`. Fan out per client with per-client consent/optOut/phone + per-client portal token.
- `backend/functions/src/lib/activityDiff.ts` — `client_link_changed` diff (L344–L359) compares single `clientId`. Update to diff the id **list**.
- `backend/functions/src/triggers/onProjectWrite.ts` (denorm/mirror maintenance) — verify it does not clobber the new fields and that assignedTasks/inbox mirrors carry no stale single-client denorm. (No client denorm is currently server-recomputed; confirm.)
- (Reference only, no logic change expected) `backend/functions/src/lib/portalTokens.ts` (`portalUid`, `portalLinkAnchorId`), `backend/functions/src/callables/redeemPortalLink.ts` (claims minting stays single-cid), `backend/functions/src/scheduled/dispatchQueue.ts`, `backend/functions/src/triggers/messageUsage.ts` (allowance counting is per-message — unaffected).

### `apps/web` (firm app + portal)
- `apps/web/src/surfaces/firm/projects/ProjectForm.tsx` — replace the single `<select>` client picker (L216–L235) with a multi-select; write `clientIds` + `clients[]`.
- `apps/web/src/surfaces/firm/projects/useProjects.ts` — `IProjectRow` (L31–L32), doc mapping (L79–L80), `createProject`/`updateProject` writes (L176–L177, L205–L206).
- `apps/web/src/surfaces/firm/projects/ProjectsListPage.tsx` — client display (L82).
- `apps/web/src/surfaces/firm/projects/ProjectDetailPage.tsx` — client display (L336–L338).
- `apps/web/src/surfaces/firm/projects/PortalLinkCard.tsx` — issuance gate on `clientId === ''` (L11, L65) → gate on empty list; likely per-client link UI.
- `apps/web/src/surfaces/firm/projects/projectsListFilter.ts` — filter predicate (L113) uses single `row.clientId`; params already `clientIds: string[]` (good).
- `apps/web/src/surfaces/portal/usePortalProject.ts` (L55) + `PortalHeader.tsx` — display all client names.
- Reusable multi-select reference: `apps/web/src/surfaces/firm/projects/tags/TagSelect.tsx` (combobox + chips) and `CheckboxRow`/`toggle` in `ProjectsListControls.tsx` (L251–L268).

---

## Data model changes

**New fields on `IProjectDoc` (`packages/shared/src/firestoreTypes.ts`):**

```ts
/** Client ids linked to this project (#157). Rules-queryable membership list
 *  used for portal access + notification fan-out. Empty = no client linked.
 *  Superseding clientId (kept for one migration window; see below). */
clientIds: string[];
/** Denormalised {id,name} for display without N reads. Kept in lockstep with
 *  clientIds by the firm CRUD forms (rules-validated pairing). */
clients: Array<{ id: string; name: string }>;
```

**Why two fields:** rules cannot resolve names, and `in` membership tests need a flat string list — so `clientIds: string[]` powers rules/queries (mirrors the existing `assigneeCollaboratorIds` string-projection precedent) and `clients: {id,name}[]` powers display (mirrors the `clientNameDenorm` intent). An alternative single `clients: {id,name}[]` array was rejected because rules would then need `clients[i].id`-style iteration, which the Firestore list prover cannot do.

**Backward-compatibility / migration (recommended: additive dual-write + backfill, no hard cut):**
1. **Keep** legacy `clientId` / `clientNameDenorm` on the type as `@deprecated`, optional. During the migration window the firm forms **dual-write** both: legacy fields set to the *first* linked client (or empty), new fields set to the full list. This keeps any not-yet-migrated reader (and the `client_link_changed` legacy diff) working.
2. **Backfill** existing projects with a one-off idempotent script under `scripts/` (Admin SDK): for every project, set `clientIds = clientId ? [clientId] : []` and `clients = clientId ? [{id:clientId,name:clientNameDenorm}] : []` when the new fields are absent. Rules must accept both the pre- and post-backfill shape during the window (see §Rules).
3. **Cut-over:** once all readers use the arrays and backfill is verified, a follow-up ticket removes the legacy fields + dual-write. (Not in this ticket — see Out of scope.)

**Firestore trigger implications:** No client denorm is server-recomputed today (`clientNameDenorm` is client-sourced, `onProjectWrite` maintains task/collaborator mirrors, not client identity). Confirm `onProjectWrite` and the assignedTasks mirror carry no single-client field; if any mirror embeds `clientNameDenorm`, extend it to the array or drop it. `activityDiff` is the only place that reads the pair on write — update it.

**Multi-tenant isolation (non-negotiable):** all client ids live under the same `/workspaces/{wid}/clients/*`; no path change. Portal principals still cannot read `/clients/*` (firm-only). A portal `cid` gaining access only because it is *in the list* is still workspace-scoped by the existing `portal.wid == wid` gate — no cross-tenant surface is introduced.

---

## Firestore rules changes

1. **`validProjectFields()`** — replace the paired single-field check with a list-shape check while tolerating legacy during the window:
   - `d.clientIds is list && d.clientIds.size() <= N` (propose N=10; see OQ-2), every entry a non-empty string is not iterable in rules, so cap size only; `d.clients is list && d.clients.size() == d.clientIds.size()`.
   - Transitional: still accept the legacy `clientId`/`clientNameDenorm` pair keys, or require the forms to always send the arrays. Prefer: **require arrays, keep legacy keys allowed but unvalidated for shape** so backfilled docs pass. Decide in OQ-1.
2. **Project `create` key allow-list (~L809)** and **`update` affectedKeys allow-list (~L845)** — add `clientIds`, `clients` (keep `clientId`, `clientNameDenorm` during the window).
3. **Portal project `get` (~L804)** — change `resource.data.clientId == request.auth.token.portal.cid` to membership: `request.auth.token.portal.cid in resource.data.clientIds`.
4. **`portalProjectLive()` (~L191)** — change `project.clientId == request.auth.token.portal.cid` to `request.auth.token.portal.cid in project.clientIds`.
5. **`validPortalDocumentCreate()` (~L383)** — `uploadedBy == request.auth.token.portal.cid` is still correct (the uploading client is one of the members); no change, but add a rules-test that a member-client can upload.
6. **Backfill-window safety:** because `in` on a missing/undefined `clientIds` errors, either (a) run the backfill **before** deploying the new rules, or (b) write the membership check defensively: `('clientIds' in resource.data) && request.auth.token.portal.cid in resource.data.clientIds`. Recommend (b) for safety, plus (a) for cleanliness. (OQ-3.)

**Rules-tests to add/update (`backend/rules-tests/`):**
- `projects.test.ts`: linking one, two, and zero clients succeeds; `clients[]` length must equal `clientIds[]` length; size cap enforced; unlink back to empty; (transitional) legacy-shaped doc still readable.
- `portal.test.ts`: portal principal whose `cid` **is in** `clientIds` can read the project + phases + milestones + list tasks/documents/activity; portal principal whose `cid` is **not in** the list is denied (rework the existing L613–L621 mismatch test for the array); a **second** client on the same project gets its own access; portal document upload pins `uploadedBy` to that `cid`; defensive check when `clientIds` absent denies rather than errors.

---

## Backend notification fan-out

**Portal link issuance/sending — one link per client:**
- `issuePortalLink.ts`: read `project.clientIds`; for each id call the existing `getOrCreateClientPortalLink(db, wid, pid, cid, issuerUid)` (already per-client, anchor keyed on the triple). Return an array of `{ clientId, url, token, expiresAt, ... }`. Preserve the `PORTAL_ISSUABLE_LIFECYCLES` (published/completed) + role gate.
- `sendPortalLink.ts`: loop over `clientIds`; for each, fetch its client doc and apply the existing gates independently (`isOptedOut` → `opted_out`, `!hasWaConsent` → `no_consent`, empty phone → `no_phone`), else enqueue one message with `recipientId: cid`, `recipientPhone: <that client's phone>`, and that client's durable token. Return **per-client** statuses so the firm UI can show "sent to A, opted-out B, no-phone C".

**Task/activity WhatsApp fan-out — every client, per-client consent:**
- `enqueueNotifications.ts` `resolveRecipients()` (L118–L137): replace the single `clientId`/`clientData` client recipient with **one recipient per** `clientIds[]` entry, each carrying its own `optedOut`/`noConsent`/`phone` resolved from that client's doc. Fetch client docs in a batched read (getAll) keyed by the id list.
- `enqueueTaskEvent()` (L308–L356): replace the single client fetch + single `clientPortalToken` with a per-client loop — resolve each eligible client's durable token via `getOrCreateClientPortalLink(...)` and enqueue a message embedding *that* client's token/link. Each message remains one queue doc → one Twilio send → one allowance decrement (`messageUsage.ts` unchanged; cost is per message).
- Consent/opt-out semantics (D-035, #26): each client is gated **independently** — an opted-out or no-consent client is silently suppressed (suppressed message doc, no send) while others still receive. Quiet-hours `holdUntil` (workspace-level) is applied per message as today.
- Lifecycle gate (D-027): draft projects still suppress all sends and issue no links — unchanged; the fan-out only runs for published/completed projects.

**Activity diff:** update `activityDiff.ts` `client_link_changed` to diff `clientIds`/`clients` (e.g. emit added/removed client names) instead of the single-value from/to. Keep the action id stable for the firm activity feed.

**Claims/redeem:** `redeemPortalLink.ts` and `portalUid` remain single-`cid` — no change. Each client redeems its own link and gets its own project-scoped principal.

---

## Steps (each independently verifiable)

1. **Types** — add `clientIds` + `clients` to `IProjectDoc`; mark legacy fields `@deprecated` optional. `pnpm --filter @siapp/shared typecheck` green. (No behavior change yet.)
2. **Rules** — update `validProjectFields`, create/update allow-lists, portal `get`, `portalProjectLive` to membership; keep legacy keys allowed. Add the defensive `'clientIds' in ...` guard.
3. **Rules-tests** — extend `projects.test.ts` + `portal.test.ts` (see §Rules-tests). `pnpm --filter @siapp/rules-tests test` green.
4. **Backfill script** — idempotent `scripts/backfill-project-clientIds.ts` (Admin SDK) populating arrays from legacy fields; dry-run flag; documented run order (backfill → deploy rules). Verified against emulator seed data.
5. **Backend fan-out** — `enqueueNotifications.ts` (recipients + per-client tokens), `sendPortalLink.ts` (per-client statuses), `issuePortalLink.ts` (per-client links), `activityDiff.ts` (list diff). `onProjectWrite` mirror audit. `pnpm --filter @siapp/functions build|test` green.
6. **Firm forms** — `ProjectForm.tsx` multi-select client picker (reuse `TagSelect`/`CheckboxRow` pattern) writing `clientIds` + `clients`; dual-write legacy first-client during window. `useProjects.ts` map/create/update.
7. **Firm display + filter** — `ProjectsListPage.tsx`, `ProjectDetailPage.tsx` show all names (joined/chips); `projectsListFilter.ts` predicate uses array intersection; `PortalLinkCard.tsx` gates on empty list + per-client send/statuses.
8. **Portal display** — `usePortalProject.ts` + `PortalHeader.tsx` render all client names (still no `/clients` read; use `project.clients[]` denorm). Bundle stays portal-local (D-036/D-037).
9. **Full test pass** — `pnpm turbo build lint typecheck test`. Manual emulator smoke: two-client project → both get portal links + a task-status WA, one client opted-out is suppressed.

---

## Test plan (for Tester)

- **Rules-tests (`backend/rules-tests/`):** project create/update with 0/1/2 clients; `clients.size() == clientIds.size()`; size cap; portal member-of-list read allow across project + phases + milestones + tasks(list) + documents + activity; non-member deny; second-client independent access; portal upload `uploadedBy` pin; absent-`clientIds` denies (no error).
- **Backend unit (Vitest, `backend/functions`):** `enqueueNotifications` fans out one recipient per client with independent opt-out/no-consent/no-phone suppression; per-client durable token embedded; allowance decrements once per sent message. `sendPortalLink` returns per-client status matrix. `issuePortalLink` returns a link per client, reusing anchor per triple. `activityDiff` emits correct added/removed client diff.
- **Web component (Vitest + RTL, `apps/web`):** `ProjectForm` multi-select adds/removes clients and submits `clientIds`+`clients` (query by role/label per testing conventions); `ProjectsListPage`/`ProjectDetailPage` render multiple client names; filter matches a project if any selected client id intersects; `PortalLinkCard` disabled only when list empty; portal header shows all names. Backfill script: idempotent unit test on a legacy doc.
- **Regression:** existing single-client projects (pre-backfill and post-backfill) still open in portal and still notify.

---

## Out of scope

- Removing legacy `clientId`/`clientNameDenorm` fields and stopping dual-write (follow-up cut-over ticket).
- Any change to the portal **claim** shape, `portalUid`, or making one portal principal see multiple clients' identity — portal stays single-client per token.
- Per-client message *content* personalisation beyond the existing templates; changing WhatsApp templates (`whatsapp-templates-v1`).
- Collaborator (`/t/*`) access, admin surface, marketing apex.
- Server-side per-client project querying/indexing (filtering stays client-side as today).
- WhatsApp allowance/pricing model changes (fan-out naturally uses more allowance — flagged as a risk, not re-modelled here).

---

## Risks / open questions (need a human call)

- **OQ-0 — Issue text unverified.** Planner could not run `gh issue view 157`. Confirm the acceptance criteria (esp. whether a "primary client" is required, and any UI mockups) before build.
- **OQ-1 — Rules transitional strictness.** Require forms to always send the new arrays (simplest) vs. also validate legacy pair during window? Recommend: require arrays; allow (but don't shape-validate) legacy keys so backfilled docs pass. Confirm.
- **OQ-2 — Max clients per project.** Propose a cap (e.g. 10) for rules size limits + WA cost control. What is the product limit?
- **OQ-3 — Migration order & rollback.** Backfill-before-rules-deploy vs. defensive `'clientIds' in resource.data` guard (recommend both). Confirm the ops runbook and whether a Cloud Function migration is preferred over a `scripts/` one-off.
- **OQ-4 — Primary-client concept.** Some legacy readers/denorms use a single name. Do we need a designated primary (e.g. for the firm's own WhatsApp deep-link in the portal, D-035, or activity single-name displays), or is "all names joined" acceptable everywhere? Affects `ProjectForm` (ordering) and portal header.
- **OQ-5 — WhatsApp cost/allowance.** Fan-out multiplies sends per event by the number of clients, drawing down `whatsappAllowance` faster and possibly tripping the 90% owner alert sooner. Acceptable, or does the firm need a per-project "notify which clients" toggle? (D-035 opt-out already lets clients self-suppress.)
- **OQ-6 — Duplicate suppression.** If two linked clients share the same phone number, should we de-dupe sends? (Current model sends one per client id.)
- **Risk — `in` operator on portal `get`:** membership test on `resource.data.clientIds` must be list-prover-safe; the defensive existence guard mitigates errors on legacy docs. Covered by rules-tests.

---

## Locked decisions (human-approved 2026-09-08)

These override any conflicting open questions above.

- **D1 — Co-equal clients, NO primary.** Model as a flat `clientIds: string[]` + `clients: {id,name}[]` denorm. All clients are peers (business-partner scenario). No primary-client concept.
- **D2 — Cap = 5** clients per project (enforced in form + rules + callable validation).
- **D3 — Always notify ALL clients.** No per-project "notify which clients" toggle. Each client still independently gated on their own `waConsent`/`notificationsOptOut`/phone.
- **D4 — De-dupe on shared phone number.** If two clients on a project share the same E.164 phone, send only ONE WhatsApp to that number (dedupe key = normalized phone). Portal-link fan-out still mints a link per client id.
- **D5 — Migration: dual-write + backfill.** Keep legacy `clientId`/`clientNameDenorm` written (mirroring first entry) during the window; backfill existing projects to populate `clientIds`/`clients`. Defensive rules guard for legacy docs. No hard cutover this ticket.
- **D6 — NO approval/sign-off gate.** Multiple clients is notifications + access only. Partner approvals are handled off-platform by the firm. Do not build any quorum/approval workflow.
- **D7 — Portal header subtitle = the logged-in client's OWN name** (derived from the session `cid`, not the full list). Do not list co-clients in the header.
- **D8 — Print / "Prepared for" = ALL client names joined** (shared deliverable document).
- **D9 — WhatsApp greeting unchanged** — per-recipient fan-out already addresses each client by their own `client_first_name`. No cross-client name leakage.
- **D10 — Firm list/detail client column = first client name + "＋N" overflow** (not full list, not just a count).
