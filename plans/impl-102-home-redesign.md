# impl-102 — Firm Home screen redesign: polish, portfolio stats & clickable tasks

**Issue:** Siapp-Development/siapp#102 — "Firm Home screen redesign: polish, portfolio stats, and clickable tasks"
**Surface:** firm app only — `dashboard.siapp.app/:workspaceSlug/` (index route). No other bundle is touched (D-036 / D-037 isolation preserved by construction).
**Type:** Presentational + interaction upgrade. **Zero** backend / Firestore / rules / data-model changes. **No** new dependencies.

---

## Goal

Turn the firm Home page (`apps/web/src/surfaces/firm/dashboard/DashboardPage.tsx`) from a plain list into a polished, action-oriented landing screen: a personalized time-aware header, a client-side "portfolio at a glance" stat strip, fully clickable task cards that deep-link into the project Tasks tab (fixing the core bug where only the project subtitle was clickable), richer task metadata (relative due-date pill + assignee), clickable "Needs your attention" project cards, and consistent micro-interactions / empty states. All data continues to arrive via `useProjects` + `useDashboardTasks`; the page stays presentational and performs no writes. This is the visual/interaction layer over the #17 dashboard (`impl-17-dashboards.md`) and reuses the design-token system from the D-039 "Site office" palette and the D-036 bundle-isolated firm surface.

---

## Design intent recap (reuse, do not invent)

- **Tokens** (`packages/ui/src/styles/tokens.css`): primary `--primary` (slate-indigo), accent `--accent` (terracotta), semantic `--warning` / `--success` / `--danger` (+ `-tint` variants), `--shadow-card` / `--shadow-raised`, `--font-display` (Space Grotesk), `--muted-foreground`, `--border`. Use the **Tailwind semantic classes** already used in this file (`text-danger`, `text-warning`, `text-primary`, `text-muted-foreground`, `bg-card`, `border-border`, `shadow-card`, `shadow-raised`, `font-display`, `tabular-nums`). **Never raw hex.**
- **Icons**: inline stroke-SVG, Lucide-style, `viewBox="0 0 24 24"`, `strokeWidth={1.8}`, `strokeLinecap/Linejoin="round"`, `fill="none"`, `stroke="currentColor"` — copy the `ICON_PROPS` convention from `FirmShell.tsx:54-63`. Icons are decorative → wrap in `aria-hidden="true"` (as `NavItem` does at `FirmShell.tsx:45`). **No icon library.**
- **Reduced motion**: a global clamp already exists at `packages/ui/src/styles/globals.css:79-87` (`@media (prefers-reduced-motion: reduce)` zeroes all `transition-duration`/`animation-duration`). So all hover transitions can use plain `transition-* duration-150` and are automatically neutralized — **no per-component media query needed**. (For any JS-driven scroll we would gate on `matchMedia`, but this redesign adds none — the scroll/highlight lives in `TasksSection.tsx` and is reused, not rewritten.)
- **Existing badges to reuse as-is**: `TaskStatusBadge` (`projects/tasks/TaskStatusBadge.tsx`), `LifecycleBadge` (`projects/LifecycleBadge.tsx`), `HealthBadge` (`dashboard/HealthBadge.tsx`). `Badge` variants available: `neutral | primary | accent | success | warning | danger | outline`.
- **`Progress`** (`packages/ui`): `label` is a **required** prop but is used only as the `aria-label` on `role="progressbar"` — it is **not rendered visually**. The current attention row already pairs it with a visible `{pct}%` span; keep that pattern (a visible "Progress" text label + the numeric %).
- **Card interaction language** already established in this file: `border-primary/50` on hover, `ring-1 ring-primary` for selection, `shadow-card → shadow-raised` lift, `transition-colors duration-150` (see the KPI tab buttons `DashboardPage.tsx:153-158`). Reuse these exact tokens for the new cards.

---

## Data-availability notes (so Builder invents nothing)

Confirmed present:
- **`IProjectRow`** (`projects/useProjects.ts:23-42`): `id, name, lifecycle, status, clientNameDenorm, progressPct, totalTasks, doneTasks, overdueTasks, blockedTasks, ownerNameDenorm, targetEndDate`. → Attention card uses `name`, `lifecycle`, `clientNameDenorm`, `progressPct`, `overdueTasks`, `blockedTasks`. Stat strip uses `lifecycle` + `projectHealth(row)`.
  - ⚠ `blockedTasks` may be `0` on projects untouched since the #17 trigger deploy (documented at `useProjects.ts:78-79`) — treat 0 as "none", never as missing.
  - ⚠ `clientNameDenorm` can be `''` (unlinked project) — render nothing / no dot separator when empty.
- **`IDashboardTaskRow` = `ITaskRow` + `projectId` + `projectName`** (`dashboard/useDashboardTasks.ts:19-22`). `ITaskRow` (`projects/tasks/useTasks.ts:52-75`) has: `title, status, dueDate (Date|null), startDate, assignees (TTaskAssignee[]), order`. → Task card uses `title, status, dueDate, projectId, projectName, assignees`.
- **`TTaskAssignee`** (`@siapp/shared`, `packages/shared/src/firestoreTypes.ts:420-435`): `{ type: 'user'|'collaborator', id, name }` (collaborators also carry `phone`). **No avatar, no color, no role field.** → Assignee display = first assignee's `name` (initials or text) + a "+N" overflow count. Do not fabricate avatar images.
- **Auth user** (`auth/AuthProvider.tsx:26-37`): `state.user` is a Firebase `User` with `displayName` and `email`; `uid` is already threaded into `DashboardPage`. The greeting's first name derives from `displayName` (fallback: local-part of `email`, final fallback: "there"). FirmShell already computes `state.user.displayName ?? state.user.email ?? ''` for `ProjectDetailPage`/`ProjectsListPage` (`FirmShell.tsx:245,258`) — mirror that.

**NOT available — do not add fields, do not touch rules/model:**
- ❌ **No task `priority`** anywhere (not on `ITaskDoc`, no enum). The issue says "show assignee/priority *if present*" — priority is **not present**, so the card shows **assignee only**. Do not introduce a priority field.
- ❌ No per-assignee avatar/photo URL. Use initials/name text.
- ❌ No existing relative-time helper anywhere in `apps/web/src/lib` or `packages/*` — a new co-located pure helper is required (see below); we are not duplicating anything.

---

## Touched surfaces & files

### New files (co-located under `dashboard/`, named exports, `function` declarations, no `any`)
| File | Purpose |
|---|---|
| `apps/web/src/surfaces/firm/dashboard/relativeDueDate.ts` | Pure helper: `relativeDueDate(due: Date \| null, now: Date)` → `{ label: string; tone: 'danger'\|'warning'\|'muted'; overdue: boolean }` (e.g. "in 2 days", "3 days overdue", "today", "tomorrow"). Day-granular, computed from calendar-day diff in viewer local time. Unit-tested. |
| `apps/web/src/surfaces/firm/dashboard/greeting.ts` | Pure helpers: `firstNameFrom(displayName: string, email: string): string` and `timeGreeting(now: Date): string` ("Good morning/afternoon/evening"). Unit-tested. |
| `apps/web/src/surfaces/firm/dashboard/portfolioStats.ts` | Pure helper: `portfolioStats(projects: readonly IProjectRow[], buckets: ITaskBuckets)` → the four metrics `{ activeProjects, onTrackPct, overdueTasks, dueThisWeek }`. `onTrackPct` = share of active (draft+published) projects where `projectHealth(row) === 'on_track'`; returns `null` when there are no active projects (render "—"). Unit-tested. |
| `apps/web/src/surfaces/firm/dashboard/dashboardIcons.tsx` | Small decorative inline-SVG set following `ICON_PROPS` (chevron-right for card affordance; folder / target-check / alarm / calendar for the four stat tiles). Each `aria-hidden`. Keeps cards lean. |
| `apps/web/src/surfaces/firm/dashboard/StatStrip.tsx` | Presentational 4-tile strip. Props = output of `portfolioStats` (plus a header id if needed). Each tile: icon + `tabular-nums` value + label, semantic color (active→primary, on-track→success, overdue→danger, due-this-week→warning). |
| `apps/web/src/surfaces/firm/dashboard/DashboardTaskCard.tsx` | Clickable task card (replaces inline `TaskListItem`). Props `{ task: IDashboardTaskRow; workspaceSlug: string; now: Date }`. Renders stretched-link deep-link to `?task=`, title, secondary project link, `TaskStatusBadge`, relative due-date pill, assignee, hover chevron. |
| `apps/web/src/surfaces/firm/dashboard/AttentionCard.tsx` | Clickable attention project card (replaces inline `<li>`). Props `{ project: IProjectRow; workspaceSlug: string }`. Whole card links to project root; shows name + `LifecycleBadge` + `HealthBadge` + `clientNameDenorm` + labeled `Progress` + mini metric line. |

### New test files (Tester authors; listed for scope)
`relativeDueDate.test.ts`, `greeting.test.ts`, `portfolioStats.test.ts`, `DashboardTaskCard.test.tsx`, `AttentionCard.test.tsx`.

### Modified files
| File | Change |
|---|---|
| `apps/web/src/surfaces/firm/dashboard/DashboardPage.tsx` | Add `userName: string` to `IDashboardPageProps`; replace bare "Home" header with eyebrow (date) + time-aware greeting + workspace name; insert `<StatStrip>` (computed via `portfolioStats`); swap `TaskListItem` → `<DashboardTaskCard>`; swap attention `<li>` → `<AttentionCard>`; upgrade both empty states (muted icon + guidance + action link). Delete the local `TaskListItem`. |
| `apps/web/src/surfaces/firm/FirmShell.tsx` | Pass `userName={state.user.displayName ?? state.user.email ?? ''}` to `<DashboardPage>` at the index route (`FirmShell.tsx:224-233`), matching the sibling pages. |
| `apps/web/src/surfaces/firm/dashboard/DashboardPage.test.tsx` | **Must be updated** (see Test plan) — the card-level link change alters several existing assertions, and `renderPage` must pass the new `userName` prop. |

**Explicitly unchanged:** `useProjects.ts`, `useDashboardTasks.ts`, `useTasks.ts`, `dueBuckets.ts`, `projectHealth.ts`, `TasksSection.tsx`, `ProjectDetailPage.tsx`, `firestore.rules`, indexes, all callables/backend.

---

## The clickable-card pattern (accessibility-critical — specify precisely)

**Constraint:** an `<a>` nested inside another `<a>` is **invalid HTML** and breaks AT. React Router `<Link>` renders an `<a>`, so we must **not** nest one `<Link>` in another. The current code sidesteps this by making *only* the project subtitle a link (`DashboardPage.tsx:59-64`) — that is the bug.

**Chosen approach — "stretched primary link + layered secondary link" (no DOM nesting):**

1. The task card is a positioned container: `<li class="group relative ...">` (a plain `<li>`, **not** an anchor).
2. Inside it, the **primary** target is a `<Link to={/${slug}/projects/${task.projectId}?task=${task.id}}>` whose title text is the visible label, given `aria-label={`Open task ${task.title} in ${task.projectName}`}`, and an overlay pseudo-element `before:absolute before:inset-0` (Tailwind `before:content-['']`) that stretches the clickable/focus area across the whole card. Focus ring goes on this link via `focus-visible:ring-2 focus-visible:ring-primary` (rendered on the stretched card via `before:` outline or a ring on the `<li>` driven by `group-focus-within`).
3. The **secondary** target — the project name — is a separate sibling `<Link to={/${slug}/projects/${task.projectId}}>` (project **root**, no `?task=`) rendered with `class="relative z-10"` so it stacks **above** the stretched overlay and is independently clickable/focusable. Because the two anchors are DOM **siblings** (not nested), the markup is valid; z-index layering — not `stopPropagation` — is what lets the project name navigate to the project root while the rest of the card opens the task. (No `onClick`/`stopPropagation` gymnastics needed; note this supersedes the issue's "nested link that stopPropagations" phrasing, which would produce invalid HTML.)
4. Hover/focus affordances on the card: `hover:border-primary/50`, title `group-hover:text-primary`, `shadow-card → group-hover:shadow-raised`, and the chevron (`dashboardIcons` chevron, `aria-hidden`) nudges via `group-hover:translate-x-0.5 transition-transform duration-150`. All motion auto-neutralized by the global reduced-motion clamp.

**Deep-link behavior is REUSED, not rebuilt:** navigating to `/:slug/projects/:projectId?task=:taskId` already triggers, in existing code: the `?task=` param handling + Tasks-tab switch (`ProjectDetailPage.tsx:236-260`) and the scrollIntoView + 2.5 s highlight + drawer open (`TasksSection.tsx:404-445`). This plan only produces the URL. **Do not modify those effects.**

**Attention card:** simpler — the whole card is a single `<Link to={/${slug}/projects/${project.id}}>` (one anchor, no nesting). Badges, progress bar and metric line are non-interactive children of that anchor, so no layering needed. `aria-label` = e.g. `"${project.name} — ${health label}"`.

---

## Steps (each independently verifiable)

1. **`relativeDueDate.ts`** — implement the pure helper + tone mapping (overdue→`danger`, due within ~2 days→`warning`, else→`muted`). Verify: unit tests for today/tomorrow/in-N-days/N-days-overdue/null.
2. **`greeting.ts`** — implement `firstNameFrom` (first whitespace token of `displayName`; else email local-part; else "there") and `timeGreeting`. Verify: unit tests across name/email/empty inputs and morning/afternoon/evening hours.
3. **`portfolioStats.ts`** — implement the four-metric derivation from `projectRows` + `ITaskBuckets`; `onTrackPct` null-safe. Verify: unit tests incl. zero-active-projects and mixed-health cases.
4. **`dashboardIcons.tsx`** — add the decorative SVG set using the `ICON_PROPS` convention. Verify: renders, all `aria-hidden`.
5. **`StatStrip.tsx`** — presentational strip consuming step 3 output; semantic colors + `tabular-nums`; responsive grid (`grid-cols-2 sm:grid-cols-4`). Verify: renders four labeled tiles; "—" when `onTrackPct` null.
6. **`DashboardTaskCard.tsx`** — implement the stretched-link pattern from the section above, wiring `TaskStatusBadge`, the due-date pill (step 1), assignee text/initials + "+N", and the hover chevron. Verify (RTL): card link has `?task=` href + correct `aria-label`; project link has project-root href; overdue pill shows danger styling.
7. **`AttentionCard.tsx`** — whole-card `<Link>` to project root; name + `LifecycleBadge` + `HealthBadge` + `clientNameDenorm` (omit when `''`) + labeled `Progress` + `{pct}%` + mini metric line built from `overdueTasks`/`blockedTasks` (e.g. "2 overdue · 1 blocked"; omit segments that are 0). Verify (RTL): link href = project root; metric line text.
8. **`DashboardPage.tsx` header** — add `userName` prop; replace the `<h1>Home</h1>` block (`DashboardPage.tsx:119-125`) with: eyebrow = today's date (`toLocaleDateString` with a weekday/month/day format) + workspace name, `<h1>` = `${timeGreeting(now)}, ${firstNameFrom(userName, '')}`. Keep the `canCreate` "New project" button untouched. Verify: greeting + date render; button still gated by role.
9. **`DashboardPage.tsx` body** — compute `portfolioStats(projectRows, buckets)`, render `<StatStrip>` above "Your tasks"; replace `TaskListItem` usage with `<DashboardTaskCard ... now={now}>`; replace the attention `<li>` block (`DashboardPage.tsx:220-244`) with `<AttentionCard>`; delete local `TaskListItem`. Verify: page renders end-to-end for owner/pm/viewer.
10. **Empty states** — give both the task-bucket empty (`DashboardPage.tsx:179-182`) and attention empty (`DashboardPage.tsx:213-216`) a muted `aria-hidden` icon + the existing one-line copy + an action link (task empty → link to `/:slug/projects`; attention empty keeps positive "All projects are on track."). Verify: empty copy + link present.
11. **`FirmShell.tsx`** — thread `userName` into the `<DashboardPage>` index route. Verify: typecheck passes (prop required).
12. **Full gate** — `pnpm -C apps/web typecheck && lint && test`; ensure updated `DashboardPage.test.tsx` and all new tests pass; no new deps in `pnpm-lock.yaml`.

---

## Test plan (Tester)

**New pure-helper unit tests (Vitest):**
- `relativeDueDate.test.ts` — today, tomorrow, "in N days", "N days overdue", null → tone + label correctness; boundary at the warning threshold.
- `greeting.test.ts` — `firstNameFrom` (multi-word name, single name, email-only, empty), `timeGreeting` at representative hours.
- `portfolioStats.test.ts` — active-project count (draft+published only, excludes archived/completed), `onTrackPct` rounding, null when no active projects, overdue/due-this-week pass-through from buckets.

**New component tests (RTL):**
- `DashboardTaskCard.test.tsx` — (a) the card exposes a link with `aria-label` "Open task … in …" whose href is `…/projects/:pid?task=:tid`; (b) a **separate** link named by the project name whose href is the project **root** (no `?task=`); (c) two anchors are siblings (no nested `<a>`); (d) overdue task renders the danger pill; (e) assignee name/initials render, "+N" on overflow.
- `AttentionCard.test.tsx` — whole card is one link to project root; renders lifecycle + health badges, client name (and omits when empty), progress %, and the "N overdue · N blocked" metric line (segments omitted at 0).

**Existing `DashboardPage.test.tsx` — MUST be updated (behavior changed by design):**
- `renderPage` helper: add the new `userName` prop (e.g. `"Alice Tan"`).
- `'links each task row to its project'` (lines 145-156): the project-name link now points at the project **root**; the deep-link `?task=` href now belongs to the **card** link (query by `aria-label` "Open task …"). Update both assertions accordingly.
- `'lists attention projects worst-first …'` (lines 168-193): the attention row is now a single whole-card link containing name + badges + metric text, so `within(li).getByRole('link').textContent` will include more than the name. Re-target the name assertion (e.g. match on `aria-label` or a heading within the card) while keeping the worst-first order + "4 overdue"/"2 blocked" checks.
- Add smoke assertions: greeting text (e.g. `/Good (morning|afternoon|evening), Alice/`) and the four stat-strip labels render.
- Preserved unchanged: KPI-tab counts, tab switching, D7 "never renders restricted tasks", positive empty states, New-project role gating, loading/error states.

---

## Accessibility checklist (specific to these changes)

- **Task card**: exactly two sibling anchors, never nested; primary anchor carries `aria-label="Open task {title} in {projectName}"`; secondary project link has its own accessible name (project name). Stretched overlay uses `before:` pseudo, so the whole card is a single click/focus target for the primary link.
- **Focus**: `focus-visible:ring-2 ring-primary` on the primary link (visible on the card via `group-focus-within`/`before:` ring); project link and its focus ring stack above via `relative z-10`. Keyboard users can reach both anchors in order.
- **Chevron + stat/empty-state icons**: purely decorative → `aria-hidden="true"`, never the only carrier of meaning.
- **Color is never the sole signal**: due-date pill always shows text ("3 days overdue") alongside its danger/warning color; `TaskStatusBadge`/`HealthBadge` already pair text+color.
- **Contrast**: all colors are existing semantic tokens documented AA-compliant (tokens.css header). Pills use tinted backgrounds (`-tint`) with the matching dark foreground token — reuse `Badge` variants rather than hand-rolling low-contrast combos.
- **Progress**: keep the required `label` (accessible name) plus a visible "Progress" text label + numeric % (the bar's `label` prop is not visually rendered).
- **Reduced motion**: all hover transitions rely on the global clamp (`globals.css:79-87`); no JS motion added here. The reused scroll/highlight already guards `matchMedia` in `TasksSection.tsx`.
- **Tablist untouched**: the KPI bucket `role="tablist"`/`tab`/`tabpanel` wiring (`DashboardPage.tsx:143-194`) is preserved exactly.
- **Header**: single `<h1>` (greeting) retained; section `<h2>`s and `aria-labelledby` links preserved.

---

## Out of scope (non-goals)

- No Firestore schema, security-rules, index, or data-model changes; no new fields (esp. **no task priority**).
- No new npm dependencies; no icon library; no token/theme edits.
- No changes to `useProjects` / `useDashboardTasks` / `useTasks` / `dueBuckets` / `projectHealth` logic.
- No rewrite of the deep-link machinery — the Tasks-tab switch, scroll, highlight and drawer in `TasksSection.tsx` / `ProjectDetailPage.tsx` are **reused** by URL only.
- No changes to any other surface (marketing apex, `/p/*` client, `/t/*` collaborator, `admin.*`).
- No new dashboard metrics beyond the four specified; no charts.

---

## Risks / open questions

1. **Existing DashboardPage tests change semantics.** The whole-card link + separate project-root link deliberately break two current assertions and require a new `userName` prop. This is expected from the redesign, not a regression — flagged so the Tester updates (not "fixes around") them. (Planner cannot edit tests.)
2. **`userName` prop threading.** Adding a required `userName` prop to `DashboardPage` is the convention-consistent choice (matches `ProjectDetailPage`/`ProjectsListPage`). Confirm we prefer that over reading `useAuth()` inside the page (kept presentational/prop-driven for testability — recommended).
3. **Stretched-link vs. issue wording.** The issue suggested a "nested link that stopPropagations"; that is invalid HTML. This plan substitutes the sibling stretched-link + z-layer pattern. Flagging in case a reviewer specifically wanted DOM nesting (not recommended).
4. **"Overdue tasks" / "Due this week" stat scope.** Per the issue these reuse the **per-user** bucket counts (`buckets.overdue.length` / `buckets.dueThisWeek.length`), i.e. *the signed-in member's* tasks — not a workspace-wide aggregate. Confirm that's the intended reading (it matches "the bucketed task counts" in the issue and avoids new queries). "Active projects" and "On-track %" are workspace-wide from `projectRows`.
5. **Assignee display with no avatars.** Only names exist; the card shows an initials chip + name + "+N". Confirm initials chip styling is acceptable (reusing the sidebar avatar treatment at `FirmShell.tsx:197-203`).
