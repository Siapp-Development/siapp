# Implementation Plan: Issue 98 - Drag-and-drop task reordering (List + Timeline)

## Goal
Implement drag-and-drop reordering for project tasks in both List and Timeline board views on the firm surface, replacing the current Move up and Move down controls while preserving existing persistence through reorderTasks, authorization/edit gating, and drawer selection behavior. This aligns with MVP firm-app task management scope in [pm_ux/plans/11-mvp-scope.md](../pm_ux/plans/11-mvp-scope.md), with no cross-surface impact per D-036 in [pm_ux/plans/decisions-log.md](../pm_ux/plans/decisions-log.md) and no data-model expansion.

## Touched surfaces and files
Surface impact
- Firm app only: dashboard.siapp.app workspace project board task area (List and Timeline views).
- No changes to apex marketing, client portal, collaborator page, or admin surface.

Planned file modifications
- apps/web/src/surfaces/firm/projects/tasks/TasksSection.tsx
- apps/web/src/surfaces/firm/projects/tasks/TimelineView.tsx
- apps/web/src/surfaces/firm/projects/tasks/TasksSection.test.tsx

Potentially touched if extraction is needed to avoid duplication
- apps/web/src/surfaces/firm/projects/tasks/useTasks.ts (only if existing row typing helpers need minor shared typing support for DnD payload handling; no persistence-path changes)

No changes planned
- firestore.rules
- firestore.indexes.json
- backend/rules-tests
- backend/api or backend/functions code

## Data model changes
Firestore schema
- None.

Collection/document field changes
- None.

Security-rules implications
- None. Reordering continues to call reorderTasks, which updates existing task docs and remains subject to current write authorization checks and workspace isolation.
- Multi-tenant boundary remains unchanged because writes stay scoped under workspaces/{wid}/projects/{pid}/tasks/{tid}.

## Steps
1. Confirm and lock reorder behavior invariants before UI changes.
- Invariant A: Reorder remains phase-group scoped (including No phase), matching current move control semantics.
- Invariant B: Restricted rows are never draggable and are never included in orderedTaskIds.
- Invariant C: List and Timeline both emit the same orderedTaskIds contract into reorderTasks.

2. Introduce a shared drag state in TasksSection for both views.
- Add state for active drag task id, source group key, and per-group hover target index.
- Keep current reorderPendingByGroup as the single lock source; block new drags while a group is pending.
- Preserve current selectedId lifecycle so drag operations do not reset selected task unless explicitly clicked.

3. Replace list move controls with draggable row affordance.
- Remove Move up and Move down buttons from task rows.
- Add drag handle/row drag affordance only when canEdit is true and group reorder is not pending.
- Keep current row click-to-select behavior; treat short click as selection and drag gesture as reorder intent.
- On drop, compute reordered readable task ids within the same group and call existing persistGroupOrder -> reorderTasks path.

4. Add timeline drag-and-drop reordering for task bars (and optionally row label handle) within each group.
- Enable drag on timeline rows only when canEdit is true and group not pending.
- Keep timeline click behavior to open drawer intact for non-drag interactions.
- Use group-local target positioning so reordering mirrors visual order in that phase lane.
- Reuse the same TasksSection persistence callback so List and Timeline cannot diverge.

5. Preserve selection and drawer behavior during drag flows.
- Ensure dragging a selected task keeps drawer state stable.
- Ensure dropping does not auto-close the drawer.
- Ensure deep-linked highlight/open flow remains unchanged after reorder snapshots.

6. Respect canEdit and pending reorder state consistently across both views.
- Non-edit roles or lifecycle-gated non-edit contexts show no draggable affordances.
- While reorderPendingByGroup contains a group, disable drag start and drop in that group.
- Keep Add task and Add phase visibility rules unchanged.

7. Accessibility and keyboard interaction pass for drag replacement.
- Ensure draggable affordance has clear accessible labeling.
- Provide keyboard-accessible reorder fallback behavior tied to the same drag handle pattern (no reintroduction of separate Move up and Move down buttons).
- Validate focus management so keyboard users remain on the moved item after reorder commit.

8. Test updates in TasksSection test suite.
- Replace existing move-button test coverage with drag reorder coverage for list and timeline.
- Keep tests that validate non-edit mode, drawer behavior, deep link selection, overdue styling, restricted rows, and timeline open interactions.
- Assert reorderTasks receives the correct ordered ids and is blocked when pending.

9. Verify no architecture or dependency drift.
- Confirm no new package dependency is introduced; use platform/native DnD and existing UI primitives.
- Confirm surface remains in firm bundle and does not alter bundle isolation assumptions.

## Risk checks
- Drag versus click conflict: protect drawer open behavior by using a movement threshold before treating interaction as drag.
- Timeline precision risk: ensure drop target index calculation is deterministic across responsive widths and horizontal scroll positions.
- Realtime snapshot race: if task list changes during drag, abort current drag and show stable fallback rather than committing stale order.
- Restricted-row safety: ensure restricted rows cannot become drop targets that alter readable-task ordering unexpectedly.
- Pending-state lock: verify rapid repeated drops cannot create overlapping reorderTasks writes for the same group.
- Accessibility regression: verify keyboard-only and screen-reader flow remains operable after button removal.

## Test plan
Unit/component tests (apps/web)
- List view reorder via drag:
  - Drag second readable task above first within same phase and assert reorderTasks called with reordered ids.
  - Verify no reorder call when dropping outside valid target.
- Timeline view reorder via drag:
  - Drag task bar within a phase lane and assert same ordered ids contract as list reorder.
  - Verify timeline still opens drawer on click when no drag occurs.
- Edit gating:
  - With canEdit false, assert draggable affordances are absent and no drag reorder can start.
- Pending reorder lock:
  - Simulate reorder pending and assert additional drag attempts do not call reorderTasks.
- Selection and drawer invariants:
  - Selected task remains selected after successful reorder.
  - Drawer remains open for selected task during and after reorder commit.
- Restricted rows:
  - Assert restricted rows are non-draggable and excluded from reorder payload.

Regression checks (existing behavior)
- Deep-linked task opening/highlight remains intact.
- Empty states and list/timeline switching remain unchanged.

Rules/data tests
- None required because schema/rules/indexes are unchanged and writes continue through existing task update paths.

## Out of scope
- Cross-phase drag (moving tasks between phases).
- Reordering restricted rows.
- Any change to reorderTasks write contract or Firestore order field semantics.
- New third-party drag-and-drop libraries.
- Client portal, collaborator page, admin UI, or backend webhook changes.

## Risks and open questions
Open questions
1. Should timeline drag be limited to task bars only, or should the left-side task label also be a drag handle for easier desktop precision?
2. For keyboard-only users, should the drag handle expose explicit lift/move/drop semantics via ARIA, or should we implement a simpler keyboard reorder shortcut on focused task rows?
3. On reorder failure, do we need a user-visible inline error state, or is current silent-fail behavior acceptable for MVP consistency?

Primary risks
- Interaction ambiguity between selection click and drag initiation can regress drawer behavior if threshold handling is weak.
- Timeline horizontal scrolling may make drop index calculations fragile unless tied to row ordering rather than pixel-only math.
