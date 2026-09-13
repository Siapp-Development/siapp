---
title: Insights section + workspace projects timeline (Gantt) view
issue: 164
status: draft
updated: 2026-09-12
---

# Impl Plan — Add "Insights" firm-dashboard section with a projects timeline (issue #164)

## Goal
Add a new **top-level firm-dashboard nav section, "Insights"**, at
`dashboard.siapp.app/{workspaceSlug}/insights` (surface: firm app, D‑036) that
serves as the workspace's analytics / project-monitoring home. The **v1 view is a
timeline (Gantt‑style) chart of all workspace projects**, one row per project,
each drawn from its `startDate → targetEndDate` with a progress overlay — a
digital replacement for the firm's spreadsheet project-progress overview. The
section is architected so future metrics/analytics views slot underneath it
without a rewrite (sub-routes under `insights/*`). This is a **read-only,
presentation-only** feature: it reuses the existing `useProjects(workspaceId)`
subscription and adds **no Firestore reads, collections, fields, security rules,
or indexes**. It must respect bundle isolation (D‑036/D‑037), use `@siapp/ui`
tokens/primitives + the shared `@siapp/ui` timeline helpers (D‑038), and meet
WCAG 2.1 AA. It aligns with the firm-side Gantt precedent (D‑033 timeline board,
D‑042/#147 timeline math already extracted into `@siapp/ui`).

## Key reuse decisions (verified against the codebase)
- **Data:** reuse `useProjects(workspaceId): TProjectsState` from
  `apps/web/src/surfaces/firm/projects/useProjects.ts`. It already returns
  `IProjectRow` with `id, name, code, lifecycle, status, startDate: Date|null,
  targetEndDate: Date|null, progressPct, updatedAt`, etc. **No new hook, no new
  Firestore read.**
- **Timeline math:** reuse the pure, DOM-free helpers already published from
  `@siapp/ui` (`packages/ui/src/lib/timeline.ts`): `paddedTimelineAxis`,
  `buildTimelineTicks`, `TIMELINE_DAY_PX`, `timelineDayStart`, `timelineDiffDays`,
  and types `ITimelineAxis`, `ITimelineTick`, `TTimelineGranularity`. These are the
  **firm axis** variant (union of dated timestamps + today, padded), which is
  exactly what a project-level "today + scroll into past/future" chart needs.
- **Primitives:** `SegmentedControl` (granularity switcher, matches the existing
  `TimelineView`/`PortalTaskTimeline` pattern), `Progress` and/or the bar-overlay
  approach for progress, `Badge`/`LifecycleBadge` for lifecycle, `cn`. All from
  `@siapp/ui` except `LifecycleBadge` which is a firm-surface component we may
  reuse from `projects/LifecycleBadge.tsx`.
- **Pattern to mirror (do NOT import):** `PortalTaskTimeline.tsx` (portal) and
  `projects/tasks/TimelineView.tsx` (firm) — copy their bar-geometry approach
  (fraction/px positioning, `role="img"` + `aria-label` per bar, `sr-only` fallback
  for undated rows). Portal code must never be imported into the firm tree
  (D‑036/D‑037); we build a fresh, project-scoped component in the firm surface.
- **Naming:** the firm surface already has a `TimelineView` symbol (task-level, in
  `projects/tasks/`). To avoid collision and confusion, name the new component
  **`ProjectsTimeline`** and the page **`InsightsPage`**.

## Touched surfaces & files

Surface: **firm app only** (`dashboard.siapp.app/{workspaceSlug}/insights`). No
marketing, portal, collaborator, or admin surface is touched.

### Create (new folder `apps/web/src/surfaces/firm/insights/`)
1. `apps/web/src/surfaces/firm/insights/InsightsPage.tsx`
   - Top-level page for the Insights section. Owns the section header ("Insights"),
     a short description, the (future-proofing) sub-view scaffold, loading/error/
     empty states, and renders `ProjectsTimeline` for v1.
   - Props mirror `ProjectsListPage`: `{ workspaceId, workspaceSlug, workspaceName,
     role, uid }` (include `role`/`uid` for forward-compat + consistency even if
     v1 doesn't branch on role — the whole workspace's projects are shown to any
     member, same visibility as the Projects list).
2. `apps/web/src/surfaces/firm/insights/ProjectsTimeline.tsx`
   - The Gantt-style chart component. Pure presentational: takes `projects:
     readonly IProjectRow[]` (+ `workspaceSlug` for row links, optional `now?: Date`
     for deterministic tests). Computes axis, ticks, bar geometry; renders the
     dated group + the "No dates" group.
   - Export a small pure helper `projectsTimelineDates(projects): number[]`
     (day-start timestamps of every start/target date) so the axis math is unit
     testable without rendering.
3. `apps/web/src/surfaces/firm/insights/InsightsPage.test.tsx`
4. `apps/web/src/surfaces/firm/insights/ProjectsTimeline.test.tsx`
5. `apps/web/src/surfaces/firm/insights/index.ts` (named re-exports, matching repo
   co-location convention).

### Modify
6. `apps/web/src/surfaces/firm/FirmShell.tsx`
   - Import the `BarChart3` lucide icon and add `insights` to `NAV_ICONS`.
   - Add a `<NavItem to={`/${workspace.slug}/insights`} label="Insights" ... />`
     in the sidebar `<ul>` — placed **immediately after Projects** (Insights is a
     cross-project analytics surface, logically adjacent to Projects).
   - Import `InsightsPage` and add `<Route path="insights" element={<InsightsPage
     workspaceId=… workspaceSlug=… workspaceName=… role={role} uid=… />} />` in the
     `<Routes>` block.
7. `apps/web/src/surfaces/firm/FirmShell.test.tsx`
   - Add a `vi.mock('./insights/InsightsPage.tsx', …)` stub (Firestore-subscribing
     child, mirroring the existing `ProjectsListPage` mock) and assertions that the
     Insights nav link + route render (see Test plan).

No barrel/index files outside the firm surface change. No `@siapp/ui` change is
required (all needed helpers/primitives already exported — verified in
`packages/ui/src/index.ts`).

## Data model changes
**None.** This feature is pure read/presentation over data `useProjects` already
subscribes to (`workspaces/{workspaceId}/projects`).

- **Firestore collections/fields:** no new collections, no new fields.
- **Security rules:** no change. The projects collection read is already governed
  by existing workspace-member rules used by the Projects list; multi-tenant
  isolation is unchanged because we add zero new queries and the hook is already
  scoped to a single `workspaceId` path. Explicitly: **no `firestore.rules`
  edit and no `firestore.indexes.json` edit are needed** (deliverable #8).
- The component must **not** introduce any `where`/`orderBy` Firestore query
  (all filtering/sorting is client-side in memory), so no composite index is
  triggered.

## Timeline view design (deliverable #2)

### Inputs & grouping
- Consume `useProjects` in `InsightsPage`; pass `rows` to `ProjectsTimeline`.
- **Exclude `lifecycle === 'deleted'`** rows (they are hidden everywhere else,
  per the Projects list precedent). Keep draft/published/archived so the timeline
  is a full portfolio view; lifecycle is shown via a badge/label per row (not by
  color alone).
- Partition remaining projects into two groups:
  - **Dated group:** projects with `startDate !== null` **or** `targetEndDate !==
    null` (at least one endpoint present).
  - **"No dates" group:** projects with **both** `startDate === null` and
    `targetEndDate === null`. These cannot be placed on the axis.

### Time axis
- Build the set of day-start timestamps from every non-null `startDate` /
  `targetEndDate` across the dated group via `timelineDayStart(date)`
  (`projectsTimelineDates` helper).
- Compute the axis with the shared firm helper:
  `paddedTimelineAxis(datedMsDayStarts, granularity, now)`.
  - This unions all dated timestamps **+ today**, pads by `TIMELINE_PAD_DAYS`,
    and snaps start-down / end-up to the granularity boundary — so "today" is
    reachable and there is empty past/future to scroll into.
  - Edge case: if the dated group is empty, `paddedTimelineAxis` still returns a
    valid axis around today (the array is `[…, today]`), but we will instead show
    the empty/undated messaging (see states) rather than an empty chart.
- **Granularity switcher:** `SegmentedControl` with options Day/Week/Month
  (`TIMELINE_GRANULARITIES`), **default `month`** (matches `TimelineView` /
  `PortalTaskTimeline`). State via `useState<TTimelineGranularity>('month')`.
- **Ticks:** `buildTimelineTicks(axis, granularity)`; render as absolutely
  positioned labels in a header row (`aria-hidden="true"`, decorative — the
  accessible dates live on each bar's label).
- **Track width / scroll:** fixed day scale — `trackWidth = axis.days *
  TIMELINE_DAY_PX[granularity]`; wrap the track in `overflow-x-auto` with a fixed
  label column (`LABEL_COL_PX`, e.g. 200) for project names, exactly like
  `PortalTaskTimeline`/`TimelineView`. (No `fitToWidth`/print mode in v1 — out of
  scope.)

### Bar geometry (per dated project)
- `startDate ?? targetEndDate` = bar start; `targetEndDate ?? startDate` = bar end
  (so a project with only one endpoint renders a minimal/one-day bar rather than
  disappearing — mirrors `PortalTaskTimeline.barGeometry`).
- `leftDays = timelineDiffDays(axis.start, dayStart(barStart))`;
  `spanDays = timelineDiffDays(dayStart(barStart), dayStart(barEnd)) + 1`.
- Position with px against the fixed scale: `left = LABEL_COL_PX + leftDays *
  dayPx`, `width = max(spanDays * dayPx, MIN_BAR_PX)` (MIN_BAR_PX ≈ 6 so tiny/
  same-day bars stay visible). (Percent-of-axis is an acceptable alternative but
  px matches the firm `TimelineView` scroll model.)

### Progress overlay
- Each bar is a track with a filled progress sub-bar using `project.progressPct`
  (0–100). Two-layer approach: outer bar = full span (muted/neutral token), inner
  overlay width = `progressPct%` of the bar (accent/primary token). This reads as
  "how far along vs. planned span," matching the spreadsheet mental model.
- Progress is **also** stated in the bar's accessible label and (optionally) as a
  trailing `NN%` text so meaning never relies on the fill alone (not color-alone).
- Do **not** color-encode lifecycle/status into the bar as the sole signal; show a
  `LifecycleBadge` and/or status text in the label column instead.

### "No dates" group (missing start/target)
- Rendered as a **separate labelled section below the chart** titled e.g. "No
  dates set" — one row per project with name + lifecycle badge + a short hint
  ("Add a start or target date to place this on the timeline"), linking to the
  project. This keeps the axis honest (undated projects don't distort padding) and
  is discoverable. Each row also carries an `sr-only` note. (Chosen over an
  inline placeholder bar, which would misrepresent dates.)

### Dependency-free
No charting/Gantt library is added. All positioning is CSS (flex + absolute
positioning within a relatively-positioned track), reusing the exact pattern
already shipped in `PortalTaskTimeline`/`TimelineView`. Justification for not
adding a lib: the math is already solved and unit-tested in `@siapp/ui`, and a lib
would bloat the firm bundle and fight our token system.

## Accessibility approach (deliverable #3)
- **Semantic structure:** render the chart as a **list of rows**, each project row
  grouped in a `<section aria-label="…">` or list semantics matching
  `PortalTaskTimeline` (which uses `role="img"` bars + `sr-only` text). The axis
  header is `aria-hidden="true"` (decorative pixel labels).
- **Screen-reader equivalent per bar:** each bar is `role="img"` with an
  `aria-label` built from a helper `barAriaLabel(project)` →
  `"{name} — {lifecycle}, from {startDate}, due {targetEndDate}, {progressPct}%
  complete"` (omit missing endpoints gracefully). Use a stable
  `Intl.DateTimeFormat` for dates. This makes the visual timeline non-essential
  for AT users (the label carries the full range + progress), satisfying the
  "task/list list is the accessible equivalent" principle from D‑042.
- **Undated rows:** carry an `sr-only` explanation so AT users learn why they're
  not on the axis.
- **Not color-alone:** lifecycle via text/badge; progress via `aria-label` + a
  visible `NN%`; overdue/status (if surfaced) via text, never hue only. Ensure
  bar fill vs. track meets AA contrast using existing tokens.
- **Keyboard:** the granularity `SegmentedControl` and any project links are
  natively focusable/operable; the scroll container is reachable. v1 bars are
  non-interactive images (no drag/reorder — out of scope), so no custom key
  handling is needed. Project name in the label column is a real `<Link>` to
  `/{workspaceSlug}/projects/{id}` for keyboard navigation to detail.
- **Reduced motion:** any transition uses `motion-reduce:` variants (consistent
  with `CircularProgress`/existing components).

## Nav + route wiring (deliverable #4)
- **Icon:** `BarChart3` from `lucide-react` (analytics connotation, distinct from
  `FolderKanban`/`Home`/`Users`/`Handshake`/`Settings` already in use). Rendered
  via the shared `ICON_SIZE=16`, `ICON_STROKE=1.8` in `NAV_ICONS.insights`.
- **Label:** `"Insights"`.
- **Placement:** new `<NavItem>` directly **after** the Projects item and before
  Clients.
- **Route:** `<Route path="insights" element={<InsightsPage … />} />` inside the
  existing `<Routes>` in `<main>`, passing `workspaceId={workspace.id}`,
  `workspaceSlug={workspace.slug}`, `workspaceName={workspace.name}`,
  `role={role}`, `uid={state.user.uid}` (same prop-derivation pattern as the
  Projects route).

## Extensibility (deliverable #5)
Architect `InsightsPage` as a **section shell**, not a single chart:
- v1 renders only the "Timeline" view, but structure the page so future views
  (e.g. "Workload", "Status breakdown", "Throughput") are added as **nested
  routes** under `insights/*` with a sub-nav, mirroring the existing
  `SettingsLayout` + `<Route path="settings">` nested pattern in `FirmShell`.
- Concretely: keep `InsightsPage` rendering a section header + (for v1) the
  timeline directly. When a second view is added, promote to an
  `InsightsLayout` with a sub-`<nav aria-label="Insights">` of `NavLink`s and
  child routes (`insights` → index = Timeline, `insights/…` = future views).
  Document this in a short comment at the top of `InsightsPage.tsx`. No data-layer
  or nav-shell rework is required to add view #2 — only new child components +
  routes. Keep `ProjectsTimeline` a standalone, prop-driven component (no routing
  knowledge) so it can be embedded under any future sub-route.

## States (deliverable #7)
Handled in `InsightsPage`, mirroring `ProjectsListPage` copy/patterns:
- **Loading** (`projects.status === 'loading'`): `"Loading insights…"` /
  `"Loading projects…"` with `role="status"`/polite where appropriate.
- **Error** (`'error'`): `"Insights could not be loaded."`
- **Empty — zero projects** (`'ready'` && no non-deleted rows): friendly empty
  state, e.g. `"No projects yet — create a project to see it on the timeline."`
  with a link/CTA to `/{workspaceSlug}/projects` (no chart rendered).
- **Ready, all undated** (dated group empty but undated group non-empty): render
  the "No dates set" section + a note that dated projects will appear on the
  timeline; suppress the empty chart.
- **Ready, mixed/normal:** render granularity switcher + chart + (if any) the
  "No dates set" section.

## Test plan (deliverable #6) — Vitest + RTL, conventions from existing tests
Use the repo conventions: `@testing-library/react`, `userEvent`, `MemoryRouter`,
`vi.mock` of hooks with `vi.hoisted` fixtures, direct `axe-core` import
(`import axe from 'axe-core'`) with the `region`/`color-contrast` rule toggles as
in `ProjectsListPage.test.tsx`. A `projectRow(overrides)` factory (copy the shape
from `ProjectsListPage.test.tsx`) produces `IProjectRow`s with fixed dates and a
fixed `now` passed to `ProjectsTimeline` for deterministic geometry.

### `ProjectsTimeline.test.tsx`
- `projectsTimelineDates` returns day-start timestamps for all non-null start/
  target dates; ignores undated projects.
- Renders one bar per **dated** project with an accessible `role="img"` label
  containing the name, date range, and `progressPct`.
- Positions bars: a project starting later has a greater `left` offset than an
  earlier one (assert relative ordering via inline style, tolerant of exact px);
  a single-endpoint project still renders a (min-width) bar.
- Progress overlay reflects `progressPct` (assert the inner fill width / an
  `aria`/text `NN%`).
- **Undated** projects (both dates null) are NOT placed on the axis and instead
  appear in the "No dates set" section with an explanatory (sr-only) note.
- Excludes `lifecycle === 'deleted'` projects.
- Granularity switcher defaults to **Months** and switching to Days/Weeks changes
  tick density / track width (assert switcher `aria-label="Timeline granularity"`
  and that ticks re-render).
- Lifecycle is conveyed by text/badge, not color alone (assert badge/text present).
- **axe:** no violations for a populated timeline.

### `InsightsPage.test.tsx`
- Loading state renders the loading message.
- Error state renders the error message.
- Empty (zero non-deleted projects) renders the empty CTA (link to Projects), no
  chart.
- Ready renders the section heading `"Insights"` (level-1 heading) and the chart.
- **axe:** no violations in the ready state.

### `FirmShell.test.tsx` (additions)
- Add `vi.mock('./insights/InsightsPage.tsx', () => ({ InsightsPage: ({
  workspaceName }) => <h1>Insights — {workspaceName}</h1> }))`.
- `renderShell('/acme/insights')` renders the Insights heading (route wired).
- The Workspace nav exposes an `Insights` link → `href="/acme/insights"`, and on
  `/acme/insights` it has `aria-current="page"`.
- Collapsed-sidebar test: Insights link keeps its accessible name (sr-only label),
  consistent with the existing Home/Projects assertions.

Run with **pnpm** (not npm): `pnpm --filter @siapp/web test` (or the repo's
`pnpm turbo test`). Also `pnpm --filter @siapp/web typecheck`/`lint` — code must be
TS-strict, no `any`, no `console.log`, named exports, `function` component
declarations.

## Out of scope (deliberate)
- No new Firestore reads/writes, collections, fields, rules, or indexes.
- No new analytics/metrics views beyond the v1 timeline (only the extensibility
  scaffold is added).
- No drag/reorder, no date editing, no task-level bars, no milestones lane on this
  view (it is project-level, read-only).
- No print/`fitToWidth`/export mode for the Insights timeline in v1.
- No changes to portal/collaborator/marketing/admin surfaces or to `@siapp/ui`.
- No role-based filtering of which projects appear (whole-workspace portfolio,
  same visibility as the Projects list); department scoping is not applied in v1.
- No new charting/Gantt dependency.

## Risks / open questions
1. **Nav placement & label** — plan puts "Insights" after Projects with the
   `BarChart3` icon. Confirm this matches PM/UX intent (issue suggested "between
   Projects and Clients, or after Home"). *Human call if a different slot/label/
   icon is preferred.*
2. **Which lifecycles to include** — plan includes draft/published/archived
   (excludes deleted) for a full portfolio view. If Insights should show only
   *published/active* projects (closer to the "in-progress spreadsheet"), that's a
   one-line filter change. *Confirm.*
3. **Progress semantics** — the overlay shows `progressPct` across the *planned
   span* (span = fill track), not time-elapsed vs. plan. If the firm's spreadsheet
   implies "% of time elapsed" or an "on-track vs behind" indicator, that's a
   larger v1.1 (needs a design decision). v1 uses the server `summary.progressPct`
   as-is.
4. **Undated presentation** — plan uses a separate "No dates set" section. If PM
   prefers these hidden or shown as ghost bars, adjust. *Confirm.*
5. **Extensibility shape** — plan defers the `InsightsLayout`+sub-nav until a
   second view exists (v1 keeps `InsightsPage` rendering the timeline directly) to
   avoid speculative structure. If PM wants the sub-tab chrome present from day one
   (even with a single tab), say so.
