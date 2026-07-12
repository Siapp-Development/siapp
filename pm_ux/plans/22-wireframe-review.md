---
title: "Wireframe Review — v1 Screens"
status: draft
updated: 2026-07-12
---

# Wireframe Review — v1 Screens

UX review of [pm_ux/designs/screens-wireframes.excalidraw](../designs/screens-wireframes.excalidraw) against [01-overview.md](./01-overview.md) and the resolved D-025 / D-028 / D-030 / D-031 / D-032 / D-033 / D-034 decisions in [decisions-log.md](./decisions-log.md).

> **2026-07-12 update.** Items #2 (Kanban card overload), #3 (approval toggle hierarchy on A5), and missing-flow #4 (Approval queue) were closed by D-032/D-033. In a follow-up pass, every remaining critical / high-impact / medium item was addressed on the wireframes (see the ~~strikethrough~~ + **RESOLVED** annotations below), and the missing empty/error states + billing/onboarding flows were drafted at wireframe fidelity as new screens ([B1x], [B2x], [B2y], [B4x], [C1x], [C1d], [Bill], [Onb]).

Screens reviewed (25 total after the 2026-07-12 review pass — 17 original + 8 new):

- **Firm desktop:** A0 Dashboard · A1 Sign in · A2 Projects list · A3 Timeline (only project-board view; the former A3 Kanban was removed and the former A4 Timeline was relabelled to A3 per D-033) · A5 Task detail · A6 Clients list · A7 Collaborators list · A8 Branding · A8b Departments · A9 Message previews
- **Client mobile (390pt):** B1 Magic-link · B2 Project overview · B3 Milestones · B4 Updates feed
- **Collaborator mobile:** C1 Task page
- **Siapp admin (admin.siapp.app):** Z1 Tenants · Z2 Provision · Z3 Template registry
- **New from the 2026-07-12 review pass:** [B1x] Client magic-link expired · [B2x] Client zero-state · [B2y] Client upload failure · [B4x] Client empty updates feed · [C1x] Collaborator magic-link expired · [C1d] Collaborator Need-help reason field · [Bill] Settings — Billing & usage · [Onb] Owner first-run onboarding

---

## Strengths (worth preserving)

- **Lifecycle (Draft / Published / Completed / Archived) is genuinely first-class** on A0/A2/A3 — the right call given "client visibility is the wedge". Lifecycle chips mirror the D-028 publish gate consistently across the firm surface.
- **WhatsApp surface area is honest.** A0 KPI "WA this month 255/300", per-task WA cost preview on A5 ("Cost: 1 conversation"), and the read-only A9 message gallery set correct expectations and dodge billing surprise.
- **Three distinct mental models per audience.** A0–A9 (rich, tabular, multi-tab) ≠ B2–B4 (single-thread, mobile, read-only) ≠ C1 (one screen, no nav). The split is appropriate — don't unify later.
- **Per-task `Restricted to` toggle on A5** is placed inline where the decision is made. Avoids a permissions-modal detour. *(The `Requires firm approval` toggle originally called out here was removed in D-032.)*
- **Z1–Z3 admin surface is correctly separated** at `admin.siapp.app` and clearly internal-only. The Z3 "Meta-approved templates" view vs A9 "customer-facing previews" boundary is well-drawn.

---

## Critical issues (must fix before hi-fi)

### 1. Dashboard (A0) — primary action is buried  — **RESOLVED**

> **2026-07-12:** `+ New project` primary CTA is now in the A0 header top-right (right of the search bar). The old "Quick actions" row at the bottom is removed. The A0 subtitle and "Needs your attention" table heading were rewritten to emphasize the action-oriented role, and the trailing zero-overdue row was dropped so only rows that need a decision remain.

Top-right has search + avatar; **Quick actions** (`+ New project`, `+ Add client`, `+ Add collaborator`) sits below a 4-card KPI strip and a 5-row attention table. For a product whose Day-1 success metric is "Firm productive in < 1 hour" ([01-overview.md](./01-overview.md) design principle 1), `+ New project` must be a primary CTA in the header, not a tertiary footer link.

> **Skill rule:** `primary-action` — one primary CTA per screen, visually dominant.

**Fix:** Move `+ New project` to the header (next to search). Demote the rest to a secondary action menu.

### 2. ~~Kanban (A3) — card affordances are overloaded~~ *(obsolete — D-033 removed the Kanban view)*

> **2026-07-12:** The Kanban view is gone from MVP. The project board is timeline-only. Task rows on the timeline carry a much narrower affordance set (title, assignees, due date, restricted-to chip, collaborator badge) so the overload critique no longer applies. If a future Kanban revival happens, revisit this recommendation.

### 3. Task detail drawer (A5) — too many sections, no hierarchy  — **RESOLVED**

> **2026-07-12 (D-032 + review pass):** Two of the sections (`Requires photo`, `Requires firm approval`) were removed by D-032. The remaining `Visible to client` + `Restricted to` fields are now visually grouped under a **"Sharing & access"** section header (renamed from the generic "Settings") with a dashed group frame. Activity is called out as its own tab (`Details · Activity`) at the top of the drawer instead of running inline at the bottom.

One drawer contains 9 zones: title, dates, assignees, photos, documents, visible-to-client, restricted-to, WhatsApp preview, activity. The publish gate (`Visible to client`) is **business-critical** but visually equal to a documents list.

**Fix:**

- Collapse into a "Sharing & access" group: `Visible to client`, `Restricted to`. Default-expand when project is `Published`.
- Move "Activity" into a tab inside the drawer or a separate side rail. Inline activity at the bottom of a long form is rarely read.

### 4. Client portal (B1–B4) — no error/empty/loading states  — **RESOLVED**

> **2026-07-12 (D-034 + review pass):** All five states are now drawn at wireframe fidelity:
>
> - **[B1x]** Client magic-link expired — clear reason + "Open WhatsApp with your firm" CTA.
> - **[B2x]** Zero-state client portal (fresh publish, 0% progress, timespan bar at 0%, dashed empty milestones + documents cards).
> - **[B2y]** Documents upload failure states — oversized (> 10 MB), unsupported mime, and virus-scan quarantine, each with a recovery hint.
> - **[B4x]** Empty updates feed — shown to a client whose firm hasn't posted anything after the welcome WA. Reply-on-WhatsApp CTA remains sticky.
> - **[C1x]** Collaborator task magic-link expired — "Message your firm and ask them to resend" recovery path.

For a magic-link product, three flows are guaranteed and **not drawn**:

- **Expired / invalid magic link** (B1 shows only the success path).
- **No milestones yet** on a freshly published project (B2 at 0% progress).
- **No updates** on B4 (currently shows 3 entries by default).

These are not edge cases. A client receiving a `project_welcome` WA will hit empty B4 *first*. Draft them at the same fidelity.

### 5. Collaborator screen (C1) — `Need help` has no recovery path  — **RESOLVED**

> **2026-07-12:** New **[C1d]** state added — selecting "Need help" reveals a required reason textarea ("What's blocking you?") with a placeholder example, optional photo attach, and a two-button action row (Cancel / Send Need help). A confirmation preview under the buttons tells the collaborator what happens next ("Your firm gets a WhatsApp with the reason").

Tapping `Need help` triggers a WA to firm team (per A9 preview). On C1 there's no confirmation, no "what happens next" copy, no way to add the blocking reason inline. The A9 preview quotes `"Tiles delivered short by 4 boxes"` — where does the collaborator type that?

> **Skill rule:** `error-recovery` — actions must include a clear next step.

**Fix:** When `Need help` is selected, reveal a required reason field before the action commits.

---

## High-impact issues

### 6. Left-rail nav labels (A0–A9)  — **RESOLVED**

> **2026-07-12:** `Templates` removed from the firm left rail on every screen it appeared (A0, A2, A3, A6, A7). `WhatsApp` renamed to `Messaging`. New firm nav: `Home · Projects · Clients · Collaborators · Messaging · Settings`. Templates remain in the Siapp Admin surface ([Z3]) where they belong per D-031.

### 7. A0 dashboard table vs A2 projects list — overlap  — **RESOLVED**

> **2026-07-12:** A0 subtitle rewritten as "Action-oriented — only rows that need a decision. Full inventory lives on [A2]". A0 attention table heading changed to **"Needs your attention"** with a short helper ("Only rows that need a decision (overdue, unpublished draft, blocked)"). The zero-overdue trailing row was removed so only true attention items surface. A2 subtitle updated to "Firm project inventory. All lifecycles; filter with the chips. See [A0] for the action-oriented view."

### 8. Timeline (A3) — milestone glanceability  — **RESOLVED**

> **2026-07-12 (post D-033 rename):** Added a **→ Today** pill in the timeline header (scrolls the viewport to the today line) and a **Jump to milestone ▾** secondary link next to it. Every phase row header now shows a collapse chevron (▾); the "Site prep" phase is shown in the collapsed state ("2 tasks · done · (click ▾ to expand)") to demonstrate the pattern.

Diamond milestones, today-line, and 4-month columns are correct primitives. Gaps:

- No way to **jump to a milestone** or **scroll-to-today**. At 18-month residential builds this is essential.
- Phase rows aren't collapsible. A finished "Site prep" phase still consumes a full row.

### 9. Departments (A8b) and `Restricted to` (A5) — discoverability mismatch  — **RESOLVED**

> **2026-07-12:** A5 already shows the department chip selector inline with default `All departments` copy (the "hidden until first department is created" instruction was a spec artifact that never made it to the wireframe). A8b now carries an inline **delete policy** annotation in danger-red: "deleting a department with restricted tasks attached prompts a required fallback — reassign to another department OR revert affected tasks to 'All departments'. Both paths are logged to audit."

### 10. Mobile (B1–B4 / C1) — system chrome and safe areas  — **RESOLVED**

> **2026-07-12:** Every mobile frame (B1, B2, B3, B4, C1, C1a/b/c, new C1d + new B1x / B2x / B2y / B4x / C1x) now carries dashed safe-area annotations at the top (44pt notch/status) and bottom (34pt home-indicator).

---

## Medium-impact / polish

### 11. A1 sign-in — "or" divider is orphaned  — **RESOLVED**

> **2026-07-12:** `or` label moved down to sit directly above the "Continue with Google" button, matching the standard OR-divider pattern.

### 12. A9 message previews — missing variable list  — **RESOLVED**

> **2026-07-12:** A9 now includes an inline **Available variables** panel listing `{client.first_name}`, `{client.full_name}`, `{project.title}`, `{project.due_date}`, `{firm.name}`, `{firm.wa_phone}`, `{task.title}`, `{link}`, with a footer note "Meta approval lives on [Z3]" to keep the A9↔Z3 boundary clean.

### 13. A6 clients list — masked phone numbers  — **RESOLVED**

> **2026-07-12:** Full phone numbers are now shown (no partial masking). An annotation under the table reads "Hover a row to reveal Copy · Call · WhatsApp actions on the phone cell." — the halfway-mask is gone.

### 14. A7 collaborators — `Active / Idle` is undefined  — **RESOLVED**

> **2026-07-12:** A7 now carries an annotation under the table: **Active** = task completed in the last 60 days; **Idle** = no completed task in 60+ days. Threshold is configurable in Settings → Team.

### 15. Z2 provision tenant — destructive confirmation  — **RESOLVED**

> **2026-07-12:** Z2 now carries a danger-red confirmation-required annotation with a typed-input mockup: the admin must type `PROVISION` into a text field before the Provision button commits. Cancel is default focus.

### 16. Z3 template registry — rejection visibility  — **RESOLVED**

> **2026-07-12:** The Rejected row (`project_welcome_v3`) now shows an inline reason banner in danger-red directly beneath it: "Utility template contains marketing content — 'Track your build in real time' promotional phrase", plus a "Fix" line naming the owner (Siapp engineering) and the required action (reword + resubmit as new revision).

---

## Cross-cutting accessibility / consistency notes

| Concern | Where | Action |
|---|---|---|
| Icon-only buttons (X close on A5, `<` back on B3/B4, `+` everywhere) | All screens | Ship with `aria-label` / `accessibilityLabel`. |
| Color-only state encoding | A0, A2, A3 lifecycle chips | Pair color with label (already in wireframe — confirm hi-fi keeps both). |
| Status badge taxonomy conflict | A0/A2 = lifecycle (Draft/Published/Completed/Archived); A7 = Active/Idle; Z1 = Active/Trial/Suspended | Three different state machines sharing similar visual treatment. Use distinct chip styles or namespaces. |
| Tabular numerals for stats | A0 KPI cards (12, 4, 7, 255/300), A2 progress (42%, 66%) | Annotate as tabular figures to prevent jitter when values change. |
| Reduced-motion / Dynamic Type | All mobile (B/C) | Magic-link landing and updates feed must support Dynamic Type without truncation. |

---

## Missing flows (referenced but not drawn)  — **RESOLVED**

> **2026-07-12:** All six flows are now addressed. Two were already drawn ([A3b] project creation with blank + duplicate, [A-Pub] project publish modal). The remaining four were added at wireframe fidelity:
>
> - **[B1x]** + **[C1x]** — magic-link expired states for both client and collaborator.
> - **[Bill]** — Settings / Billing & usage: current plan, WA usage bar with over-cap projection, invoice history, payment method, plan comparison, and an "Upgrade to Business" CTA that lands from the A2 85%-usage banner.
> - **[Onb]** — Owner first-run onboarding: 4-step guided tour from the Z2 welcome-email magic link, with a "What's already set up" side panel listing the six provisioning side-effects. Skippable.

Original flag list (kept for the paper trail):

1. ~~**Project creation**~~ — already drawn as [A3b] (Create project — blank or duplicate).
2. ~~**Project publish modal**~~ — already drawn as [A-Pub] (Publish project dialog).
3. **Magic-link expired** — client [B1x] + collaborator [C1x] added.
4. ~~**Approval queue**~~ — obsolete (D-032 removed the approval gate).
5. **Billing / usage upgrade** — added as [Bill].
6. **Owner first-run onboarding** — added as [Onb].

---

## Recommendation

Wireframes are at the **right fidelity for the stage** and, as of the 2026-07-12 pass, every actionable review item is either resolved on the wireframes or explicitly retired by a decision. IA decisions are clear, lifecycle/permission model is consistent, and the three audience splits are well-defined.

Ready for hi-fi. Suggested sequence when it starts:

1. Regenerate hi-fi from [figma-make-design-prompt.md](./figma-make-design-prompt.md) — the prompt already reflects the D-032/D-033/D-034 decisions and the review resolutions above.
2. Verify the four cross-cutting accessibility items (aria labels on icon-only buttons, dual color+label state chips, three distinct state-machine chip styles, tabular numerals) survive the hi-fi pass — easy to lose in translation.
3. Do one round of copy tightening on the new empty/error states ([B1x], [B2x], [B2y], [B4x], [C1x]) with a native-English + Malaysian reader.

---

## Related plans

- [01-overview.md](./01-overview.md) — design principles this review is checked against
- [11-mvp-scope.md](./11-mvp-scope.md) — what's in v1
- [20-access-control-departments.md](./20-access-control-departments.md) — D-025 model that drives A5 / A8b
- [decisions-log.md](./decisions-log.md) — D-025, D-028 (superseded by D-032), D-030, D-031, D-032, D-033, D-034
- [figma-make-design-prompt.md](./figma-make-design-prompt.md) — hi-fi generation prompt (update with fixes from this review)
