---
title: "impl-86-94 Orchestration Plan"
status: draft
updated: 2026-08-06
---

## Goal
Deliver a coordinated implementation for issues #86-#94 across firm dashboard/tasks, collaborator visibility, and admin authentication, while preserving D-036 surface isolation (dashboard/apex/admin split), MVP boundaries in pm_ux/plans/11-mvp-scope.md, and Firestore defense-in-depth from pm_ux/plans/13-tech-architecture.md and pm_ux/plans/firestore-data-model.md. This pass prioritizes closing partial implementations already present for #86/#87/#89/#91, then landing schema/rules-safe changes for #92/#93, and finally the remaining UX/auth flows.

## Current Status By Issue (Code/Test Evidence)

### #86 - Timeline chips/labels clearly clickable + task-list dividers
Status: partial (functionality mostly present, verification gaps remain)
Evidence files:
- apps/web/src/surfaces/firm/projects/tasks/TimelineView.tsx
- apps/web/src/surfaces/firm/projects/tasks/TasksSection.tsx
- apps/web/src/surfaces/firm/projects/tasks/TasksSection.test.tsx
Remaining tasks:
- Add explicit tests for clicking the timeline left label (not just bar) opening drawer.
- Add/confirm keyboard-focus behavior assertions for both chip and label (focus-visible ring path).
- Complete the issue’s "clickable-element design pass" scope in these task views and record what was audited.

### #87 - ZIP attachments support (shared allowlist + storage rules)
Status: partial
Evidence files:
- packages/shared/src/constants.ts
- storage.rules
- apps/web/src/surfaces/firm/projects/documents/DocumentsSection.tsx
- apps/web/src/surfaces/collab/CollabUploader.tsx
- backend/rules-tests/src/storage.test.ts
- backend/rules-tests/src/collabStorage.test.ts
- firestore.rules
- backend/rules-tests/src/collab.test.ts
Remaining tasks:
- Firestore collab document create validator still rejects ZIP (`validCollabDocumentCreate` MIME list excludes ZIP); align with shared constants.
- Update collab Firestore rules tests to allow ZIP metadata create when all pinned fields are valid.
- Add/extend UI tests covering ZIP upload acceptance for task/document flows (firm + collab), and non-allowlisted rejection.

### #88 - Task reordering UI with persistence + keyboard path + consistent reads
Status: not-started
Evidence files:
- apps/web/src/surfaces/firm/projects/tasks/TasksSection.tsx
- apps/web/src/surfaces/firm/projects/tasks/useTasks.ts
- apps/web/src/surfaces/portal/usePortalProject.ts
- apps/web/src/surfaces/collab/useCollabTask.ts
Remaining tasks:
- Implement reorder controls in firm task list (pointer + keyboard move up/down).
- Persist order writes safely (batched order updates per phase).
- Ensure every consumer that renders task ordering uses the same canonical order semantics.
- Add role/rules coverage: viewers/portal/collab cannot mutate order.

### #89 - Remove task dependsOn setting
Status: partial
Evidence files:
- apps/web/src/surfaces/firm/projects/tasks/useTasks.ts
- packages/shared/src/firestoreTypes.ts
- firestore.rules
- backend/rules-tests/src/tasks.test.ts
- apps/web/src/surfaces/firm/projects/duplicateProject.ts
- backend/functions/src/provisioning/seeds/*.ts
Remaining tasks:
- Remove `dependsOn` from active task schema/write validation path in Firestore rules (or make it truly optional legacy-read-only).
- Remove remaining runtime/domain dependence in web/shared types where no longer used by product behavior.
- Resolve duplicate/seeding coupling: either deprecate dependsOn in duplication/provisioning or explicitly keep as legacy-only with no UI exposure and no future writes.

### #90 - Home task click deep-link to project task (highlight + drawer + URL state)
Status: not-started
Evidence files:
- apps/web/src/surfaces/firm/dashboard/DashboardPage.tsx
- apps/web/src/surfaces/firm/projects/ProjectDetailPage.tsx
- apps/web/src/surfaces/firm/projects/tasks/TasksSection.tsx
Remaining tasks:
- Link dashboard task row to `?task=<taskId>` target.
- On project tasks view load: expand containing phase, scroll row into view, open drawer, apply temporary highlight.
- Maintain URL-as-state lifecycle (cleanup when drawer closes, handle deleted/missing task).
- Add accessibility focus handling for opened drawer from deep-link.

### #91 - Add "Notes:" label for collaborator-submitted notes (activity + task stream)
Status: partial
Evidence files:
- apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.tsx
- apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.test.tsx
- apps/web/src/surfaces/firm/projects/activity/activityLabels.ts
- backend/functions/src/callables/submitCollabUpdate.ts
Remaining tasks:
- Task update stream already labels collaborator comments as "Notes:"; keep and regression-test.
- Project activity feed currently has "added notes on" but no labeled note content payload; add labeled note detail rendering path and payload mapping where needed.
- Add activity section tests asserting visible "Notes:" label for collaborator note events.

### #92 - Task setting collaboratorCanSeeAllAttachments (default true)
Status: not-started
Evidence files:
- apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.tsx
- apps/web/src/surfaces/collab/useCollabTask.ts
- firestore.rules
- storage.rules
- backend/rules-tests/src/collab.test.ts
- backend/rules-tests/src/collabStorage.test.ts
Remaining tasks:
- Add task field `collaboratorCanSeeAllAttachments` defaulting to true on new tasks.
- Add UI control in task detail.
- Enforce in Firestore document read/list rules with missing-field treated as true.
- Enforce file download behavior with server-side guarantee (see open decision on Storage-rule feasibility below).
- Add rules tests for true/false/missing field behavior.

### #93 - blockedBy model + improved blocked display + clear on unblock
Status: not-started
Evidence files:
- apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.tsx
- apps/web/src/surfaces/firm/projects/tasks/useTasks.ts
- backend/functions/src/callables/submitCollabUpdate.ts
- firestore.rules
Remaining tasks:
- Add `blockedBy` shape on task docs (collaborator/member actor identity + kind + display name).
- Populate on both collaborator need-help path and firm-side block action path.
- Improve blocked callout UI (separate blocker and reason, status semantics for assistive tech).
- Clear `blockedBy` and `blockedReason` when status leaves blocked.
- Add backward-compatible rendering for legacy blocked tasks lacking `blockedBy`.

### #94 - Admin email/password sign-in path with existing claim/MFA guarantees
Status: not-started
Evidence files:
- apps/web/src/surfaces/admin/auth/AdminLoginPage.tsx
- apps/web/src/surfaces/admin/auth/AdminAuthProvider.tsx
- backend/functions/src/admin/adminGuard.ts
Remaining tasks:
- Add email/password sign-in path alongside Google.
- Route password sign-in through existing MFA resolver and `isAdmin` claim gating (no bypass path).
- Add explicit error messaging for invalid credentials / not-admin / MFA states.
- Optionally add password reset path after allowed continue-URL/domain confirmation.
- Add auth component tests for both providers and MFA challenge transitions.

## Touched Surfaces & Files

### Surface impact (D-036)
- dashboard.siapp.app: issues #86 #88 #89 #90 #91 #92 #93 (firm app)
- siapp.app/t/*: issues #87 #88 #92 #93 (collaborator)
- admin.siapp.app: issue #94
- siapp.app/p/*: read-consistency validation for #88 (if task ordering appears in portal task-adjacent UI)

### Files expected to modify
- apps/web/src/surfaces/firm/projects/tasks/TasksSection.tsx
- apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.tsx
- apps/web/src/surfaces/firm/projects/tasks/useTasks.ts
- apps/web/src/surfaces/firm/projects/tasks/TimelineView.tsx
- apps/web/src/surfaces/firm/dashboard/DashboardPage.tsx
- apps/web/src/surfaces/firm/projects/ProjectDetailPage.tsx
- apps/web/src/surfaces/firm/projects/activity/activityLabels.ts
- apps/web/src/surfaces/firm/projects/activity/ActivitySection.tsx
- apps/web/src/surfaces/collab/useCollabTask.ts
- apps/web/src/surfaces/collab/CollabUploader.tsx
- apps/web/src/surfaces/admin/auth/AdminLoginPage.tsx
- apps/web/src/surfaces/admin/auth/AdminAuthProvider.tsx
- packages/shared/src/firestoreTypes.ts
- packages/shared/src/constants.ts
- firestore.rules
- storage.rules
- backend/functions/src/callables/submitCollabUpdate.ts
- backend/rules-tests/src/tasks.test.ts
- backend/rules-tests/src/collab.test.ts
- backend/rules-tests/src/storage.test.ts
- backend/rules-tests/src/collabStorage.test.ts
- apps/web/src/surfaces/firm/projects/tasks/TasksSection.test.tsx
- apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.test.tsx
- apps/web/src/surfaces/firm/dashboard/DashboardPage.test.tsx
- apps/web/src/surfaces/firm/projects/activity/ActivitySection.test.tsx

## Data Model Changes

### Task document changes (`workspaces/{wid}/projects/{pid}/tasks/{tid}`)
- Add `collaboratorCanSeeAllAttachments: boolean`.
- Default for new tasks: `true`.
- Missing field semantics for existing tasks: treat as `true`.
- Add optional `blockedBy` map:
  - `kind: 'collaborator' | 'member'`
  - `id: string`
  - `name: string`
- Keep `blockedReason` as string (already present) but clear together with `blockedBy` on unblock.
- Remove or deprecate `dependsOn` in active write contract (decision required, see risks).

### Activity payload adjustments
- For collaborator note events, include note text payload where activity feed must display labeled note content.

### Security-rules implications (multi-tenant isolation remains non-negotiable)
- Firestore task validator (`validTaskFields`) must include new optional fields with strict shape checks.
- Firestore document get/list rules for collab principal must branch by task flag:
  - flag true (or missing): allow task-scoped attachments for pinned task.
  - flag false: allow only explicitly shared (`visibleToCollaboratorIds` includes colid).
- Preserve lexical tenant isolation under `/workspaces/{wid}/...` and existing project-live checks.
- Storage enforcement for #92 requires a design choice because current storage paths + no Firestore lookup in Storage rules limit per-task conditional checks.

## Ordered Build Plan (Dependency Sequencing)

1. **Normalize baseline schema/rules debt (#89 + #87 completion points)**
Why first: eliminates conflicting task/rules contracts before adding new task fields and UI controls.
Verifiable outcome: task create/update payloads and rules agree; ZIP accepted in both metadata and bytes paths.

2. **Land core task-schema/rules extensions (#92 + #93 backend contract)**
Why second: UI and collaborator behavior must rely on enforced server contract, not client-only toggles.
Verifiable outcome: Firestore rules + callable writes support `collaboratorCanSeeAllAttachments` and `blockedBy` semantics with legacy-safe behavior.

3. **Implement firm task UX behaviors (#88 reorder + #93 blocked callout UI)**
Why third: depends on stable schema from step 2; minimizes rework in task components.
Verifiable outcome: reorder persists and blocked callout shows actor+reason with unblock cleanup.

4. **Implement navigation deep-link flow (#90)**
Why fourth: builds on stabilized task list rendering/selection APIs from step 3.
Verifiable outcome: `?task=` loads/open/highlights target task and cleans URL state correctly.

5. **Close collaborator-note presentation parity (#91)**
Why fifth: can use final activity payload shape decided in step 2.
Verifiable outcome: "Notes:" appears in both task update stream and activity feed detail path.

6. **Finish UX polish/test closure for #86**
Why sixth: primarily verification and polish once task interaction model is finalized.
Verifiable outcome: explicit tests for label/chip interaction and focus affordance.

7. **Add admin password path (#94)**
Why seventh: separate surface, can proceed in parallel, but merge after core firm/collab rule changes to reduce concurrent risk.
Verifiable outcome: email/password + MFA + isAdmin claim flow works without changing existing Google path.

8. **Regression sweep + full validation run**
Why last: confirms cross-surface stability and prevents rule regressions.
Verifiable outcome: web tests, rules tests, lint/typecheck/build all green.

## Step-by-Step Execution Tasks

1. Update task/domain types and Firestore rule validator to reconcile `dependsOn` policy (#89), plus add pending fields for #92/#93 behind strict validation.
2. Fix ZIP parity across shared constants, Firestore collab document validator, and associated rules tests (#87).
3. Implement collab attachment visibility flag in task form state + writes + collab read hooks, with missing-field=true logic in rules (#92).
4. Implement blockedBy write paths in firm task updates and submitCollabUpdate callable; ensure unblock clears both fields (#93).
5. Upgrade blocked-task UI callout semantics and legacy fallback rendering in task detail (#93).
6. Add reorder controls with keyboard-accessible move actions; persist per-phase order updates (#88).
7. Ensure all consumer reads that present task ordering use canonical order semantics and remain read-only on portal/collab surfaces (#88).
8. Wire dashboard task links to URL state and hydrate project task view open/highlight/scroll flow, including param cleanup (#90).
9. Extend collaborator-note label behavior into project activity feed detail and add tests (#91).
10. Finish #86 discoverability audit items and missing focused interaction tests.
11. Add admin email/password sign-in in login UI/provider while preserving mfaChallenge/notAdmin flows and backend guards (#94).
12. Run validation suite; fix regressions; capture any follow-up tickets for deferred scope.

## Test Plan

### Unit/component tests
- Tasks and timeline:
  - TasksSection: reorder keyboard controls, deep-link selection/open behavior, collapsed-phase auto-expand, divider/clickability assertions.
  - TimelineView: label-click open path and focus-visible behavior.
  - TaskDetailPanel: blockedBy callout, unblock clears, collaboratorCanSeeAllAttachments toggle.
- Dashboard:
  - DashboardPage: task links include `?task=` and navigate to project task state.
- Activity:
  - ActivitySection/activity labels: collaborator note shows labeled "Notes:" detail.
- Admin auth:
  - AdminLoginPage/AdminAuthProvider: email/password success path, invalid credentials, not-admin state, MFA challenge continuation, Google path regression.

### Rules tests (Firestore + Storage)
- `backend/rules-tests/src/tasks.test.ts`:
  - dependsOn policy assertions (removed or optional legacy).
  - blockedBy field shape and unblock transitions.
- `backend/rules-tests/src/collab.test.ts`:
  - collaboratorCanSeeAllAttachments true/false/missing behavior.
  - ZIP metadata allow path for collaborator uploads.
- `backend/rules-tests/src/storage.test.ts` and `backend/rules-tests/src/collabStorage.test.ts`:
  - ZIP bytes allowlist parity.
  - #92 storage-read behavior for false-flag path (or callable-signed-url fallback design if selected).

### Validation commands
- `pnpm --filter @siapp/web test`
- `pnpm test:rules`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`

## Out Of Scope
- Any new notification/channel behavior beyond issue scopes (#86-#94).
- Cross-surface visual redesign unrelated to task discoverability/callouts.
- Re-architecting collaborator auth/session model.
- Billing/admin feature changes outside #94 sign-in path.
- Non-MVP enhancements not requested in issue set.

## Risks / Open Questions (Decisions Needed)

1. **#92 Storage-rule enforcement feasibility:** current storage rules cannot directly inspect Firestore task flag; decision needed between:
   - A) move collab downloads behind callable-signed URLs and tighten storage reads, or
   - B) accept Firestore-metadata enforcement only (does not fully satisfy issue wording).

2. **#89 dependsOn deprecation depth:** retain as legacy-only in seeds/duplicate/export, or fully remove from all generation and copy flows now.

3. **#91 activity detail source-of-truth:** should collaborator note text be duplicated into project activity payload, or should activity link to task-update entry without duplicating content.

4. **#90 URL param contract:** finalize param name and lifecycle (`task`, `taskId`, cleanup strategy) to avoid future routing conflicts.

5. **#94 password reset path inclusion:** whether to include reset flow now (requires allowed continue URL/domain confirmation for admin surface) or keep this issue strictly to sign-in.
