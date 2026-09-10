---
title: "Bulk select + bulk actions on firm Tasks list view"
issue: 156
status: draft
updated: 2026-09-08
surface: dashboard.siapp.app (firm app)
---

# Impl plan — Bulk select + bulk actions on firm Tasks list (#156)

> Issue fetch note: `gh`/`curl` are not runnable from this planning environment
> (no shell), so the requirements below are taken from the issue summary passed
> in the task brief. Builder should re-read `gh issue view 156` and the linked
> ClickUp reference before starting, and reconcile any drift with this plan.

## Goal
Add multi-select + a floating bulk-actions bar to the firm-side project **Tasks
list view** (`TasksSection`, wireframe A3, #13) so an owner/admin/pm can act on
many tasks at once: **update status**, **delete**, and **add an assignee**.
Selection is per-task with a hover/focus-revealed row checkbox (persistent when
selected) and a group-header select-all with indeterminate state; a floating bar
reads "N Tasks selected" with a clear (×) control. Fully keyboard-accessible
(visible focus, ARIA, selection announced, Escape clears). This is a firm-app
(`dashboard.siapp.app`, D-036) UX-only enhancement — it introduces **no new
Firestore fields** and reuses the existing per-task authorization paths, so
multi-tenant workspace isolation is unchanged. There is no logged decision for
bulk task actions; see Open Questions for the phase-vs-status grouping conflict.

## Key facts established by research (read before building)
- The list view groups tasks by **phase** (`renderGroup(phaseId | NO_PHASE)`),
  **not by status**. The issue's "status group select-all" therefore maps to the
  actual rendered **phase groups**. See Open Questions Q1.
- `TasksSection` is **single-project** (`workspaceId` + `projectId` props). The
  list never spans projects, so selection is keyed by **taskId only**.
- Rows are one of two kinds: readable `ITaskRow` (`restricted: false`) or a
  dimmed `IRestrictedHeaderRow` (`restricted: true`). **Restricted rows are not
  selectable** — the member cannot read/edit them.
- Bulk editing is gated by the existing project-level `canEdit` flag (already
  computed as draft/published + owner/admin/pm on the detail page).
- Existing single-task mutation paths to reuse (batched):
  - **Status / assignees update** = direct client `updateDoc`
    (`useTasks.ts#updateTask`). Rules (`firestore.rules`, `match /tasks/{tid}`)
    allow `hasRole(['owner','admin','pm'])` updates and **require
    `updatedBy == request.auth.uid`** plus `validTaskFields`. `updatedAt` is
    stamped on every write. `completedAt` is set to `serverTimestamp()` when a
    task becomes `done` and `deleteField()` when it leaves `done`; leaving
    `blocked` clears `blockedReason`/`blockedBy`. Assignee writes must also
    rebuild the queryable **`assigneeCollaboratorIds`** projection (#127) and
    respect the **≤20 assignees** rule cap.
  - **Delete** = `deleteTask` callable (`@/lib/callables.ts`); `firestore.rules`
    has `allow delete: if false` (client deletes denied, #23 Q5). **No bulk
    delete callable exists.**
- `packages/ui` has **no Checkbox** primitive today. It does have `Button`,
  `Popover` (Escape + outside-click + focus-restore, no focus-trap),
  `ConfirmDialog` (native `<dialog>`, focus + Escape managed), `Badge`, `Avatar`.
- No reusable assignee-picker exists — the picker is inline `<select>`s inside
  `TaskDetailPanel` (teammate `<select>` builds `{type:'user',id:uid,name}`;
  collaborator `<select>` builds `{type:'collaborator',id,name,phone}`, filtered
  to `status==='active'`).
- No existing multi-select / bulk / floating-bar pattern anywhere in `apps/web`.
- No `aria-live` announcer utility exists; `sr-only` (skip-link) styling exists.
- Tests use Vitest + RTL, co-located `*.test.tsx`. `axe-core` is a dep but
  `vitest-axe`/`jest-axe` is **recommended but not yet wired** (accessibility
  instructions). See Open Questions Q5.

## Touched surfaces & files

### Create
- `packages/ui/src/components/Checkbox.tsx` — shared accessible checkbox
  primitive (native `<input type="checkbox">`, supports `indeterminate` via ref,
  visible focus ring, label/aria wiring). Add matching
  `packages/ui/src/components/Checkbox.test.tsx`.
- `apps/web/src/surfaces/firm/projects/tasks/useTaskSelection.ts` — selection
  state hook (Set<taskId>, toggle, group select-all/clear, clearAll, derived
  counts/indeterminate). Plus `useTaskSelection.test.ts`.
- `apps/web/src/surfaces/firm/projects/tasks/TaskBulkActionsBar.tsx` — floating
  bar ("N Tasks selected" + clear ×, status menu, delete-with-confirm, add
  assignee). Plus `TaskBulkActionsBar.test.tsx`.
- `apps/web/src/surfaces/firm/projects/tasks/TaskAssigneeBulkPicker.tsx` —
  popover picker used by the bar to choose one teammate/collaborator to add
  (reuses the member/collaborator lists already flowing into `TasksSection`).
  Plus `TaskAssigneeBulkPicker.test.tsx`. (Kept local to avoid scope creep;
  extracting the detail-panel picker is explicitly out of scope — Q3.)

### Modify
- `packages/ui/src/index.ts` — export `Checkbox` + `ICheckboxProps`.
- `apps/web/src/surfaces/firm/projects/tasks/useTasks.ts` — add batched writers:
  `bulkUpdateTaskStatus`, `bulkAddAssignee`, `bulkDeleteTasks` (see Bulk mutation
  strategy). Extend `useTasks.test.ts` (if present) or add tests co-located.
- `apps/web/src/surfaces/firm/projects/tasks/TasksSection.tsx` — wire selection:
  render row checkboxes in `TaskRowItem`, add a select-all checkbox to each phase
  group header (`renderGroup`), mount `TaskBulkActionsBar`, add an `aria-live`
  announcer, and an Escape handler that clears selection. Extend
  `TasksSection.test.tsx`.

### Explicitly NOT touched
- `firestore.rules`, `firestore.indexes.json` — **no changes** (no new fields, no
  new query shapes; bulk writes reuse the existing per-doc update/delete rules).
- `backend/functions/*` — **no changes** unless Q2 resolves toward a bulk-delete
  callable (see risk). Default plan loops the existing `deleteTask` callable.
- `TimelineView.tsx`, client portal `/p/*`, collaborator `/t/*`, admin — untouched
  (bundle isolation, D-036). Selection is list-view only.

## Data model changes
**None.** No Firestore collection or field is added or changed.

Security-rules implications:
- Status update and add-assignee are ordinary `updateDoc` writes to
  `workspaces/{wid}/projects/{pid}/tasks/{tid}` — already governed by the
  existing `allow update` (owner/admin/pm, `validTaskFields`,
  `updatedBy == auth.uid`, restricted-department gate). Every batched write must
  set `updatedAt` + `updatedBy` and keep `assigneeCollaboratorIds` in sync, or
  rules will reject it.
- Delete stays behind the `deleteTask` callable (`allow delete: if false`).
- Because each bulk operation is a fan-out of already-authorized single-doc
  operations scoped to one workspace/project path, **multi-tenant isolation is
  unchanged** — there is no cross-workspace surface. No rules edits required.
- Constraint to honor in writers: assignees array cap **≤ 20** and the
  `validTaskFields` allow-list (don't write stray keys).

## Component / state design

### `useTaskSelection` hook
- State: `selected: ReadonlySet<string>` (task ids).
- API:
  - `isSelected(id)`, `toggle(id)`, `select(id)`, `deselect(id)`
  - `selectMany(ids)`, `deselectMany(ids)`, `clear()`
  - `count` (number)
  - `groupState(groupIds: string[]): 'none' | 'some' | 'all'` for the header
    checkbox indeterminate/checked calculation (computed over the group's
    **selectable** ids only).
  - `toggleGroup(groupIds: string[])` — if all selected → deselect group; else
    select all group.
- Selection is **pruned** when the underlying task rows change (e.g. a task is
  deleted or filtered out): an effect drops ids no longer present in the ready
  row set so the count and bar can't reference stale tasks.
- Lives in `TasksSection` (list view only). Not persisted (unlike collapse
  state) — selection is ephemeral per the issue (Escape clears it).

### Row checkbox (`TaskRowItem`)
- Add a leading `Checkbox` before the drag handle inside the existing `group`
  flex row.
- Reveal pattern mirrors the drag handle:
  `opacity-0 group-hover:opacity-100 focus-within:opacity-100` **and** force
  visible when `selected` (`selected && 'opacity-100'`).
- `aria-label={`Select ${task.title}`}`, `checked={selected}`,
  `onChange={onToggleSelect}`. `stopPropagation` on the checkbox click so it does
  **not** open the detail panel (row title button remains the open affordance).
- Selected row keeps a subtle persistent style (reuse `bg-primary-tint`
  currently used for the panel-`selected` state, but introduce a distinct
  "checked" class so multi-select highlight ≠ panel-open highlight — see Q4).
- Restricted rows (`RestrictedRowItem`) render **no** checkbox.

### Group header select-all
- In `renderGroup`, add a `Checkbox` to the header row (only when `canEdit` and
  the group has ≥1 selectable task).
- `indeterminate` when `groupState === 'some'`, `checked` when `'all'`.
- `aria-label={`Select all tasks in ${label}`}`.
- Clicking toggles the whole group via `toggleGroup(selectableIdsInGroup)`.
- Must not interfere with the existing collapse toggle button (separate control,
  its own click target).

### Floating bulk-actions bar (`TaskBulkActionsBar`)
- Rendered by `TasksSection` when `count >= 1` and `canEdit`.
- Fixed/floating at bottom-center of the list surface; `role="region"`
  `aria-label="Bulk task actions"`. Does **not** trap focus (non-modal), but is
  keyboard reachable and shows visible focus on every control.
- Content:
  - Live count: "**N Tasks** selected" (singular/plural correct).
  - Clear (×) button — `aria-label="Clear selection"` → `clear()`.
  - **Status** action: a `Popover` trigger listing the four
    `TASK_STATUS_LABELS` (`todo`/`in_progress`/`blocked`/`done`); choosing one
    runs `bulkUpdateTaskStatus`.
  - **Assignee** action: a `Popover` trigger rendering
    `TaskAssigneeBulkPicker` (teammates + active collaborators); choosing one
    runs `bulkAddAssignee`.
  - **Delete** action: opens `ConfirmDialog`
    (`variant="destructive"`, title "Delete N tasks?", pending + error props);
    confirm runs `bulkDeleteTasks`.
- Pending state disables all actions and shows progress; inline error via `Alert`
  / the ConfirmDialog `error` prop on partial failure.

### Announcement + Escape
- Add a visually-hidden `role="status" aria-live="polite"` element in
  `TasksSection` that announces selection changes ("3 tasks selected", "Selection
  cleared", "2 tasks moved to Done", "1 task deleted").
- Add a `keydown` handler (on the list container) so **Escape clears selection**
  when the bar is showing and focus isn't inside a popover/dialog (let those
  handle their own Escape first).

## Bulk mutation strategy (writers in `useTasks.ts`)

All writers accept `(workspaceId, projectId, …, uid)` and operate only on
**readable, selected** task ids.

1. **`bulkUpdateTaskStatus(workspaceId, projectId, tasks, status, uid)`**
   - Uses `writeBatch`, chunked at **500** ops (mirror `reorderTasks`).
   - Per task set: `{ status, updatedAt: serverTimestamp(), updatedBy: uid }`
     plus the same status side-effects as `updateTask`:
     - `done` and not already done → `completedAt: serverTimestamp()`.
     - not `done` → `completedAt: deleteField()`.
     - leaving `blocked` (status !== 'blocked') →
       `blockedReason: deleteField(), blockedBy: deleteField()`.
     - to `blocked` → leave `blockedBy` as-is (no bulk blockedBy authoring).
   - Needs each task's current status (to compute "wasDone" / "leaving blocked")
     — pass the selected `ITaskRow[]`, not just ids.

2. **`bulkAddAssignee(workspaceId, projectId, tasks, assignee, uid)`**
   - `assignee: TTaskAssignee` (built exactly like the detail-panel selects).
   - Per task: skip if already assigned (dedupe by `type+id`) or if already at 20
     assignees (rules cap); else append. Rebuild
     `assigneeCollaboratorIds = nextAssignees.filter(type==='collaborator').map(id)`.
   - Write `{ assignees, assigneeCollaboratorIds, updatedAt, updatedBy }` via a
     chunked `writeBatch`. Report a count of skipped tasks back to the bar for the
     announcement ("Added to 4 tasks, 1 already assigned").

3. **`bulkDeleteTasks(workspaceId, projectId, taskIds)`** *(default approach)*
   - Loops the existing `deleteTask` callable with **bounded concurrency**
     (e.g. `Promise.allSettled` over small batches) — the callable is the only
     authorized delete path and each call produces an attributed
     `task_deleted` activity entry (#23 Q5).
   - Returns `{ deleted, failed }`; surface partial failures in the ConfirmDialog
     error/Alert. (See Q2: a real `bulkDeleteTasks` callable is the alternative.)

Error handling / refresh / clearing:
- Firestore `onSnapshot` already streams the writes back — no optimistic local
  mutation needed; the list re-renders from the subscription.
- After a fully successful action: **`clear()` the selection** and announce.
- On partial failure: keep the still-existing/failed ids selected, show the
  error, do not announce success.
- After deletes, call `tasksState.refreshRestricted()` (as the detail panel does
  on delete) so restricted headers stay consistent.
- Guard against acting on restricted ids (they should never be selectable, but
  writers filter defensively).

## Steps (each independently verifiable)
1. Add `Checkbox` to `packages/ui` (+ test + index export). Verify: unit test
   covers checked/unchecked/indeterminate + keyboard + label; `pnpm --filter
   @siapp/ui test` green.
2. Add `useTaskSelection` hook (+ test). Verify: toggle, group select-all,
   indeterminate `groupState`, `clear`, and stale-id pruning covered by hook
   tests.
3. Add batched writers to `useTasks.ts` (+ tests): `bulkUpdateTaskStatus`,
   `bulkAddAssignee`, `bulkDeleteTasks`. Verify with mocked Firestore
   `writeBatch`/`updateDoc` and mocked `deleteTask` callable that the correct
   fields/side-effects/chunking/dedupe are produced.
4. Build `TaskAssigneeBulkPicker` (+ test) — lists teammates + active
   collaborators, emits a `TTaskAssignee`.
5. Build `TaskBulkActionsBar` (+ test) — count/clear, status popover, assignee
   popover, delete ConfirmDialog; wires to the writers via callbacks.
6. Integrate into `TasksSection` + `TaskRowItem` + `renderGroup`: row checkboxes
   (reveal + persistent), header select-all (indeterminate), mount the bar,
   `aria-live` announcer, Escape-clears. Restricted rows get no checkbox; all
   gated by `canEdit`.
7. Extend `TasksSection.test.tsx` for the integration behaviors.
8. Run full `lint` + `typecheck` + `test` for `@siapp/ui` and `apps/web`.

## Test plan (for Tester)
- **`Checkbox` (packages/ui)**: renders role checkbox; checked/unchecked;
  `indeterminate` reflected on the DOM node; space toggles; visible focus;
  associated label/aria-label; axe: no violations.
- **`useTaskSelection`**: toggle add/remove; `selectMany`/`deselectMany`;
  `groupState` returns none/some/all correctly over selectable ids;
  `toggleGroup` selects then clears; `clear`; pruning of ids removed from rows.
- **`useTasks` writers**:
  - `bulkUpdateTaskStatus`: batches per-task `status/updatedAt/updatedBy`;
    `completedAt` set when →done, deleted when →non-done; `blockedReason/blockedBy`
    deleted when leaving blocked; chunk boundary at 500.
  - `bulkAddAssignee`: dedupes existing assignee; skips tasks at the 20 cap;
    rebuilds `assigneeCollaboratorIds` for collaborator assignees; user assignee
    leaves projection unchanged; returns skipped count.
  - `bulkDeleteTasks`: calls `deleteTask` once per id; aggregates
    success/failure; a rejected call doesn't abort the rest.
- **`TaskBulkActionsBar`**: shows correct singular/plural count; clear button
  fires clear; status popover lists 4 statuses and invokes status writer; delete
  opens ConfirmDialog and confirm invokes delete writer; add-assignee popover
  invokes assignee writer; pending disables actions; error shown on failure;
  axe: no violations.
- **`TasksSection` integration**: checkbox hidden until hover/focus and visible
  when selected; clicking a row checkbox selects without opening the panel;
  header select-all toggles the whole phase group and shows indeterminate for a
  partial group; restricted rows have no checkbox; bar appears at ≥1 selection
  and disappears at 0; **Escape clears** selection; live-region announces
  selection count; bar hidden when `!canEdit`.
- **Rules**: no rules change, but add/retain coverage asserting a **non**
  owner/admin/pm cannot update a task's `status`/`assignees` (confirms the bulk
  path can't escalate) and that client `delete` is denied — i.e. the bulk fan-out
  inherits the same gate as single writes.
- **Accessibility**: use `axe`/`vitest-axe` per accessibility.instructions on the
  new components (Q5 — wire `vitest-axe` if not already available; `axe-core` is
  present).

## Out of scope
- Any grouping/sort change to the list (it stays phase-grouped) and any new
  bulk actions beyond status / delete / add-assignee (e.g. move-to-phase, set
  due date, bulk visibility/restriction, remove-assignee, tag). No "while we're
  at it".
- Bulk selection in the **Timeline** view, the client portal task list/modal
  (D-042), or the collaborator page.
- Refactoring/extracting the `TaskDetailPanel` inline assignee picker into a
  shared component.
- A new `bulkDeleteTasks` backend callable (default plan reuses `deleteTask`; see
  Q2).
- Persisting selection across reload/navigation.
- Drag-multiselect / range-select / shift-click ranges (issue asks only for
  checkbox + group select-all).

## Risks / open questions
- **Q1 (needs a human call): "status group" vs actual phase groups.** The issue
  describes group-level select-all over a "status group", but the firm list view
  groups by **phase**. Default in this plan: header select-all operates on the
  rendered **phase** groups (and "update status" is one of the bulk actions).
  Confirm this is acceptable, or clarify whether the list should be regroupable
  by status first (larger scope).
- **Q2 (decision): bulk delete transport.** Default loops the existing
  `deleteTask` callable (N callable invocations, N attributed activity entries,
  partial-failure friendly, no backend change). Alternative: add a
  `bulkDeleteTasks` callable (one round-trip, atomic-ish, one aggregated audit
  entry) — but that adds backend surface, is out of the current scope line, and
  needs its own rules/limits. Recommend the loop for MVP; flag if product wants
  atomic bulk delete.
- **Q3 (mild dup): assignee picker duplication.** No reusable picker exists, so
  the bar gets its own `TaskAssigneeBulkPicker`. This duplicates the detail
  panel's inline `<select>` logic. Accepted to avoid scope creep; note as future
  refactor.
- **Q4 (UX): selected-highlight collision.** Row `selected` styling
  (`bg-primary-tint`) currently means "panel open". Multi-select needs a distinct
  visual so a checked row is not confused with the panel-open row. Confirm the
  design token/treatment for "checked".
- **Q5 (tooling): a11y test harness.** `vitest-axe`/`jest-axe` is recommended but
  not yet wired; `axe-core` is a dependency. Builder/Tester may need to add the
  `vitest-axe` dev dependency + matcher setup to satisfy the a11y test
  requirement — confirm that's acceptable.
- **Cap/perf:** very large selections write in 500-op batches; `bulkAddAssignee`
  must read current assignees (from the already-loaded rows) — fine since the
  list is fully in memory. The 20-assignee cap means some tasks may be silently
  skipped; the announcement communicates this.
- **Concurrent edits:** a task changed/deleted by another user between selection
  and action is handled by snapshot pruning + `Promise.allSettled` (delete) /
  rules rejection (update) surfacing as partial failure.

---

## Locked decisions (human-approved 2026-09-08)

- **D1 — Header select-all operates on PHASE groups** (the firm list groups by phase, not status). "Update status" remains a bulk action in the bar. No regrouping-by-status.
- **D2 — Bulk delete = loop the existing `deleteTask` callable** (`Promise.allSettled`, partial-failure friendly). No new atomic backend callable.
- **D3 — Do NOT add `vitest-axe` yet.** Do not introduce a new a11y test dependency. Write accessibility into the components (roles, keyboard, aria-live, focus) and cover it with standard RTL assertions using what's already available; skip the axe matcher.
