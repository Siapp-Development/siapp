# Implementation plan — #17 Dashboards (my tasks, overdue, this week, project health)

## Context

Issue #17 (M1 — Firm app core): the firm home screen, wireframe **[A0]**. Per the resolved 2026-07-12 review pass (`pm_ux/plans/22-wireframe-review.md` items #1, #6, #7):

- A0 is **action-oriented** — "only rows that need a decision"; the full project inventory stays on [A2] (`ProjectsListPage`).
- `+ New project` is the single primary CTA in the A0 header.
- Firm nav is `Home · Projects · Clients · Collaborators · Messaging · Settings`. Today `FirmShell.tsx` has no Home entry and mounts `ProjectsListPage` at the workspace index route.
- MVP scope line (`pm_ux/plans/11-mvp-scope.md`): "**Dashboards**: my tasks, overdue, this week, project list with health".

What already exists and is reused:

- **Pre-aggregated project health inputs**: `projects/{pid}.summary` (`totalTasks`, `doneTasks`, `overdueTasks`, `progressPct`, `lastActivityAt`) is maintained server-side by `recomputeProjectSummary` (`backend/functions/src/triggers/projectSummary.ts`) on every task write — this **is** the "pre-aggregation via Functions" the issue asks for. `useProjects.ts` already maps `summary` onto `IProjectRow` and `ProjectsListPage` already renders `overdueTasks > 0 && '… overdue'`.
- **Department-safe task queries**: `taskQueriesFor(tasksPath, seesEverything, departments)` in `apps/web/src/surfaces/firm/projects/tasks/useTasks.ts` produces the exact query set the #13 list rules can prove (whole collection for owner/admin; `restrictedToDepartments == []` + one `array-contains` per claim department for pm/viewer). `mapTask` maps raw docs to `ITaskRow`.
- **Rules**: tasks live at `workspaces/{wid}/projects/{pid}/tasks/{tid}` with list rules proven against the query (`canSeeRestrictedList`). There is **no** collection-group match for tasks and a catch-all `match /{document=**} { allow read, write: if false; }` — a `collectionGroup('tasks')` query is denied today. Task docs carry **no `workspaceId`/`projectId` fields** (`validTaskFields` `hasOnly` list), so a collection-group rules match couldn't even establish tenancy without a schema + rules + backfill change. This plan avoids that entirely (decision D1).
- **Statuses**: `TTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done'`; `TProjectStatus` (execution) and `TProjectLifecycle` (visibility gate, D-027) are orthogonal — the data model doc explicitly keeps `status` "for dashboards, filters, and project health".
- **Assignee shape**: `assignees: TTaskAssignee[]` — array of maps (`{ type: 'user', id, name }` | `{ type: 'collaborator', id, name, phone }`). There is no flat `assigneeUids` field, so "my tasks" cannot be a server-side filter without a denorm field (see D3).
- **Indexes**: `firestore.indexes.json` has no task indexes. All existing task queries are single-clause (no composite index needed) — this plan keeps it that way (D8).

**Base branch**: `feat/17-dashboards` off latest `main`. Committed plan copy: `plans/impl-17-dashboards.md`.

**Surfaces touched**: firm app (`dashboard.siapp.app/{slug}`) only. `/p/*`, `/t/*`, apex, and admin bundles untouched — bundle isolation (D-036) unaffected; `scripts/check-bundle-isolation.mjs` must stay green.

## Acceptance criteria mapping

| Criterion | Where it lands |
|---|---|
| My tasks view | `DashboardPage` "My tasks" section — fan-out task reads via `useDashboardTasks`, filtered client-side to `assignees` containing `{ type: 'user', id: uid }` and `status != 'done'` |
| Overdue view | Same data, bucketed by `dueBuckets.ts`: `dueDate < now` and `status != 'done'` |
| Due this week view | Same data, bucket: `now <= dueDate < now + 7 days` (D6) |
| Project list with health indicators | "Needs your attention" project table on `DashboardPage`, health derived from `project.summary` (+ new `summary.blockedTasks`) via `projectHealth.ts` + `HealthBadge` (D4) |
| Pre-aggregation via Functions where queries demand it | Existing `recomputeProjectSummary` trigger extended with `blockedTasks`; no *new* function needed — personal task lists are computed client-side from rules-provable queries (D1) |

## Decisions needed — NEED USER APPROVAL

1. **D1 — Cross-project "my tasks" query strategy: per-project fan-out reusing `taskQueriesFor` (recommended).** The dashboard subscribes to `useProjects` (already whole-collection), takes the actionable projects (lifecycle `draft`/`published`, status not `archived`), and runs the existing `taskQueriesFor` query set per project — identical security posture to the project board, zero rules changes, zero new indexes, restricted tasks physically unfetchable. Cost: N projects × (1 + deptCount) listeners; at MVP volume (design partners, ≲ 20 active projects) that's ≲ 40–60 listeners, within Firestore's limits; a `getDocs` one-shot fallback is a drop-in change if listener count ever bites.
   - *Alternative A — `collectionGroup('tasks')`*: needs (a) a `match /{path=**}/tasks/{tid}` rules block, which cannot see `{wid}` from the path, forcing a `workspaceId` field on every task doc + `validTaskFields` change + backfill of all existing tasks + rules test surface; (b) composite collection-group indexes; (c) it still can't combine the department `array-contains` clause with an assignee `array-contains` clause (one `array-contains` per query max), so "my tasks" filtering ends up client-side anyway. High cost, no win at MVP scale. Rejected.
   - *Alternative B — Functions-maintained per-member dashboard doc* (`workspaces/{wid}/memberDashboards/{uid}`): "overdue" and "due this week" are **time-derived** — they change with no write occurring, so the doc goes stale unless a scheduled function sweeps every workspace daily, and assignment/dept changes need careful fan-out. Real complexity, worse freshness than live queries. Rejected for personal lists; pre-aggregation stays where it already earns its keep (project summary).
2. **D2 — Dashboard route: A0 becomes the workspace index (`dashboard.siapp.app/{slug}`); the projects list moves to `/{slug}/projects` (recommended).** Matches the wireframe nav (`Home` first) and the A0/A2 split; `projects/:projectId` detail URLs are unchanged and now nest naturally. Old bookmarks to `/{slug}` land on Home instead of Projects — acceptable pre-launch (D-036 notes firm-app URL reversal cost is low pre-launch). *Alternative*: dashboard at `/{slug}/home` keeping Projects at index — preserves current URLs but contradicts the wireframe nav order and makes "Home" not the home. Rejected.
3. **D3 — "My tasks" matching is client-side over the fetched rows** (`assignees.some(a => a.type === 'user' && a.id === uid)`) **— no `assigneeUids` denorm field (recommended).** Follows directly from D1 (rows are already in memory). *Alternative*: add `assigneeUids: string[]` denorm to task docs for future server-side filtering — schema + rules + write-path churn with no consumer at MVP. Rejected until a real server-side query needs it.
4. **D4 — Project health = derived enum from `project.summary`, with one trigger extension (recommended).** Add `blockedTasks` to the summary computed by `recomputeProjectSummary` (count of `status == 'blocked'`). Health derivation (pure function `projectHealth.ts`): `overdue` if `summary.overdueTasks > 0`, else `blocked` if `summary.blockedTasks > 0`, else `on_track`. `lifecycle: 'draft'` shows the existing `LifecycleBadge` alongside (a draft with a linked client is an A0 "needs your attention" row: *unpublished draft*). "Needs your attention" table = projects where health ≠ `on_track` OR (lifecycle `draft` and `totalTasks > 0`); everything healthy renders the positive empty state instead. *Alternatives*: (a) compute health client-side from the D1 fan-out rows — always fresh, but a pm's counts silently exclude other departments' restricted tasks, so two members would see different health for the same project; (b) add a "stalled" state from `summary.lastActivityAt` — deferred, no wireframe or scope line asks for it.
5. **D5 — Accept `summary.overdueTasks` write-time staleness for the health chip; personal overdue list is always fresh (recommended).** The summary only recomputes on task writes, so a project's overdue *chip* can lag until the next write (A2 already ships with this behaviour since #12). The member's own "Overdue" list is computed client-side from live rows against `Date.now()` — never stale. *Alternative*: a scheduled function (e.g. daily 00:05 MYT) sweeping all workspaces to refresh summaries — real cost/complexity for a chip that self-heals on any task touch; defer as a follow-up if partners notice.
6. **D6 — "Due this week" = due within the next 7 × 24 h from now, in the viewer's local timezone, excluding overdue and done (recommended).** Rolling window is action-oriented ("what's coming at me"), avoids the Mon-vs-Sun calendar-week argument, and needs no workspace timezone plumbing. MVP is Malaysia-only (quiet hours already default `Asia/Kuala_Lumpur`), so viewer-local ≈ MYT in practice. Buckets are mutually exclusive: Overdue (`dueDate < now`), Due this week (`now ≤ dueDate < now+7d`), the rest under "My tasks". Implemented in a pure, unit-tested `dueBuckets.ts` taking `now` as a parameter. *Alternatives*: calendar week Mon–Sun in fixed `Asia/Kuala_Lumpur` (matches the literal word "week"; needs a tz library or manual offset math — flag if you prefer this reading); workspace-configurable timezone (no field exists; out of scope).
7. **D7 — Restricted-task exposure: personal lists structurally exclude them; project health counts include them as aggregates (recommended).** Lists/counts of *my* tasks come only from rules-provable queries — a pm can never fetch (hence never count or render) another department's restricted task. Project `summary` counters are computed server-side over **all** tasks and readable by every member — aggregate numbers only, no titles/content; this is the existing, shipped #12 precedent (A2 already shows `overdueTasks` to everyone) and matches 20-access-control (need-to-know gates task *content*, not project-level rollups). *Alternative*: per-viewer health counts — requires per-department summary fan-out or client-side computation (see D4a inconsistency). Rejected; flagging explicitly since the issue calls this out.
8. **D8 — No new composite indexes; `firestore.indexes.json` untouched (recommended).** All dashboard queries are the existing single-clause task queries plus the whole-projects subscription; sorting/bucketing is client-side. The data-model doc's index table (`My tasks — tasks collection group — assignees.id ASC…`) presumed a collection-group strategy that D1 rejects (and `assignees.id` isn't indexable over an array-of-maps anyway — that table row is stale; noted in Risks). *Alternative*: only needed if D1-Alternative-A is chosen.
9. **D9 — KPI cards scope: three counters derived from the same fetched data (My tasks · Overdue · Due this week), acting as filters for the task list below; the A0 "WA this month 255/300" card is deferred (recommended).** WhatsApp usage counters belong to the messaging/billing tickets (#19/#24) — `usageCounters/{period}` docs exist in rules but nothing writes them yet. A dead "0/300" card is worse than no card. *Alternative*: render the WA card with a "coming soon" placeholder — visual completeness against the wireframe at the cost of shipping a lie. Rejected.

## Data model & rules changes

- **Firestore rules: no changes.** No collection-group match, no new collections, no new client-writable fields. Multi-tenant isolation is untouched — every read the dashboard performs is an already-ruled read (`projects` under `isFirmMember`, tasks under the #13 list rules).
- **Schema**: `projects/{pid}.summary` gains `blockedTasks: number` (server-written only, like the other counters; `summary` is already client-immutable per #12, so no rules edit). Update `IProjectDoc['summary']` in `packages/shared/src/firestoreTypes.ts` (optional field to tolerate docs written before the trigger redeploy) and the data-model doc is *not* edited by this ticket (it's a pm_ux artifact; a one-line follow-up note is listed under Out of scope).
- **Backfill**: none required — `blockedTasks` is absent on existing projects until their next task write; `projectHealth.ts` treats missing as `0`.

## Steps

### 0. Setup
- Branch `feat/17-dashboards` off up-to-date `main`. Commit this plan file.

### 1. Shared (`packages/shared/src/firestoreTypes.ts`)
- Add `blockedTasks?: number` to the project `summary` shape.

### 2. Functions (`backend/functions/src/triggers/projectSummary.ts`)
- Extend the existing transaction loop: count `status === 'blocked'` into `blockedTasks` and include it in the `summary` update. No new exports, no new triggers.
- Extend the existing trigger unit test (`backend/functions/src/triggers/projectSummary.test.ts` or wherever the current coverage lives) with a blocked-task fixture.

### 3. Web data layer (`apps/web/src/surfaces/firm/dashboard/` — new module)
- `useDashboardTasks.ts` (new): fan-out hook per D1. Inputs: `workspaceId`, `role`, `departments`, `projects: IProjectRow[]` (threaded from `useProjects` so the collection is subscribed once). For each actionable project (lifecycle `draft`/`published`, status ≠ `archived`), build `taskQueriesFor(path, seesEverything, departments)` and `onSnapshot` each query; merge rows deduped by `projectId + taskId` (reuse `mapTask`), tagging each row with `{ projectId, projectName }`. State machine mirrors `useTasks` (`loading` until every expected query has answered / `error` on any failure / `ready`). Resubscribe key: workspaceId + sorted actionable-project-id list + role + departmentsKey (same `\u0000` join trick as `useTasks`).
- `dueBuckets.ts` (new, pure): `bucketTasks(rows, uid, now)` → `{ myOpen, overdue, dueThisWeek }` per D3/D6 — filters to `type:'user', id: uid` assignee, excludes `done`, buckets by `dueDate`; sorts each bucket by `dueDate` asc (nulls last), then `order`.
- `projectHealth.ts` (new, pure): `projectHealth(row: IProjectRow)` → `'overdue' | 'blocked' | 'on_track'` and `needsAttention(row)` per D4.
- `useProjects.ts` (edit): map `summary.blockedTasks` onto `IProjectRow` (default `0`).

### 4. Web UI (`apps/web/src/surfaces/firm/dashboard/`)
- `HealthBadge.tsx` (new): small status chip (`Overdue n` danger / `Blocked n` warning / `On track` success) using `@siapp/ui` token colors; visually distinct from `LifecycleBadge` (wireframe chip-taxonomy note). Text + color, never color alone (accessibility instructions).
- `DashboardPage.tsx` (new): wireframe A0 —
  - Header: `Home` h1, workspace name, and the **`+ New project`** primary CTA (owner/admin/pm only) linking to `/{slug}/projects?new=1`.
  - KPI row (D9): three cards — My tasks / Overdue / Due this week — each a button that filters/scrolls the task section; counts from `dueBuckets`.
  - **Task section**: tabbed or segmented list (`My tasks` default · `Overdue` · `Due this week`) rendering task title, project name (link to `/{slug}/projects/{pid}`), due date, status. Empty states per bucket ("Nothing overdue 🎉"-tone copy per A0 review — text only, no emoji per repo conventions).
  - **"Needs your attention" table** (D4): projects failing `needsAttention`, ordered worst-first (overdue > blocked > draft), showing name (link), `LifecycleBadge`, `HealthBadge`, `progressPct`, overdue/blocked counts. Positive empty state when everything is healthy. Subtitle points to Projects for the full inventory (A0/A2 split, review item #7).
  - Presentational only: all data via `useProjects` (passed down or called here) + `useDashboardTasks`; no writes on this page.
- `ProjectsListPage.tsx` (edit): honor `?new=1` by opening the existing New-project chooser on mount (small change; the chooser state already exists).
- `FirmShell.tsx` (edit): nav becomes `Home · Projects · Clients · Collaborators · Settings` (Messaging waits for #19); `index` route → `DashboardPage`; new `projects` route → `ProjectsListPage` (same props); `projects/:projectId` unchanged. Mark the active nav item (`aria-current="page"`).

### 5. Web tests (wholesale data-layer mock via `vi.hoisted` + `vi.mock`, per existing page tests)
- `dueBuckets.test.ts` (pure): fixed `now`; overdue vs boundary (`dueDate === now`, `now+7d − 1ms`, `now+7d`) vs later; `done` excluded everywhere; collaborator-assignee and other-user tasks excluded; null `dueDate` lands in `myOpen` only; sort order.
- `projectHealth.test.ts` (pure): precedence overdue > blocked > on_track; missing `blockedTasks` treated as 0; `needsAttention` includes draft-with-tasks, excludes healthy published.
- `useDashboardTasks.test.ts`: archived/deleted projects spawn no queries; pm with departments produces `1 + n` queries per project (spy on query builder); merge dedupes; any query error → `error`.
- `DashboardPage.test.tsx`: KPI counts match fixtures; tab switch swaps the list; restricted-task fixture never appears (feed the hook mock only what rules would return — documents the D7 contract); attention table rows + ordering; empty states; `+ New project` hidden for viewer; task row links point at the right project URL.
- `FirmShell.test.tsx` (extend): index renders Home; `/projects` renders the list; nav links + `aria-current`.
- `ProjectsListPage.test.tsx` (extend): `?new=1` opens the chooser.

### 6. Rules & functions tests
- **Rules tests: no rules diff → no new rules tests required.** Optionally add one regression assertion in `backend/rules-tests/src/tasks.test.ts`: a `collectionGroup('tasks')` query is **denied** even for an owner — pins the D1 security assumption so a future collection-group change is deliberate.
- Functions: `projectSummary` test extension per step 2.

### 7. Verify
- `pnpm turbo typecheck lint test build`; root `pnpm test:rules`; `node scripts/check-bundle-isolation.mjs`.
- Emulator smoke — see Rollout below.

### 8. Ship
- Conventional commits; PR against `main` per the template. Surfaces: firm app + one functions trigger edit. PR body calls out D1 (no collection-group), D7 (aggregate counts visible to all members), and the stale data-model index-table note.

## Test plan (Tester)

| Layer | Coverage |
|---|---|
| Pure units (RTL/Vitest) | `dueBuckets` boundary math (D6), `projectHealth` precedence + missing-field defaults |
| Hook | `useDashboardTasks` fan-out shape per role/departments, project filtering, dedupe, error propagation |
| Component (RTL) | `DashboardPage` KPI counts, bucket tabs, attention table, empty states, role-gated CTA, no restricted rows; `FirmShell` routing/nav; `ProjectsListPage` `?new=1` |
| Rules | Regression only: `collectionGroup('tasks')` denied (no rules diff in this ticket) |
| Functions | `recomputeProjectSummary` emits `blockedTasks` (0, some, after-transition) |

## Rollout / smoke test

1. Deploy order: functions first (`pnpm --filter @siapp/functions deploy`) — `blockedTasks` starts appearing on next task writes; web after. No backfill, no index deploy, no rules deploy.
2. Emulator smoke (`--project siapp-prod`, seeded workspace):
   - Owner: Home shows all three buckets; create a task due yesterday assigned to self → appears under Overdue and KPI increments live; mark done → disappears.
   - Set a task `blocked` → after trigger, project's `HealthBadge` flips to Blocked on Home.
   - pm with department claim: restricted task from another department (created by owner) appears in **no** bucket and no count; a restricted task in *their* department does.
   - Viewer: page renders read-only, no `+ New project`.
   - Nav: `/{slug}` = Home, `/{slug}/projects` = list, deep link `/{slug}/projects/{pid}` unchanged; `+ New project` from Home opens the chooser on the projects page.
   - Network tab: no `collectionGroup` requests; listener count ≈ actionable-projects × (1 + departments).
3. Post-deploy watch: Firestore listener/read metrics for the fan-out (D1 fallback to `getDocs` is a one-line-per-query change if reads spike).

## Out of scope (follow-ups)

Messaging nav entry + WA-usage KPI card (`usageCounters` writer — #19/#24); scheduled daily summary refresh (D5 alternative); "stalled" health state from `lastActivityAt`; `assigneeUids` denorm / server-side my-tasks query (D3 alternative); collection-group tasks rules + `workspaceId` denorm (D1 alternative A); per-viewer department-scoped health counts (D7 alternative); search bar in the A0 header (separate wireframe element, no ticket yet); mobile-specific A0 layout beyond the responsive defaults; updating the stale "My tasks (collection group)" row in `pm_ux/plans/firestore-data-model.md` §Required-composite-indexes (pm_ux doc edit — flag to the doc owner).

## Risks / open questions

- **D7 needs an explicit human call**: aggregate overdue/blocked counts on project rows are visible to members outside the restricted departments. Existing precedent (#12/A2) already ships this, but this ticket makes the counts more prominent — confirm the aggregate-counts-are-fine reading of 20-access-control.
- **Listener fan-out growth**: D1 scales linearly with active projects × departments. Fine for design partners; if a firm hits ~50 active projects the dashboard should switch the task fetch to one-shot `getDocs` on mount (cheap change, noted in the hook's doc comment).
- **`summary.blockedTasks` rollout gap**: chips read 0-blocked on projects untouched since deploy until their next task write. Self-healing; called out in the PR.
- **Stale doc**: the data-model doc's index table assumes a collection-group "my tasks" query with an un-indexable `assignees.id` path — D1/D8 supersede it in practice; needs a pm_ux doc correction (out of scope here).
- **"This week" semantics** (D6): if the user wants literal calendar weeks in MYT rather than a rolling 7-day window, `dueBuckets.ts` changes but nothing else does — decide before build, it's copy + boundary math.
