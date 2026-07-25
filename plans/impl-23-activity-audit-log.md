# Implementation plan — #23 Activity log + audit log

## Context

Issue #23 (M3 — Compliance/visibility): per-project **activity timeline** for firms + PDPA-required **workspace audit-log writes**. MVP scope lines (`pm_ux/plans/11-mvp-scope.md`):

- Firm app: "**Activity log** per project (read-only timeline)".
- Admin & ops: "**Audit log** (per workspace)".
- Scope-cut rules: cut #4 is "Activity log UI (keep DB writes; ship UI v1.5)" and the **do-not-cut** list includes "**Audit log writes (PDPA risk)**". The issue mirrors this: activity UI ships now, audit **writes** are non-negotiable, audit **UI** can slip to v1.5.
- PDPA (`pm_ux/plans/14-legal-compliance.md`): data-subject-rights flow needs an "audit trail"; RoPA + breach response assume we can reconstruct who touched what, when.

What already exists and is reused:

- **`workspaces/{wid}/auditLog/{alid}` is fully pre-modelled.** Data model (`pm_ux/plans/firestore-data-model.md` §auditLog), `IAuditLogDoc` + `TActorType` in [packages/shared/src/firestoreTypes.ts](../packages/shared/src/firestoreTypes.ts) (~L478) / [enums.ts](../packages/shared/src/enums.ts), and [firestore.rules](../firestore.rules) (~L580): `read: hasRole(wid, ['owner','admin'])`, `write: false` (server-only). **#23 does not invent this collection — it starts writing to it.**
- **Task-level activity feed exists** (#13): `tasks/{tid}/updates/{updid}` append-only stream (`ITaskUpdateDoc`, `TTaskUpdateAction`), client-writable with author pinned to caller, rendered by `ActivityFeed` inside [TaskDetailPanel.tsx](../apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.tsx) (`useTaskUpdates` in [useTasks.ts](../apps/web/src/surfaces/firm/projects/tasks/useTasks.ts)). #23 must not duplicate its job (comments/@mentions stay task-scoped, D2).
- **Siapp-admin audit precedent** (#10): top-level `/adminLog/{alid}` written via [writeAdminLog.ts](../backend/functions/src/admin/writeAdminLog.ts) from the three admin callables. The workspace audit writer mirrors this shape.
- **All the event sources already exist**: `onTaskWrite`, `onWorkspaceMemberWrite`, `onClientWrite`, `onCollaboratorWrite` triggers + `setProjectLifecycle`, invite callables, `setMemberDepartments`, `updateNotificationSettings`, admin callables ([backend/functions/src/index.ts](../backend/functions/src/index.ts) — header lists "Activity / audit log capture (#23)" as the last remaining stub).
- **Department need-to-know plumbing exists** (#11/#13): `restrictedToDepartments` on tasks/docs, `canSeeRestricted` / `canSeeRestrictedList` rules functions, the multi-query subscription pattern in `useTasks.ts` (one unrestricted query + one `array-contains` query per claim department), and `getRestrictedTaskHeaders` whose contract is explicit: header projection only, "**never** description, assignees, or activity". Activity entries for restricted tasks must honour that.
- **Project detail tab bar** ([ProjectDetailPage.tsx](../apps/web/src/surfaces/firm/projects/ProjectDetailPage.tsx) ~L231): `'tasks' | 'documents' | 'details'`, accessible `role="tablist"` markup. D-033 already names **Activity** as a project-detail tab.
- **D-027 principle 5** (data model §lifecycle): "Activity feed always records events regardless of lifecycle, with a visual 'would have notified' marker on suppressed entries during draft." #18's `enqueueTaskEvent` already computes exactly the suppression outcome the marker needs.
- **D-034**: firm-side activity feed must record `client_document_uploaded` events (client portal upload is #21/#22 territory; #23 lays the entry type + trigger so those events appear for free once client uploads land).

**Base branch**: `feat/23-activity-audit-log` off latest `main`. Committed plan copy: `plans/impl-23-activity-audit-log.md`.

**Surfaces touched**: firm app (`dashboard.siapp.app/{slug}`) + backend functions/rules only. Apex, `/p/*` client, `/t/*` collaborator, and admin bundles untouched — bundle isolation (D-036) unaffected; `scripts/check-bundle-isolation.mjs` must stay green.

## Acceptance criteria mapping

| Criterion | Where it lands |
|---|---|
| Activity log per project (read-only timeline UI) | New server-written `projects/{pid}/activity/{aid}` subcollection (D1) + **Activity** tab on `ProjectDetailPage` (D9), paginated read-only timeline (D8), department-gated (D6) |
| Workspace audit log writes for sensitive actions (do-not-cut) | `lib/auditLog.ts` writer + writes from every sensitive callable and member/client/collaborator trigger (D5); collection + rules already exist |
| Audit UI can slip to v1.5 | Deferred (D5) — rules already allow owner/admin reads, so the v1.5 page is additive |

## Decisions needed — NEED USER APPROVAL

1. **D1 — Project activity = new server-written subcollection `workspaces/{wid}/projects/{pid}/activity/{aid}` (recommended).** Denormalized, append-only, written exclusively by Cloud Functions (Admin SDK). Entry shape (shared type `IProjectActivityDoc`): `{ id, action: TProjectActivityAction, actorType: TActorType, actorId, actorNameDenorm, taskId?, taskTitleDenorm?, docId?, docNameDenorm?, restrictedToDepartments: string[], payload: { from?, to? }, wouldHaveNotified?: boolean, at: Timestamp }`. `restrictedToDepartments` is **copied from the source task/doc at event time** so read rules gate without a `get()` (D6). Rules: `read` for firm members via `canSeeRestrictedList`, `write: false`.
   - **Recommended** because: (i) the timeline needs **project-level** events (lifecycle, project-scoped docs, client link) that have no task parent; (ii) a collection-group query over existing `tasks/{tid}/updates` cannot be departmentgated — its read rule does a parent-task `get()`, which list-query proving can't evaluate; (iii) per-project subcollection keeps tenant isolation trivially inside the existing `projects/{pid}` tree.
   - *Alternative A — derive timeline from `updates` collection-group query*: no project-level events, un-provable list rules, requires a collection-group index + new collection-group rules block. Rejected.
   - *Alternative B — workspace-level `workspaces/{wid}/activity` with `projectId` field*: works, but every query needs a `projectId ==` clause + composite indexes, and per-project purge (retention) becomes a query-delete instead of a subtree delete. Rejected.
   - **Flagged divergence:** the data-model doc has no `activity` subcollection (its "activity stream" is task-scoped `updates`). This plan adds one; `firestore-data-model.md` should be updated in the docs step. Not contradicting any D-0nn decision — D-033 (Activity tab) and D-027 §5 (feed markers) both *assume* a project-level feed exists.

2. **D2 — MVP event set (recommended).** Captured into project activity:
   | Event | `action` | Source |
   |---|---|---|
   | Task created | `task_created` | `onTaskWrite` (no before, has after) |
   | Task status changed | `task_status_changed` (payload from/to; carries `wouldHaveNotified` when the matching #18 message record was lifecycle-suppressed) | `onTaskWrite` diff |
   | Task assignees changed | `task_assigned` / `task_unassigned` | `onTaskWrite` diff |
   | Task due date changed | `task_due_date_changed` | `onTaskWrite` diff |
   | Task deleted | `task_deleted` | `onTaskWrite` (has before, no after) |
   | Document uploaded | `doc_added` (uploaderType 'client' renders as "client uploaded" per D-034) | new `onProjectDocumentWrite` trigger |
   | Document soft-deleted | `doc_deleted` | same trigger, `deletedAt` null→set diff |
   | Project created | `project_created` | new `onProjectWrite` trigger (no before) |
   | Lifecycle transition | `project_published` / `project_completed` / `project_archived` / `project_deleted` / `project_reopened` | `setProjectLifecycle` callable (transaction already has actor + from/to) |
   | Client linked/unlinked | `client_link_changed` | `onProjectWrite` diff on `clientId` |
   - **Not captured** (deliberately): comments/@mentions and eta changes (stay in the task-scoped `updates` feed — the timeline links to the task instead; avoids double-writing every comment), phase CRUD, per-field project edits other than client link (noise), milestone changes (no write path yet).
   - *Alternative — mirror comments into project activity*: doubles write volume for the highest-frequency event and duplicates content the task panel already shows. Rejected.

3. **D3 — Capture mechanism = Firestore triggers (before/after diff) for client-CRUD'd docs + inline writes in callables for callable-owned transitions (recommended).** Tasks/documents/projects are written directly by the web client under rules — only a trigger sees every mutation regardless of writer. Lifecycle, invites, departments, settings are callable-only — the callable writes the audit/activity entry itself (it knows actor, before, after, with no extra reads). **Idempotency:** trigger-written entries use a deterministic doc id derived from the Firestore trigger `event.id` + `create()` so at-least-once delivery can't double-write.
   - *Alternative A — client-side activity writes (like `updates`)*: server writes (provisioning seeds, future portal actions) would be missing, and a hostile client could omit or forge entries — unacceptable for a feed that doubles as evidence. Rejected.
   - *Alternative B — everything via callables*: would require converting task/doc CRUD from rules-validated direct writes to callables — a large regression of the #13/#14 architecture. Rejected.

4. **D4 — Actor attribution = add a rules-pinned `updatedBy` field to task updates (and rely on existing `createdBy` / `uploadedBy` / `deletedBy` for the other paths) (recommended).** Triggers don't know the request auth. Today's docs already attribute create (`tasks.createdBy`, `documents.uploadedBy`) and doc delete (`deletedBy`); the gap is **task updates**. Fix: add `updatedBy` to `validTaskFields` + task `update` rule pinning `request.resource.data.updatedBy == request.auth.uid`; the web writers stamp it alongside `updatedAt`. The trigger copies the correct actor field per event kind and resolves `actorNameDenorm` from `users/{uid}` (one cached read per invocation). Callable-written entries attribute from `request.auth` directly.
   - **Accepted gap:** `task_deleted` (hard delete) — the trigger only sees the before-doc, which has no deleter field. Entry is written with `actorType: 'system'`, `actorId: ''`, rendered as "a team member". Deletion is owner/admin/pm-only and rare; converting task delete to soft-delete or a callable is out of scope (flagged in risks).
   - *Alternative — write activity client-side just for attribution*: reintroduces D3-Alternative-A's forgery problem. Rejected.
   - Scope note: `updatedBy` is **not** added to clients/collaborators/projects in #23 — their audit entries (D5) attribute create via `createdBy`/`invitedBy` and record updates as `actorType: 'system'` at MVP. Additive to tighten later.

5. **D5 — Audit-log scope: every privileged/PII-touching server-mediated action; UI deferred to v1.5 (recommended).** Writes to `workspaces/{wid}/auditLog` via a new `lib/auditLog.ts` (mirrors `writeAdminLog`; `IAuditLogDoc` shape, dot-namespaced `action` strings):
   | Action | Source | Notes |
   |---|---|---|
   | `invite.create` / `invite.accept` / `invite.revoke` / `invite.resend` | invite callables (#11) | actor = caller; accept actor = invitee |
   | `member.departments_change` | `setMemberDepartments` | before/after department ids |
   | `member.role_change` / `member.added` / `member.removed` | `onWorkspaceMemberWrite` diff | member docs are server-written only, so trigger capture is complete; actor = system (the originating callable also logs) |
   | `project.lifecycle_change` (incl. publish/delete) | `setProjectLifecycle` | before/after lifecycle |
   | `settings.notifications_change` | `updateNotificationSettings` | before/after quiet-hours map |
   | `client.create` / `client.update` | `onClientWrite` diff | PII (phone/email) before/after — PDPA data-trail |
   | `collaborator.create` / `collaborator.update` | `onCollaboratorWrite` diff | same |
   | `admin.workspace_adjust` / `admin.impersonate` | admin callables, mirrored per-workspace | see open question Q2 |
   - `ip` / `userAgent` captured where available (`request.rawRequest` in callables); omitted on trigger-sourced entries.
   - **Audit UI ships v1.5** per the issue. Rules already permit owner/admin reads, so the future page is purely additive. No index needed until then (single-field `ts DESC` is automatic).
   - *Alternative — audit only callable actions (skip client/collaborator PII trail)*: cheaper, but the PDPA data-subject-rights flow ("who changed this person's record") is precisely about PII edits. Rejected — writes are the do-not-cut item.

6. **D6 — Activity read access = firm members, with restricted-task entries department-gated via a denormalized `restrictedToDepartments` copy (recommended).** Entries sourced from a restricted task copy the task's restriction list at event time; rules use the existing `canSeeRestrictedList` helper (no `get()`, list-provable). Owner/admin see everything; pm/viewer reuse the `useTasks.ts` multi-query pattern (one `restrictedToDepartments == []` query + one `array-contains` query per claim department, merged client-side). Task titles are denormalized into entries — safe because a restricted entry is unreadable by non-members, satisfying the `getRestrictedTaskHeaders` "never activity" contract. **Note:** the restriction snapshot is point-in-time; re-restricting a task later does not retroactively hide old entries (flagged in risks). Audit log stays owner/admin-only (existing rule, unchanged).
   - *Alternative — redact restricted entries ("Restricted task updated") and leave them member-readable*: leaks event timing/frequency of restricted work and contradicts "never activity". Rejected.

7. **D7 — Retention: none at MVP; no TTL, no cap (recommended).** Audit log is the PDPA evidence trail — deleting it early is the risk, not keeping it. Activity entries live and die with the project subtree (the future retention/hard-purge job deletes `activity/*` along with tasks/docs). Write volume at MVP scale (~60-task projects, single-digit workspaces) is negligible. A reserved `expiresAt` TTL field is documented but not written.
   - *Alternative — Firestore TTL (e.g. 2 years)*: premature; the retention policy is a legal decision not yet made (14-legal-compliance watchlist). Additive later. Rejected for now.

8. **D8 — Timeline UI reads: first page live (`onSnapshot`, `orderBy('at','desc')`, `limit(50)`), older pages one-shot `getDocs` + `startAfter` cursor ("Load more") (recommended).** Unlike `useTaskUpdates` (loads a whole task's feed live), a project timeline is unbounded. Live first page keeps the D-027 draft-mode preview useful while editing; cursor pagination bounds reads. For pm/viewer the per-department queries each carry the same limit and are merged + re-sorted client-side (accepting slightly-uneven page sizes at MVP). Requires composite indexes on `activity`: `restrictedToDepartments ASC (array-contains), at DESC` and the `== []` equality variant — added to [firestore.indexes.json](../firestore.indexes.json).
   - *Alternative — load-everything live like the task feed*: unbounded snapshot growth over an 18-month build. Rejected.

9. **D9 — UI placement: new `activity` tab on `ProjectDetailPage` (tab order: Tasks · Documents · Activity · Details) (recommended).** Matches D-033's tab list ("Timeline, Documents, Activity, Settings" — current code names them tasks/documents/details; #23 only adds Activity, no renames). Component set mirrors the documents section: `activity/ActivitySection.tsx` + `useProjectActivity.ts` + `activityLabels.ts` (icon + human label per action) + tests. Read-only: no composer, no edit/delete affordances. Draft-suppressed entries render the D-027 "would have notified" badge from `wouldHaveNotified`.
   - *Alternative — reuse/extend the TaskDetailPanel ActivityFeed component*: different data source, row shape, and pagination model; forcing one component to serve both couples #13's feed to #23's schema. Rejected — share only the label helpers where trivial.

## Data model & rules changes

Multi-tenant isolation untouched: the new subcollection lives inside `workspaces/{wid}/projects/{pid}`, is only readable via existing claim-based membership checks, and is written exclusively by the Admin SDK.

**New: `workspaces/{wid}/projects/{pid}/activity/{aid}`** (server-written only):

```typescript
{
  id: string,
  action: TProjectActivityAction,        // union per D2 table
  actorType: TActorType,                 // reuse existing enum
  actorId: string,                       // uid / colid / cid / '' (system)
  actorNameDenorm: string,
  taskId?: string,
  taskTitleDenorm?: string,
  docId?: string,
  docNameDenorm?: string,
  restrictedToDepartments: string[],     // copied from source task/doc; [] = unrestricted
  payload: { from?: unknown, to?: unknown },
  wouldHaveNotified?: boolean,           // D-027 §5 draft-preview marker
  at: Timestamp
}
```

**Rules** ([firestore.rules](../firestore.rules)) — inside `match /projects/{pid}`:

```
match /activity/{aid} {
  allow get: if isFirmMember(wid)
    && canSeeRestricted(wid, restrictionsOf(resource.data));
  allow list: if isFirmMember(wid)
    && canSeeRestrictedList(wid, resource.data);
  allow write: if false;   // Admin SDK only
}
```

**Rules — task `updatedBy` (D4)**: add `'updatedBy'` to the `validTaskFields` allowlist; task `create` requires `updatedBy == request.auth.uid` (or absent); task `update` requires `request.resource.data.updatedBy == request.auth.uid`. Existing docs without the field stay valid (create-only validation runs on the new doc).

**`auditLog`**: no schema or rules change — collection, `IAuditLogDoc`, and owner/admin read rule already exist. #23 only adds writers.

**Indexes** ([firestore.indexes.json](../firestore.indexes.json)): `activity` composites for `restrictedToDepartments (CONTAINS) + at DESC` and `restrictedToDepartments ASC + at DESC` (the `== []` equality query), matching the tasks-pattern queries in D8.

## Steps

### 0. Setup
1. Branch `feat/23-activity-audit-log`; commit this plan file.

### 1. Shared types (`packages/shared/src/`)
2. [enums.ts](../packages/shared/src/enums.ts): add `TProjectActivityAction` union (D2 table) and `TAuditAction` union (D5 table — typed union rather than bare `string`; widen `IAuditLogDoc.action` accordingly or keep `string` with the union exported for writers).
3. [firestoreTypes.ts](../packages/shared/src/firestoreTypes.ts): add `IProjectActivityDoc`; add optional `updatedBy?: string` to `ITaskDoc`.
4. Export from `packages/shared/src/index.ts`. Verify `pnpm --filter @siapp/shared build` + typecheck.

### 2. Firestore rules + indexes
5. [firestore.rules](../firestore.rules): add the `activity` match block (D6); extend `validTaskFields` + task create/update pins for `updatedBy` (D4); update the header comment ("#23 adds…").
6. [firestore.indexes.json](../firestore.indexes.json): activity composites (D8).

### 3. Functions — writers (`backend/functions/src/lib/`)
7. New `lib/activityLog.ts`: `writeProjectActivity(wid, pid, entry, deterministicId?)` — `create()` with the id for trigger idempotency (D3); actor-name resolution helper (cached `users/{uid}` read).
8. New `lib/auditLog.ts`: `writeAuditLog(wid, entry)` mirroring [writeAdminLog.ts](../backend/functions/src/admin/writeAdminLog.ts); never throws into callers (log-and-continue, same posture as the #18 enqueue try/catch).
9. New `lib/activityDiff.ts`: pure before/after → activity-event derivation for tasks (`task_created`/`task_status_changed`/`task_assigned`/`task_unassigned`/`task_due_date_changed`/`task_deleted`), documents (`doc_added`/`doc_deleted`), projects (`project_created`/`client_link_changed`), and member/client/collaborator audit diffs. Pure = unit-testable without emulator.

### 4. Functions — wiring (`backend/functions/src/index.ts` + callables)
10. Extend `onTaskWrite`: after existing summary/lastTaskAt/enqueue steps, derive task activity events (step 9) and write them; pass through the #18 suppression outcome to set `wouldHaveNotified`. Same non-fatal error handling as the enqueue block.
11. New `onProjectDocumentWrite` trigger (`.../documents/{did}`): `doc_added` / `doc_deleted` entries (copies the doc's `restrictedToDepartments`; uploaderType 'client' entries attribute `actorType: 'client'` — D-034 forward-compat).
12. New `onProjectWrite` trigger (`.../projects/{pid}`): `project_created`, `client_link_changed`.
13. `setProjectLifecycle`: write `project_*` lifecycle activity entry + `project.lifecycle_change` audit entry after the transaction commits (actor from `request.auth`).
14. Invite callables + `setMemberDepartments` + `updateNotificationSettings`: add audit writes (D5).
15. Extend `onWorkspaceMemberWrite` / `onClientWrite` / `onCollaboratorWrite`: audit writes for member add/remove/role-change and client/collaborator PII create/update.
16. Admin callables: mirror `admin.workspace_adjust` / `admin.impersonate` into the target workspace's `auditLog` — **pending Q2 sign-off**; if declined, skip (adminLog already records them).
17. Update the `index.ts` header comment: #23 no longer a stub.

### 5. Web — task writers stamp `updatedBy`
18. [useTasks.ts](../apps/web/src/surfaces/firm/projects/tasks/useTasks.ts) writers (create/update/status/save paths in `TaskDetailPanel`): include `updatedBy: currentUid` wherever `updatedAt` is stamped.

### 6. Web — Activity tab (`apps/web/src/surfaces/firm/projects/activity/`)
19. `useProjectActivity.ts`: role/department-aware subscription — owner/admin single query; pm/viewer merged unrestricted + per-department queries; first page `onSnapshot` limit 50, `loadMore()` via `getDocs` + `startAfter` (D8).
20. `activityLabels.ts`: action → icon + sentence formatter (e.g. "Alia changed **Piling works** to In progress"), deleted-doc rows strikethrough (decisions-log D-029 consequence), `wouldHaveNotified` badge text.
21. `ActivitySection.tsx`: read-only timeline list — grouped by day, accessible list markup, empty/loading/error states, "Load more" button. Follow accessibility + react-component instructions (function declarations, named exports, co-located tests).
22. [ProjectDetailPage.tsx](../apps/web/src/surfaces/firm/projects/ProjectDetailPage.tsx): widen the tab union to `'tasks' | 'documents' | 'activity' | 'details'`, add the tab button + panel (D9).

### 7. Docs touch-ups (plan-adjacent, no code)
23. `pm_ux/plans/firestore-data-model.md`: add the `activity` subcollection to the workspace tree + doc shape; note the D1 flagged divergence resolution.

## Test plan

**Unit (functions, co-located vitest):**
- `activityDiff.test.ts`: every D2 event derivation — create, each field diff, delete, no-op writes produce no event; document `deletedAt` transition; project `clientId` diff; restriction-list copy-through.
- `activityLog.test.ts` / `auditLog.test.ts`: deterministic-id `create()` idempotency (second write with same id is a no-op); entry shape; writer never throws.
- Callable tests (extend existing e.g. `updateNotificationSettings.test.ts` pattern): each audited callable writes the expected `auditLog` entry with actor + before/after.

**Rules tests (`backend/rules-tests/src/`, new `activity.test.ts` + `tasks.test.ts` additions):**
- `activity`: member can `get`/`list` unrestricted entries; pm/viewer **cannot** list without constraining `restrictedToDepartments`; department member can read matching restricted entries; non-member of the department cannot; owner/admin read everything; **all client writes denied** (create/update/delete).
- `auditLog`: (existing coverage) owner/admin read allowed, pm/viewer denied, writes denied — extend if not already asserted.
- Cross-tenant: member of workspace A cannot read workspace B's `activity` (extend `isolation.test.ts`).
- `tasks`: update without `updatedBy == auth.uid` denied; spoofed `updatedBy` denied; legacy create without the field still allowed per D4 wording chosen.

**Component (web, RTL):**
- `ActivitySection.test.tsx`: renders rows newest-first with human labels; day grouping; empty state; error state; "Load more" appends and preserves order; `wouldHaveNotified` badge renders; restricted entries absent for a pm without the department (hook-level mock).
- `ProjectDetailPage.test.tsx`: Activity tab present, selectable, `aria-selected` correct, panel swaps.
- `useProjectActivity` hook test: owner single-query vs pm multi-query merge + dedupe + sort.

**Smoke (emulator):** create task → change status in draft project → entry appears with `wouldHaveNotified`; publish via callable → `project_published` activity + `project.lifecycle_change` audit entry; upload + soft-delete doc → `doc_added`/`doc_deleted`; invite create/revoke → audit entries; verify `pnpm build`, `lint`, `typecheck`, `test`, and `scripts/check-bundle-isolation.mjs` all green.

## File-by-file change list

| File | Change |
|---|---|
| [packages/shared/src/enums.ts](../packages/shared/src/enums.ts) | Add `TProjectActivityAction`, `TAuditAction` |
| [packages/shared/src/firestoreTypes.ts](../packages/shared/src/firestoreTypes.ts) | Add `IProjectActivityDoc`; `ITaskDoc.updatedBy?` |
| [packages/shared/src/index.ts](../packages/shared/src/index.ts) | Exports |
| [firestore.rules](../firestore.rules) | `activity` match block; `updatedBy` in `validTaskFields` + task pins; header comment |
| [firestore.indexes.json](../firestore.indexes.json) | Two `activity` composites |
| backend/functions/src/lib/activityLog.ts | **New** — activity writer + actor-name resolver |
| backend/functions/src/lib/auditLog.ts | **New** — workspace audit writer |
| backend/functions/src/lib/activityDiff.ts | **New** — pure diff→event derivation (+ test) |
| [backend/functions/src/index.ts](../backend/functions/src/index.ts) | Extend `onTaskWrite`, `onWorkspaceMemberWrite`, `onClientWrite`, `onCollaboratorWrite`; new `onProjectWrite`, `onProjectDocumentWrite`; header comment |
| [backend/functions/src/callables/setProjectLifecycle.ts](../backend/functions/src/callables/setProjectLifecycle.ts) | Activity + audit writes post-transaction |
| backend/functions/src/callables/invites.ts, setMemberDepartments.ts, updateNotificationSettings.ts | Audit writes |
| backend/functions/src/admin/adjustWorkspace.ts, impersonateUser.ts | Workspace-audit mirror (pending Q2) |
| [apps/web/src/surfaces/firm/projects/tasks/useTasks.ts](../apps/web/src/surfaces/firm/projects/tasks/useTasks.ts) | Stamp `updatedBy` in writers |
| apps/web/src/surfaces/firm/projects/activity/ActivitySection.tsx / useProjectActivity.ts / activityLabels.ts (+ tests) | **New** — timeline UI |
| [apps/web/src/surfaces/firm/projects/ProjectDetailPage.tsx](../apps/web/src/surfaces/firm/projects/ProjectDetailPage.tsx) (+ test) | Activity tab |
| backend/rules-tests/src/activity.test.ts | **New**; plus `tasks.test.ts`, `isolation.test.ts` additions |
| pm_ux/plans/firestore-data-model.md | Document `activity` subcollection (docs-only) |

## Out of scope (deliberately)

- **Audit log UI** — v1.5 per the issue; only writes ship.
- Client-portal activity surface (#21/#22) — this plan writes `doc_added` entries with client attribution when those flows land, nothing more.
- Data export of activity/audit (separate MVP line, "Data export (per project)").
- Retention/TTL policy and the hard-purge job (D7 — policy is a legal decision; field reserved).
- `updatedBy` stamping on clients/collaborators/projects (D4 scope note; additive later).
- Comments/@mentions in the project timeline (stay task-scoped, D2).
- Backfill of activity for pre-existing tasks/projects — the timeline starts at deploy time.

## Risks / open questions

- **Q1 (risk): trigger fan-out volume on `onTaskWrite`.** It now does summary + lastTaskAt + notification enqueue + activity. All steps are individually try/caught, but a slow `users/{uid}` name lookup adds latency to every task write. Mitigation: per-invocation memo + tolerate missing names (`'Unknown member'`). No action needed at MVP scale.
- **Q2 (RESOLVED — user approved: YES, mirror).** Siapp-admin actions (plan changes, impersonation) ARE mirrored into the *workspace* audit log where the firm's owner can see them. PDPA transparency: impersonation is access to the firm's personal data.
- **Q3 (risk): point-in-time restriction snapshot (D6).** Restricting a task *after* events occurred doesn't hide earlier entries; un-restricting doesn't reveal old restricted ones. Consistent with how `updates` behaves today (gate follows the *current* parent task) — actually slightly *stricter* in the un-restrict direction and *looser* in the restrict direction. Accept and document, or add a backfill-on-restriction-change trigger later.
- **Q4 (risk): merged multi-query pagination for pm/viewer (D8)** yields uneven page sizes and possible duplicate-fetch across department queries. Deduped by id client-side; acceptable at MVP volumes. Revisit if a workspace exceeds ~5 departments.
- **Q5 (RESOLVED — user decision: make task delete a callable NOW, in this ticket).** Task hard-delete moves behind a new `deleteTask` callable so `task_deleted` activity/audit entries are fully attributed. Scope addition to #23: new callable (auth: firm member with task-edit rights, honoring department restrictions), web `useTasks` delete path switches from direct Firestore delete to the callable, firestore.rules denies client-side task deletes, and the callable writes the activity + audit entries with the acting uid before deleting.
- **Q6 (flagged divergence): data-model doc has no `activity` subcollection** (D1). Docs updated in step 23; no D-0nn decision contradicted.
