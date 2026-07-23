# Implementation Plan — Projects CRUD + Lifecycle (issue #12, milestone M1)

## Goal

Project lifecycle per D-027: firms create, edit, and list projects in the dashboard; nothing fires and no external access exists until an explicit publish. Deliverables map to the issue's acceptance criteria:

- Create (Blank), edit, list projects: name, client, status, dates.
- % complete computed from tasks (`summary` maintained by trigger — starter projects already ship with seeded tasks).
- Lifecycle states with publish gate; publish dialog shows WA count + cost preview (D-027).
- Draft: portal/task links inactive by contract (`lifecycle` is the single gate #19/#21/#22 consume); no sends is vacuously true until #19 exists — the gate contract is what this ticket delivers.
- Soft delete (`lifecycle: 'deleted'`, owner only).

## Proposed decisions (need sign-off before build)

1. **Write-path split.** Field CRUD (name, code, clientId, status, dates, visibility) is **client-side Firestore, rules-validated** (owner/admin/pm, field allow-list — mirrors the departments pattern from #11). **Lifecycle transitions are callable-only** (`setProjectLifecycle`): the D-027 transition/role matrix, timestamp stamping (`publishedAt`/`completedAt`/`archivedAt`/`deletedAt`), and the future side effects (#19 welcome WAs, #23 audit) must be server-side ("defense in depth", firestore-data-model.md §gate-enforcement). Rules make `lifecycle` + its timestamps + `summary` + denorm fields client-immutable.
2. **Publish preview = `dryRun` on the same callable.** `setProjectLifecycle({ action: 'publish', dryRun: true })` returns `{ waCount, estimatedCostMyr }` computed server-side (Admin SDK sees restricted tasks a pm cannot read, so no undercount): tasks with `sendWhatsapp && collaborator assignees` + 1 client welcome if `clientId` set. Cost constant RM 0.10/utility conversation (21-cost-estimation §2.8) in a named shared constant — refined in #19/#24.
3. **Client field optional until #16.** `clientId: ''` allowed (the Siapp-Admin starter project already does this). The create/edit form shows a client selector fed by the `clients` collection (readable per rules) with a "No client yet" option; management arrives in #16.
4. **Summary trigger lands now.** The `onTaskWrite` stub becomes real: recompute `summary` (totalTasks/doneTasks/overdueTasks/progressPct/lastActivityAt) in a transaction (hot-doc note: data model allows debounce "at most every 2s"; at MVP volume a straight transactional recompute per write is fine — debounce deferred to #13 if needed). Satisfies "% complete computed from tasks" against the seeded starter tasks.
5. **Soft delete only.** `deleted` hides the project everywhere in the UI; no hard purge (retention job is a later ticket per 14-legal-compliance).

## Architecture

### Lifecycle transitions (D-027, authoritative table in firestore-data-model.md)

| Action | Transition | Allowed roles |
|---|---|---|
| `publish` | draft → published | owner, admin, pm |
| `complete` | published → completed | owner, admin, pm |
| `archive` | published → archived | owner, admin |
| `archive` | completed → archived | owner, admin, pm |
| `reopen` | completed → published | owner, admin |
| `delete` | any → deleted | owner |

`deleted` is terminal. Invalid transition or insufficient role → `HttpsError('failed-precondition', …, { code })` with stable codes `project/invalid-transition`, `project/forbidden-transition`, `project/not-found` (mirrors the `invite/*` error-surface pattern; web maps codes via a `projectErrorCode()` sibling of `inviteErrorCode()`).

### Callable

`setProjectLifecycle` (asia-southeast1, same region wiring as #11 via `globalOptions.ts`):

```ts
interface ISetProjectLifecycleRequest {
  workspaceId: string;
  projectId: string;
  action: 'publish' | 'complete' | 'archive' | 'reopen' | 'delete';
  dryRun?: boolean; // only meaningful for 'publish'
}
interface ISetProjectLifecycleResponse {
  lifecycle: TProjectLifecycle;      // resulting (or current, when dryRun) state
  publishPreview?: { waCount: number; estimatedCostMyr: number }; // publish only
}
```

Handler: auth → role from claims → load project → pure transition check (`lib/projectLifecycle.ts`, unit-tested state machine like `lib/invites.ts`) → if `dryRun`, compute preview and return → else update `lifecycle` + matching timestamp + `updatedAt` in a transaction.

### Firestore rules

Replace `allow write: if false` on `projects/{pid}`:

- `create`: `hasRole(wid, ['owner','admin','pm'])`, field allow-list, `lifecycle == 'draft'`, `status in [...]`, `summary` zeroed shape, `createdBy == request.auth.uid`, string-length sanity on `name`.
- `update`: same roles; diff-restricted to editable fields (`name`, `code`, `clientId`, `clientNameDenorm`, `status`, `startDate`, `targetEndDate`, `actualEndDate`, `visibility.clientCanSee`, `updatedAt`) — `lifecycle`, lifecycle timestamps, `summary`, `ownerUid/ownerNameDenorm`, `createdAt/createdBy` immutable from clients. Editing blocked when `lifecycle in ['archived','deleted']` and (per D-027 table) when `completed` — except nothing: completed is read-only client-side; re-open first.
- `delete`: `false` (soft delete via callable).
- Read stays `isFirmMember(wid)`; UI filters `lifecycle != 'deleted'` (and archived behind a toggle).

### Web (dashboard surface only)

- `/:slug` index → **ProjectsListPage** (replaces the FirmShell placeholder): live `onSnapshot` list (name, client, status chip, lifecycle badge, % complete bar from `summary.progressPct`, dates), "New project" (owner/admin/pm), archived toggle, deleted hidden.
- `/:slug/projects/:pid` → **ProjectDetailPage**: editable fields (role-gated), lifecycle action buttons per matrix, **PublishDialog** (calls dryRun → shows "N WhatsApp messages will be sent, est. RM X.XX" → confirm calls the real action), delete confirm (owner only, type-name-to-confirm).
- Hooks in `surfaces/firm/projects/useProjects.ts` following `useTeamData.ts` conventions (`useCollection` reuse).

## Files

### packages/shared
- `src/callableTypes.ts` — `ISetProjectLifecycleRequest/Response`, `TProjectLifecycleAction`, `TProjectErrorCode`.
- `src/constants.ts` (new) — `WA_UTILITY_COST_MYR = 0.10`.

### backend/functions
- `src/lib/projectLifecycle.ts` (new) — pure transition state machine + role matrix. Unit-tested.
- `src/callables/setProjectLifecycle.ts` (new) — handler incl. publish preview scan.
- `src/triggers/projectSummary.ts` (new) — transactional `summary` recompute; wired into the existing `onTaskWrite` export.
- `src/index.ts` — export `setProjectLifecycle`; `onTaskWrite` calls `projectSummary`.
- (mirrors types locally — functions has no `@siapp/shared` dep, per #11 precedent.)

### firestore.rules + backend/rules-tests
- `projects` create/update rules as above.
- `projects.test.ts` (new) — matrix: create by pm allow / viewer deny; lifecycle field mutation deny (all roles); summary mutation deny; edit-while-archived deny; edit-completed deny; immutable-field tamper deny; delete deny; read any member.

### apps/web
- `src/lib/callables.ts` — `setProjectLifecycle()` wrapper + `projectErrorCode()`.
- `src/surfaces/firm/projects/` (new) — `ProjectsListPage.tsx`, `ProjectDetailPage.tsx`, `ProjectFormDialog.tsx`, `PublishDialog.tsx`, `useProjects.ts` (+ tests for each).
- `src/surfaces/firm/FirmShell.tsx` — index route → ProjectsListPage; add `projects/:pid` route; sidebar "Projects" becomes a real link.

## Out of scope (explicit)

- Duplicate project (#15) — `duplicatedFromProjectId` written by nothing yet.
- Tasks CRUD (#13) — summary trigger reads seeded tasks only.
- Outbox / actual WA sends + draft preview records (#19) — this ticket delivers the gate they consume.
- Client management (#16), portals (#21/#22), audit log capture (#23), phases UI.

## Validation

- `pnpm turbo typecheck lint test` green (web/functions/shared); `pnpm test:rules` with the new projects matrix.
- Manual (emulators + seed): create project → appears in list; edit fields; publish dialog shows count/cost from starter tasks (`sendWhatsapp` seeds exist); lifecycle buttons follow role matrix (test as owner + pm); delete hides project; % complete moves when a task doc is flipped to `done` in the emulator UI.
- Bundle isolation check (no firm imports in /p /t).
