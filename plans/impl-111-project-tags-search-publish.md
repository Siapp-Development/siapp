---
status: accepted
issue: 111
title: Project & task tags (two workspace registries), projects-list search/sort/filter, New-project + icon, tasks-screen Publish button
surface: dashboard.siapp.app (firm app only) — reusable primitives in @siapp/ui
decision: D-041 (ACCEPTED — two workspace-level tag registries: projectTags + taskTags; tag docs store tagIds; delete-from-registry propagates on read)
---

# Impl 111 — Project/Task tags, projects-list search·sort·filter, New-project icon, tasks-screen Publish

## Goal
Deliver GitHub issue #111 across the firm app: (1) a **tags** capability on both project and task
documents, editable in three places (project detail header, project tasks screen header, task detail
panel) via a reusable accessible **TagSelect** combobox that can create a tag inline, select an
existing tag, and delete a tag from the option list entirely; (2) **search / sort / filter** on the
projects list; (3) a leading **`+` icon** on the New-project button; and (4) a **Publish** button with
a **confirmation modal** on the project tasks screen that reuses the existing `setProjectLifecycle`
publish mechanism (D‑027). The "delete a tag from the options entirely" requirement means tags cannot
be per-doc free strings — they require shared **per-workspace tag registries** so colours and the
canonical option list have one home and deletion propagates everywhere. **Project tags and task tags
are independent pools** (D‑041): a project tag is not selectable on a task and vice-versa, so there are
**two** registries — `projectTags` and `taskTags`. This is firm-app UX polish on
`dashboard.siapp.app/:workspaceSlug/*`; **all new code stays out of the `/p` client and `/t`
collaborator bundles**, preserving physical bundle isolation (**D‑037**, reinforced by the URL-surface
split in **D‑036**). It maps to the MVP projects/tasks track (11-mvp-scope: "name, client, status,
dates, % complete" + "project list with health"); tags/search/filter are additive, no new surface.

> **Note on the brief's decision reference:** the task brief cites "D‑036" for bundle isolation.
> Per the decisions log, **D‑036** is the *URL-surface split* and **D‑037** is the *physical bundle
> isolation* decision. Both are honoured here; nothing new is imported into the client/collaborator
> bundles.

---

## Key data-model decision (ACCEPTED as D‑041)

**Adopt TWO workspace-level tag registries (independent pools); project/task docs store arrays of
tagIds referencing their own registry.**

- **Two separate registry collections** (independent option pools — a project tag is NOT selectable on
  a task, and vice-versa):
  - **`workspaces/{wid}/projectTags/{tagId}`** — the option list for **project** chips (project detail
    header + tasks-screen header).
  - **`workspaces/{wid}/taskTags/{tagId}`** — the option list for **task** chips (task detail panel +
    any task-row tag display).
- **Both registries share the SAME `ITagDoc` shape and the SAME `tagColor` palette**; the difference is
  only the collection path. Doc shape:
  `{ id, name, normalizedName, color, createdAt, createdBy, updatedAt, updatedBy }`.
  - `name` — display string (≤ 40 chars). `normalizedName` — lower-cased/trimmed, used for
    duplicate-prevention on inline create (client-side check; not a rules uniqueness constraint).
  - `color` — a `TTagColor` enum key resolved to WCAG-safe token classes in `@siapp/ui`
    (mirror the existing `avatarColor.ts` palette approach so contrast stays ≥ 4.5:1 per D‑039).
- **`IProjectDoc.tags?: string[]`** — arrays of **projectTags** ids.
  **`ITaskDoc.tags?: string[]`** — arrays of **taskTags** ids. Both are references (NOT free strings,
  NOT denormalized names).
- **Rendering:** join a doc's `tags` (ids) against the matching live registry to get name + colour.
  **Orphaned ids** (registry doc deleted) are simply ignored/filtered on read.
- **Why this is the simplest correct model:** deleting a tag from the options = delete one registry
  doc. Because docs store ids and resolve on read, a deleted tag **disappears everywhere for free** —
  which is exactly the requested "delete from options entirely" semantic — with **no fan-out sweep**
  over project/task docs. Renames also propagate for free.
- **Why two registries (not one shared pool):** the human decision (D‑041) is that project and task
  tag vocabularies are distinct — e.g. task workflow tags shouldn't clutter the project option list.
  Two registries keep the pools independent while the single `TagSelect` component + `useTags` hook are
  reused by passing a **scope** (`'project' | 'task'`).
- **Rejected alternatives:**
  - *Per-doc `string[]` of names only* — no place for colours, no canonical option list, "delete from
    options" is undefined, renames don't propagate. ✗
  - *Single shared registry for both projects and tasks* — rejected by D‑041 (pools must be
    independent). ✗
  - *Store tagIds + denormalized name/colour on each doc* — requires a backend sweep on every
    rename/delete to stay consistent. Unnecessary complexity for MVP. ✗
  - *Optional* future enhancement: a cleanup trigger to prune orphaned ids from docs. **Out of scope**
    — orphans are harmless because they're filtered on read.
- **Migration / back-compat:** `tags` is **optional** on both doc types. Mappers default a missing
  field to `[]`; a missing registry = no tags. **No backfill**; rules treat absent `tags` as valid.

---

## Touched surfaces & files

### Shared types — `packages/shared/src`
- `firestoreTypes.ts` — add `tags?: string[]` to `IProjectDoc` (references `projectTags`) and
  `ITaskDoc` (references `taskTags`); add a single shared `ITagDoc` interface (registry doc shape
  above — used by BOTH registries).
- `enums.ts` — add `TTagColor` string-literal union (e.g. `'slate' | 'red' | 'amber' | 'green' |
  'blue' | 'violet' | 'pink' | ...`) matching the palette; export a `TAG_COLORS` list. Optionally add
  a `TTagScope = 'project' | 'task'` helper used by the shared component/hook.

### UI kit — `packages/ui/src` (reusable primitives; D‑038 design system lives here)
- **`components/Dialog.tsx`** (NEW) — accessible centered modal primitive (`role="dialog"`,
  `aria-modal`, focus trap, Escape-to-close, backdrop click, `prefers-reduced-motion`). No modal
  primitive exists today (publish confirm currently uses inline `Alert`); the brief asks for a modal.
  Export a thin `ConfirmDialog` convenience wrapper for confirm/cancel bodies.
- **`components/Popover.tsx`** (NEW) — minimal anchored popover used by the combobox listbox
  (positioning, outside-click/Escape dismissal, focus management).
- **`lib/tagColor.ts`** (NEW) — `TTagColor → { bg, fg, ring }` token map + `tagColorClasses(color)`
  helper, mirroring `avatarColor.ts`; guaranteed ≥ 4.5:1 pairs.
- `index.ts` — export `Dialog`, `ConfirmDialog`, `Popover`, `tagColorClasses`, `TAG_COLOR_KEYS`.
- Keep `Badge` as the tag-chip base (add a `dismissible`/`onRemove` affordance via composition in the
  feature layer rather than bloating `Badge`).

### Firm projects feature — `apps/web/src/surfaces/firm/projects`
- **`tags/useTags.ts`** (NEW) — `useTags(workspaceId, scope: 'project' | 'task')` live subscription
  to `workspaces/{wid}/projectTags` **or** `workspaces/{wid}/taskTags` depending on `scope` (the hook
  maps `scope` → collection segment); writers `createTag`, `renameTag`, `deleteTag` all take the same
  `scope`. Returns a `Map<tagId, {name,color}>` for joins. One hook, two independent pools.
- **`tags/TagSelect.tsx`** (NEW) — the reusable combobox (props below). Renders selected tags as
  dismissible chips + a dashed `+` circle trigger; opens a `Popover` listbox with filter input,
  existing options (coloured chips), inline "Create '<x>'" row, and per-option delete (gear/settings
  affordance from screenshot → a small "Manage/delete" control per option, guarded by a confirm since
  it removes the tag everywhere).
- **`tags/ManageTagDialog.tsx`** (NEW, optional) — confirm dialog for delete-from-options
  ("Delete 'High Priority' everywhere? It will be removed from N projects/tasks."). May be folded into
  `TagSelect` using `ConfirmDialog`.
- `useProjects.ts` — add `tags: string[]` and `updatedAt: Date | null` to `IProjectRow` + `mapProject`
  (updatedAt is needed for the "last updated" sort). Add writer **`updateProjectTags(workspaceId,
  projectId, tags)`** (updates only `tags` + `updatedAt`). Leave `updateProject`/`createProject`
  otherwise unchanged (tags are edited inline, not through `ProjectForm`).
- `tasks/useTasks.ts` — add `tags: string[]` to `ITaskRow` + `mapTask`; add `tags` to
  `ITaskFormValues` and include it in the `createTask` / `updateTask` write payloads.
- **`ProjectsListPage.tsx`** — add a **title-only** search input + Date/Tags/Filters pill controls;
  wire client-side filter/sort; URL-as-state via the already-imported `useSearchParams`; add `<Plus />`
  to the New project button; fold the existing "Show archived" toggle into the lifecycle filter.
- **`projectsListFilter.ts`** (NEW) — pure `filterAndSortProjects(rows, params, projectTagMap)` +
  URL param (de)serialization helpers. `projectTagMap` (from `useTags(wid, 'project')`) is needed for
  the **Tags pill** filter (map ids → names for display), not for the search box. Extracted so it is
  unit-testable in isolation.
- **`ProjectDetailPage.tsx`** — (a) render project-level `TagSelect` (scope `'project'`, backed by
  `useTags(wid, 'project')`) in the shared header (covers both the "detail screen" and the "tasks
  screen", since Tasks is a tab under this header — see decision note below); (b) add the **Publish**
  button + confirmation dialog next to the `LifecycleBadge` when `lifecycle === 'draft'` and role ∈
  owner/admin/pm, via a new shared `PublishProjectDialog`.
- **`PublishProjectDialog.tsx`** (NEW) — extracts the existing dry-run publish flow
  (`setProjectLifecycle({action:'publish', dryRun:true})` → preview → confirm) from the inline
  `PublishConfirm` in `ProjectDetailPage`. Reused by the header button. Remove `publish` from the
  `draft` entry of `LIFECYCLE_ACTIONS` (Details-tab `LifecycleActions`) so there is a single publish
  entry point; keep delete/other transitions there.
- `tasks/TaskDetailPanel.tsx` — wire task-level `TagSelect` (scope `'task'`, backed by
  `useTags(wid, 'task')`) into the editable form (init `tags` state from `task.tags` ~L271–284; add a
  tags field after Description ~L557; include `tags` in the `updateTask` payload ~L335–349). Show
  read-only chips in the `!canEdit` `<dl>` branch.

### Rules & indexes
- `firestore.rules` — see Data model changes.
- `firestore.indexes.json` — **no change** (see below).

---

## Decision note: where the project-level TagSelect renders (RESOLVED)
The user lists three edit locations, but "project detail screen" and "project tasks screen" edit the
**same** `project.tags`. `TasksSection` is a **tab rendered under the shared `ProjectDetailPage`
header**, which already renders the project title + `LifecycleBadge`. **APPROVED:** render the
project-level `TagSelect` (and Publish button) **once** in that shared header — this satisfies both
screens with one control and zero duplication, and matches both screenshots (chips under the title;
Publish next to the DRAFT badge). The task-level `TagSelect` is separate and lives in
`TaskDetailPanel`.

---

## Data model changes (Firestore + security rules)

### New collections `workspaces/{wid}/projectTags/{tagId}` AND `workspaces/{wid}/taskTags/{tagId}`
Two independent registries with **identical rules** (only the path differs). Mirror the existing
**`departments`** pattern (rules ~L573–590; validator `validDepartment` ~L199–214). Add both
`match /projectTags/{tagId}` and `match /taskTags/{tagId}` blocks (or a shared helper reused by both):
- **read:** any firm member of `wid` (`isFirmMember(wid)`).
- **create/update/delete:** `hasRole(wid, ['owner','admin','pm'])` && `workspaceActive(wid)` — pm is
  **explicitly included** for both registries (matches project/task edit roles).
- **validate `validTag()`** (shared by both collections): `keys().hasOnly([...]) && hasAll([...])`,
  `name is string && name.size() >= 1 && name.size() <= 40`, `color in TAG_COLOR_KEYS` (string set
  literal), `createdBy == request.auth.uid` on create, server-ish timestamps present. **No uniqueness
  constraint** (duplicate-name prevention is client-side via `normalizedName`). Deletion allowed by
  role (no in-use guard — orphaned ids are filtered on read).

### Project docs — `workspaces/{wid}/projects/{pid}` (`tags` → projectTags ids)
- Add `'tags'` to the **create** `request.resource.data.keys().hasOnly([...])` allowlist (~L685–718).
- Add `'tags'` to the **update** `diff().affectedKeys().hasOnly([...])` allowlist (~L721–740) so
  `updateProjectTags` is permitted for owner/admin/pm on draft/published projects.
- In `validProjectFields()` (~L270–285) add: `(!('tags' in data) || (data.tags is list &&
  data.tags.size() <= 20))`. (Rules can't cheaply length-check each element; tagIds are
  registry-controlled doc IDs, so list + size is sufficient — mirror the `restrictedToDepartments is
  list && size() <= 10` pattern at task L484–485.)

### Task docs — `workspaces/{wid}/projects/{pid}/tasks/{tid}` (`tags` → taskTags ids)
- Add `'tags'` to the shared `validTaskFields(tid)` `keys().hasOnly([...])` allowlist (~L457–464).
- Add `tags is list && size() <= 20` validation there.

### Multi-tenant isolation (non-negotiable)
Every new rule is gated on `isFirmMember(wid)` / `hasRole(wid, …)` from custom claims (O(1), no
cross-workspace reads) and, for writes, `workspaceActive(wid)` — identical to existing project/task/
department rules. Both registries (`projectTags`, `taskTags`) live strictly under
`workspaces/{wid}/…`, so a member of workspace A can never read or write workspace B's tags.

### Indexes — `firestore.indexes.json`
**No new composite indexes.** The projects list is already **fully client-subscribed** (`useProjects`
`onSnapshot` over the whole `projects` collection, mapping every row), so search/sort/filter — including
by tags — is **client-side** over the in-memory rows. Both tag-registry subscriptions are simple
collection reads (no ordering/where). Confirmed: no server queries by `tags` are introduced.

---

## Reusable TagSelect component (spec)

**Location:** `apps/web/src/surfaces/firm/projects/tags/TagSelect.tsx` (firm feature layer). Uses
`@siapp/ui` `Popover`, `Badge`, `Button`, `Input`, `tagColorClasses`. Kept in the firm tree so the
`/p` and `/t` bundles never import it (D‑037). **One component serves both pools** — the caller wires
it to either the project or task registry (via the `useTags(wid, scope)` outputs passed as props); the
component is scope-agnostic.

**Props:**
```ts
interface ITagSelectProps {
  allTags: ReadonlyMap<string, { name: string; color: TTagColor }>; // from useTags(wid, scope)
  value: string[];                       // selected tagIds (projectTags OR taskTags ids)
  onChange: (tagIds: string[]) => void;  // persist (project or task writer)
  onCreateTag: (name: string, color: TTagColor) => Promise<string>; // returns new tagId
  onDeleteTag: (tagId: string) => Promise<void>; // delete from THIS registry (confirmed)
  canEdit: boolean;                      // read-only chips when false
  label: string;                         // aria label e.g. "Project tags" / "Task tags"
}
```

**Behaviour / a11y (WAI-ARIA combobox pattern):**
- Selected tags render as coloured, dismissible `Badge` chips (× removes the id from `value`).
- A dashed `+` circle button opens the `Popover` listbox (matches screenshot).
- Filter `Input` = `role="combobox"`, `aria-expanded`, `aria-controls={listboxId}`,
  `aria-activedescendant`. Listbox = `role="listbox"`; options = `role="option"` with
  `aria-selected`.
- Keyboard: ArrowUp/Down move active option, Enter selects (or **creates** when the typed value has no
  exact match → shows a "Create '<x>'" option), Escape closes, Backspace on empty input removes the
  last chip. Focus returns to the trigger on close.
- **Delete-from-options:** each option row has a small manage/delete affordance (the gear/settings icon
  in the screenshot) → `ConfirmDialog` ("remove everywhere?") → `onDeleteTag`. Because docs store ids,
  the chip vanishes wherever it was used.
- New-tag colour: auto-assign from the palette (round-robin/hash) or a tiny colour picker — MVP:
  auto-assign, editable later.

---

## Projects list — FINAL search / sort / filter (per approved decisions)

The three screenshot pills map to controls; all client-side; all mirrored to the URL via
`useSearchParams` (shareable/bookmarkable).

- **Search input** (`?q=`) — **title-only**: substring match (case-insensitive) against **project
  name** only. Free-text tag/date/client search is **dropped from the search box** (the Tags pill and
  Filters pill cover tags/client; the Date pill covers dates). **Placeholder → "Search projects by
  title…".**
- **Date pill** (`?sort=`, `?dir=`) — sort control: **start date**, **target end date**,
  **last updated** (needs `updatedAt` on the row — being added). Optional light date-range filter is
  **out of scope** for MVP.
- **Tags pill** (`?tag=` repeatable/csv, projectTags ids) — multi-select tag filter; **match = ANY**
  selected tag (OR). OR over AND for discoverability.
- **Filters pill** (`?status=`, `?vertical=`, `?client=`, `?lifecycle=`, `?overdue=1`) — popover with:
  **lifecycle** (folds in today's "Show archived" toggle; default hides archived + deleted),
  **status**, **vertical**, **client**, **has-overdue-tasks** (`overdueTasks > 0`).
- **Sort options** (Date pill + a name toggle): **name A–Z / Z–A**, **% complete**, **start date**,
  **target end date**, **last updated**. **Default sort = last updated (desc)** with **name A–Z** as
  the secondary tiebreak.

All logic lives in the pure `projectsListFilter.ts`
(`filterAndSortProjects(rows, params, projectTagMap)`) for unit-testability; `ProjectsListPage` stays
declarative. Note the search box does NOT consult `projectTagMap` (title-only); the map is used solely
by the Tags-pill filter.

---

## New-project `+` icon
Add lucide-react `Plus` as a leading icon inside the existing New-project `Button`
(`<Plus className="h-4 w-4" aria-hidden />` + "New project"). lucide-react is already used in this
tree (`TasksSection` imports `Plus`, `ChevronRight`, etc.).

---

## Publish button + confirmation modal (tasks screen)
Reuse the **existing** mechanism — do not build a new one:
- `setProjectLifecycle({ workspaceId, projectId, action: 'publish', dryRun: true })` →
  `publishPreview: IPublishPreview { waCount, estimatedCostMyr }`; confirm re-calls without `dryRun`
  (callable at `apps/web/src/lib/callables.ts` L81–89; types in `callableTypes.ts`).
- Extract the current inline `PublishConfirm` flow from `ProjectDetailPage` into
  **`PublishProjectDialog.tsx`** using the new `@siapp/ui` `Dialog`. Render a green Publish button next
  to the `LifecycleBadge` in the `ProjectDetailPage` header when `lifecycle === 'draft'` and role ∈
  owner/admin/pm — this is the DRAFT-badge-adjacent placement in the screenshot and shows on the Tasks
  tab. Body shows the WA count + estimated cost (RM) from the dry run (matches D‑027's publish preview).
- Remove `publish` from the `draft` row of `LIFECYCLE_ACTIONS` so there's a single publish entry point;
  keep the delete/complete/archive actions in the Details-tab `LifecycleActions`.

---

## Steps (ordered, each independently verifiable)
1. **Shared types:** add `tags?` to `IProjectDoc`/`ITaskDoc`, add shared `ITagDoc`, add `TTagColor` +
   `TAG_COLORS` (+ optional `TTagScope`) to `enums.ts`. (Type-check passes.)
2. **UI kit:** add `Dialog`/`ConfirmDialog`, `Popover`, `tagColor.ts`; export from `index.ts`.
   (Storybook/tests render; axe clean.)
3. **Rules:** add `tags` to project create/update allowlists + `validProjectFields`; add `tags` to
   `validTaskFields`; add BOTH `workspaces/{wid}/projectTags/{tagId}` and
   `workspaces/{wid}/taskTags/{tagId}` blocks sharing `validTag()` (owner/admin/pm CRUD). (Rules tests
   pass.)
4. **Tag registry hook + writers:** `tags/useTags.ts` — `useTags(wid, scope)`, `createTag`,
   `renameTag`, `deleteTag`, all `scope`-aware (`'project' | 'task'` → collection segment).
5. **TagSelect** (+ optional `ManageTagDialog`) built against `useTags`, scope-agnostic; unit + axe
   tests.
6. **Data hooks:** add `tags` (+ `updatedAt`) to `IProjectRow`/`mapProject`, add `updateProjectTags`;
   add `tags` to `ITaskRow`/`mapTask`/`ITaskFormValues` and the task write payloads.
7. **Wire project tags** into the `ProjectDetailPage` header (scope `'project'`; covers detail + tasks
   screens with one control).
8. **Wire task tags** into `TaskDetailPanel` (scope `'task'`; editable form + read-only branch).
9. **Projects list:** `projectsListFilter.ts` pure module (title-only search); wire search input +
   Date/Tags/Filters pills + URL params into `ProjectsListPage`; fold in archived toggle.
10. **New-project `+` icon.**
11. **PublishProjectDialog:** extract + mount in header; remove duplicate publish from
    `LIFECYCLE_ACTIONS`.
12. Full lint/typecheck/build + all tests (Validator gate).

---

## Test plan (Vitest + RTL + vitest-axe + rules tests)
- **Firestore rules tests** (emulator): project update with valid `tags` allowed for owner/admin/pm,
  denied for viewer/client; `tags` non-list and `tags.size() > 20` denied; task create/update with
  `tags` allowlisted; **BOTH tag registries** (`projectTags` + `taskTags`) create/rename/delete by
  role (**owner/admin/pm allowed**; viewer/client denied); `name.size() > 40` denied; invalid `color`
  denied; `workspaceActive` gate on writes; **cross-workspace isolation** (member of A cannot
  read/write B's `projectTags`/`taskTags`). Use the firestore-rules skill/auditor.
- **`projectsListFilter.test.ts`** (pure): **title-only** search (does NOT match code/client/tag);
  each sort (incl. name A–Z/Z–A, % complete, dates, last-updated + tiebreak); tag OR filter;
  lifecycle/status/vertical/client/overdue filters; URL param round-trip.
- **`TagSelect.test.tsx`**: renders chips; add existing tag; inline-create (Enter on no-match);
  remove chip (×/Backspace); delete-from-options confirm flow; keyboard nav
  (Arrow/Enter/Escape); read-only when `canEdit=false`; **vitest-axe** on open combobox. Verify the
  same component works for both `'project'` and `'task'` scopes (option pools stay independent).
- **`useTags` / mapper tests:** `useTags(wid, 'project')` and `useTags(wid, 'task')` subscribe to the
  correct, distinct collections; `mapProject`/`mapTask` default missing `tags` → `[]` and orphaned ids
  filter out on join.
- **`PublishProjectDialog.test.tsx`**: dry-run preview render (waCount/cost), confirm calls
  `setProjectLifecycle` without `dryRun`, cancel, error path; axe on the dialog; Escape/focus-trap.
- **`ProjectsListPage.test.tsx`**: title search box filters rows; a pill changes URL params and
  reorders; New-project button has the `+` icon and accessible name.
- **`Dialog`/`Popover` primitive tests:** focus trap, Escape, backdrop, `aria-modal`, reduced-motion.

---

## Out of scope (deliberately)
- Backend sweep/cleanup trigger to prune orphaned tagIds from docs (orphans are harmless on read).
- Server-side (indexed) querying/filtering of projects or tasks by tags — list is client-subscribed.
- A single shared tag pool across projects and tasks — D‑041 keeps the two pools independent.
- Cross-scope tag reuse (a project tag selectable on a task, or vice-versa).
- Tags on any non-firm surface (client `/p`, collaborator `/t`) — not imported into those bundles.
- Per-tag colour picker beyond auto-assign (can follow up); tag usage counts/analytics.
- Free-text tag/client/date search in the projects search box (title-only) and date-range filtering.
- Threading tags through `ProjectForm` create/edit (tags are edited inline via `TagSelect`).
- Changing the existing lifecycle transitions other than consolidating the Publish entry point.

---

## Resolved decisions (from human approval — Builder: treat as fixed)
1. **D‑041 ACCEPTED** — workspace-level tag registries with ids-stored-on-docs + delete-propagates-on-
   read; **two independent registries** `projectTags` + `taskTags` (project and task tag pools are
   separate). Log D‑041 in `decisions-log.md` as part of shipping.
2. **Placement:** render the project-level `TagSelect` + Publish button ONCE in the shared
   `ProjectDetailPage` header (serves both the detail and tasks screens).
3. **Projects search = title (project name) only;** placeholder "Search projects by title…". Tags pill
   + Filters pill cover tags/client; Date pill covers dates.
4. **Tag delete permission = owner/admin/pm** for BOTH registries (rules reflect this).
5. **New `@siapp/ui` `Dialog` + `Popover` primitives:** approved.
6. **Limits:** ≤ 20 tags/doc, tag name ≤ 40 chars; duplicate-name prevention **client-side only**
   (no rules uniqueness constraint).

## Remaining open questions
- None blocking. New-tag colour assignment is auto (round-robin/hash from the palette) unless the team
  later wants a picker — non-blocking, deferrable.
