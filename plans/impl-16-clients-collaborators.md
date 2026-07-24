# Implementation plan — #16 Client & collaborator management

## Context

Issue #16 (M1 — Firm app core): firms manage the external people notifications go to. Wireframes: **[A6] Clients list** (full phone numbers shown; hover reveals Copy · Call · WhatsApp actions on the phone cell — `pm_ux/plans/22-wireframe-review.md` §13) and **[A7] Collaborators list** (Active/Idle annotation: *Active = task completed in the last 60 days*; §14). Firm nav per the 2026-07-12 wireframe note is `Home · Projects · Clients · Collaborators · Messaging · Settings` — this ticket adds the `Clients` and `Collaborators` entries (Clients is currently a dead `#main` stub in `FirmShell.tsx`).

What already exists:

- **Schema**: `IClientDoc` and `ICollaboratorDoc` are fully declared (packages/shared/src/firestoreTypes.ts:191, :205) including `notificationsOptOut?: boolean` (D-035) and collaborator `status: 'active' | 'archived'`, `lastTaskAt?`. `TTaskAssignee` already has the `{ type: 'collaborator', id, name, phone }` variant (firestoreTypes.ts:308) — task rules (`assignees is list, size <= 20`) accept collaborator entries today.
- **Rules**: `clients/{cid}` and `collaborators/{colid}` are `read: isFirmMember / write: false` (firestore.rules:296–304). **This ticket opens the write path** with typed create/update validators, same style as departments/#12/#13/#14.
- **Functions**: `onClientWrite` / `onCollaboratorWrite` trigger stubs exist with a literal `TODO (#16): update /phoneIndex/{phone}` (backend/functions/src/index.ts:99, :111). `IPhoneIndexDoc` is declared in shared. `computePublishPreview` (setProjectLifecycle.ts:60) counts client + collaborator WA sends but does **not** yet check `notificationsOptOut`.
- **Web patterns to reuse**: `useTeamData.ts` `useCollection` + `TCollectionState<T>` subscription pattern; `useProjects.ts` create/update write shapes; `ProjectForm.tsx` `prefill`/controlled-form pattern; `TaskDetailPanel.tsx` "Assign teammate" `<select>` (assignee chips already render both assignee types); `TeamSettingsPage.tsx` table/list layout. Project update rules **already allowlist `clientId` + `clientNameDenorm`** (firestore.rules:349) and `validProjectFields` requires both as strings — assigning a client to a project is a plain project update; `updateProject` just needs to carry the two fields.
- **Role model**: pm may "create/edit projects, tasks, clients, collaborators" (firestore-data-model.md roles table) → write gate is `hasRole(wid, ['owner','admin','pm'])`. Clients/collaborators are workspace-visible (no department gating — 20-access-control applies to tasks/docs only).

**Base branch**: branch `feat/16-clients-collaborators` off latest `main` (after any open PR for #15 merges). Committed plan copy: `plans/impl-16-clients-collaborators.md`.

## Acceptance criteria mapping

| Criterion | Where it lands |
|---|---|
| Add client: name, phone, email, language preference | `ClientsListPage` + `ClientForm` + `useClients.createClient`; rules `validClientCreate` |
| …assign to project | Client `<select>` in `ProjectForm` (create + edit) writing `clientId`/`clientNameDenorm`; already allowed by project rules |
| Add collaborator | `CollaboratorsListPage` + `CollaboratorForm` + `useCollaborators.createCollaborator`; rules `validCollaboratorCreate` |
| …assign to tasks | "Assign collaborator" `<select>` in `TaskDetailPanel` (active collaborators), pushing `{ type: 'collaborator', id, name, phone }` into `assignees` — no rules change needed |
| `notificationsOptOut` respected everywhere (D-035) | Field is **server-only** (absent from every client-write allowlist); read-only "Notifications off" badge on A6/A7 rows and in pickers; `computePublishPreview` excludes opted-out client + collaborators from `waCount` (the only send-counting code that exists today; the actual send pipeline is #19) |
| Screens per wireframes A6/A7 | Two new routed pages under `dashboard.siapp.app/{slug}/clients` and `/{slug}/collaborators`; nav links in `FirmShell` |

## Scope decisions — NEED USER APPROVAL

1. **Client-side rules-validated CRUD, no callable** (recommended). Same convention as projects/tasks/documents: owner/admin/pm write directly; rules fail closed with key allowlists + typed validators. Alternative rejected: a callable adds latency and a function for no privileged behaviour — nothing here needs the Admin SDK except the phoneIndex sync, which is already a trigger.
2. **`notificationsOptOut` is server-only — firm staff cannot set OR clear it from the UI** (recommended). D-035 says the flag is "set by STOP keyword on inbound webhook"; letting a firm un-opt-out a contact who texted STOP is a compliance hole (14-legal-compliance). Rules: the key is absent from create/update allowlists, so any client write carrying it is denied. UI shows a read-only "Notifications off" badge. Alternative (firm can toggle it, e.g. for a client who asks verbally to resubscribe) is a legitimate future need — if you want it, it should be a logged callable, not a raw field write. Flag if you want that now.
3. **No hard delete for clients or collaborators** (recommended). Deleting a client orphans `project.clientId` denorms; deleting a collaborator orphans task `assignees` entries and `phoneIndex` refs. Collaborators archive via `status: 'archived'` (already in the schema, satisfies A7). Clients have **no archive field in the data model** — at MVP they are edit-only; a `status`/archive field for clients is a schema addition deferred unless you want it now (would need a data-model doc update + D-log note).
4. **Client→project link is a plain project update with client-side denorm, no rules `get()` referential check** (recommended). `validProjectFields` gains only: `clientId` and `clientNameDenorm` are **either both empty or both non-empty** (today `clientNameDenorm` can be any string). No `exists()` check that `clientId` points at a real client doc — matches the `phaseId` precedent (plain string, no get) and keeps every project write from paying an extra read. A stale/fabricated `clientId` only mislabels the firm's own project inside its own workspace — no cross-tenant risk.
5. **Opted-out collaborators remain assignable to tasks** (recommended). Opt-out suppresses *sends* (D-035), not work assignment — the collaborator can still be reached by the firm directly and could re-subscribe later. The picker shows the "Notifications off" badge next to their name so the firm knows no WA will go out. Alternative (block assignment) conflates messaging consent with task tracking.
6. **A7 Active/Idle derived from `lastTaskAt` with a fixed 60-day threshold; `onTaskWrite` stamps `lastTaskAt`** (recommended, smallest server change). When a task transitions to `done`, the existing `onTaskWrite` trigger (projectSummary) additionally updates `lastTaskAt = now` on each collaborator assignee's doc (Admin SDK — the field is not client-writable). The web derives `Active` = `lastTaskAt` within 60 days, else `Idle`. The wireframe's "threshold configurable in Settings → Team" is **out of scope** (hardcode 60, named constant in `@siapp/shared`). Alternative (defer stamping entirely): the A7 column reads "Idle" forever until #19 — acceptable but hollow; the stamp is ~15 lines.
7. **Implement the `phoneIndex` sync now** (recommended — the TODO in `index.ts` is literally tagged `#16`). `syncPhoneIndex(type, wid, refId, before, after)` in `backend/functions/src/lib/phoneIndex.ts`: transaction that removes the ref from the old phone's doc (deleting the doc when `refs` empties) and adds it to the new phone's doc, per the data-model shape. Runs on create and phone-change (delete handling written but unreachable while decision 3 holds). Alternative (defer to the messaging ticket) leaves a tagged TODO rotting and makes #19 bigger.
8. **Publish preview respects opt-out** (recommended — this is what "respected everywhere" can mean before the send pipeline exists). `computePublishPreview` fetches the linked client doc and the assigned collaborators' docs and excludes any with `notificationsOptOut == true` from `waCount`. Slightly more reads on a dry-run only. The real send-suppression check lands with the outbound pipeline (#19) — noted there.
9. **Phone format: E.164 enforced in rules, normalized client-side** (recommended). Rules: `d.phone.matches('\\+[1-9][0-9]{6,14}')` on both create validators (phoneIndex keys on E.164; garbage phones would poison it). Web: a small pure `normalizePhone` helper (strip spaces/dashes; `01…` → `+601…` Malaysian default) in the clients module, unit-tested. No libphonenumber dependency at MVP.
10. **Lists subscribe to the whole collection, filter/sort client-side** (recommended). Matches `useProjects`; MVP volumes are small; avoids a `status`+`name` composite index. `firestore.indexes.json` untouched.

## Data model & rules changes

- **No new fields or collections** — `IClientDoc`, `ICollaboratorDoc`, `IPhoneIndexDoc` all exist. One new shared constant: `COLLABORATOR_ACTIVE_WINDOW_DAYS = 60` (decision 6).
- **firestore.rules**:
  - `validClientCreate(cid)`: keys `hasOnly(['id','name','phone','email','companyName','language','notes','createdAt','createdBy'])`; `id == cid`; `name` string 1–120; `phone` matches E.164 regex; optional `email`/`companyName`/`notes` strings (`notes` ≤ 2000); `language in ['en','ms']`; `createdAt is timestamp`; `createdBy == request.auth.uid`. **`notificationsOptOut` deliberately absent** (decision 2).
  - `clients/{cid}`: `create` for owner/admin/pm with `validClientCreate`; `update` for owner/admin/pm re-validating the client-editable shape with diff `affectedKeys().hasOnly(['name','phone','email','companyName','language','notes'])` (id/createdAt/createdBy/notificationsOptOut immutable from the client); `delete: false` (decision 3).
  - `validCollaboratorCreate(colid)`: keys `hasOnly(['id','name','phone','email','company','trade','type','status','createdAt','invitedBy'])`; `id == colid`; `name` 1–120; `phone` E.164; optional `email`/`company`/`trade` strings; `type in ['individual','company']`; `status == 'active'` on create; `createdAt is timestamp`; `invitedBy == request.auth.uid`. **`notificationsOptOut` and `lastTaskAt` deliberately absent** (server-only).
  - `collaborators/{colid}`: `create` for owner/admin/pm; `update` for owner/admin/pm with diff `affectedKeys().hasOnly(['name','phone','email','company','trade','type','status'])` and `status in ['active','archived']`; `delete: false`.
  - `validProjectFields()`: tighten to `(d.clientId == '' && d.clientNameDenorm == '') || (d.clientId.size() > 0 && d.clientNameDenorm.size() > 0)` (decision 4). Verify the starter-project seeds and `createProject` (both write `''`/`''`) still pass.
  - Header comment block gains a `#16` line.
- **Multi-tenant isolation unchanged**: both collections stay under `/workspaces/{wid}` behind `isFirmMember`/`hasRole`; `phoneIndex` stays `read, write: false` for clients (Admin SDK only).

## Steps

### 0. Setup
- Branch `feat/16-clients-collaborators` off up-to-date `main`. Commit this plan file.

### 1. Shared (`packages/shared/src`)
- `constants.ts`: add `COLLABORATOR_ACTIVE_WINDOW_DAYS = 60` (decision 6). Verify `IClientDoc`/`ICollaboratorDoc`/`IPhoneIndexDoc` need no edits (expected: none).

### 2. Rules (`firestore.rules`)
- Add the two validators + open create/update per "Data model & rules changes". Tighten `validProjectFields` clientId/denorm pairing.

### 3. Rules tests (`backend/rules-tests/src/clients-collaborators.test.ts` — new; `projects.test.ts` — extend)
Conventions from existing files (`createTestEnv`/`seedWorkspace`/`memberClaims`, valid-doc factories):
- client create: allow owner/admin/pm; deny viewer + non-member (cross-workspace claims) + unauthenticated.
- client create deny cases: extra key; `notificationsOptOut: true` in payload; bad phone (`'0123'`, missing `+`); `language: 'fr'`; `createdBy` ≠ caller; `id` ≠ doc id.
- client update: allow field edit; deny diff touching `createdBy`/`createdAt`/`notificationsOptOut`; deny delete (all roles).
- collaborator create: allow with `status:'active'`; deny `status:'archived'` on create, `lastTaskAt` in payload, `notificationsOptOut` in payload, `invitedBy` ≠ caller, bad `type`.
- collaborator update: allow archive (`status → 'archived'`); deny diff touching `invitedBy`/`createdAt`/`lastTaskAt`/`notificationsOptOut`; deny delete.
- reads: member of another workspace cannot read/list either collection (isolation).
- projects.test.ts: update with `clientId:'c1', clientNameDenorm:'Acme'` → allow; `clientId:'c1', clientNameDenorm:''` → deny; both `''` → allow (regression).

### 4. Functions (`backend/functions/src`)
- `lib/phoneIndex.ts` (new): `syncPhoneIndex({ workspaceId, type, refId, beforePhone, afterPhone })` — transaction: pull ref out of `phoneIndex/{beforePhone}.refs` (delete doc if empty), arrayUnion-style add `{ workspaceId, type, refId, addedAt }` to `phoneIndex/{afterPhone}`, set `updatedAt`. No-op when phones equal and ref present. Pure ref-list transform (`applyRefChange(refs, …)`) split out for unit tests (same pattern as `restrictedTasks.ts`).
- `index.ts`: flesh out `onClientWrite`/`onCollaboratorWrite` to call `syncPhoneIndex` (replacing the `TODO (#16)` bodies).
- `triggers/projectSummary.ts` (or `onTaskWrite` in `index.ts`, whichever is cleaner): on task status transition to `done`, stamp `lastTaskAt` on each `{ type: 'collaborator' }` assignee doc (decision 6). Keep it idempotent and tolerant of missing collaborator docs.
- `callables/setProjectLifecycle.ts`: `computePublishPreview` fetches linked client + assigned collaborator docs; excludes `notificationsOptOut === true` from `waCount` (decision 8). Extend `projectLifecycle.test.ts`/preview tests accordingly.

### 5. Web data layer (`apps/web/src/surfaces/firm/clients/useClients.ts`, `collaborators/useCollaborators.ts` — new)
- Follow `useTeamData.ts`: `IClientRow` / `ICollaboratorRow` mapped defensively (like `mapProject`), `TCollectionState<T>` states, whole-collection `onSnapshot` (decision 10), rows sorted by name client-side.
- Writes: `createClient(workspaceId, values, uid)` / `updateClient(…)` matching the rules shape exactly (optional keys omitted when empty, like `createProject` does with `code`); `createCollaborator(…, uid)` with `status:'active'`; `updateCollaborator(…)`; `setCollaboratorStatus(…, 'archived' | 'active')`.
- `clients/normalizePhone.ts` (new, pure): normalization per decision 9 + validity predicate; used by both forms.

### 6. Web UI
- `clients/ClientsListPage.tsx` + `ClientForm.tsx` (new): A6 — table of name / company / phone (full, with Copy · Call (`tel:`) · WhatsApp (`wa.me`) actions on the phone cell — buttons with `aria-label`s; always reachable by keyboard, not hover-only) / language / "Notifications off" badge when opted out. "Add client" opens the form card (name*, phone*, email, company, language en/ms, notes); pm/admin/owner only (viewer read-only, same gating pattern as `ProjectsListPage`). Edit via row action reusing the form.
- `collaborators/CollaboratorsListPage.tsx` + `CollaboratorForm.tsx` (new): A7 — table of name / trade / company / phone (same actions) / type / **Active·Idle chip** (from `lastTaskAt` vs `COLLABORATOR_ACTIVE_WINDOW_DAYS`; distinct chip style from lifecycle badges per the wireframe taxonomy note) / opt-out badge; Archive/Unarchive row action; archived rows filtered behind a toggle. Add form: name*, phone*, email, company, trade, type.
- `FirmShell.tsx`: replace the `Clients` `#main` stub with `<Link to={`/${slug}/clients`}>`; add `Collaborators` link; add the two `<Route>`s passing `workspaceId`/`role` (+ `uid` where needed).
- `projects/ProjectForm.tsx` + `useProjects.ts`: add a client `<select>` (fed by `useClients`; options = client names; empty option "No client"). `IProjectFormValues` gains `clientId`/`clientName`; `createProject`/`updateProject` write `clientId` + `clientNameDenorm` (denorm resolved from the selected row at submit). Opted-out clients selectable but suffixed "(notifications off)" (decision 5 rationale applies).
- `projects/tasks/TaskDetailPanel.tsx`: alongside "Assign teammate", add "Assign collaborator" `<select>` over **active** collaborators not already assigned, pushing `{ type:'collaborator', id, name, phone }`. Existing chips/removal/`assigned` activity entry already handle both types. `TasksSection`/`ProjectDetailPage` thread the collaborators rows (or the panel subscribes itself via `useCollaborators` — prefer threading props to match how `members` reaches the panel today).

### 7. Web tests (wholesale data-layer mock, `vi.hoisted` + `vi.mock`, per existing page tests)
- `normalizePhone.test.ts` (pure): MY local → E.164, already-E.164 passthrough, junk rejected.
- `ClientsListPage.test.tsx`: rows render with full phone + action links (accessible names); add-client submit calls `createClient` with normalized phone; viewer sees no Add button; opt-out badge renders.
- `CollaboratorsListPage.test.tsx`: Active vs Idle chip derivation (fresh vs stale vs missing `lastTaskAt`); archive action calls `setCollaboratorStatus`; archived hidden by default.
- `ProjectForm` (extend existing tests): client select renders options, submit carries `clientId` + denorm name; "No client" → `''`/`''`.
- `TaskDetailPanel.test.tsx` (extend): collaborator select lists only active unassigned collaborators; selection adds a collaborator-type chip; save writes the assignee entry.
- Functions unit tests: `phoneIndex.test.ts` (ref-list transform: add, move phone, remove-last-deletes-doc) and publish-preview opt-out exclusion.

### 8. Verify
- `pnpm turbo typecheck lint test build`; root `pnpm test:rules`; `node scripts/check-bundle-isolation.mjs` (firm surface only — /p/, /t/, admin untouched).
- Emulator smoke (`--project siapp-prod`): create client → appears in list + `phoneIndex/{phone}` doc gains the ref (trigger); assign client to a project → project card shows the name; create collaborator, assign to a `sendWhatsapp` task, publish dry-run → `waCount` = 2 (client + collaborator); set `notificationsOptOut: true` on the client via emulator UI (server-side) → badge appears, dry-run `waCount` drops to 1, and a firm-side update attempting to clear the flag is denied; mark the task done → collaborator flips to Active; REST negatives: client create with `notificationsOptOut` → PERMISSION_DENIED, collaborator delete → PERMISSION_DENIED.
- Flag explicitly: UI not browser-verified unless a browser is available.

### 9. Ship
- Conventional commits, push, PR against `main` per `.github/pull_request_template.md`. Surfaces: firm app + rules + functions. PR body calls out decisions 2, 3, 6 and the D-035 scope note (real send suppression lands with #19).

## Critical files
- `firestore.rules` (clients/collaborators matches ~line 296; `validProjectFields`)
- `backend/rules-tests/src/clients-collaborators.test.ts` (new), `projects.test.ts` (extend)
- `backend/functions/src/lib/phoneIndex.ts` + test (new); `index.ts` (trigger bodies); `triggers/projectSummary.ts`; `callables/setProjectLifecycle.ts` + tests
- `packages/shared/src/constants.ts`
- `apps/web/src/surfaces/firm/clients/` and `collaborators/` (new modules + tests)
- `apps/web/src/surfaces/firm/FirmShell.tsx`, `projects/ProjectForm.tsx`, `projects/useProjects.ts`, `projects/tasks/TaskDetailPanel.tsx` (+ their tests)
- `plans/impl-16-clients-collaborators.md` (this plan, committed)

## Out of scope (follow-ups)
The outbound WA/SMS send pipeline and actual STOP-webhook opt-out writes (#19 — the webhook *sets* the flag; this ticket only makes everyone downstream respect it); magic-link issuance for clients/collaborators (`magicLinks`, /p and /t surfaces); client archive/status field (schema addition — decision 3); un-opt-out flow for firms (logged callable — decision 2); configurable Active/Idle threshold in Settings → Team; `visibleToCollaboratorIds` management UI; Messaging nav entry (rest of the wireframe nav); collaborator "frequently used" sorting; import/bulk add; composite indexes (decision 10); hard deletes and orphan-cleanup of assignee/denorm references.

## Risks / open questions
- **Decision 2** (opt-out not clearable by firms) needs an explicit call — it's the strictest reading of D-035 and a firm *will* eventually ask to resubscribe someone.
- **Decision 3** (no client delete/archive) means a mistyped client lives forever in the picker at MVP; cheap to add an archive field later but it's a schema/doc change.
- **Decision 6** writes to collaborator docs from `onTaskWrite` — a task-done burst (e.g. duplicate-then-complete flows) fans out writes; bounded by ≤ 20 assignees/task, fine at MVP volume.
- `phoneIndex` transaction contention is negligible at MVP (one firm editing one contact), but the transform is unit-tested anyway.
- A6's hover-revealed phone actions must stay keyboard-reachable (accessibility instructions) — plan renders them as always-focusable buttons, visually emphasized on hover.
