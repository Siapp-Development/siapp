# Implementation Plan — #22 Collaborator task page (`siapp.app/t/{token}`)

> GitHub issue #22 — "Collaborator task page (/t) — magic link, status, need-help, notes/photos"
> Refs: D-035 (structured portal responses replace inbound WA parsing), D-036 (apex URL + bundle isolation), D-027 (lifecycle gate), D-029 (collaborator uploads client-visible by default), D-032 (Mark Done flows straight through), wireframes C1 / C1a–c / C1d (need-help reason) / C1x (expired link).

## Goal

Give collaborators a mobile-first, single-screen task page at `siapp.app/t/{token}` where they redeem a task-scoped magic link and respond in a structured way — status buttons (Start / Mark done / Need help), a required-reason need-help flow (C1d), free-text notes, and photo/document upload — replacing inbound WhatsApp parsing per D-035. The build **reuses the #21 portal magic-link infrastructure** (token format, hashing, redemption pattern, custom-token claims, rules posture, direct-upload pattern) rather than duplicating it, keeps `/t` an isolated lazy chunk in the apex bundle per D-036, and routes all collaborator mutations through the existing #23 activity/attribution and #18 notification pipelines.

---

## DECISIONS

### (a) Magic-link storage: reuse `magicLinks` vs parallel collection

| Option | Notes |
|---|---|
| **A1. Same `workspaces/{wid}/magicLinks` collection** (recommended) | The #21 shape already carries `audience: 'collaborator' \| 'client'`, `scopeType: 'task' \| 'project'`, `scopeId`, `subjectId` — it was designed for both audiences (`IMagicLinkDoc`, firestore-data-model.md §magicLinks). The existing collection-group `shortCode` field-override index serves redemption for free. Rules already deny all client access to `magicLinks`. |
| A2. Parallel `collabLinks` collection | Needs a second collection-group index, second expiry sweep, duplicated rules. No isolation benefit — the docs are server-only either way. |

**Recommendation: A1.** Collaborator links are `{ audience: 'collaborator', scopeType: 'task', scopeId: tid, subjectId: colid }` in the same collection. Extend, don't fork: generalize [backend/functions/src/lib/portalTokens.ts](../backend/functions/src/lib/portalTokens.ts) (token mint/parse/hash/verify are audience-agnostic already; add `collabUid()` and `buildCollabUrl()`), and add a **separate `redeemCollabLink` callable** rather than widening `redeemPortalLink` — the portal contract just shipped and its `linkBlocker` hard-pins `audience == 'client'`; a sibling callable sharing the same lib keeps the blast radius zero and the response shapes honest (collab response has no `not_started` branding nuance differences, different ids).

### (b) Collaborator writes: callable vs direct rules-gated writes

| Option | Notes |
|---|---|
| **B1. `submitCollabUpdate` callable for status / need-help / notes** (recommended) | Task rules pin `updatedBy == request.auth.uid` and `hasRole(['owner','admin','pm'])` — opening a direct collab write path means a second field-diff allowlist in rules plus attribution surgery. A callable validates transitions (e.g. need-help requires a reason), writes with the Admin SDK, and stamps `updatedBy = collabUid` so the **existing** `onTaskWrite` trigger derives activity and enqueues notifications (status→done fires the client WA per D-032; status→blocked fires `task_blocked` to the firm per #18). Attribution fix is one small extension (see step 6). |
| B2. Direct Firestore writes under new collab rules | Requires: field-diff allowlisted task update rule for the collab principal, an updates-create rule with pinned author fields, and client-side transition validation that rules can't fully express (required reason length, status transition matrix). More rules surface = more rules-test surface. |

**Recommendation: B1** for status, need-help, and notes (one callable, discriminated-union payload). **Exception — uploads stay direct** (Storage bytes + pinned-validator Firestore metadata create), mirroring the proven #21 D7 pattern, because the `onProjectDocumentWrite` trigger already derives `doc_added` activity with `uploaderType: 'collaborator'` (`uploaderActorType` in [backend/functions/src/lib/activityDiff.ts](../backend/functions/src/lib/activityDiff.ts) handles it).

### (c) Where collaborator notes live

| Option | Notes |
|---|---|
| **C1. Existing `tasks/{tid}/updates` stream** (recommended) | #13 already built this: `ITaskUpdateDoc` has `authorType: 'collaborator'`, `source: 'web'`, `action: 'comment'` — the schema anticipated exactly this. Firm sees collaborator notes in the TaskDetailPanel Activity tab with zero new UI. |
| C2. New `collabResponses` subcollection | Duplicates the feed; firm-side UI would need a second query + merge. |

**Recommendation: C1.** The callable appends `{ authorType: 'collaborator', authorId: colid, authorNameDenorm: <collaborator name>, source: 'web', action: 'comment' }`. Collaborator **read-back** of the thread is restricted to their own entries (`authorId == colid` query, rules-proven) so internal firm comments/@mentions never leak to externals.

### (d) Need-help modeling

| Option | Notes |
|---|---|
| **D1. `status: 'blocked'` + new `blockedReason?: string` on the task + a `status_change` updates entry carrying the reason text** (recommended) | `'blocked'` already exists in `TTaskStatus`; #18 already has the `task_blocked` trigger, `notify.blocked` config key, and `task_blocked_v1` template; #17 already counts `summary.blockedTasks`. The reason lands (1) denormalized on the task for the WA template + firm UI, (2) in the updates feed for the audit trail. Firm resolving the block clears `blockedReason` when moving status off `blocked` (existing firm status edit — enforce in the firm `updateTask` helper). |
| D2. Separate `needHelp: { flag, reason }` field, status untouched | Invents a second "blocked" concept next to an existing enum value; Kanban/board/notify code would all need to learn it. |

**Recommendation: D1.** No new status enum member, no new notification trigger — the pipeline lights up as-designed.

### (e) Link scope: per (task, collaborator) vs per collaborator

| Option | Notes |
|---|---|
| **E1. Per (task, collaborator)** (recommended) | Matches the C1 wireframe ("one screen, no nav"), the D-036 URL shape (`/t/{token}` — singular task), the data-model `scopeType: 'task'`, and the WA delivery model (each assignment WA carries its own link). One active link per pair, rotation on re-issue — same invariant as portal links. Claims: `collab: { wid, pid, tid, colid, linkId }`; deterministic uid `collab_{wid}_{tid}_{colid}` (portal-uid pattern — re-redemption reuses the auth user). |
| E2. Per collaborator across tasks | Needs a task list/switcher screen (not wireframed, not in MVP scope), complicates revocation on unassignment, and widens the blast radius of one leaked link to every task. |

**Recommendation: E1.** Post-MVP, a collaborator-scoped "my tasks" link can be added additively (`scopeType: 'collaborator'`).

### (f) Upload path + visibility of collaborator uploads

| Option | Notes |
|---|---|
| **F1. `workspaces/{wid}/projects/{pid}/collab-uploads/{fileName}` Storage path, 25 MB cap, image/PDF/DOCX allowlist; metadata doc `scope: 'task'`, `scopeId: tid`, `uploaderType: 'collaborator'`, `uploadedBy: colid`, `visibleToClient` defaulted from the parent task (D-029), `visibleToCollaboratorIds: [colid]`, `restrictedToDepartments` copied from the task** (recommended) | Mirrors the #21 `client-uploads/` split: a dedicated path lets storage.rules gate collab writes without touching firm/portal matches. 25 MB is the documented collaborator cap (firestore-data-model.md). D-029: client-visible by default when the task is client-visible → the portal documents page picks them up with zero work; firm sees them via the existing task-scoped `TaskAttachments`. Setting `visibleToCollaboratorIds: [colid]` makes the collaborator's own read-back query provable (`array-contains colid`) without wrestling the "empty = all" convention in rules. |
| F2. Reuse `client-uploads/` path | Muddies the D-034 client validator (10 MB, `uploaderType: 'client'` pins) with branches. |
| F3. Upload via callable (signed URLs) | The direct-write pattern is already proven and rules-tested for the portal; a callable adds latency and server bandwidth for no security gain. |

**Recommendation: F1.** Collaborator Storage **read** grant is limited to `collab-uploads/` (their own uploads) — no blanket project-file read like the portal client has, since task-scoped firm docs can be department-restricted. Viewing firm-shared documents from `/t` is out of scope (nothing in C1 wireframes shows it).

---

## Touched surfaces & files

**Surface impact (D-036):** apex bundle only (`/t` lazy chunk) + firm dashboard (link affordance in TaskDetailPanel). No admin/marketing changes. `scripts/check-bundle-isolation.mjs` already asserts `/t` is a separate lazy chunk — must stay green.

### Create

| File | Purpose |
|---|---|
| `backend/functions/src/callables/issueCollabLink.ts` (+ `.test.ts`) | Mint/rotate a collaborator link per (task, collaborator) |
| `backend/functions/src/callables/redeemCollabLink.ts` (+ `.test.ts`) | Token → custom token with `collab` claims + branding snapshot |
| `backend/functions/src/callables/submitCollabUpdate.ts` (+ `.test.ts`) | Status / need-help / note writes with collaborator attribution |
| `backend/rules-tests/src/collab.test.ts` | Firestore rules matrix for the collab principal |
| `backend/rules-tests/src/collabStorage.test.ts` | Storage rules matrix for `collab-uploads/` |
| `apps/web/src/surfaces/collab/useCollabSession.ts` (+ `.test.ts`) | Redeem → sign-in → session context (mirror of `usePortalSession`) |
| `apps/web/src/surfaces/collab/useCollabTask.ts` (+ `.test.ts`) | Task doc + own-updates + own-documents subscriptions |
| `apps/web/src/surfaces/collab/CollabStatusButtons.tsx` (+ `.test.tsx`) | Start / Mark done / Need help action row (C1, C1a–c) |
| `apps/web/src/surfaces/collab/NeedHelpForm.tsx` (+ `.test.tsx`) | C1d: required reason, optional photo, Cancel/Send, "what happens next" copy |
| `apps/web/src/surfaces/collab/CollabNotes.tsx` (+ `.test.tsx`) | Note composer + own-notes list |
| `apps/web/src/surfaces/collab/CollabUploader.tsx` (+ `.test.tsx`) | Photo/document upload (Storage + metadata create) |
| `apps/web/src/surfaces/collab/CollabErrorStates.tsx` (+ `.test.tsx`) | C1x invalid/expired, not-started, generic error |
| `apps/web/src/surfaces/firm/projects/tasks/CollabLinkButton.tsx` (+ `.test.tsx`) | Per-collaborator-assignee "Copy task link" in TaskDetailPanel |

### Modify

| File | Change |
|---|---|
| `backend/functions/src/lib/portalTokens.ts` | Add `collabUid(wid, tid, colid)` + `buildCollabUrl(origin, token)`; existing mint/parse/hash/verify reused as-is |
| `backend/functions/src/lib/activityDiff.ts` | Actor-type derivation: `updatedBy` starting with `collab_` → `actorType: 'collaborator'` (+ extract colid) |
| `backend/functions/src/lib/activityLog.ts` | Actor-name resolver: collaborator actors resolve via `workspaces/{wid}/collaborators/{colid}` (not `users/{uid}` → 'Unknown member') |
| `backend/functions/src/lib/enqueueNotifications.ts` | Include `blockedReason` in the `task_blocked_v1` template variables |
| `backend/functions/src/index.ts` | Export the three new callables; `onTaskWrite`: revoke active collaborator links for colids removed from `assignees` |
| `packages/shared/src/firestoreTypes.ts` | `ITaskDoc.blockedReason?: string`; `ICollabClaims` shape |
| `packages/shared/src/callableTypes.ts` | `IIssueCollabLinkRequest/Response`, `IRedeemCollabLinkRequest`, `TRedeemCollabLinkResponse`, `ISubmitCollabUpdateRequest` (discriminated union) `/Response` |
| `packages/shared/src/constants.ts` | `COLLAB_LINK_TTL_DAYS` (90, mirror portal), `COLLAB_UPLOAD_MAX_BYTES` (25 MB), collab mime allowlist |
| `firestore.rules` | `isCollabPrincipal(wid, pid, tid)` helper; collab `get` on the one task; own-authored `updates` read; `documents` read (array-contains colid) + `validCollabDocumentCreate` pinned validator; task update rule gains `blockedReason` in the field allowlist for firm edits |
| `storage.rules` | `collab-uploads/{fileName}` match: collab create (≤25 MB, mime allowlist) + collab/firm/portal-consistent read |
| `firestore.indexes.json` | `updates` composite `(authorId ASC, createdAt DESC)`; `documents` composite `(visibleToCollaboratorIds CONTAINS, deletedAt ASC, uploadedAt DESC)` — confirm exact tuples from emulator error output |
| `apps/web/src/surfaces/collab/CollabTaskPage.tsx` | Replace stub: session provider, task header (firm branding), status buttons, need-help, notes, uploads, error states, mobile-first layout with safe-area insets |
| `apps/web/src/lib/callables.ts` | `issueCollabLink`, `submitCollabUpdate` wrappers (redeem is called from `useCollabSession` like the portal) |
| `apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.tsx` | Render `CollabLinkButton` per collaborator assignee; show a "Blocked: {reason}" banner when `status == 'blocked' && blockedReason` |
| `pm_ux/plans/firestore-data-model.md` | Document implemented collab-link shape, `blockedReason`, `collab-uploads/` path, own-updates read grant |

*(No change needed to [apps/web/src/routes/apexRouter.tsx](../apps/web/src/routes/apexRouter.tsx) — `/t/:token` → lazy `CollabTaskPage` is already wired.)*

## Data model changes

- **`workspaces/{wid}/magicLinks/{linkId}`** — no schema change; collaborator docs use the existing fields with `audience: 'collaborator'`, `scopeType: 'task'`, `scopeId: tid`, `subjectId: colid`. One active link per (task, collaborator); issuance rotates. Server-only (rules already `read, write: if false`).
- **`workspaces/{wid}/projects/{pid}/tasks/{tid}`** — new optional `blockedReason?: string` (≤ 1000 chars). Written by `submitCollabUpdate` (need-help) or firm edits; cleared when status leaves `blocked`.
- **`tasks/{tid}/updates/{updid}`** — no schema change; collaborator entries use existing `authorType: 'collaborator'`, `source: 'web'`, actions `comment` / `status_change`.
- **`projects/{pid}/documents/{did}`** — no schema change; collaborator uploads: `uploaderType: 'collaborator'`, `uploadedBy: colid`, `scope: 'task'`, `scopeId: tid`, `visibleToClient` = parent task's `visibleToClient` (D-029), `visibleToCollaboratorIds: [colid]`, `restrictedToDepartments` copied from the task, `storagePath` under `collab-uploads/`.
- **Security-rules implications (multi-tenant isolation — non-negotiable):**
  - New principal: custom-token claims `collab: { wid, pid, tid, colid, linkId }`. Every grant pins **all three** of `wid`/`pid`/`tid` from claims — a collab principal can never touch a sibling task, another project, or another workspace.
  - All collab reads re-check `portalProjectLive(wid, pid)` (D-027: unpublish/archive/delete instantly closes the page) and the task's `visibleToCollaboratorIds` gate (empty or contains colid).
  - `updates` reads are provable-query-limited to `authorId == collab.colid` — firm-internal comments and @mentions never reach externals.
  - Collab principals get **no** access to `projects` doc, `phases`, `milestones`, `activity`, `magicLinks`, or any firm collection; document reads require `visibleToCollaboratorIds array-contains colid`.
  - Storage: collab create/read confined to `collab-uploads/`; no blanket project-file read.

## Steps

Each step is independently verifiable (typecheck/tests pass at every point).

1. **Shared types & constants** — `packages/shared`: add `ICollabClaims`, `blockedReason` on `ITaskDoc`, callable request/response types for the three callables (redeem response mirrors `TRedeemPortalLinkResponse`: `ok` w/ customToken + ids + branding, `not_started` w/ firmName, uniform error otherwise), `COLLAB_LINK_TTL_DAYS`, upload constants. *Verify:* `pnpm turbo typecheck`.
2. **Token lib generalization** — `portalTokens.ts`: add `collabUid` + `buildCollabUrl` (pure, unit-tested without emulators, same convention). *Verify:* functions unit tests.
3. **`issueCollabLink` callable** — auth: firm `owner/admin/pm` of `wid` (claim check, same as `issuePortalLink`). Gate (pure `issueBlocker`-style fn): project exists & lifecycle `published`/`completed` (D-027), task exists, `collaboratorId` is a current collaborator-type assignee of the task, and passes `visibleToCollaboratorIds`. Rotate-then-mint into `magicLinks` (`audience: 'collaborator'`); audit-log `collab_link.issue` / `collab_link.reset` (extend `TAuditAction`). Returns `{ url, expiresAt }`. *Verify:* unit tests on the gate fn.
4. **`redeemCollabLink` callable** — unauthenticated; parse → collection-group `shortCode` lookup (existing index) → timing-safe `verifySecret` → `linkBlocker` variant pinning `audience == 'collaborator' && scopeType == 'task'` → task + project + workspace fetch → lifecycle gate (`draft` → distinguishable `not_started`, per portal precedent) → re-verify assignment + `visibleToCollaboratorIds` → mint custom token `{ collab: { wid, pid, tid, colid, linkId } }` with uid `collab_{wid}_{tid}_{colid}` → bump `useCount`/`lastUsedAt` → return ids + branding snapshot. Every failure = the same uniform `collab/invalid_or_expired` error (anti-enumeration, C1x). *Verify:* unit tests on the blocker fn.
5. **`submitCollabUpdate` callable** — requires `collab` claims; re-checks lifecycle + assignment server-side. Discriminated payload:
   - `{ kind: 'status', to: 'in_progress' | 'done' }` → task `status` (+ `completedAt` on done), `updatedBy: collabUid`, updates entry `status_change`.
   - `{ kind: 'need_help', reason: string (1–1000 chars, required) }` → `status: 'blocked'`, `blockedReason`, `updatedBy`, updates entry `status_change` with `payload.text = reason`.
   - `{ kind: 'note', text: string (1–5000 chars) }` → updates entry `comment` only.
   All updates entries: `authorType: 'collaborator'`, `authorId: colid`, `authorNameDenorm` from the collaborator doc, `source: 'web'`. Task writes flow through the **existing** `onTaskWrite` trigger for summary recompute, activity, and #18 enqueue (done → client WA per D-032; blocked → `task_blocked` internal WA). *Verify:* unit tests on payload validation.
6. **Attribution & notification plumbing** — `activityDiff.deriveTaskActivity`: `updatedBy` prefixed `collab_` → `actorType: 'collaborator'`, `actorId: colid`; `activityLog` resolver: collaborator actors resolve names from `collaborators/{colid}`; `enqueueNotifications`: `task_blocked_v1` gains the `blockedReason` variable. *Verify:* existing + new unit tests on `deriveTaskActivity` / resolver.
7. **Link hygiene on unassignment** — `onTaskWrite` in `index.ts`: when a collaborator assignee is removed (reuse `collaboratorIdsToStamp`-style diffing), soft-revoke their active `magicLinks` for that task. *Verify:* functions unit test.
8. **firestore.rules** — add `isCollabPrincipal(wid, pid, tid)`; grants per the Data-model section above (`task get`, own-authored `updates` get/list, `documents` get/list/create with `validCollabDocumentCreate` pinning `uploadedBy == collab.colid`, `uploaderType == 'collaborator'`, `scope == 'task'`, `scopeId == collab.tid`, path prefix, size/mime metadata, `visibleToClient` matching the parent task, `visibleToCollaboratorIds == [colid]`, `restrictedToDepartments` copied); allow `blockedReason` in the firm task-update field allowlist. All other collections remain closed to collab principals. *Verify:* step 10 rules tests.
9. **storage.rules + indexes** — `collab-uploads/{fileName}`: collab create ≤ 25 MB with image/PDF/DOCX allowlist, read for firm + the collab principal (+ portal client, consistent with D-029 visibility); add the two composite indexes to `firestore.indexes.json`. *Verify:* step 10.
10. **Rules tests** — `collab.test.ts` + `collabStorage.test.ts` (see Test plan). *Verify:* `pnpm --filter @siapp/rules-tests test` against emulators.
11. **Collab session + data hooks** — `useCollabSession` (mirror `usePortalSession`: sessionStorage cache keyed on `collab.tid` claims, uniform-error → `invalid` state, `not_started` state, retry) and `useCollabTask` (task doc `onSnapshot`, own-updates query `authorId == colid` ordered `createdAt desc`, own-documents query `visibleToCollaboratorIds array-contains colid && scopeId == tid && deletedAt == null`). *Verify:* hook unit tests with mocked Firebase.
12. **`/t` UI (C1 family)** — rebuild `CollabTaskPage`: portal theme (warm neutrals per D-039), firm-name header from branding snapshot, task title/description/due date/status; `CollabStatusButtons` (state-aware: todo → Start+Need help; in_progress → Mark done+Need help; blocked → banner + Mark done; done → confirmation state); `NeedHelpForm` per C1d (required reason textarea with placeholder example, optional photo attach reusing the uploader, Cancel / Send row, "Your firm gets a WhatsApp with the reason" preview copy); `CollabNotes`; `CollabUploader` (Storage `uploadBytes` → metadata create, progress + failure states); `CollabErrorStates` for C1x ("Message your firm and ask them to resend") / not-started / generic error. Mobile-first: single column, 44px+ touch targets, safe-area insets (`env(safe-area-inset-*)`), forms and buttons per accessibility instructions. *Verify:* component tests + `pnpm --filter @siapp/web build` + `node scripts/check-bundle-isolation.mjs`.
13. **Firm-side affordance** — `CollabLinkButton` next to each collaborator assignee in `TaskDetailPanel` (pattern-match `PortalLinkCard`: disabled + reason when lifecycle isn't published/completed or role can't issue; click → `issueCollabLink` → clipboard copy + rotation warning + expiry display); "Blocked: {reason}" banner in the panel; firm `updateTask` clears `blockedReason` when status leaves `blocked`. *Verify:* component tests.
14. **Docs** — update `pm_ux/plans/firestore-data-model.md` (implemented collab-link note beside the #21 note, `blockedReason`, `collab-uploads/`, own-updates grant). *Verify:* review.
15. **Full verification** — `pnpm turbo build lint typecheck test`, rules tests, bundle-isolation check, manual emulator walk-through: issue → open `/t` → start → note → upload → need-help → firm sees activity/feed/banner → expired & revoked links show C1x → draft project shows not-started.

## Test plan

- **Unit (functions):** `collabUid`/`buildCollabUrl`; issue gate (not-found / not-published / not-assigned / visibility-excluded); redeem blocker (wrong audience, revoked, expired, malformed token, unassigned-since-issuance); `submitCollabUpdate` payload validation (bad status target, empty/oversized reason, oversized note); `deriveTaskActivity` collab-prefix attribution; resolver collaborator-name lookup; unassignment link revocation.
- **Rules tests (emulator):** collab principal **can** get its one task (published), read own updates, create valid document metadata; **cannot** read the task when draft/archived/deleted, when `visibleToCollaboratorIds` excludes it, read sibling tasks / other projects / other workspaces (isolation), read firm-authored updates, write the task or updates directly, read `activity`/`milestones`/`phases`/`magicLinks`, create doc metadata with any un-pinned field (wrong `uploadedBy`, wrong `scopeId`, `visibleToClient` mismatch, wrong path). Storage: >25 MB rejected, disallowed mime rejected, write outside `collab-uploads/` rejected, cross-tenant path rejected. Firm task update rule still accepts/clears `blockedReason`.
- **Component (RTL, apps/web):** `useCollabSession` (redeem success/cache-reuse/invalid/not_started/error+retry); `CollabTaskPage` state rendering incl. C1x copy; `CollabStatusButtons` per-status button matrix + pending/disabled states; `NeedHelpForm` — submit blocked until reason present, cancel restores, confirmation copy visible; `CollabNotes` submit + own-notes render; `CollabUploader` success/progress/failure (B2y-equivalent); `CollabLinkButton` — hidden/disabled by lifecycle+role, calls `issueCollabLink`, copies URL, shows rotation warning. Accessibility assertions: labeled controls, focus management in the need-help flow, status announced via live region.
- **CI invariants:** bundle-isolation script green (no firm/admin modules in apex; `/t` still a dynamic-entry chunk).

## Out of scope

- Embedding collaborator links in outbound WA templates / auto-issuing on assignment or publish (dispatcher-side; the issuer callable is designed to be invoked from the enqueue path later).
- Collaborator soft-delete of own uploads (D-029 grants it; ship as a follow-up — not in the #22 acceptance criteria).
- Collaborator viewing firm-shared documents, the updates thread beyond their own entries, or any multi-task view (E2).
- Inbound WhatsApp processing of any kind (D-035), virus-scan pipeline changes (`scanStatus` stays `pending`-as-is), i18n/BM copy pass, PWA offline support for `/t`.
- Firm-side "manage all collaborator links" screen (issue/rotate happens per task; revocation via unassign or archive).

## Risks / open questions

1. **Collaborator uid claims collide with nothing today, but `collab_{wid}_{tid}_{colid}` approaches Firebase's 128-char uid limit** with three 20-char auto-ids (~70 chars — safe, but verify with real id lengths in the emulator before locking the format).
2. **Own-updates-only read (decision c) means the collaborator never sees firm replies.** If a firm answers a need-help in the task thread, the collaborator won't see it on `/t` — the loop closes via the firm's own WhatsApp instead. Acceptable per D-035 framing, but worth a product confirmation.
3. **Session revocation is soft** (same Q1 posture as the portal): unassignment/rotation blocks re-redemption, and rules re-check lifecycle + `visibleToCollaboratorIds` per read — but an already-signed-in collaborator who remains task-visible keeps access until claims-bearing reads fail. Rules cannot cheaply re-verify `assignees` membership (array-of-maps); mitigation is step 7's revocation + the `visibleToCollaboratorIds` gate. Human call: is that sufficient, or should unassignment also clear `visibleToCollaboratorIds`?
4. **Composite index tuples** for the own-updates and own-documents queries are best confirmed from emulator `failed-precondition` output rather than hand-authored — the plan lists expected shapes, Builder should verify.
5. **`activity` feed gains collaborator-attributed `task_status_changed` entries but no dedicated "note added" activity action** — collaborator notes appear only in the task updates thread (like firm comments, which #23 also chose not to mirror into project activity). If PM wants notes in the project Activity tab, that's a new `TProjectActivityAction` member + trigger work — flag before building.
6. **Need-help photo attach (C1d "optional photo")** is implemented as a normal upload that happens alongside the need-help submission — the photo and the reason are not linked in data (no `storagePath` on the updates entry). If the WA template must include the photo, that's extra work in the dispatcher ticket.

## Approved decisions (auto-approved — user unavailable, recommendations taken)

- D-a: Reuse magicLinks with audience:'collaborator' + scopeType:'task'; new redeemCollabLink callable.
- D-b: submitCollabUpdate callable for status/need-help/notes; uploads direct rules-gated Storage writes.
- D-c: Notes in tasks/{tid}/updates stream, authorType:'collaborator', read-back own entries only.
- D-d: Need-help = status:'blocked' + blockedReason field + reason in updates entry.
- D-e: One active rotating link per (task, collaborator); uid collab_{wid}_{tid}_{colid}.
- D-f: collab-uploads/ path, 25 MB, image/PDF/DOCX; visibleToClient inherited (D-029); visibleToCollaboratorIds:[colid].
- Q1: /t is submit-only at MVP; firm closes need-help loop via WhatsApp.
- Q2: Mirror collaborator actions into project Activity (collaborator_* actions).
