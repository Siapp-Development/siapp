---
title: "Wireframe Review — v1 Screens"
status: draft
updated: 2026-06-30
---

# Wireframe Review — v1 Screens

UX review of [pm_ux/designs/screens-wireframes.excalidraw](../designs/screens-wireframes.excalidraw) against [01-overview.md](./01-overview.md) and the resolved D-025 / D-028 / D-030 / D-031 decisions in [decisions-log.md](./decisions-log.md).

Screens reviewed (18 total):

- **Firm desktop:** A0 Dashboard · A1 Sign in · A2 Projects list · A3 Kanban · A4 Timeline · A5 Task detail · A6 Clients list · A7 Collaborators list · A8 Branding · A8b Departments · A9 Message previews
- **Client mobile (390pt):** B1 Magic-link · B2 Project overview · B3 Milestones · B4 Updates feed
- **Collaborator mobile:** C1 Task page
- **Siapp admin (admin.siapp.app):** Z1 Tenants · Z2 Provision · Z3 Template registry

---

## Strengths (worth preserving)

- **Lifecycle (Draft / Published / Completed / Archived) is genuinely first-class** on A0/A2/A3 — the right call given "client visibility is the wedge". Lifecycle chips mirror the D-028 publish gate consistently across the firm surface.
- **WhatsApp surface area is honest.** A0 KPI "WA this month 255/300", per-task WA cost preview on A5 ("Cost: 1 conversation"), and the read-only A9 message gallery set correct expectations and dodge billing surprise.
- **Three distinct mental models per audience.** A0–A9 (rich, tabular, multi-tab) ≠ B2–B4 (single-thread, mobile, read-only) ≠ C1 (one screen, no nav). The split is appropriate — don't unify later.
- **Per-task `Restricted to` + `Requires firm approval` toggles on A5** are placed inline where the decision is made. Avoids a permissions-modal detour.
- **Z1–Z3 admin surface is correctly separated** at `admin.siapp.app` and clearly internal-only. The Z3 "Meta-approved templates" view vs A9 "customer-facing previews" boundary is well-drawn.

---

## Critical issues (must fix before hi-fi)

### 1. Dashboard (A0) — primary action is buried

Top-right has search + avatar; **Quick actions** (`+ New project`, `+ Add client`, `+ Add collaborator`) sits below a 4-card KPI strip and a 5-row attention table. For a product whose Day-1 success metric is "Firm productive in < 1 hour" ([01-overview.md](./01-overview.md) design principle 1), `+ New project` must be a primary CTA in the header, not a tertiary footer link.

> **Skill rule:** `primary-action` — one primary CTA per screen, visually dominant.

**Fix:** Move `+ New project` to the header (next to search). Demote the rest to a secondary action menu.

### 2. Kanban (A3) — card affordances are overloaded

Cards already carry: assignee avatar, due date, WA-collaborator chip, `P` (photo required), `A` (approval required), `Restricted - Finance` chip. **Six signals per card with no visual grouping.** At hi-fi this becomes noise.

**Fix:**

- Promote **status-affecting** indicators (overdue red, blocked) to a left border or accent stripe.
- Group **meta** indicators (`P`, `A`, `Restricted`) into a single bottom icon row with tooltips. Don't put the legend in a footnote — that's a cognitive load tax on every glance.
- Differentiate firm member (filled avatar) vs external collaborator (avatar + WA badge). Today both render as initials.

### 3. Task detail drawer (A5) — too many sections, no hierarchy

One drawer contains 11 zones: title, dates, assignees, photos, documents, requires-photo, requires-approval, visible-to-client, restricted-to, WhatsApp preview, activity. The publish gate (`Visible to client`) and `Requires firm approval` are **business-critical** but visually equal to a documents list.

**Fix:**

- Collapse into a "Sharing & access" group: `Visible to client`, `Restricted to`, `Requires approval`. Default-expand when project is `Published`.
- Move "Activity" into a tab inside the drawer or a separate side rail. Inline activity at the bottom of a long form is rarely read.

### 4. Client portal (B1–B4) — no error/empty/loading states

For a magic-link product, three flows are guaranteed and **not drawn**:

- **Expired / invalid magic link** (B1 shows only the success path).
- **No milestones yet** on a freshly published project (B2 at 0% progress).
- **No updates** on B4 (currently shows 3 entries by default).

These are not edge cases. A client receiving a `project_welcome` WA will hit empty B4 *first*. Draft them at the same fidelity.

### 5. Collaborator screen (C1) — `Need help` has no recovery path

Tapping `Need help` triggers a WA to firm team (per A9 preview). On C1 there's no confirmation, no "what happens next" copy, no way to add the blocking reason inline. The A9 preview quotes `"Tiles delivered short by 4 boxes"` — where does the collaborator type that?

> **Skill rule:** `error-recovery` — actions must include a clear next step.

**Fix:** When `Need help` is selected, reveal a required reason field before the action commits.

---

## High-impact issues

### 6. Left-rail nav labels (A0–A9)

Current: `Home · Projects · Clients · Collaborators · Templates · WhatsApp · Settings`.

- **"Templates" is shown to firm users**, but per D-031 the customer-facing template library is **deferred**. Templates are Siapp-admin only at MVP. Either remove the nav item or label it "My templates" with an empty/coming-soon state.
- **"WhatsApp" as a top-level destination** is unusual. From the screens shown, it would house Message Previews + usage. Consider **"Messaging"** — it's a clearer category and survives if SMS is added later (per D-026 / D-027).

### 7. A0 dashboard table vs A2 projects list — overlap

A0's "Projects needing attention" and A2's "Projects list" share ~80% of columns (Project, Client, Last activity, Lifecycle). A 12-project firm hits both. Differentiate by role:

- **A0** = action-oriented. Only overdue / draft / awaiting-approval rows, sorted by urgency.
- **A2** = full inventory. All projects, filterable by lifecycle tabs (already drawn).

Today A0 looks like a smaller A2 — wasted dashboard real estate.

### 8. Timeline (A4) — milestone glanceability

Diamond milestones, today-line, and 4-month columns are correct primitives. Gaps:

- No way to **jump to a milestone** or **scroll-to-today**. At 18-month residential builds this is essential.
- Phase rows aren't collapsible. A finished "Site prep" phase still consumes a full row.

### 9. Departments (A8b) and `Restricted to` (A5) — discoverability mismatch

A5 says *"Control hidden until first department is created"*. Good progressive disclosure, **but** onboarding seeds 5 departments via the vertical template (per A8b + D-025). So most users *always* see this control.

**Fix:**

- Default A5 copy: "Pick one or more departments" — not the hidden-until-created path.
- A8b: define a delete policy. Deleting a department with restricted tasks attached needs an explicit fallback (reassign, or revert to all-departments). Call this out in the wireframe annotation.

### 10. Mobile (B1–B4 / C1) — system chrome and safe areas

`9:41` and `100%` battery are shown for context, but no notch/Dynamic Island safe-area padding is drawn. `< Back` on B3/B4 sits where a status bar clip would occur on a real device.

> **Skill rule:** `safe-area-awareness`.

**Fix:** Annotate top 44pt as reserved; reserve bottom 34pt for the home-indicator gesture region.

---

## Medium-impact / polish

### 11. A1 sign-in — "or" divider is orphaned

Today reads as: `Sign in | or | Continue with Google | New here? Create a workspace`. The "or" sits below the password CTA instead of dividing it from the Google CTA. Standard pattern: **OR divider directly above the Google button**.

### 12. A9 message previews — missing variable list

The previews build trust, but a firm owner will ask: *"What if my client's name has special characters? What about long project titles?"*

**Fix:** Add a small "Available variables" panel per template (`{client.first_name}`, `{project.title}`, `{firm.name}`, `{link}`). Keeps the A9-vs-Z3 boundary clean: variables are template-facing, Meta approval is Z3-facing.

### 13. A6 clients list — masked phone numbers

`+60 ** *** 6789` — partial masking suggests PII concern, but the full number is needed to call/WA. Either show full (with `copy / call / WA` on hover) or fully mask with reveal-on-click. Halfway is the worst option.

### 14. A7 collaborators — `Active / Idle` is undefined

What promotes a collaborator from Active → Idle? Days since last task? Surface the threshold (settings or tooltip). Otherwise the column is decorative.

### 15. Z2 provision tenant — destructive confirmation

`Provision tenant` triggers ~6 backend side-effects (preview panel lists them) plus a 14-day trial timer and outbound WA. Cancel is left, Provision is right — good. Add an explicit confirmation step (modal or typed `PROVISION` confirm).

> **Skill rule:** `confirmation-dialogs` for irreversible-ish actions.

### 16. Z3 template registry — rejection visibility

Already has filter dropdowns. Confirm they actually filter by approval state (annotation doesn't say). When a template is `Rejected`, surface the Meta rejection reason inline — today a Siapp admin would need to bounce to Twilio to know why `project_welcome_v3` was rejected.

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

## Missing flows (referenced but not drawn)

Flagged for v1.1 or before hi-fi — these are referenced by other screens:

1. **Project creation** — Duplicate vs Blank vs Starter (referenced from A0 / A2 `+ New project`).
2. **Project publish modal** — D-028 publish gate. What does the firm see at the moment they "go live"?
3. **Magic-link expired** — for both client (B1) and collaborator (C1).
4. **Approval queue** — D-028 "hold client-facing WA until PM approves". Where does the PM see and act on these?
5. **Billing / usage upgrade** — A2 footer says "Upgrade" at 85% WA usage but no destination screen.
6. **Owner first-run onboarding** — Z2 provisions a tenant; what does the firm owner see when they tap the magic link in the welcome email?

---

## Recommendation

Wireframes are at the **right fidelity for the stage** — IA decisions are clear, lifecycle/permission model is consistent, and the three audience splits are well-defined.

Before moving to hi-fi:

1. Fix the four critical IA issues (A0 primary CTA, A3 card overload, A5 hierarchy, B/C empty/error states).
2. Resolve the Templates-in-nav vs deferred-D-031 inconsistency.
3. Draft the six missing flows at this same wireframe fidelity — so hi-fi doesn't get blocked on undefined behavior.

---

## Related plans

- [01-overview.md](./01-overview.md) — design principles this review is checked against
- [11-mvp-scope.md](./11-mvp-scope.md) — what's in v1
- [20-access-control-departments.md](./20-access-control-departments.md) — D-025 model that drives A5 / A8b
- [decisions-log.md](./decisions-log.md) — D-025, D-028, D-030, D-031
- [figma-make-design-prompt.md](./figma-make-design-prompt.md) — hi-fi generation prompt (update with fixes from this review)
