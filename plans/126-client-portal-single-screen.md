---
title: "Impl #126 — Redesign client portal as a single-screen dashboard"
status: approved
updated: 2026-08-24
decision: D-042
issue: 126
surface: portal (siapp.app/p/:token)
---

# Impl #126 — Client portal single-screen dashboard

> ✅ **Scope approved and logged as [D-042](../../pm_ux/plans/decisions-log.md) (2026-08-24, #126).**
> The client portal becomes a single-screen dashboard with a client-visible **task list +
> Gantt timeline** and a **print/export** view. D-042 supersedes: D-034 point 2 (the timespan
> bar, chosen instead of a Gantt) and the 11-mvp-scope lines that omitted a portal task list /
> marked Gantt "Never" — **for the client portal specifically** (firm-side D-033 scope
> unchanged). The former Open Questions are now resolved decisions (see **Resolved decisions**).

---

## Goal

Replace the current tabbed/route-changing client portal (Overview / Documents / Updates as
nested routes under `PortalShell`) with a **single-screen dashboard** at `siapp.app/p/:token`
that shows, on one page, exactly four sections plus a project header: a header (title, client,
start/target dates, **Print**), an **Overall Progress** circular chart, a **Project Tasks**
preview grouped by phase with a **"Show All Tasks →"** button, a **Recent Updates** preview, and
a **Documents** preview + upload. "Show All Tasks" opens a **modal** with **List** and
**Timeline (Gantt-style)** views. A **print** action renders a horizontal, print-friendly layout
of everything including both task views. The standalone **Current phase** and **Next milestone**
blocks are removed and **milestones are no longer rendered in the portal** (phases survive only
as task-group headers). Implements **D-042**; preserves bundle isolation (D-036/D-037), the
"Powered by Siapp" footer (D-030), the read-only/"not started" lifecycle gates (D-027), and
server-maintained `progressPct` (never recomputed client-side).

---

## Touched surfaces & files

Only the **portal (apex `/p/*`) bundle** and the shared **`@siapp/ui`** package are touched.
Firm / admin / collaborator surfaces are untouched. **No firm-surface code may be imported into
the portal** (D-036/D-037 — currently intact, must stay intact).

### `@siapp/ui` (shared design system — reusable by firm + portal, D-038)
- **CREATE** `packages/ui/src/components/CircularProgress.tsx` — generic accessible SVG ring
  (promote the proven `viewBox 0 0 36 36`, `R=15.915…`, `strokeDasharray`/`strokeDashoffset`
  pattern from the firm `TaskProgressRing`). Props: `value: number` (0–100, clamped),
  `label: string`, optional `size`, `trackClassName`, `indicatorClassName`, children (center
  content). No firm deps. **CREATE** `CircularProgress.test.tsx` (co-located).
- **MODIFY** `packages/ui/src/index.ts` — export `CircularProgress`.
- *(Do NOT move `TaskProgressRing`/`TaskStatusRing` out of the firm surface in this issue —
  scope creep. Just add the generic primitive the portal needs; the firm ring can adopt it
  later.)*

### Portal surface — `apps/web/src/surfaces/portal/`
- **REWRITE** `PortalProjectPage.tsx` — single-screen composition (header + 4 sections).
- **MODIFY** `PortalShell.tsx` — remove the `NAV_ITEMS` tab nav (single screen). Keep the
  firm-branded bar and `PortalSessionProvider`/`Outlet`. Mobile-first single column;
  desktop container widened to `max-w-5xl` with a multi-section grid. The **Print button**
  lives in the page header (needs project data), not the shell.
- **CREATE** `sections/PortalHeader.tsx` — project title, client name, start/target dates,
  Print button.
- **CREATE** `sections/PortalProgressSection.tsx` — `CircularProgress` centered on
  `project.progressPct` (D5 server value). **No timespan bar** (D-034 timespan removed by D-042).
- **CREATE** `sections/PortalTasksSection.tsx` — phase-grouped preview (first N per phase /
  first N phases) + "Show All Tasks →" button opening the modal.
- **CREATE** `sections/PortalUpdatesSection.tsx` — inline preview (reuse `usePortalUpdates`,
  `updateLabel`). Replaces the current inline block + "See all" link semantics.
- **CREATE** `sections/PortalDocumentsSection.tsx` — inline preview + upload. **Reuse the
  existing** `usePortalDocuments` / `uploadPortalDocument` / `validateClientFile` /
  `portalDownloadUrl` logic unchanged; extract the current `PortalDocumentsPage` list+upload
  UI into this section component so both the screen and print can render it.
- **CREATE** `tasks/PortalAllTasksDialog.tsx` — `<Dialog size="lg">` modal with a List/Timeline
  view toggle (mirror the firm `role="group"` + `aria-pressed` toggle pattern), phase-grouped.
- **CREATE** `tasks/PortalTaskList.tsx` — read-only list grouped by phase; each row shows
  status chip (Done / In Progress / To do / Blocked / Overdue) + dates.
- **CREATE** `tasks/PortalTaskTimeline.tsx` — **read-only** portal-local Gantt (do NOT import
  the 443-line firm `TimelineView`; rebuild the layout math without the drag/keyboard-reorder
  surface — roughly half the code). Supports a `fitToWidth` mode for print.
- **CREATE** `tasks/usePortalTasks.ts` — live query + client-safe mapping + phase grouping.
- **CREATE** `tasks/portalTaskStatus.ts` — pure helpers: `derivePortalStatus(task, now)`,
  `PORTAL_STATUS_LABELS`, `isPortalOverdue(task, now)`.
- **CREATE** `print/PortalPrintLayout.tsx` — print-only DOM (`hidden print:block`) rendering
  header + progress + updates + documents + **both** task views expanded.
- **CREATE** co-located tests (see Test plan).
- **REMOVE (via the `PortalProjectPage` rewrite)** the standalone **Current phase** and
  **Next milestone** blocks — no longer rendered anywhere in the portal (D-042). Milestones are
  not shown at all. `usePortalProject` **still reads phases** (needed for task-group headers/
  order/labels); its `milestones` read + the `nextMilestone`/`currentPhase` helpers become
  unused by the portal UI. Leave `usePortalProject` reading milestones only if trivially cheap;
  otherwise Builder may drop the milestones subscription and the two helpers (and their tests).
  `TimespanBar.tsx` (+ test) is no longer used by the portal — remove its usage; deleting the
  component file is optional cleanup.
- *(Retain thin route shims for the old paths — see Routing.)*

### Routing
- **MODIFY** `apps/web/src/routes/apexRouter.tsx` — index route → new single screen; convert
  `documents` and `updates` child routes to backward-compatible redirects (below).

### Rules & indexes
- **MODIFY** `firestore.rules` — add a portal-client `list` grant on `tasks` (below).
- **MODIFY** `firestore.indexes.json` — **only if** we add an `orderBy` to the portal task
  query. Recommended approach uses equality-only filters + client-side sort → **no new index**
  (mirrors the documents hook). Confirm in Steps.

### Print CSS
- **MODIFY** the portal global stylesheet (the one applied under `[data-surface='portal']`,
  `packages/ui/src/styles/…` or the app entry CSS — Builder to confirm) to add `@media print`
  rules + `@page { size: landscape; }`. No new dependency.

---

## Data model changes

**No new collections or fields.** We read the existing `tasks` subcollection
(`/workspaces/{wid}/projects/{pid}/tasks/{tid}`) from the portal for the first time.

### Client-safe task projection (mapped in `usePortalTasks`)
Expose **only** these fields to the portal client:

| Field | Use |
|---|---|
| `id` | key |
| `title` | task name |
| `status` | `'todo'\|'in_progress'\|'blocked'\|'done'` → derive client status |
| `phaseId?` | group under phase (unphased → "Other"/"No phase" group) |
| `startDate?` | timeline bar start |
| `dueDate?` | timeline bar end + overdue calc |
| `completedAt?` | (optional) done date |
| `order` | client-side sort within group |

**Deliberately NOT exposed to the client:** `description`, `assignees`, `restrictedToDepartments`,
`blockedReason`/`blockedBy`, `notify`, `sendWhatsapp`, `tags`, `createdBy`/`updatedBy`,
`visibleToCollaboratorIds`. (The mapper reads only the whitelist keys; even though rules will
return the whole doc, the client bundle must not surface internal fields.)

### Status derivation (`portalTaskStatus.ts`) — five client statuses

Precedence: **Overdue wins over the underlying status when past due** (except Done).

- `status == 'done'` → **Done**
- else `dueDate` present AND `dueDate < now` → **Overdue** *(takes precedence over
  in_progress / todo / blocked)*
- else `status == 'blocked'` → **Blocked**
- else `status == 'in_progress'` → **In Progress**
- else (`todo`) → **To do**

`blockedReason`/`blockedBy` are **never** exposed to the client — the chip says "Blocked" with no
reason. `PORTAL_STATUS_LABELS` = `{ done: 'Done', overdue: 'Overdue', blocked: 'Blocked',
in_progress: 'In Progress', todo: 'To do' }`.

### Security-rules implications (multi-tenant isolation — non-negotiable)

The portal principal authenticates via custom claims `request.auth.token.portal.{wid,pid,cid,linkId}`
(no `workspaces` claim). Today `firestore.rules` grants portal reads on `project`, `phases`,
`milestones`, client-visible `documents`, and client-visible `activity`, **but tasks `get`/`list`
are firm-member or collab-principal only** (~line 846). We must add a **narrow, list-provable**
portal grant:

```
// inside match /tasks/{tid}, add to the existing `allow list`:
allow list: if (isFirmMember(wid) && canSeeRestrictedList(wid, resource.data))
  || (isPortalClient(wid, pid)
      && portalProjectLive(wid, pid)
      && resource.data.visibleToClient == true
      && resource.data.restrictedToDepartments.size() == 0);
```

Design rationale / constraints:
- **`isPortalClient(wid, pid) && portalProjectLive(wid, pid)`** — same gate used for
  phases/milestones: the caller's `portal.cid` must still equal `project.clientId` and the
  project lifecycle must be `published`/`completed` (D-027: draft ⇒ not-started, archived/deleted
  ⇒ revoked). This is the multi-tenant isolation guarantee — a portal token is scoped to exactly
  one `wid/pid`.
- **`visibleToClient == true`** — reuses the same per-task client-visibility flag that already
  governs `documents`/`activity`. This is the firm's curation lever (Open Question #2).
- **`restrictedToDepartments.size() == 0`** — clients carry no departments; restricted tasks
  (D-025) must never reach a client. The rule references the field **directly** (like
  `canSeeRestrictedList`), so Firestore's `list` prover **forces the query to constrain it** —
  a query that omits the constraint is denied, not just filtered. This closes the D-025 leak.
- **No portal `get` grant is added** — the portal only ever runs the constrained `list`
  subscription; single-doc `get` stays firm/collab only. (If a future portal task-detail view is
  wanted, add a mirrored `get` — out of scope here.)
- Because the fields are referenced directly (not via `restrictionsOf`'s `.get()` default), the
  **query MUST include both `where` clauses** or it fails — this is the intended contract.

### Index
Equality-only query (`visibleToClient == true` + `restrictedToDepartments == []`) with
**client-side sort** by `(phase order, task order)` needs **no composite index** (Firestore
zig-zag-merges single-field indexes for equality-only queries — exactly what
`usePortalDocuments` relies on). **Do not add `orderBy` to the query**; if a future requirement
forces server ordering, add `tasks: visibleToClient ASC, restrictedToDepartments ASC, order ASC`
to `firestore.indexes.json`.

---

## Steps (Builder-ordered, each independently verifiable)

1. **Add `CircularProgress` to `@siapp/ui`.** Port the SVG ring math from `TaskProgressRing`
   into a generic value/label component; export it; write its unit test. Verify: renders a ring
   whose `strokeDashoffset` reflects `value`, exposes an accessible name, clamps 0–100.

2. **Security rules.** Extend the `tasks` `allow list` with the portal branch above. Verify with
   emulator rules tests (Step in Test plan): portal client lists client-visible non-restricted
   tasks; is **denied** for restricted / `visibleToClient==false`; is denied when project is
   `draft`/`archived`; firm-member listing is unaffected.

3. **`portalTaskStatus.ts`** pure helpers + test (five-status derivation with Overdue precedence,
   `blocked`→Blocked, labels).

4. **`usePortalTasks.ts`** hook: `onSnapshot` over the equality-only query, map to the client-safe
   projection, group by `phaseId` (join with phases from `usePortalProject` for names/order;
   unphased bucket last), sort client-side. Return `{ status, groups }`. Test the mapping,
   grouping, sort, and that no internal fields leak. Verify the query shape matches the rules
   (both `where` clauses present).

5. **`PortalTaskList.tsx`** — read-only phase-grouped list with status chips (reuse `Badge`) and
   dates. **`PortalTaskTimeline.tsx`** — read-only Gantt: compute the axis as the **dynamic
   min/max of task start/due dates ± padding** (same approach as the firm `TimelineView`, NOT
   project start→target), lay out bars proportionally; include a `fitToWidth` prop for print
   (screen mode may scroll like the firm view; print mode fits page width). Accessible bar labels
   (title + status + dates).

6. **`PortalAllTasksDialog.tsx`** — `<Dialog size="lg">` hosting a List/Timeline toggle
   (`role="group"`, `aria-pressed`, keyboard operable) rendering the two components above.
   Native `<dialog>` gives focus trap / Esc / restore.

7. **Section components** — `PortalHeader` (title/client/dates + Print button),
   `PortalProgressSection` (`CircularProgress` only — no timespan bar), `PortalTasksSection`
   (preview + "Show All Tasks →" opening the dialog), `PortalUpdatesSection`,
   `PortalDocumentsSection` (extract from current `PortalDocumentsPage`, reuse hooks unchanged).
   **Do not build Current-phase or Next-milestone blocks** — removed by D-042.

8. **Rewrite `PortalProjectPage.tsx`** to compose header + the **four** sections responsively
   (single column on mobile, multi-section grid at `max-w-5xl` on desktop). Preserve
   loading/error/`role="status"`/`role="alert"` states. Remove the milestone/phase blocks and the
   `TimespanBar` usage.

9. **`PortalShell.tsx`** — remove `NAV_ITEMS`/`<nav>`; keep branded bar, provider, `Outlet`,
   footer. Widen the desktop container to `max-w-5xl` while keeping mobile single-column.

10. **Routing backward-compat** in `apexRouter.tsx`: keep `/p/:token` → `PortalShell`; index →
    new page. Replace the `documents`/`updates` element routes with a small
    `<Navigate to=".." replace>`-style redirect (optionally appending `#documents` / `#updates`
    so the target section can be scrolled into view). Verify old WhatsApp deep links still land on
    a working screen (WA tokens are re-sent per notification — D-036 — but in-flight links must
    not 404).

11. **Print.** Add the Print button (`<Button>` + lucide `Printer`, `aria-label="Print project
    summary"`) calling `window.print()`. Add `PortalPrintLayout` (`hidden print:block`) rendering
    all four areas + **both** task views (`PortalTaskList` and `PortalTaskTimeline fitToWidth`).
    Add `@media print` CSS: `@page { size: landscape; }`, hide footer/interactive chrome/screen
    layout (`print:hidden`), show the print layout, expand scroll containers. No new dependency —
    `@media print` + `window.print()` is sufficient (do NOT add react-to-print).

12. **Tests + a11y pass** (Test plan). Run build/lint/typecheck; confirm the portal bundle has no
    firm-surface import (grep) so D-036/D-037 isolation holds.

---

## Test plan (for Tester)

- **Unit (`packages/ui`)**: `CircularProgress` — value→offset mapping, clamping, accessible name.
- **Unit (portal)**: `portalTaskStatus` — every branch incl. Overdue-precedence boundary and
  `blocked`→Blocked (five statuses).
- **Hook**: `usePortalTasks` — Firestore mock: maps client-safe fields only (assert internal
  fields absent), groups/sorts by phase, handles unphased tasks, loading/error states, query
  carries both `where` clauses.
- **Component**: `PortalAllTasksDialog` — toggles List↔Timeline, `aria-pressed` updates, phases
  render, Esc closes; `PortalTasksSection` — "Show All Tasks →" opens dialog; `PortalProgressSection`
  — renders percent + accessible label.
- **Component**: `PortalPrintLayout` renders **both** task views + all four sections.
- **Rules (emulator)**: extend the existing portal rules test suite — portal client CAN list
  `visibleToClient==true` + non-restricted tasks on a live project; CANNOT list restricted or
  `visibleToClient==false`; CANNOT list on `draft`/`archived`/`deleted`; a query missing either
  `where` clause is denied; firm-member and collaborator paths unchanged; cross-tenant token
  (wrong wid/pid/cid) denied.
- **Routing**: old `/p/:token/documents` and `/updates` resolve to the single screen (redirect),
  no 404.
- **Isolation**: assertion/grep that `surfaces/portal/**` imports nothing from `surfaces/firm/**`.

---

## Accessibility

- **Modal**: native `<Dialog>` provides focus trap, Esc, and focus restore — reuse as-is.
- **CircularProgress**: `role="img"` + `aria-label="{value}% complete"` (or `progressbar` with
  `aria-valuenow/min/max`); center percent text is decorative/`aria-hidden` if label covers it.
- **View toggle**: `role="group"` + `aria-pressed` buttons, full keyboard operation (mirror the
  firm `List/Timeline` toggle).
- **Print button**: real `<button>`/`<Button>` with visible "Print" text + icon and an
  `aria-label`.
- **Status chips**: text label (not color-only) — "Done / In Progress / To do / Blocked / Overdue".
- **Timeline bars**: each an element with an accessible name (title + status + dates); provide a
  text alternative since the visual Gantt is not screen-reader-friendly (the List view is the
  accessible equivalent — ensure it's always reachable).
- Preserve existing `role="status"`/`role="alert"` loading/error patterns.

---

## Out of scope

- Any firm / admin / collaborator surface change; moving `TaskProgressRing`/`TaskStatusRing`/
  firm `TimelineView` into `@siapp/ui`.
- Editing tasks, drag/reorder, or task-detail drill-in from the portal (read-only only).
- Exposing task `description`, assignees, notes/updates-per-task, or attachments to clients.
- New Firestore fields/collections; changing how `progressPct` is computed (stays server-side, D5).
- New runtime dependencies (react-to-print, chart libs, dnd) — build with SVG + `@media print`.
- PDF export / server-side print rendering (this is browser `window.print()` only).
- Real-time collaboration or notifications changes.

---

## Resolved decisions (locked in by the user, 2026-08-24)

1. **Scope approved & logged as [D-042](../../pm_ux/plans/decisions-log.md).** The client portal
   becomes a single-screen dashboard with a client-visible task list + Gantt timeline + print/
   export. D-042 supersedes D-034 point 2 (timespan bar) and the 11-mvp-scope "no portal task
   list" / "Gantt … Never" lines for the client portal.
2. **Tasks shown = `visibleToClient == true` only** (firm opt-in via the existing flag; restricted
   tasks always excluded). Query/rules assume both `where` clauses.
3. **Four sections only.** Overall Progress, Project Tasks, Recent Updates, Documents. The
   standalone **Current phase** and **Next milestone** blocks are removed; **milestones are not
   rendered in the portal**. Phases remain only as task-group headers.
4. **Five status chips**, Overdue taking precedence when past due: Done, Overdue, Blocked, In
   Progress, To do. `blockedReason` stays hidden.
5. **Timeline axis** = dynamic min/max of task start/due dates ± padding (firm `TimelineView`
   approach), NOT project start→target.
6. **Timespan bar dropped** — not rendered in the redesign.
7. **Layout** = mobile single column, desktop multi-section grid at `max-w-5xl`.

## Remaining risks / smaller open items (non-blocking)

- **Unphased tasks grouping.** Tasks with no `phaseId` go to a trailing "Other" group; confirm the
  exact label with the user during build if needed.
- **Print timeline fidelity.** Fitting a long Gantt onto one landscape page may compress bars;
  acceptable for v1. If a project spans many months, `fitToWidth` may make bars very thin —
  Builder should cap minimum bar width and, if needed, allow the print timeline to break across
  pages rather than distort. Flag to the user if it looks unusable in testing.
- **`usePortalProject` milestones read.** Now unused by the UI; Builder decides whether to drop the
  milestones subscription (and `nextMilestone`/`currentPhase` helpers + tests) or leave them
  dormant. Prefer removing dead code, but keep the `phases` read.

---

## Reuse notes (for Builder)

- **Dialog** (`@siapp/ui`) `size="lg"` = `max-w-4xl max-h-[90vh] overflow-hidden p-0`, native
  focus trap/Esc — same modal the #124 firm task detail uses.
- **Button** `variant="ghost" size="icon"` for icon-only close; `Printer`/`X`/`List`/`Columns3`
  from **lucide-react** (the repo's icon set).
- **Tokens**: `--accent` (#c4553d), `--primary` (#3e4c77), `--shadow-card`, `--font-display`;
  portal warm-neutral theming under `[data-surface='portal']` — match, don't invent.
- **Ring math** to port: `viewBox="0 0 36 36"`, `R=15.915494309189533`,
  `strokeDasharray=CIRCUMFERENCE`, `strokeDashoffset=CIRCUMFERENCE*(1-value/100)`, rotate -90°.
- **Existing document hooks** (`usePortalDocuments`, `uploadPortalDocument`, `validateClientFile`,
  `portalDownloadUrl`) and **updates hook** (`usePortalUpdates`, `updateLabel`) are reused verbatim.
- **Query precedent**: `usePortalDocuments` uses equality-only filters + client-side sort "no
  composite index" — mirror this exactly for tasks.
