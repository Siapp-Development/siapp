# Implementation plan — #15 Duplicate project (D-031)

## Context

Issue #15 (M1 — Firm app core): firms create subsequent projects from an existing one — per D-031 this is the *only* firm-side scaffolding path (no customer-facing templates in MVP; see `pm_ux/plans/decisions-log.md` §D-031). The rule is **structure carries, content clears**: task titles, order, phase grouping, dependency links, per-task `restrictedToDepartments` / `visibleToClient` / `sendWhatsapp` carry; assignees, dates, statuses, updates, documents and % complete clear; the copy starts in `lifecycle: 'draft'`. Wireframe [A3b] specifies the entry point: the Create-project screen is a two-mode chooser, **Blank or Duplicate from existing** (`pm_ux/plans/22-wireframe-review.md`).

Everything this needs already exists:

- Schema: `IProjectDoc.duplicatedFromProjectId?: string` is already declared (packages/shared/src/firestoreTypes.ts:263), as are `IPhaseDoc` and `ITaskDoc` with `dependsOn`, `sendWhatsapp`, `restrictedToDepartments`, `visibleToClient`, `order` (firestoreTypes.ts:280, :332).
- Rules: project create (firestore.rules:307) already forces `lifecycle == 'draft'`, zeroed `summary`, `collaboratorsCount == 0`, `ownerUid/createdBy == auth.uid` for owner/admin/pm. Task create (firestore.rules:372) validates the full task shape via `validTaskFields`, pins `createdBy`, and enforces `canSeeRestricted` on the incoming doc. Phase create (firestore.rules:359) via `validPhaseFields`. **One gap**: the project-create key allowlist does *not* include `duplicatedFromProjectId`, so a client write carrying provenance is currently denied.
- Web: `createProject` in apps/web/src/surfaces/firm/projects/useProjects.ts:139 shows the exact create-rule-satisfying doc shape; `useTasks.ts` has the pm/viewer constrained-query pattern (unrestricted + per-dept `array-contains`) and `mapTask`; `getRestrictedTaskHeaders` (apps/web/src/lib/callables.ts) reports tasks hidden from the caller; `ProjectsListPage.tsx` hosts the New-project `ProjectForm` card; `onTaskWrite → recomputeProjectSummary` (from #12) will recompute `summary` automatically as copied tasks land.

**Volume & write budget**: MVP projects are ~10 phases + ~60 tasks (impl-13 sizing) → 1 + 10 + 60 ≈ 71 writes, far under the 500-op `writeBatch` limit. A client-side **single atomic batch** works under existing rules with only the one-key allowlist addition — no Cloud Function needed, consistent with the #13 "write path is client-side, rules-validated" convention (callables are reserved for privileged transitions like `setProjectLifecycle`, D-027).

**Base branch**: current branch is `feat/14-documents` with PR #45 open — branch `feat/15-duplicate-project` off `main` **after #45 merges** (same pattern as impl-14). Committed plan copy: `plans/impl-15-duplicate-project.md`.

## Scope decisions — NEED USER APPROVAL

1. **Client-side batched write, no callable** (recommended). One `writeBatch`: project doc + all phase docs + all task docs, committed atomically. Guard: if total ops would exceed 500 (≈489 tasks+phases), fail with "project too large to duplicate" — no chunking at MVP. Alternative rejected: an Admin-SDK callable could copy tasks the caller can't see, but that breaks the rules invariant "you can never create a task you couldn't see" and adds a function for no MVP-scale reason.
2. **Restricted tasks the caller cannot see → block, don't partial-copy** (recommended). A pm outside a restricted department can neither read those tasks nor create their copies (rules deny both). Before copying, a pm/viewer-role caller calls `getRestrictedTaskHeaders`; if any hidden tasks exist, the duplicate is blocked with "This project has N restricted task(s) you can't access — ask an owner or admin to duplicate it." Owner/admin always see everything, so they can always duplicate. Alternative (partial copy with a warning) silently drops structure and dangling dependencies — worse.
3. **Task `description` is copied** (recommended, needs a call). D-031's carried/cleared table doesn't mention it. Descriptions are instructions ("pour per spec §4"), i.e. structure you'd rebuild by hand — copying fits "structure carries". Flag if you'd rather clear it.
4. **Project-level fields on the copy**: `vertical` copied (locked in the form — it's create-only structure); `visibility.clientCanSee` defaults to the source's value, user-editable; `name` prefilled "Copy of {source}", editable; `code` cleared (user may type a new one); `startDate` user-entered (defaults today — rules require a timestamp); `status` resets to `'planning'`; `clientId`/`clientNameDenorm` cleared to `''` (client links are #16); `targetEndDate`/`actualEndDate` cleared; `duplicatedFromProjectId` = source id.
5. **Role gate = owner/admin/pm**, identical to project create — no new rules concept. Viewer sees no duplicate affordance (list "New project" button is already gated).
6. **Entry point = A3b two-mode chooser only** (list page). The "New project" card on `ProjectsListPage` gains a `Blank | Duplicate from existing` mode toggle; Duplicate mode adds a source-project select (non-deleted projects). No row-menu or Details-tab duplicate button at MVP — D-031 says "from the projects list", and the detail page adds surface without evidence.
7. **Status enum mapping**: D-031's table says task status resets to `not_started`; the shipped `TTaskStatus` enum is `['todo','in_progress','blocked','done']` — reset to `'todo'` (and phase status to `'todo'`, project status to `'planning'`). Noted here so nobody "fixes" it to a nonexistent enum value.

## Data model & rules changes

- **No new collections or fields** — `duplicatedFromProjectId` already exists in the shared types and D-031.
- **firestore.rules** (one-line-ish change): add `'duplicatedFromProjectId'` to the project **create** `keys().hasOnly([...])` allowlist (firestore.rules:310) plus `(!('duplicatedFromProjectId' in d) || (d.duplicatedFromProjectId is string && d.duplicatedFromProjectId.size() > 0))`. The **update** diff allowlist (firestore.rules:347) is deliberately *not* touched → the field is create-only and immutable, preserving provenance. Multi-tenant isolation is unchanged: all writes stay under `/workspaces/{wid}` with the existing `hasRole`/`canSeeRestricted` guards.

### Exact field mapping (copy → clear)

| Doc | Copied | Cleared / reset |
|---|---|---|
| `IProjectDoc` | `vertical`; `visibility.clientCanSee` (default, editable) | new `id`; `name`/`code`/`startDate` from form; `lifecycle: 'draft'`; `status: 'planning'`; `clientId: ''`, `clientNameDenorm: ''`; `ownerUid`/`createdBy` = caller, `ownerNameDenorm` = caller name; `targetEndDate`/`actualEndDate`/`publishedAt`/`completedAt` omitted; `summary` zeroed (trigger recomputes); `visibility.collaboratorsCount: 0`; `createdAt`/`updatedAt` serverTimestamp; `duplicatedFromProjectId` = source id |
| `IPhaseDoc` | `name`, `order` | new `id`; `status: 'todo'`; `startDate`/`endDate` omitted |
| `ITaskDoc` | `title`, `description` (decision 3), `order`, `phaseId` (**remapped** old→new phase id), `visibleToClient`, `restrictedToDepartments`, `sendWhatsapp`, `dependsOn` (**remapped** old→new task ids) | new `id`; `status: 'todo'`; `startDate`/`dueDate`/`completedAt` omitted; `assignees: []`; `visibleToCollaboratorIds: []`; `createdAt`/`updatedAt` serverTimestamp; `createdBy` = caller |
| `updates/*`, `documents/*`, milestones | — | **not copied** (subcollections never enumerated) |

### Dependency remapping

Pre-generate new auto-ids for every phase and task via `doc(collection(db, …))` *before* building the batch; build `Map<oldId, newId>` for tasks and phases; rewrite each `dependsOn` entry and `phaseId` through the maps. Entries with no mapping (stale ids pointing at deleted tasks — possible today since task delete doesn't clean up inbound `dependsOn`) are **dropped**, which also keeps the copy valid against `validTaskFields` (no self-deps, ≤ 50).

## Steps

### 0. Setup
- After PR #45 merges: `git checkout main && git pull`, branch `feat/15-duplicate-project`.
- Copy this plan to `plans/impl-15-duplicate-project.md` (committed with the PR, per convention).

### 1. Shared (`packages/shared/src`)
- **No changes expected** — `duplicatedFromProjectId`, `IPhaseDoc`, `ITaskDoc` already cover the feature. Verify only.

### 2. Rules (`firestore.rules`)
- Project create allowlist + validation per "Data model & rules changes" above. Nothing else — phases/tasks create rules already validate every copied doc.

### 3. Rules tests (`backend/rules-tests/src/projects.test.ts` — extend)
Conventions from the existing file (`createTestEnv`/`seedWorkspace`/`dbAs`, `validProject(id, extra)` factory):
- create with `duplicatedFromProjectId: 'src-project'` → allow for owner/admin/pm.
- create with `duplicatedFromProjectId: 123` (non-string) or `''` → deny.
- update introducing/modifying `duplicatedFromProjectId` on an existing project → deny (immutability).
- batch-shaped sanity: project create + task create with `createdBy` = caller in the same batch → allow; task copy carrying a `restrictedToDepartments` dept the pm is not in → deny (documents the decision-2 block rationale at the rules layer).

### 4. Web data layer (`apps/web/src/surfaces/firm/projects/duplicateProject.ts` — new)
- **Pure planner, unit-testable without Firestore**: `buildDuplicatePlan(sourcePhases, sourceTasks, idFor: () => string)` → `{ phases: [...], tasks: [...] }` with remapped `phaseId`/`dependsOn` and all clears applied per the mapping table. Keep it free of Firebase imports (takes plain rows, returns plain docs).
- `duplicateProject({ workspaceId, sourceProjectId, values: IProjectFormValues, uid, ownerName, role, departments })`:
  1. One-shot `getDocs` of source phases; one-shot tasks read — owner/admin: whole collection; pm: the #13 constrained pair (`restrictedToDepartments == []` + per-dept `array-contains`), deduped by id. Reuse/extract the query-constraint + `mapTask`/`mapPhase` helpers from `tasks/useTasks.ts` (export them; do not fork the mapping logic).
  2. pm only: `getRestrictedTaskHeaders`; if `headers.length > 0`, throw a typed `DuplicateBlockedError { hiddenCount }` (decision 2).
  3. Guard `1 + phases + tasks <= 500` else typed "too large" error (decision 1).
  4. `writeBatch`: project doc (exact `createProject` shape + `duplicatedFromProjectId`, decision-4 fields) + phase docs + task docs from the plan; single `commit()`. Return new project id.

### 5. Web UI (`apps/web/src/surfaces/firm/projects/ProjectsListPage.tsx` — modify; `ProjectForm.tsx` — small prop)
- New-project card gains an accessible mode toggle (radio group, per A3b): **Blank** (default, current behaviour) | **Duplicate from existing**.
- Duplicate mode: source `<select>` over non-deleted projects (label: name + code); on selection, mount `ProjectForm` with prefill `{ name: 'Copy of {source}', vertical: source, clientCanSee: source, code: '', startDate: today, targetEndDate: null, status: 'planning' }` and `vertical` disabled (add a narrow `verticalLocked`/prefill prop to `ProjectForm` rather than a fork). Helper text: "Copies phases, tasks, order, dependencies and visibility settings. Assignees, dates, statuses, updates and documents are not copied. The copy starts as a draft."
- Submit → `duplicateProject(...)`; success closes the card (new draft appears via the live `useProjects` subscription). `DuplicateBlockedError` → inline `Alert` with the decision-2 message; "too large" → its own message.

### 6. Web tests (mock data-layer wholesale, `vi.hoisted` + `vi.mock`, per ProjectsListPage.test.tsx)
- `duplicateProject.test.ts` (pure `buildDuplicatePlan`): phase remap; dependsOn remap incl. dropped dangling ids; clears (assignees/dates/status/visibleToCollaboratorIds) and carries (title/description/order/restrictedToDepartments/visibleToClient/sendWhatsapp) exhaustively; deterministic `idFor` stub.
- `ProjectsListPage.test.tsx` (extend): mode toggle renders for pm, absent for viewer; duplicate submit calls `duplicateProject` with source id + form values; vertical select disabled in duplicate mode; blocked error renders the Alert.

### 7. Verify
- `pnpm turbo typecheck lint test build`; root `pnpm test:rules` (env: `PATH=/opt/homebrew/opt/node@22/bin:...`, `JAVA_HOME=/opt/homebrew/opt/openjdk@21`); `node scripts/check-bundle-isolation.mjs` (firm-only change; /p/, /t/, admin bundles untouched).
- Emulator smoke (`--project siapp-prod`): seed a project with 2 phases + 5 tasks (one dept-restricted, one with `dependsOn` + `sendWhatsapp: true` + `visibleToClient: true`, assignees and dates set); as owner duplicate → verify copy is `draft`, `duplicatedFromProjectId` set, deps remapped to new ids, assignees/dates empty, statuses `todo`, `summary` recomputed by trigger (totalTasks = 5, progressPct = 0), updates/documents subcollections empty; as in-dept pm duplicate → allow; as out-of-dept pm → blocked with N = 1; REST negative: project create with `duplicatedFromProjectId: 123` → PERMISSION_DENIED.
- Flag explicitly: UI not browser-verified unless a browser is available.

### 8. Ship
- Conventional commit(s), push, PR against `main` using `.github/pull_request_template.md`. Surfaces: firm app + rules. PR body notes decisions 2/3 and the enum mapping (decision 7).

## Critical files
- `firestore.rules` (~line 307–316, project create allowlist)
- `backend/rules-tests/src/projects.test.ts` (extend)
- `apps/web/src/surfaces/firm/projects/duplicateProject.ts` + `duplicateProject.test.ts` (new)
- `apps/web/src/surfaces/firm/projects/ProjectsListPage.tsx`, `ProjectForm.tsx`, `ProjectsListPage.test.tsx` (modify)
- `apps/web/src/surfaces/firm/projects/tasks/useTasks.ts` (export mapping/query helpers)
- `plans/impl-15-duplicate-project.md` (this plan, committed)

## Out of scope (follow-ups)
Siapp-Admin starter-project provisioning seeds (the other half of D-031 — separate ticket); milestones copy (milestones CRUD itself is still a follow-up from #13); copying documents/updates (explicitly cleared by D-031); duplicate button on the project detail page or row menu; cross-workspace duplication; chunked >500-doc copies; template engine of any kind (D-031 revisit gate); client/collaborator re-linking on the copy (#16); cleanup of stale `dependsOn` ids on task delete (pre-existing, noted).

## Risks / open questions
- **Decision 3 (copy `description`)** needs an explicit call — D-031's table is silent on it.
- **Decision 2 (block vs partial copy)** changes pm UX for restricted-heavy projects; blocking is safest but means some pms must ask an owner/admin.
- Concurrent edits to the source during the read→batch window can produce a copy of a mid-edit snapshot; accepted at MVP (reads are one-shot, copy is still internally consistent).
- The summary trigger recomputes per task write; a 60-task batch fires ~60 recomputes. Known #12 behaviour, harmless at MVP volume — flag in PR, no action.
