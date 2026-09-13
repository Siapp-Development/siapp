---
title: Insights page — client-friendly metrics & visualization ideas
issue: 164
status: draft
updated: 2026-09-13
---

# Insights — metrics & visualization ideas

Guiding constraints (from product):

- **No performance/productivity metrics.** Nothing that grades staff or throughput
  (velocity, cycle time, tasks-per-person, burndown, SLA adherence).
- **Not intimidating for clients.** The firm shares this view with clients (it
  replaces their progress-overview spreadsheet), so the tone must be reassuring,
  status/progress oriented, and free of harsh "late / at-risk / behind" framing.
- **Reuse existing data.** Everything below is computable from the `IProjectRow`
  data `useProjects` already loads — no new backend, Firestore reads, or rules:
  `lifecycle, status, startDate, targetEndDate, progressPct, totalTasks,
  doneTasks, overdueTasks, blockedTasks, collaboratorsCount, tags, vertical,
  updatedAt`.

## Recommended layout (top → bottom)

1. **Portfolio snapshot** — a row of 3–5 summary stat cards.
2. **Status mix** (donut) + **What's next** (upcoming dates list), side by side.
3. **Projects timeline** (the existing Gantt) — the centrepiece.
4. **Progress at a glance** — compact per-project completion bars.
5. **Completion momentum** (area/line over time) — optional, encouraging.

---

## Tier 1 — easy wins (recommend for v2)

### 1. Portfolio snapshot cards
Big, friendly numbers across the top:
- **Active projects** (lifecycle published / not archived/deleted).
- **Overall completion** — average `progressPct` across active projects, shown as
  a single % with a thin progress ring.
- **Wrapping up soon** — count with a `targetEndDate` in the next 30 days.
- **Recently completed** — projects moved to done in the last 30/90 days.

*Why client-safe:* purely descriptive counts, no judgement. Chart type: **stat
cards** (optionally a small radial/progress ring for the completion figure).

### 2. Status mix — donut / segmented bar
Distribution of projects by a **gentle status vocabulary**:
`Upcoming` · `In progress` · `Completed` (optionally `On hold`).
- Map from `lifecycle`/`status`; avoid exposing raw "overdue/at-risk" here.
- Show counts + % with a legend; never colour-only (pair each slice with a label).

*Why client-safe:* frames the portfolio as a healthy pipeline, not a scorecard.
Chart type: **donut** or a single **stacked segmented bar**.

### 3. What's next — upcoming targets list
A simple ordered list of the next handful of `targetEndDate`s (next 30/60/90
days): project name, target date, and a soft relative label ("in 2 weeks").
- Internally you *can* surface a subtle "needs attention" chip for past-due, but
  for the **client-facing** variant keep it to "Upcoming" only.

*Why client-safe:* answers the #1 client question ("when is my thing done?")
without a red overdue wall. Chart type: **list / small table**, no chart needed.

### 4. Progress at a glance — per-project bars
Horizontal completion bars (one per active project), sorted by % complete or by
target date. Essentially a condensed, non-time-axis companion to the timeline.

*Why client-safe:* concrete, momentum-positive. Chart type: **horizontal bar /
progress list** (reuses the timeline's progress-bar styling).

---

## Tier 2 — nice additions (later)

### 5. Completion momentum — cumulative area/line
Cumulative count of **completed** projects (or completed milestones) by month.
An always-up-and-to-the-right curve that reads as steady delivery.

*Why client-safe:* celebrates progress; no per-person attribution. Chart type:
**area** or **line**, monthly buckets.

### 6. Work by category — vertical / tag breakdown
Projects grouped by `vertical` (or `tags`) as a small bar chart — useful for
firms with mixed engagement types to show breadth of work.

*Why client-safe:* descriptive composition, not evaluation. Chart type:
**horizontal bar**.

### 7. Milestone calendar (mini)
A compact month grid highlighting dates with milestones/target dates — a
"what's happening this month" glance that complements the timeline.

*Why client-safe:* planning aid, forward-looking. Chart type: **calendar heat /
dot grid** (keep intensity subtle, not a "heatmap of lateness").

---

## Framing & tone guidelines

- Prefer **forward-looking, positive** labels: "Upcoming", "In progress",
  "Completed", "Wrapping up soon".
- Keep any **exception surfacing internal-only** (e.g. an "attention" filter for
  the firm), and hide it from the client-facing rendering — the page already has
  `role` and `clientCanSee` signals to branch on.
- Always pair colour with text/icon (WCAG + the "not colour alone" rule already
  used on the timeline bars).
- Every number should be **explainable in one plain sentence** — if it needs a
  definition tooltip to not alarm someone, it's probably too "performance-y".

## Explicitly avoid (per the "no performance / not intimidating" brief)

- Velocity, throughput, cycle/lead time, tasks-per-assignee.
- Burndown/burn-up with prominent overdue emphasis.
- Utilisation / capacity / billable-hours dashboards.
- Red "at risk / behind schedule" scorecards in the client-facing view.
- Anything that ranks people or projects against each other.

## Activity heatmap — feasibility (GitHub-style calendar)

**Verdict: possible, but it needs an aggregation source we don't have yet.** The
raw activity stream lives in **per-project** subcollections
(`workspaces/{wid}/projects/{pid}/activity`, each row has an `at` timestamp);
there is no workspace-wide activity feed, and the workspace `auditLog` is
**owner/admin-only** by rules (so not client-shareable). Three ways to build it:

- **A — Client-side cross-project aggregation (no backend, MVP).** On the Insights
  page, one-shot fetch a bounded recent window (e.g. last 90 days, capped limit)
  from each non-deleted project's `activity`, bucket by day, sum → heatmap.
  *Cost:* O(#projects) reads per page load; replicating pm/viewer department
  need-to-know is complex, so realistically gate this to **owner/admin**. Fine for
  small workspaces; scales poorly (50 projects = 50 queries).
- **B — Backend daily rollup (recommended, production).** A Firestore-triggered
  Cloud Function on activity-doc creation increments a per-day counter at
  `workspaces/{wid}/activityDaily/{yyyy-mm-dd}` (just counts, optionally by
  actor type). Insights then reads **one small collection** (≤~90 docs), cheap,
  works for **all roles**, and is client-safe because it exposes counts only —
  no "who did what". Needs: a function, a new collection + security rules (+
  maybe an index), optional backfill. Clean and scalable.
- **C — Reuse `auditLog`.** Quick single read, but owner/admin-only and entries
  can be sensitive → not appropriate for a client-facing view. Rejected.

**Recommendation:** Option **B** — a counts-only daily rollup, rendered as a calm
"Workspace activity" calendar heatmap (momentum framing, not a productivity
scorecard, intensity by gentle token shades). It's a **separate increment**
(backend + rules + UI) that warrants its own plan/PR rather than being bolted
onto the current UI-only PR #165. Option A is a viable owner/admin-only MVP if a
heatmap is wanted sooner with no backend work.

## Sequencing suggestion

v2: cards (1) + status donut (2) + what's-next (3) above the existing timeline —
all from current data, no backend work. v3: progress bars (4) + momentum (5).
Categories (6) and milestone calendar (7) when there's demand. Each slots under
the `insights/*` section shell without reworking the data layer.
