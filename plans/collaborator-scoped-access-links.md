---
title: "Collaborator-scoped access links (one link → all my tasks)"
status: approved
issue: 127
updated: 2026-08-25
---

# Implementation Plan — Collaborator-scoped access links

> GitHub issue: **Siapp-Development/siapp#127**. Branch `feat/127-collaborator-scoped-links`.
> Supersedes the task-scoped magic link introduced in [impl-22-collaborator-task-page.md](./impl-22-collaborator-task-page.md).
> Design inspiration: the "My Assigned Tasks" switcher wireframe (task picker at the top, existing task-detail surface below).
> **Anchors validated against live code 2026-08-25** — see "Validated anchors" below.

## Goal

Move the collaborator link from **one link per (task, collaborator)** to **one durable link per collaborator**, scoped to that collaborator within a firm/workspace. When the collaborator opens their single `siapp.app/t/{token}` link they see **every task assigned to them across all projects** in that workspace (subject to the same per-task visibility + project-lifecycle gates already enforced today), pick one from a switcher, and act on it using the **existing** task-detail surface (status buttons, need-help, notes, uploads).

The firm gets and shares **one link per collaborator**, surfaced where collaborators are managed — not buried on each task row.

### Non-goals / boundaries

- **Cross-firm is still multi-link.** A `collaborator` doc lives under one `workspaces/{wid}` ([`ICollaboratorDoc`](../packages/shared/src/firestoreTypes.ts) L333). The same human engaged by two firms is two collaborator records → two links. This plan scopes a link to **(workspace, collaborator)**.
- No change to what a collaborator can *do* on a task (status / need-help / notes / uploads) — only to how many tasks one link exposes and how they navigate between them.
- No change to firm-side task assignment UX.

---

## Validated anchors (live code, 2026-08-25)

| Area | Symbol / path | Confirmed location | Notes / drift corrected |
|---|---|---|---|
| Issue callable | `issueCollabLink` | [issueCollabLink.ts](../backend/functions/src/callables/issueCollabLink.ts) handler L142 | scopeType `'task'`, one active per (task,collaborator). To be **deleted**, replaced by `issueCollaboratorLink`. |
| Redeem callable | `redeemCollabLink` | [redeemCollabLink.ts](../backend/functions/src/callables/redeemCollabLink.ts) handler L66; `collabUid(wid,taskId,colid)` L147; claims `{wid,pid,tid,colid,linkId}` L149–155 | Returns a single pinned-task snapshot L165–191 (to be dropped). |
| Update callable | `submitCollabUpdate` | **[submitCollabUpdate.ts](../backend/functions/src/callables/submitCollabUpdate.ts)** handler L98; `collabClaimsOf` L72–96 returns `{wid,pid,tid,colid}`; task ref built from claims `pid/tid` L111; actor `collabUid(wid,tid,colid)` L131 | Derives task **from claims, not payload** — must become task-parameterized. |
| Principal uid | `collabUid` / `parseCollabUid` | [portalTokens.ts](../backend/functions/src/lib/portalTokens.ts) L100 / L108 | Both keyed by `tid`. Consumers: `redeemCollabLink.ts:147`, `submitCollabUpdate.ts:131` (collabUid), **[activityDiff.ts](../backend/functions/src/lib/activityDiff.ts) L181** (parseCollabUid → activity attribution; import L61). Plan had not named `activityDiff.ts`. |
| Link hygiene | `removedCollaboratorIds` / `revokeCollabLinksForTask` | [collabLinks.ts](../backend/functions/src/lib/collabLinks.ts) L36 / L46; wired in [index.ts](../backend/functions/src/index.ts) `onTaskWrite` L166–177 | Whole module + wiring to be removed. |
| Triggers | `onTaskWrite` / `onProjectWrite` | [index.ts](../backend/functions/src/index.ts) L143 / L275 | `onProjectWrite` today only emits `project_created` + client link activity and "deliberately ignores lifecycle/summary-only writes" (L271) — extending it to refresh mirror `lifecycle`/`projectName` is a real addition. |
| Shared types | `ITaskDoc` L488, `TTaskAssignee` L466 (user L452 / collab L459), `ICollaboratorDoc` L333, `ICollabClaims` L95–103, `IMagicLinkDoc` L359 (`projectId?` L380) | [firestoreTypes.ts](../packages/shared/src/firestoreTypes.ts) | `assignees` is an **object array** — Firestore/rules cannot query/iterate it (drives the new string-array field). |
| Constants | `COLLAB_LINK_TTL_DAYS = 90` L133, `PORTAL_LINK_TTL_DAYS = 90` L126 | [constants.ts](../packages/shared/src/constants.ts) | Mirrored as `COLLAB_LINK_TTL_MS` in portalTokens.ts L92. |
| Rules helpers | `isCollabProject` L134, `isCollabPrincipal` L141, `collabCanSeeTask` L150, `collabCanSeeAllTaskAttachments` L157, `projectLive` L166 | [firestore.rules](../firestore.rules) | `isCollabPrincipal` pins `claim.tid == tid`. |
| Rules sites to rewrite | tasks `get` L846–853 (uses `isCollabPrincipal` L851); `updates` read L882–894 (L891); `documents` `get` L927–944 / `list` L945–961 (pin `scopeId == claim.tid` L939/L956); `validCollabDocumentCreate` **L409** (reads task at `claim.tid` L411, forces `scopeId == claim.tid` L435) | [firestore.rules](../firestore.rules) | `magicLinks` server-only L1024–1026 (no change). `collaborators/{colid}` read is **firm-only** L711 — no collab read rule exists yet (add `assignedTasks` read). |
| Storage rules | `collab-uploads` path | [storage.rules](../storage.rules) L141 gated on `collab.wid`/`collab.pid` only (no `tid`) | Already project-scoped → **no storage-rules change needed**. |
| Indexes | `documents` composite L36–44 (`visibleToCollaboratorIds` CONTAINS + `deletedAt` + `scopeId`); `updates` composite L27–35; `magicLinks` = `shortCode` field-override only | [firestore.indexes.json](../firestore.indexes.json) | **No magicLinks composite to drop** (single-field where-clauses are auto-indexed). Add one `assignedTasks` composite. |
| Collab surface | `ICollabSession` (has `taskId`) [useCollabSession.ts](../apps/web/src/surfaces/collab/useCollabSession.ts) L19–33; redeem inline L131; `CollabTaskPage` L48, `CollabTaskView` L73–86 [CollabTaskPage.tsx](../apps/web/src/surfaces/collab/CollabTaskPage.tsx); hooks `useCollabTask` L70, `useCollabUpdates` L117, `useCollabDocuments` L180, `uploadCollabDocument` L239 [useCollabTask.ts](../apps/web/src/surfaces/collab/useCollabTask.ts) | Session = single pinned task today. |
| Firm — collaborators | [CollaboratorsListPage.tsx](../apps/web/src/surfaces/firm/collaborators/CollaboratorsListPage.tsx): card grid, `CollaboratorCard` L95–202, **inline icon-button** action cluster L120–165 (**no overflow/kebab menu exists** — plan drift corrected); mutations via [useCollaborators.ts](../apps/web/src/surfaces/firm/collaborators/useCollaborators.ts) (`createCollaborator`/`updateCollaborator`/`setCollaboratorStatus`). [CollaboratorForm.tsx](../apps/web/src/surfaces/firm/collaborators/CollaboratorForm.tsx) L33 (no callables; parent `onSubmit`). |
| Firm — task panel | "Collaborator task links" section **L476–495** (renders `CollabLinkButton` L483–492); removable assignee pill `<ul>/<li>` **L628–653** (the `<li>` at L633, remove `×` button L638) [TaskDetailPanel.tsx](../apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.tsx) | Plan previously cited L495–514 / L652 — corrected. |
| Firm — link button | [CollabLinkButton.tsx](../apps/web/src/surfaces/firm/projects/tasks/CollabLinkButton.tsx) (full file, ~113 lines) → to be **deleted**. Web binding `issueCollabLink` [callables.ts](../apps/web/src/lib/callables.ts) L132–140; `submitCollabUpdate` L143–149. |
| Firm — task writes | [useTasks.ts](../apps/web/src/surfaces/firm/projects/tasks/useTasks.ts) `createTask` L440–472 (`assignees` L457, `visibleToCollaboratorIds: []` L460); `updateTask` L474–507 (`assignees` L496). No duplicate-write path here. |
| Duplicate project | [duplicateProject.ts](../apps/web/src/surfaces/firm/projects/duplicateProject.ts) `IDuplicateTaskDoc` L82–97; `buildDuplicatePlan` sets `assignees: []` L130; batch `set` writes it L234–250 | Duplicated tasks **strip** assignees → new `assigneeCollaboratorIds` is trivially `[]` here. |
| Messaging (WA/SMS) | **Stub only.** `NoopProvider` [provider.ts](../backend/functions/src/lib/messaging/provider.ts) L30–34; no `twilio` dep; **no #19 dispatcher**; only `messages` consumer is `onMessageCreated`→usage counting [index.ts](../backend/functions/src/index.ts) L392–400. `enqueueNotifications` recipients are **client + member only** (no collaborator path). `TNotificationTrigger` [enums.ts](../packages/shared/src/enums.ts) L111–122 has **no** access-link trigger; `ITaskAssignedVars` [notificationTypes.ts](../packages/shared/src/notificationTypes.ts) L26–33 is task-scoped. | See Q-WA resolution — delivery is not possible in-repo today. |

---

## Current state (what we are replacing)

| Concern | Today | File |
|---|---|---|
| Link scope | `{ audience:'collaborator', scopeType:'task', scopeId: tid, subjectId: colid }`, one active per (task, collaborator), rotates on reissue | [issueCollabLink.ts](../backend/functions/src/callables/issueCollabLink.ts) |
| Principal uid | `collab_{wid}_{tid}_{colid}` | [portalTokens.ts](../backend/functions/src/lib/portalTokens.ts) `collabUid()` L100 |
| Custom claims | `collab: { wid, pid, tid, colid, linkId }` — pins ONE task | [redeemCollabLink.ts](../backend/functions/src/callables/redeemCollabLink.ts) L149 |
| Rules gate | `isCollabPrincipal(wid,pid,tid)` matches `claim.tid == tid` | [firestore.rules](../firestore.rules) L141 |
| Surface | Renders a single "pinned task" from the redeem snapshot | [CollabTaskPage.tsx](../apps/web/src/surfaces/collab/CollabTaskPage.tsx) |
| Firm-side share | Per-task "Copy task link for {name}" on the assignee row | [CollabLinkButton.tsx](../apps/web/src/surfaces/firm/projects/tasks/CollabLinkButton.tsx) |
| Unassign hygiene | `onTaskWrite` soft-revokes that collaborator's task links | [index.ts](../backend/functions/src/index.ts) L166, [collabLinks.ts](../backend/functions/src/lib/collabLinks.ts) |

**Hard constraint (confirmed):** `tasks.assignees` is an array of **objects** (`{type,id,name,phone}`, [`TTaskAssignee`](../packages/shared/src/firestoreTypes.ts) L466). Firestore cannot `array-contains` a partial object, and Security Rules cannot iterate object arrays. So a cross-project "my tasks" list needs a **denormalized, queryable, string-array field** of collaborator ids. That field does double duty: it powers both the client query (via the mirror) and the rules gate.

---

## DECISIONS

### (a) Link scope — **A1: workspace-collaborator**
Store `{ audience:'collaborator', scopeType:'collaborator', scopeId: colid, subjectId: colid }` in `workspaces/{wid}/magicLinks`. `projectId`/`taskId` drop out of the link doc. One active link per collaborator; reuses `magicLinks` + the `shortCode` field-override index.

### (b) Claims & principal uid
- New claims: **`collab: { wid, colid, linkId }`** (drop `pid`, `tid`). Update `ICollabClaims` (firestoreTypes.ts L95–103).
- New deterministic uid: **`collab_{wid}_{colid}`** — one auth principal per collaborator. Update `collabUid()` / `parseCollabUid()` (portalTokens.ts L100/L108) and consumers `redeemCollabLink.ts:147`, `submitCollabUpdate.ts:131`, `activityDiff.ts:181`.
- **Migration:** existing `scopeType:'task'` links become un-redeemable → `invalid_or_expired` (uniform failure). Firms re-share once. Acceptable pre-launch.

### (c) Cross-project task list — **C1: per-collaborator mirror subcollection**
`workspaces/{wid}/collaborators/{colid}/assignedTasks/{pid}_{tid}`, fanned out by `onTaskWrite`. Mirror doc snapshot: `{ projectId, taskId, title, status, dueDate, projectName, lifecycle, visibleToThisCollaborator, updatedAt }`. Rules: collab principal reads only their own `assignedTasks` where `colid == claim.colid`. Precedent: `recomputeProjectSummary`.

### (d) New queryable field on tasks
Add `assigneeCollaboratorIds: string[]` to [`ITaskDoc`](../packages/shared/src/firestoreTypes.ts) — the string projection of collaborator-type assignees. Maintained on `createTask`/`updateTask` (useTasks.ts) and `duplicateProject.ts` (always `[]` there). Rules gate uses `resource.data.get('assigneeCollaboratorIds', []).hasAny([claim.colid])`. Backfill existing tasks (scripts/).
> **Trust boundary (R3):** rules cannot validate `assigneeCollaboratorIds` against the object array `assignees` (same object-array limitation). Only firm roles (owner/admin/pm/staff with task write) can write tasks, so an inconsistent value can only affect that firm's own collaborators. Accepted; documented, not gated.

### (e) Rules rewrite — from task-pin to assignee-membership
- `isCollabPrincipal(wid,pid,tid)` → **`isCollabAssignee(wid,pid)`** = `isCollabWorkspace(wid) && projectLive(wid,pid) && resource.data.get('assigneeCollaboratorIds', []).hasAny([claim.colid]) && collabCanSeeTask(resource.data)`.
- `isCollabWorkspace(wid)` = signed in && `claim.collab.wid == wid` (drop pid/tid).
- `updates`/`documents` reads that pin `claim.tid`/`scopeId` must `get()` the parent task and check membership + visibility (reuse `collabCanSeeTask` / `collabCanSeeAllTaskAttachments`). The `documents` `get`/`list` predicate `scopeId == claim.tid` → `get(task at scopeId).assigneeCollaboratorIds.hasAny([claim.colid])`.
- `validCollabDocumentCreate` (L409): today reads the task at `claim.tid` and forces `scopeId == claim.tid`. Rewrite to read the task at the **submitted** `scopeId` and validate `get(task).assigneeCollaboratorIds.hasAny([claim.colid])` + visibility. (Storage path is unchanged / project-scoped.)
- **New:** allow the collab principal to read its own `collaborators/{colid}/assignedTasks/*` when `colid == claim.colid`; deny writes (server-only fan-out).

### (f) `submitCollabUpdate` becomes task-parameterized
Change payload to carry `{ projectId, taskId, update }`; the callable validates `claim.colid` is in that task's `assigneeCollaboratorIds` + visible + project live, then writes as today. Uploads pass `{ projectId, taskId }` (uploadCollabDocument already takes them; only the claims-derivation assumption changes).

### (g) Firm-side issuance & distribution
Replace per-task `issueCollabLink` with **`issueCollaboratorLink({ workspaceId, collaboratorId, reset? })`** (scopeType `collaborator`, one active per collaborator, revoke-on-reissue, `collab_link.issue` / `.reset` audit; role owner/admin/pm). Surfaces:
1. **Collaborators page (primary).** "Copy access link" + "Reset link" on each `CollaboratorCard` action cluster (CollaboratorsListPage.tsx L120–165). **There is no existing overflow menu** — add inline icon buttons alongside Edit/Archive (do **not** assume a kebab). Gated owner/admin/pm.
2. **Send via WhatsApp** — see Q-WA. **Enqueue-only** (delivery depends on #19; flagged).
3. **Copy-icon on the collaborator assignee chip** in TaskDetailPanel (the removable pill `<li>` L633): add a small copy-icon button next to `×`, `aria-label="Copy {name}'s access link"`, copied confirmation via live region. Resolves to the **one** collaborator link. **Replaces** the "Collaborator task links" section (L476–495) + `CollabLinkButton` entirely.

> **Confirmed by product (2026-08-24):** workspace-wide only; durable link, rotates on explicit **Reset** only; Send-via-WhatsApp in scope; chip copy-icon as above.

### (h) Unassign hygiene simplifies
Remove `collabLinks.ts` + its `onTaskWrite` wiring (L166–177). Access to a specific task still closes instantly via the rules assignee/visibility re-check and the `assignedTasks` mirror removal on `onTaskWrite`. Keep `lastTaskAt` stamping (`lastTaskAt.ts`, unaffected).

---

## Surface design (collab `/t`)

- Redeem returns `{ status, customToken, workspaceId, collaboratorId, branding, collaborator: { name }, firmName }` — **no** single pinned task.
- New hook `useCollabAssignedTasks(workspaceId, collaboratorId)` live-queries `collaborators/{colid}/assignedTasks` where `lifecycle in [published,completed]` and `visibleToThisCollaborator == true`, ordered per **Q1**.
- Top **"My Assigned Tasks"** combobox (real `<label>`, keyboard, `aria-*`). Selecting a task loads the **existing** `CollabTaskView` (reuse `useCollabTask` / `useCollabUpdates` / `useCollabDocuments`) for `(projectId, taskId)`. Header shows `{firm} · {projectName}`.
- Empty state: "No tasks assigned yet." Single task: auto-select, collapse switcher.
- `ICollabSession` (useCollabSession.ts L19–33) loses `taskId`/`task`; the per-token cache re-validation (`claims.collab.tid` check ~L117–126) is replaced by a `claims.collab.colid` check.
- Deep-link (optional): `#/t/{token}?task={pid}_{tid}` preselects.

---

## Resolved open questions

### Q1 — Switcher ordering: **Active-first, then due date, flat list, "(Active)" suffix** ✅
Definition to remove Builder ambiguity: **active = `status !== 'done'`** (i.e. `todo | in_progress | blocked`). Sort key: `active` desc (active first) → `dueDate` asc (missing due dates **last**) → `title` asc. Flat list (no project grouping). Append " (Active)" to the option label for active items. Mirror stores `status` + `dueDate`; `active` is derived in the hook/selector.

### Q-WA — WhatsApp template: **add one new `collab_access_link_v1` template; enqueue-only** ✅ (with dependency flag)
**Finding:** the WA send stack is a no-op stub — no `twilio` dependency, no #19 dispatcher, no on-demand send callable, and `enqueueNotifications` has no collaborator recipient path. **No message can actually be delivered in-repo today.**
- **Reuse existing?** The only collaborator-facing template is `siapp_task_assigned_v1_en` (`task_assigned`), which is **task-scoped** and requires `task_title` / `project_title` / `due_date`. A collaborator-scoped access link has no single task, so reuse would require fabricated/misleading variables and risk Meta rejection. **Reject reuse.**
- **Recommendation (lowest-risk, build-ready):** add a **new** `collab_access_link_v1` template (draft copy into [whatsapp-templates-v1.md](./whatsapp-templates-v1.md); add a `collab_access_link` value to `TNotificationTrigger` in enums.ts + `ICollabAccessLinkVars { collaboratorName, firmName, accessLink }` in notificationTypes.ts). "Send via WhatsApp" **enqueues** a `workspaces/{wid}/messages` doc (channel `whatsapp`, recipient = collaborator phone, `templateName: 'collab_access_link_v1'`), reusing `isOptedOut` / `hasWaConsent`. It **will not deliver** until the #19 dispatcher + Twilio + Meta approval land. This decouples the Builder from Meta/Twilio latency (the real risk) while honoring the product decision.
- **Rationale:** no existing template fits; a new template is the correct semantic model; enqueue-only avoids blocking on external approval and matches the established #18 pipeline contract.

---

## Build-ready work breakdown (ordered)

**1 — shared types** ([packages/shared/src](../packages/shared/src))
- `firestoreTypes.ts`: add `assigneeCollaboratorIds: string[]` to `ITaskDoc` (~L497); trim `ICollabClaims` to `{ collab: { wid, colid, linkId } }` (L95–103); add `IAssignedTaskMirrorDoc { projectId, taskId, title, status, dueDate?, projectName, lifecycle, visibleToThisCollaborator, updatedAt }`.
- `enums.ts`: add `'collab_access_link'` to `TNotificationTrigger` (L111–122).
- `notificationTypes.ts`: add `ICollabAccessLinkVars` (L26+).
- New callable request/response types for `issueCollaboratorLink` and task-parameterized `submitCollabUpdate` / redeem (wherever callable types live).

**2 — task write field maintenance** (web data-layer; land with PR1 so rules never read a truly absent field)
- `useTasks.ts`: derive `assigneeCollaboratorIds` from `assignees` in `createTask` (L457 block) and `updateTask` (L496 block).
- `duplicateProject.ts`: add `assigneeCollaboratorIds: []` to `IDuplicateTaskDoc` (L82–97), `buildDuplicatePlan` (L130), batch `set` (L240).
- Backfill script `scripts/backfill-assignee-collaborator-ids.mjs` (follow `seed-design-data.mjs` admin-init + `firestore-backup.mjs` "safe by default / --execute" convention): iterate all tasks, set `assigneeCollaboratorIds` from `assignees`.

**3 — fan-out triggers** ([index.ts](../backend/functions/src/index.ts))
- Extend `onTaskWrite` (L143): upsert/remove `collaborators/{colid}/assignedTasks/{pid}_{tid}` mirror docs from `before`/`after` (add for new collaborator ids, delete for removed, update snapshot on change). Read the project doc for `projectName`/`lifecycle`. Keep it non-fatal (same posture as existing blocks).
- Extend `onProjectWrite` (L275): on `name`/`lifecycle` change, refresh `projectName`/`lifecycle` across that project's mirror docs. New helper module `backend/functions/src/lib/assignedTasksMirror.ts` (pure diff + admin write, unit-testable like `collabLinks.ts`).
- Remove `removedCollaboratorIds`/`revokeCollabLinksForTask` wiring (L166–177) and delete `lib/collabLinks.ts` + its test.

**4 — auth / callables** ([backend/functions/src/callables](../backend/functions/src/callables), [portalTokens.ts](../backend/functions/src/lib/portalTokens.ts))
- `portalTokens.ts`: `collabUid(wid, colid)` → `collab_{wid}_{colid}`; `parseCollabUid` → `{ wid, colid }` (2-part after prefix).
- `activityDiff.ts:181`: adapt to new `parseCollabUid` shape (uses `colid` only).
- `redeemCollabLink.ts`: accept `scopeType:'collaborator'`; mint claims `{ wid, colid, linkId }`; uid `collabUid(wid, colid)`; response drops the pinned task, adds `collaborator.name` (+ keep branding/firmName + lifecycle guidance). **Sliding expiry (R4):** on success, extend `expiresAt = now + COLLAB_LINK_TTL_MS`.
- New `issueCollaboratorLink.ts`: `{ workspaceId, collaboratorId, reset? }`; role gate owner/admin/pm; `assertWorkspaceActive`; revoke active `scopeType:'collaborator'` link for the collaborator; mint fresh; audit `collab_link.issue|reset`; return `{ url, expiresAt }`.
- Delete `issueCollabLink.ts` (move the still-needed pure helpers `isCollaboratorAssignee`/`passesCollabVisibility` into a shared lib, since `submitCollabUpdate`/`redeem` import them today).
- `submitCollabUpdate.ts`: read `{ projectId, taskId }` from payload; drop `pid/tid` from claims; membership re-check via `assigneeCollaboratorIds`; actor uid `collabUid(wid, colid)`.
- New (optional per Q-WA) `sendCollaboratorLink.ts` **enqueue-only**: role gate; resolve collaborator phone/consent; write a `messages` doc (`collab_access_link_v1`). Or fold into `issueCollaboratorLink` with a `deliver:'whatsapp'` flag. Flag delivery dependency in code comment.
- `index.ts` exports: drop `issueCollabLink`, add `issueCollaboratorLink` (+ optional `sendCollaboratorLink`).

**5 — rules + rules-tests** ([firestore.rules](../firestore.rules), [backend/rules-tests](../backend/rules-tests))
- Replace `isCollabProject`/`isCollabPrincipal` with `isCollabWorkspace`/`isCollabAssignee` (per (e)); update tasks `get` L851, `updates` read L891, `documents` `get`/`list` L939/L956, and `validCollabDocumentCreate` L409/L435.
- Add `collaborators/{colid}/assignedTasks/{id}` read rule (`colid == claim.colid`, writes false).
- Rules-tests (`backend/rules-tests/src/collab.test.ts`): assignee-membership read allow/deny, cross-collaborator deny, lifecycle + visibility gates, `assignedTasks` own-vs-other, collab-uploads create with new validator.

**6 — indexes** ([firestore.indexes.json](../firestore.indexes.json))
- Add `assignedTasks` composite: `lifecycle` ASC + `visibleToThisCollaborator` ASC + `dueDate` ASC (order supporting the Q1 query; confirm against the actual `where`+`orderBy`). No index to drop.

**7 — collab surface** ([apps/web/src/surfaces/collab](../apps/web/src/surfaces/collab))
- `useCollabSession.ts`: drop `taskId`/`task` from `ICollabSession`; re-validate cache on `claims.collab.colid`; consume new redeem response.
- New `useCollabAssignedTasks.ts` (Q1 query + sort).
- `CollabTaskPage.tsx` / `CollabTaskView`: add the "My Assigned Tasks" switcher; wire the existing `useCollabTask`/`useCollabUpdates`/`useCollabDocuments` to the selected `(projectId, taskId)`; empty/single-task states.
- `callables.ts`: task-parameterized `submitCollabUpdate` binding.

**8 — firm surface** ([apps/web/src/surfaces/firm](../apps/web/src/surfaces/firm))
- `callables.ts`: replace `issueCollabLink` binding with `issueCollaboratorLink` (+ optional `sendCollaboratorLink`).
- `CollaboratorsListPage.tsx`: add "Copy access link" / "Reset link" (+ optional "Send via WhatsApp") inline icon buttons to the L120–165 action cluster; gate owner/admin/pm; copied/reset live-region feedback.
- New `CollabAccessLinkButton.tsx` (+ small hook) reused by the card and the chip.
- `TaskDetailPanel.tsx`: delete the "Collaborator task links" section (L476–495); add a copy-icon button to the collaborator assignee pill `<li>` (L633) — `aria-label="Copy {name}'s access link"`, live-region confirm.
- Delete `CollabLinkButton.tsx` (+ its test).

**9 — cleanup**
- Remove `lib/collabLinks.ts` (+ test); update `impl-22-collaborator-task-page.md` cross-refs; remove now-dead `IMagicLinkDoc.projectId` usage notes if the field is retired (keep the field for portal links — only collab stops using it).

**10 — tests** ([Tester](#test-plan))
- See Test plan below.

---

## PR split — **recommended: two stacked PRs**

Estimated net diff ≫ 600 lines (rough: backend/rules/tests ~700–900; web surfaces ~500–700). Split.

- **PR1 — foundation (backend + shared + rules + data-layer):** work items **1, 2, 3, 4, 5, 6** + backfill. Files: `packages/shared/src/{firestoreTypes,enums,notificationTypes,constants?}.ts`; `backend/functions/src/callables/{redeemCollabLink,issueCollaboratorLink,submitCollabUpdate,sendCollaboratorLink}.ts` (delete `issueCollabLink.ts`); `backend/functions/src/lib/{portalTokens,activityDiff,assignedTasksMirror}.ts` (delete `collabLinks.ts`); `backend/functions/src/index.ts`; `firestore.rules`; `firestore.indexes.json`; `backend/rules-tests/src/collab.test.ts`; `apps/web/src/surfaces/firm/projects/tasks/useTasks.ts` + `apps/web/src/surfaces/firm/projects/duplicateProject.ts` (data-layer field write only); `scripts/backfill-assignee-collaborator-ids.mjs`; `plans/whatsapp-templates-v1.md` (draft template).
- **PR2 — web surfaces (stacked on PR1):** work items **7, 8** + component/a11y tests. Files: `apps/web/src/surfaces/collab/*`; `apps/web/src/surfaces/firm/collaborators/*`; `apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.tsx`; delete `CollabLinkButton.tsx`; `apps/web/src/lib/callables.ts`; new `CollabAccessLinkButton.tsx` + hooks.

**Coupling caveat:** PR1 changes the redeem response + claims shape, which **breaks the current single-pinned-task `/t` surface** until PR2 lands. Because old task-scoped links become un-redeemable anyway and there is no live collaborator traffic pre-launch (WA/Twilio not yet integrated, D-001), a short window between merges is acceptable — but **branch PR2 off PR1 and merge them close together** (do not merge PR1 to a live production surface alone). If the team prefers atomic, ship as a single PR (~1200–1600 lines) instead.

---

## Test plan (for Tester)

- **Rules-tests** (`backend/rules-tests/src/collab.test.ts`): collab principal reads an assigned+visible task on a live project (allow); non-assigned / invisible / draft-or-archived project (deny); another collaborator's task (deny); `assignedTasks` own read (allow) vs other colid (deny); `updates`/`documents` read via membership; `collab-uploads` create with the rewritten validator (allow valid, deny wrong scopeId/colid).
- **Callable unit tests:** `issueCollaboratorLink` role gate + one-active-per-collaborator revoke + reset audit; `redeemCollabLink` new claims/uid + sliding expiry + old task-scoped link → invalid; `submitCollabUpdate` membership re-check with `{projectId,taskId}`; `assignedTasksMirror` pure diff (add/remove/update); `parseCollabUid`/`collabUid` new shape.
- **Component tests:** switcher — empty state, single-task auto-select, multi-task Q1 ordering ("(Active)" suffix, active-first then due asc, missing-due last); collaborators page Copy/Reset (+ Send) states; task-panel chip copy-icon `aria-label` + copied live region; `axe` a11y pass on the switcher and the new buttons.
- **Backfill script test:** `.test.mjs` verifying `assigneeCollaboratorIds` derivation from mixed assignee arrays.

---

## Out of scope

- Cross-firm single link (stays multi-link per collaborator record).
- Any change to collaborator task capabilities (status/need-help/notes/uploads).
- Firm task-assignment UX.
- **Actually delivering** WhatsApp/SMS (blocked on the #19 dispatcher + Twilio + Meta approval — this feature only enqueues).
- BM (`ms`) template translation (ships with the v1.5 BM release, D-026).

---

## Risks / open questions

- **R1 — Mirror consistency.** Fan-out drift → stale switcher list. Mitigation: mirror is derived + reconcilable by the backfill; task-detail reads remain rules-gated, so a stale entry cannot grant access.
- **R2 — Rules cost.** Each collab subcollection read now `get()`s the parent task — same order as today's lifecycle `get()`. Acceptable.
- **R3 — `assigneeCollaboratorIds` is client-asserted** (rules can't cross-check the object array). Bounded by firm-only task-write authority; documented, accepted.
- **R4 — Durable-link expiry model (human call).** "Durable, rotates on Reset only" vs the 90-day TTL. **Proposed default: sliding expiry** — `redeemCollabLink` extends `expiresAt` by `COLLAB_LINK_TTL_DAYS` on each successful use, so active collaborators never lapse while abandoned links expire. Alternative: remove expiry entirely for collaborator-scoped links. Confirm preference.
- **BLOCKER-CLASS (human call) — WhatsApp delivery infra absent.** The send stack is a no-op stub (no Twilio, no #19 dispatcher, no collaborator recipient path). "Send via WhatsApp" can only **enqueue** today. Decision needed: (a) ship enqueue-only now with the reserved `collab_access_link_v1` template (recommended — honors product scope, no external blocker), or (b) defer the WhatsApp button to a follow-up once #19 lands and ship only Copy/Reset now. Either way, **Copy access link + Reset link are fully functional and unblocked.**

### Resolved
- **Scope:** workspace-wide only (cross-firm stays multi-link). ✅
- **Reset:** durable link, explicit **Reset** only. ✅ (expiry model → R4)
- **Send via WhatsApp:** in scope, enqueue-only (Q-WA). ✅
- **Task-panel share:** copy-icon on the collaborator assignee chip (replaces the per-task link button). ✅
- **Q1 ordering:** active-first (`status !== 'done'`) → due date asc (missing last) → title; flat list, "(Active)" suffix. ✅
- **Q-WA template:** new `collab_access_link_v1`, enqueue-only. ✅
