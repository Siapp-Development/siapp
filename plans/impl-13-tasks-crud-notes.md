# Implementation plan — #13 Tasks: CRUD, phases, dependencies, notes with @mentions

## Context

Issue #13 (M1 — Firm app core) delivers the core work unit: tasks under a project, grouped by phases, with dependencies, per-task visibility/department/WA toggles, and notes with @mentions. Depends on #12 (projects, PR #41 in review) — branch `feat/13-tasks-crud-notes` off `feat/12-projects-crud-lifecycle`; open the PR against that branch and retarget `main` once #41 merges.

The schema already exists in `packages/shared/src/firestoreTypes.ts` (`ITaskDoc`, `IPhaseDoc`, `ITaskUpdateDoc`, `TTaskAssignee`) and in `pm_ux/plans/firestore-data-model.md` §tasks. Read rules for tasks/updates (department need-to-know, D-025) landed in #11; the `onTaskWrite → recomputeProjectSummary` trigger landed in #12. This ticket opens the write paths, the safe-projection callable, and the web surface.

## Approved scope decisions

1. **Phase-grouped task list, not Gantt** (user-approved): collapsible phase groups with due/overdue colouring + A5-style task panel. Gantt bars, today line, milestones CRUD, jump-to-milestone → follow-up ticket. D-033 note: no Kanban ever.
2. **Safe-projection callable now** (user-approved): `getRestrictedTaskHeaders` returns title/status-level headers for tasks the caller cannot read, so non-authorized members see the "Restricted · Dept" rows per wireframe A3/A5d.
3. **Internal-user assignees only** (user-approved): assignee picker lists workspace members. Collaborator assignment (A5b/A5c) ships with #16; schema already supports both shapes.
4. **Write path is client-side, rules-validated** — mirrors the #12 split. No lifecycle-like transitions here, so no mutation callable. Activity entries (`updates/*`) are client-written, append-only, with rules pinning `authorId == auth.uid`, `authorType == 'user'`, `source == 'web'`.
5. **@mentions**: parse `@Name` against workspace members client-side; store mentioned uids in `payload.mentions: string[]` (additive schema field). Mention *notifications* are #18/#19.
6. **Markdown notes**: render comments with `react-markdown` (new dep, firm bundle only, no raw-HTML plugins → XSS-safe). Description stays a plain textarea.
7. **Hard delete for tasks/phases** (no soft-delete in the data model), owner/admin/pm only. Summary trigger already handles task deletes.
8. **No drag reordering**: new tasks get `order = max + 1` within their phase; sorting is client-side (avoids composite indexes on the restricted-list queries).
9. **UI-gate task editing to draft/published projects** (matches project `canEdit`); rules don't enforce project lifecycle on task writes at MVP.

## Steps

### 0. Setup
- Copy this plan to `plans/impl-13-tasks-crud-notes.md` (committed with the PR, per convention).
- `git checkout -b feat/13-tasks-crud-notes` from `feat/12-projects-crud-lifecycle`.

### 1. Shared (`packages/shared/src`)
- `callableTypes.ts`: `IGetRestrictedTaskHeadersRequest { workspaceId; projectId }`, `IRestrictedTaskHeader { id; title; status: TTaskStatus; phaseId: string | null; dueDate: string | null /* ISO */; order: number; restrictedToDepartments: string[] }`, `IGetRestrictedTaskHeadersResponse { headers: IRestrictedTaskHeader[] }`.
- `firestoreTypes.ts`: add `mentions?: string[]` to `ITaskUpdatePayload`.

### 2. Functions (`backend/functions/src`)
Types mirrored locally (shared is source-only; NodeNext can't consume it) — same pattern as `setProjectLifecycle.ts`.
- `lib/restrictedTasks.ts` + unit tests: pure `canSeeRestrictedTask(role, memberDepartments, restrictedToDepartments)` and `toRestrictedHeader(id, data)` projection (title, status, phaseId, dueDate ISO, order, restrictedToDepartments — nothing else).
- `callables/getRestrictedTaskHeaders.ts`: reuse the `requireMemberRole` claims pattern from `callables/setProjectLifecycle.ts:35` (any role; also read `workspaces[wid].departments` from claims). Read all tasks for the project via Admin SDK (MVP volume ~60), filter to tasks the caller **cannot** read, return projections.
- `index.ts`: export the callable.

### 3. Rules (`firestore.rules`)
Reuse `hasRole`, `canSeeRestricted`, `restrictionsOf` (defined at top of file). Replace the `allow write: if false` stubs at the `phases` (line ~239), `tasks` (~248), and `updates` (~254) blocks:
- `validPhaseFields(phid)`: id == phid; name string 1–80; order number; status in ['todo','in_progress','done']; optional startDate/endDate timestamps; `hasOnly` key allowlist.
- **phases** create/update/delete: `hasRole(wid, ['owner','admin','pm'])` + valid.
- `validTaskFields(tid)`: id == tid; title string 1–200; optional description string ≤ 5000; optional phaseId string; status in ['todo','in_progress','blocked','done']; optional startDate/dueDate/completedAt timestamps; assignees list ≤ 20; visibleToClient bool; visibleToCollaboratorIds list; restrictedToDepartments list ≤ 10; sendWhatsapp bool; dependsOn list ≤ 50 and `!data.dependsOn.hasAny([tid])` (no self-dependency); order number; createdAt/updatedAt timestamps; `hasOnly` allowlist.
- **tasks create**: `hasRole(['owner','admin','pm'])` && `canSeeRestricted(wid, incoming)` (can't create a task you couldn't see) && `createdBy == auth.uid` && valid.
- **tasks update**: same roles && `canSeeRestricted` on **both** existing and incoming && id/createdAt/createdBy unchanged && valid.
- **tasks delete**: same roles && `canSeeRestricted(existing)`.
- **updates create** (append-only): `isFirmMember(wid)` && `canSeeRestricted` on parent task (one `get()`, mirrors the existing read rule) && `authorType == 'user'` && `authorId == auth.uid` && `source == 'web'` && action in ['comment','status_change','eta_change','assigned'] && payload is map && comment text 1–5000 && createdAt timestamp && `hasOnly` allowlist. `allow update, delete: if false`.

### 4. Rules tests (`backend/rules-tests/src/tasks.test.ts`)
Conventions from `projects.test.ts` (createTestEnv/seedWorkspace/seedDoc/dbAs, `validX(id, extra)` factory). Matrix:
- phases: create/update/delete owner+admin+pm allow, viewer deny; bad status/extra key deny.
- tasks create: 3 roles allow, viewer deny; pm creating a task restricted to a dept he's not in → deny; title empty/201 deny; self-dependency deny; extra key (`requiresPhoto`) deny; createdBy spoof deny.
- tasks update: allow legit edits; tamper id/createdAt/createdBy deny; pm not in dept updating restricted task deny; escalate-restriction-to-invisible deny (incoming check).
- tasks delete: owner/admin/pm allow, viewer deny; restricted deny for unauthorized pm.
- updates: viewer comment allow (any member can comment); authorId spoof / source 'whatsapp' / authorType 'system' / bad action deny; update+delete of an update deny; comment on restricted task by unauthorized member deny.
- list: pm query with `where('restrictedToDepartments','==',[])` allows; unconstrained pm list denies; owner unconstrained allows.

### 5. Web data layer (`apps/web/src/surfaces/firm/projects/tasks/`)
- `useTasks.ts`: `ITaskRow` (full) / `IRestrictedHeaderRow` (`restricted: true`) union; `TTasksState`.
  - `useTasks(workspaceId, projectId, role, departments)`: owner/admin → one collection `onSnapshot`; pm/viewer → merged snapshots: `where('restrictedToDepartments','==',[])` + one `array-contains` query per claim department, deduped by id, **sorted client-side** (no composite indexes needed); plus a one-shot `getRestrictedTaskHeaders` call merged in as header rows (re-fetched via exposed `refresh`).
  - `usePhases`, `useTaskUpdates(taskId)` (orderBy createdAt is single-field — fine).
  - Writers: `createTask` (order = max+1 in phase), `updateTask`, `deleteTask`, `createPhase`/`updatePhase`/`deletePhase`, `addTaskUpdate`; `changeStatus`/save-with-diff also appends the matching `status_change`/`eta_change`/`assigned` update entry.
- `mentions.ts` + unit tests: `parseMentions(text, members)` → uids (longest-name-first matching); `tokenizeMentions(text, members)` for render highlighting.
- `apps/web/src/lib/callables.ts`: `getRestrictedTaskHeaders` wrapper.

### 6. Web UI
- `ProjectDetailPage.tsx`: local tab bar `Tasks | Details` (Tasks default, per A3 where the board is the default project view). Existing details card + lifecycle actions move under Details. Pass `departments` from claims through `FirmShell.tsx` (available as `claims.workspaces[wid].departments`).
- `tasks/TasksSection.tsx`: phase groups (sorted by order) + "No phase" group; collapsible headers ("Site prep · 4 tasks · 2 done"); "+ Add phase" and per-phase "+ Add task" quick-add (title only) for owner/admin/pm; rows: title, status label, assignee initials chips, due date (destructive colour when overdue & not done), "Restricted · Dept" chip, collaborator badge when present (read-only display). Restricted header rows are dimmed; clicking shows the A5 empty-state card ("This task contains restricted content visible to: Finance…").
- `tasks/TaskDetailPanel.tsx` (inline Card below the list — no Dialog primitive in @siapp/ui, consistent with #11/#12 inline-panel convention) with `Details | Activity` tab pair per A5:
  - Details: title, description, status select, start/due date inputs, assignee chips + "Assign teammate" picker (from `settings/useTeamData.ts:useMembers`), **Sharing & access** group: visibleToClient toggle + restrictedToDepartments chip selector (owner/admin/pm; `useDepartments`; hidden until a department exists, D-004), sendWhatsapp toggle, dependsOn checkbox list (other tasks, self excluded), Delete with inline confirm. Explicit Save (ProjectForm pattern); status/due-date/assignee diffs append activity entries.
  - Activity: `useTaskUpdates` feed (author, action, from→to or markdown text, relative time); comment box with @-typeahead over members; submit stores text + `payload.mentions`; comments rendered with `react-markdown`, mentions highlighted.
- New dep: `react-markdown` in `apps/web` only.

### 7. Web tests
Mock the data-layer module wholesale (`vi.hoisted` + `vi.mock`, per ProjectsListPage.test.tsx):
- TasksSection: grouping + collapse, quick-add calls createTask with order, viewer sees no add/edit affordances, overdue colouring, restricted header row + empty-state on click.
- TaskDetailPanel: save calls updateTask + status_change entry on status diff; dependsOn excludes self; restricted selector hidden for viewer & when no departments; delete confirm flow.
- Activity: comment submit calls addTaskUpdate with parsed mentions; feed renders status_change entries.
- `mentions.test.ts`: parse/tokenize edge cases (adjacent punctuation, overlapping names, no match).
- callables.test.ts: wrapper passthrough.
- FirmShell.test: mock new imports as needed.

### 8. Verify
- `pnpm turbo typecheck lint test build`; `pnpm --filter @siapp/rules-tests test:rules` (against running emulator); `node scripts/check-bundle-isolation.mjs` (react-markdown must not leak into /p/ or /t/ bundles).
- Emulator HTTP smoke (env: `PATH=/opt/homebrew/opt/node@22/bin:...`, `JAVA_HOME=/opt/homebrew/opt/openjdk@21`, `--project siapp-prod`; rebuild functions first): seed script; as owner create phase + task + dept-restricted task; as pm run the constrained list (sees unrestricted only), call `getRestrictedTaskHeaders` (sees header), attempt restricted update (deny); comment write allow, author-spoof deny; task status → done then verify `project.summary` recompute; viewer create deny.
- Flag explicitly: UI not browser-verified unless a browser is available.

### 9. Ship
- Conventional commit, push, PR with `.github/pull_request_template.md` (base `feat/12-projects-crud-lifecycle`; retarget `main` after #41 merges). Surfaces: firm app, backend, rules.

## Critical files
- `firestore.rules` (~239–262), `backend/rules-tests/src/tasks.test.ts` (new)
- `backend/functions/src/{lib/restrictedTasks.ts,callables/getRestrictedTaskHeaders.ts,index.ts}`
- `packages/shared/src/{callableTypes.ts,firestoreTypes.ts}`
- `apps/web/src/lib/callables.ts`, `apps/web/src/surfaces/firm/FirmShell.tsx`, `apps/web/src/surfaces/firm/projects/ProjectDetailPage.tsx`
- `apps/web/src/surfaces/firm/projects/tasks/*` (new)

## Out of scope (follow-ups)
Gantt timeline + milestones CRUD (new ticket), collaborator assignment (#16), mention/assignment notifications (#18/#19), documents tab (#14), activity/audit log page (#23), drag reordering, dependency cycle detection beyond self-reference.
