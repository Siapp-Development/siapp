# Impl Plan — Upgrade Tasks Timeline view (issue #147)

## Goal
Upgrade the project **Tasks Timeline** (Gantt) on both the firm board and the client
portal. On the **firm** surface (`dashboard.siapp.app`): remove the Milestones lane;
add a **Daily / Weekly / Monthly** granularity switcher (default Monthly); default the
axis to "today + generous past/future padding" so the user can scroll left/right to
reveal empty past/future; render **assignee + collaborator avatars** on each task bar
(user assignees resolve a profile photo, collaborators show initials), capped with a
`+N` overflow chip; keep status‑token bar colors. On the **portal** surface
(`siapp.app/p/*`): add the same granularity switcher (default Monthly), keep status‑token
bar colors, **no avatars**, and keep the print (`fitToWidth`) path working with **no
switcher in print**. This is a UI upgrade to the existing timeline delivered under
D‑033 (timeline is the only MVP board view) and D‑042 (portal read‑only Gantt); it must
respect bundle isolation D‑036/D‑037 (portal imports nothing from the firm tree) and use
`@siapp/ui` design tokens/primitives (D‑038).

## Decisions this plan makes (call out before building)

### Decision A — Avatar `photoUrl` resolution (firm only)
`TTaskAssignee` (packages/shared `firestoreTypes.ts`, union of `ITaskUserAssignee
{type:'user',id,name}` and `ITaskCollaboratorAssignee {type:'collaborator',id,name,phone}`)
carries **no** `photoUrl`. The existing, proven pattern (List rows in `TaskRowItem`,
and `DashboardTaskCard`) is: **join by uid against a `memberPhotos: Map<string,string>`
(uid → photoUrl)** and pass `photoUrl={assignee.type === 'user' ? memberPhotos.get(assignee.id) : undefined}`.
- `memberPhotos` is **already built in `TasksSection`** (lines ~404–412) from
  `useMembers()` → `IMemberRow.photoUrl` (the member‑readable denormalised copy of
  `users/{uid}.photoUrl`, #104).
- **Plan:** thread a new prop `memberPhotos: ReadonlyMap<string, string>` into
  `TimelineView` (identical to how List rows already receive it). Collaborator assignees
  get `photoUrl={undefined}` → Avatar falls back to initials + seed color. This is
  **bundle‑safe** (all firm‑tree, no new cross‑surface imports; no Firestore change).
- **Portal shows no avatars**, so no `memberPhotos` is threaded there.

### Decision B — Granularity + scroll approach: **padded fixed axis** (Option A), NOT dynamic-on-scroll
- **Approach:** keep the existing day‑based positioning math (`diffDays(start, date) *
  DAY_PX`) and make **`DAY_PX` and tick spacing a function of granularity**. For the
  firm axis, replace the current "task/project min–max ± fixed padding" with
  **union(task+project dates, today) then pad generously around the whole range by a
  per‑granularity amount** so today is scrollable to center and empty past/future exists
  to scroll into. Center on today on mount and whenever granularity changes.
- **Why Option A:** deterministic, pure, trivially unit‑testable, no scroll listeners,
  no layout thrash. **Tradeoff:** the scroll range is finite (bounded by padding), not
  infinite. Padding is sized per granularity to be generous (day ±30d, week ±~12w,
  month ±~7mo) which is more than enough for the mockup's "scroll to reveal" intent.
- **Rejected Option B (dynamic extension on scroll):** append days when nearing an edge.
  More code, stateful, jank/anchor‑preservation risk, and hard to unit‑test. Not worth it.
- **Portal note:** issue #147 asks the portal only for the *switcher* (items 6–8), **not**
  the today‑centered scroll behavior. Per D‑042 the portal axis stays the dynamic
  **task** min/max ± padding (never project bounds, no forced today). So `portalTimelineRange`
  is unchanged; only `DAY_PX`/tick spacing become granularity‑driven.

### Decision C — Shared primitives live in `@siapp/ui` (never the firm tree)
There is **no** existing segmented control / tabs / toggle‑group in `packages/ui` (both
surfaces hand‑roll a `role="group"` + `aria-pressed` toggle today). To share the
Day/Week/Month switcher and the granularity math across firm + portal **without the
portal importing firm code** (D‑036/D‑037):
1. New accessible **`SegmentedControl`** component in `packages/ui` (proper
   `role="radiogroup"` / `role="radio"` with arrow‑key roving focus).
2. New DOM‑free **granularity/tick math module** in `packages/ui/src/lib/timeline.ts`
   (`TTimelineGranularity`, `TIMELINE_DAY_PX`, `buildTimelineTicks`, `paddedTimelineAxis`).
   Both surfaces already depend on `@siapp/ui`, so this is the cleanest shared home.
   (packages/shared was considered but the scale values are UI tokens, so `@siapp/ui` fits.)
- **Out of scope / not changing:** the existing List↔Timeline `role="group"` toggles in
  `TasksSection` and `PortalAllTasksDialog` are left as‑is (migrating them to
  `SegmentedControl` is scope creep). The mockup shows the granularity control *next to*
  the view toggle, but we co‑locate it inside the timeline components (state stays local,
  `TasksSection` stays untouched apart from removing milestones).

## Touched surfaces & files

### `packages/ui` (shared — imported by both surfaces)
- **CREATE** `packages/ui/src/components/SegmentedControl.tsx`
- **CREATE** `packages/ui/src/components/SegmentedControl.test.tsx`
- **CREATE** `packages/ui/src/lib/timeline.ts`
- **CREATE** `packages/ui/src/lib/timeline.test.ts`
- **MODIFY** `packages/ui/src/index.ts` — add named exports for the above.

### Firm surface (`dashboard.siapp.app`)
- **MODIFY** `apps/web/src/surfaces/firm/projects/tasks/TimelineView.tsx`
- **MODIFY** `apps/web/src/surfaces/firm/projects/tasks/TimelineView.test.tsx`
- **MODIFY** `apps/web/src/surfaces/firm/projects/tasks/TasksSection.tsx`
  (remove `useMilestones` call + `milestones` prop; add `memberPhotos` prop to `<TimelineView>`)
- **MODIFY (only if it asserts milestones/props)** `apps/web/src/surfaces/firm/projects/tasks/TasksSection.test.tsx`
- **NOT deleted:** `apps/web/src/surfaces/firm/projects/milestones/useMilestones.ts`
  (milestone CRUD hook stays; only the timeline stops consuming it — verified it is
  used *only* to feed `<TimelineView milestones=…>` today).

### Portal surface (`siapp.app/p/*`)
- **MODIFY** `apps/web/src/surfaces/portal/tasks/PortalTaskTimeline.tsx`
- **MODIFY** `apps/web/src/surfaces/portal/tasks/PortalTaskTimeline.test.tsx`
- **MODIFY (verify green)** `apps/web/src/surfaces/portal/print/PortalPrintLayout.test.tsx`
  (must confirm no switcher renders in the `fitToWidth` print path)
- **UNCHANGED** `PortalAllTasksDialog.tsx`, `PortalTasksSection.tsx`, `PortalPrintLayout.tsx`
  (the switcher lives inside `PortalTaskTimeline`, gated on `!fitToWidth`).

## Data model changes
**None.** No Firestore collections/fields/indexes change. No security‑rules change.
Multi‑tenant isolation is untouched — all data (tasks, members, `memberPhotos`) already
flows through existing workspace‑scoped subscriptions. Avatars reuse the already‑denormalised
`members/{uid}.photoUrl` (#104); no new reads.

## Shared module design (`packages/ui/src/lib/timeline.ts`)
Pure, DOM‑free, no React. Reuses the same day‑math already duplicated in both timelines.

```ts
export type TTimelineGranularity = 'day' | 'week' | 'month';

export interface ITimelineAxis { start: number; days: number; } // start = midnight ms
export interface ITimelineTick { label: string; offsetDays: number; }

export const TIMELINE_GRANULARITIES: readonly TTimelineGranularity[] =
  ['day', 'week', 'month'];

/** Pixels per day per zoom level (UI token). */
export const TIMELINE_DAY_PX: Record<TTimelineGranularity, number> =
  { day: 28, week: 12, month: 5 };

/** Past/future padding (in days) added around the whole dated range, per level. */
export const TIMELINE_PAD_DAYS: Record<TTimelineGranularity, number> =
  { day: 30, week: 84, month: 210 };

export function timelineDayStart(date: Date): number;
export function timelineDiffDays(fromMs: number, toMs: number): number;

/**
 * Firm axis: union of all dated timestamps + today, padded by TIMELINE_PAD_DAYS,
 * so today is scrollable-to-center and empty past/future exists. Snaps start down /
 * end up to the granularity boundary (month→1st, week→Monday, day→midnight).
 */
export function paddedTimelineAxis(
  datedMsDayStarts: readonly number[],
  granularity: TTimelineGranularity,
  today: Date,
): ITimelineAxis;

/**
 * Ticks for the axis at the given granularity:
 *  - month → first of each month, label "Aug 26"
 *  - week  → each Monday, label e.g. "18 Aug"
 *  - day   → each day, label e.g. "18" (short)
 * offsetDays is relative to axis.start (callers convert to px OR to a % fraction).
 */
export function buildTimelineTicks(
  axis: ITimelineAxis,
  granularity: TTimelineGranularity,
): ITimelineTick[];
```

## `SegmentedControl` design (`packages/ui/src/components/SegmentedControl.tsx`)
Accessible radio group (keyboard operable, satisfies the a11y constraint):

```ts
export interface ISegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode; // optional leading lucide icon (aria-hidden)
}

export interface ISegmentedControlProps<T extends string> {
  options: readonly ISegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Required accessible group name, e.g. "Timeline granularity". */
  'aria-label': string;
  size?: 'sm' | 'md';
  className?: string;
}

export function SegmentedControl<T extends string>(props: ISegmentedControlProps<T>): JSX.Element;
```
- Container `role="radiogroup"` + `aria-label`; each option a `<button role="radio"
  aria-checked>` with roving `tabIndex` and ArrowLeft/ArrowRight (and Home/End) to move
  selection. Uses `cva` + design tokens, mirroring the current toggle's active styling
  (`bg-primary-tint text-primary-deep`). Named export; `type`‑prefixed prop interface;
  no `any`; function declaration.

## Firm `TimelineView.tsx` — change list

**Remove (milestones):**
- `import type { IMilestoneRow } from '../milestones/useMilestones.ts'`.
- `milestones` from `ITimelineViewProps` and the destructure.
- The whole **Milestone lane** JSX block (current lines ~360–388) and `datedMilestones`.
- The `milestones` param from `timelineRange(...)`.

**Granularity signature change (breaks tests — see test plan):**
```ts
// was: timelineRange(rows, milestones, projectStart, projectEnd, today)
export function timelineRange(
  rows: readonly TTaskListRow[],
  projectStart: Date | null,
  projectEnd: Date | null,
  granularity: TTimelineGranularity,
  today?: Date,
): ITimelineAxis;
```
Implementation collects dayStarts from rows (unrestricted `startDate`, any `dueDate`),
project start/end, and today, then returns `paddedTimelineAxis(dates, granularity, today)`.

**Add granularity state + wiring:**
- `const [granularity, setGranularity] = useState<TTimelineGranularity>('month')` (default Monthly).
- `const dayPx = TIMELINE_DAY_PX[granularity]`; replace the `DAY_PX` constant usage
  (bar `left`/`width`, `chartWidth`, `todayOffset`, tick `left`) with `dayPx`.
- `const range = useMemo(() => timelineRange(allRows, projectStart, projectEnd,
  granularity), [allRows, projectStart, projectEnd, granularity])`.
- `const ticks = useMemo(() => buildTimelineTicks(range, granularity), [range, granularity])`.
- Pass `dayPx` (and `memberPhotos`) into `TimelineTaskRow` for bar geometry + avatars.

**Header controls:** in the existing header row (currently only `→ Today`) add the
`SegmentedControl` on the left, keep `→ Today` on the right:
```tsx
<div className="flex items-center justify-between">
  <SegmentedControl
    aria-label="Timeline granularity"
    value={granularity}
    onChange={setGranularity}
    options={[{value:'day',label:'Days'},{value:'week',label:'Weeks'},{value:'month',label:'Months'}]}
    size="sm"
  />
  <Button variant="outline" size="sm" onClick={scrollToToday}>→ Today</Button>
</div>
```

**Auto-center today:** `useEffect(() => centerToday(false), [granularity])` and once on
mount, reusing the existing `scrollToToday` math (add an `instant` flag → `behavior:'auto'`
for the effect, `'smooth'` for the button).

**Avatar stack on bars (firm only):** add `memberPhotos: ReadonlyMap<string,string>` to
`ITimelineViewProps` (threaded to `ITimelineTaskRowProps`). Only for non‑restricted rows
with `assignees.length > 0` (restricted header rows have no `assignees`). Render an
overlapping stack absolutely positioned at the **right end of the bar**
(`left: LABEL_COL_PX + left + width + 4`, vertically centered) so short bars remain legible:
```tsx
const MAX_TIMELINE_AVATARS = 3;
const visible = row.assignees.slice(0, MAX_TIMELINE_AVATARS);
const overflow = row.assignees.length - visible.length;
// <span className="flex items-center -space-x-1.5" aria-hidden> ... Avatar size="xs" ...
//   photoUrl={a.type === 'user' ? memberPhotos.get(a.id) : undefined}
//   {overflow > 0 && <span>+{overflow}</span>} </span>
```
- **A11y:** the avatar stack is `aria-hidden` (avatars carry `aria-hidden` / decorative),
  and the assignee names are folded into the **bar button's existing `aria-label`**
  (append `", assigned to A, B, C +N"`) so there's a single, non‑duplicated announcement.
- **Colors:** keep `BAR_STATUS_CLASSES` (todo→`bg-slate-300`, in_progress→`bg-primary`,
  blocked→`bg-warning`, done→`bg-success`) with overdue→`bg-accent`. **Confirmed** these
  are design‑system tokens (green `bg-success` = done). No change (item #5).

## Firm `TasksSection.tsx` — change list
- **Remove** `import { useMilestones }` and the `const milestonesState = useMilestones(...)`
  call (verified: used *only* to feed the timeline; milestone CRUD hook file stays).
- In `<TimelineView>`: **delete** the `milestones={…}` prop; **add**
  `memberPhotos={memberPhotos}` (the map is already computed at ~L404–412).
- No other change to this file.

## Portal `PortalTaskTimeline.tsx` — change list
- Add `const [granularity, setGranularity] = useState<TTimelineGranularity>('month')`.
  When `fitToWidth` (print), **ignore state and use `'month'`** and **do not render the
  switcher**.
- Replace local `DAY_PX` with `TIMELINE_DAY_PX[effectiveGranularity]` for the **screen**
  `trackWidth` (print stays fraction‑based / fit‑to‑width — unchanged).
- Replace local `monthTicks` with `buildTimelineTicks(range, effectiveGranularity)`,
  converting `offsetDays → fraction` via `offsetDays / range.days` (portal positions by %).
- `portalTimelineRange(tasks)` signature/behavior **unchanged** (D‑042 task min/max ± pad).
- Render the switcher above the chart **only when `!fitToWidth`**:
  `<SegmentedControl aria-label="Timeline granularity" value={granularity}
  onChange={setGranularity} options={Days|Weeks|Months} size="sm" />`.
- **No avatars** (item #8). Bar colors already status‑token‑driven — **confirmed**, no change (item #7).

## Steps (each independently verifiable)
1. **Shared math**: add `packages/ui/src/lib/timeline.ts` + `timeline.test.ts`; export
   from `index.ts`. Verify: `pnpm --filter @siapp/ui test`.
2. **Shared control**: add `SegmentedControl.tsx` + `SegmentedControl.test.tsx`; export
   from `index.ts`. Verify: keyboard (arrows/Home/End) + `radiogroup`/`radio` roles in test.
3. **Firm timeline math**: change `timelineRange` signature (drop milestones, add
   granularity), delegate to `paddedTimelineAxis`; update `TimelineView.test.tsx` unit
   tests. Verify: `pnpm --filter @siapp/web test TimelineView`.
4. **Firm timeline UI**: remove milestone lane; add granularity `SegmentedControl` +
   auto‑center; make geometry use `dayPx`. Verify: render test shows no `Milestones`
   text / no `timeline-milestone` testid, shows `radiogroup`.
5. **Firm avatars**: add `memberPhotos` prop + avatar stack + `+N`; fold names into bar
   `aria-label`. Verify: component test asserts photo/initials + overflow chip.
6. **Firm wiring**: `TasksSection` — drop `useMilestones`, drop `milestones` prop, pass
   `memberPhotos`; fix `TasksSection.test.tsx` if needed. Verify: `pnpm --filter @siapp/web test TasksSection`.
7. **Portal switcher**: add granularity state + `SegmentedControl` (hidden when
   `fitToWidth`), granularity‑driven `DAY_PX`/ticks; keep range unchanged. Verify:
   `PortalTaskTimeline.test.tsx`.
8. **Print guard**: confirm `PortalPrintLayout.test.tsx` stays green and no `radiogroup`
   appears in the print path.
9. **Full gate**: `pnpm --filter @siapp/ui build|lint|typecheck|test` and
   `pnpm --filter @siapp/web build|lint|typecheck|test` (exact scripts: `build`,
   `lint`, `typecheck`, `test`; web filter name `@siapp/web`, ui `@siapp/ui`).

## Test plan (for Tester)
**`packages/ui/src/lib/timeline.test.ts` (new):**
- `paddedTimelineAxis`: today‑only input → range spans today ± `TIMELINE_PAD_DAYS[g]`,
  snapped to boundary, for each granularity; dated inputs widen the range and still pad.
- `buildTimelineTicks`: month → one tick per month on the 1st; week → Mondays; day →
  daily; offsetDays are within `[0, axis.days]` and labels are correct.
- `TIMELINE_DAY_PX` monotonic (day > week > month).

**`packages/ui/src/components/SegmentedControl.test.tsx` (new):**
- Renders `role="radiogroup"` with N `role="radio"`, correct `aria-checked`.
- Click and ArrowRight/ArrowLeft/Home/End change selection via `onChange`; roving tabIndex.

**`TimelineView.test.tsx` (update):**
- Rewrite `timelineRange` tests to the new signature (no milestones); default granularity
  `'month'`; assert today‑padded range for the empty case and dated case.
- Component: **no** `Milestones` lane / no `timeline-milestone` testid; granularity
  `radiogroup` present, default Months; bar `aria-label` includes status + assignees;
  avatar stack renders capped avatars + `+N`; user assignee uses `photoUrl`, collaborator
  falls back to initials; overdue bar uses `bg-accent`.

**`PortalTaskTimeline.test.tsx` (update):**
- Keep `portalTimelineRange` min/max±padding assertions (unchanged).
- Granularity `radiogroup` present + default Months on screen; **absent** when
  `fitToWidth`; changing granularity changes track width / tick count; **no avatars** rendered.

**`PortalPrintLayout.test.tsx` (verify/keep green):**
- Both task views still render in print; timeline region still shows task titles/bars;
  assert no `role="radiogroup"` (no switcher) in the print output.

**`TasksSection.test.tsx` (update if needed):**
- Ensure removed `useMilestones` mock no longer required; timeline path renders without a
  `milestones` prop and with avatars from `memberPhotos`.

## Out of scope
- Migrating the existing List↔Timeline `role="group"` toggles to `SegmentedControl`.
- Any milestone CRUD change or deletion of `useMilestones.ts` (only the timeline stops
  consuming milestones).
- Infinite/dynamic-on-scroll axis extension (Option B) — using padded fixed axis instead.
- Portal today‑centered scroll behavior (issue only asks portal for the switcher).
- Firestore schema, rules, indexes, or any backend/Cloud Run change.
- Adding a profile photo to collaborators (they intentionally show initials only).

## Risks / open questions
1. **Avatar placement on short/undated bars** — placing the stack at the bar's right end
   can overflow the visible chart on far‑right bars or collide with the Today line. Plan
   clamps within the chart and keeps avatars `aria-hidden`. *Confirm the mockup wants
   avatars trailing the bar vs. inside it.* (Assumption: trailing, matching `-space-x` stacks.)
2. **Avatar cap value** — plan uses `MAX_TIMELINE_AVATARS = 3` to match
   `DashboardTaskCard`. Confirm 3 (vs. 2) is desired on the denser timeline row.
3. **Shared-module home** — plan puts granularity math in `@siapp/ui`
   (`lib/timeline.ts`) rather than `@siapp/shared`, since `DAY_PX` values are UI tokens
   and both surfaces already import `@siapp/ui`. Confirm this is the preferred home.
4. **Day granularity density** — at `day` zoom a long build (18 months) is very wide;
   padded axis keeps it bounded, but confirm `TIMELINE_DAY_PX.day = 28` and pad = ±30d
   feel right (tunable tokens).
5. **Portal range vs. today** — per D‑042 the portal axis is task min/max (not today).
   With Monthly default a short project renders a narrow chart; acceptable per D‑042.
   Confirm no product desire to also center "today" on the portal.
6. **`generic` component in cva** — `SegmentedControl<T>` uses a generic with `cva`;
   trivial but confirm the team is fine with a generic function component here.
