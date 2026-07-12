---
title: "Decisions Log"
status: living
updated: 2026-07-12
---

# Decisions Log

Append-only record of resolved decisions. New decisions go at the **top**. Each entry: what, why, consequences, reversal cost, when to revisit.

When superseded, do not delete — add a new entry that supersedes the old one (link both ways).

---

## 2026-07-12 — Client portal gets shared documents (upload + list), project start date, and a timespan visualization (D-034)

**Decision:** Extend the client portal ([B2]) with three additions:

1. **Project start date** displayed alongside the existing target completion date in the project header.
2. **Timespan visualization** — a horizontal timeline bar from `project.startDate` → `project.targetDate`, with a "today" marker and phase transition markers. Gives the client a single-glance answer to "how long is this project and where are we in it?" without needing to scroll the milestones list.
3. **Shared documents** section — the client can (a) view documents the firm has marked `visibleToClient: true` and (b) upload their own documents (e.g. signed contracts, ID copies, payment proofs). Client uploads land in the same project documents collection with `uploaderType: 'client'` and are always visible to the firm.

**Why:**

- **Trust the wedge with more data.** [01-overview.md](./01-overview.md) principle 2 is "the client portal is the wedge". Withholding the start date and visual timespan while showing a % complete is inconsistent — clients ask "when did this actually start?" in every discovery call.
- **Two-way document exchange closes a real support gap.** Firms today receive client documents over WhatsApp (photos of signed docs) and lose them in the thread. Letting the client upload directly into the project keeps every artifact in one place and cuts one "please send that to me again" round-trip.
- **Timespan bar is cheaper than a Gantt.** A horizontal bar with start / today / target + phase markers gives 80% of Gantt value for a client audience that would never use a full timeline (per [10-customer-discovery-plan.md](./10-customer-discovery-plan.md) H2).

**Consequences:**

- `projects/{pid}` schema: `startDate: Timestamp` becomes required (was implicit / derived).
- `projects/{pid}/documents/{did}` schema: `uploaderType: 'firm_member' | 'collaborator' | 'client'` added; `uploaderId` still points to the underlying user/collaborator/client doc.
- Firestore security rules: clients (magic-link JWT with `audience: 'client'`) get `create` permission on `documents/*` scoped to their project. Documents created by clients are automatically `visibleToClient: true`.
- Storage rules mirror the security rules; client uploads land under `gs://{bucket}/workspaces/{wsId}/projects/{projId}/client-uploads/{uuid}-{filename}` for easy audit/moderation.
- Upload size cap: 10 MB per file for clients (vs 25 MB for firm members). Prevents accidental video dumps.
- Virus scanning: client uploads flow through the same Cloud Storage → scan → quarantine pipeline as firm uploads (see [13-tech-architecture.md](./13-tech-architecture.md)).
- Firm-side activity feed shows `client_document_uploaded` events; the firm's audit trail is unchanged.
- Wireframes: [B2] gains a header start-date row, a timespan bar between the progress circle and Next milestone, and a compact Documents section (last 3 shared documents + upload button) above the WhatsApp CTA.

**Reversal cost:** Medium — removing client upload requires a security rule tightening and would leave already-uploaded client documents orphaned (accessible only to the firm, which is acceptable). Removing start-date + timespan is a UI change only.

**Revisit when:** Client uploads become a spam vector (auto-attach random files to WhatsApp forwards) or a moderation load. Consider a per-workspace "clients can upload" toggle if so — but ship it on by default.

**Affects:** [firestore-data-model.md](./firestore-data-model.md), [figma-make-design-prompt.md](./figma-make-design-prompt.md), [13-tech-architecture.md](./13-tech-architecture.md), [20-access-control-departments.md](./20-access-control-departments.md), [22-wireframe-review.md](./22-wireframe-review.md) (item #4 client portal empty/error states now applies to Documents too), wireframes ([B2]).

---

## 2026-07-12 — Timeline is the only project board view in MVP; Kanban is deferred (D-033)

**Decision:** Remove the Kanban board view ([A3]) from MVP. The project board has a single view: the timeline ([A4], now relabelled [A3]). Task cards are still clickable to open the task detail; the "Board" tab is removed from the project detail tab bar.

**Why:**

- **Kanban duplicates a status column already visible on every task card.** In construction and legal projects, tasks are gated by dates and dependencies, not by pull-based workflow — a Kanban column ("To do / In progress / Blocked / Done") tells the PM less than a timeline showing "this is late, this starts next week". Timeline is closer to the ground truth of how these firms think.
- **Fewer views to build and maintain.** Two board views mean two states to keep in sync, two empty states, two loading skeletons, two mobile responsive stories. Cutting one halves the ongoing surface area.
- **Timeline scales to 18-month builds; Kanban collapses.** A 60-task residential build in Kanban means 15-20 cards per column with no phase grouping. On timeline, phase rows keep the structure intact.
- **We can still ship Kanban later without data migration.** The `tasks.status` field remains; a future Kanban view is a pure UI addition. Deferring today doesn't foreclose it.

**Consequences:**

- [A3] wireframe elements are removed. The existing [A4] timeline is relabelled [A3] and becomes "the project board". Cross-references to "A3 (Kanban)" in older docs (e.g. [22-wireframe-review.md](./22-wireframe-review.md) item #2) are now obsolete — the review's overloaded-card critique no longer applies since timeline rows carry a different affordance model.
- Project detail tab bar: **Board** tab removed. Remaining tabs: Timeline (default), Documents, Activity, Settings.
- Task cards on the timeline still show: title, assignees, due date, restrict-to badge, collaborator badge — but no `P` (photo) or `A` (approval) indicators, since those toggles are being removed per [D-032](#2026-07-12--remove-requires-photo--requires-firm-approval-toggles-from-mvp-d-032).
- Figma prompt: A3 section rewritten as "Project board (Timeline — only view)"; the old A3 Kanban section is deleted.

**Reversal cost:** Low — Kanban is pure UI (no schema changes). Rebuilding it takes ~2 sprint-days if a customer asks.

**Revisit when:** A paying customer asks for a Kanban view AND we can point to at least one internal workflow inside that firm that maps cleanly to columns. Neither of the two design partners has asked for one.

**Affects:** [figma-make-design-prompt.md](./figma-make-design-prompt.md), [11-mvp-scope.md](./11-mvp-scope.md), [22-wireframe-review.md](./22-wireframe-review.md) (item #2 obsolete), wireframes ([A3] deleted, [A4] relabelled to [A3]).

---

## 2026-07-12 — Remove `Requires photo` and `Requires firm approval` toggles from MVP (D-032, supersedes D-028)

**Decision:** Remove both per-task toggles from MVP:

1. `tasks.requiresPhoto` and `tasks.requiresFirmApproval` are dropped from the task schema.
2. `tasks.pendingApproval` is dropped (no longer meaningful without the approval toggle).
3. The A5 task detail no longer renders these two toggle rows.
4. The A5d "Pending review" pill and the `P` / `A` indicators on task cards are removed.
5. **Supersedes [D-028](#2026-06-27--collaborator-mark-done-flows-straight-through-firm-approval-is-opt-in-d-028)** — the "collaborator Mark Done flows straight through" behaviour is now the *only* behaviour, not the default. There is no opt-in.

**Why:**

- **D-028 already rendered these toggles low-value.** With `requiresFirmApproval` defaulting to false and provisioning-seed audits keeping it off for < 10% of tasks, the toggle was live-toggled by PMs rarely enough to not justify the design + engineering weight in the task detail UI. Removing it entirely removes the ambiguity.
- **`requiresPhoto` conflates two workflows.** It suggests the collaborator *cannot* mark done without a photo — but the [C1] collaborator screen never enforced this (the collaborator can always tap Done). A soft "please attach a photo" nudge is better handled at the WhatsApp template layer or as a status-change validation, not as a persistent per-task flag.
- **A5 hierarchy issue in [22-wireframe-review.md](./22-wireframe-review.md) item #3.** The review flagged "11 zones with no hierarchy". Removing two zones is the cheapest correction.
- **Consistent with the D-031 direction** — MVP kills speculative surface until customer evidence justifies it.

**Consequences:**

- `tasks` schema loses 3 boolean fields (`requiresPhoto`, `requiresFirmApproval`, `pendingApproval`). This is a subtractive schema change; existing docs with these fields set are ignored (Firestore is schemaless).
- Provisioning seeds (`functions/src/provisioning/seeds/*.ts`) stop emitting these fields on `taskDef` entries.
- Notification pipeline simplifies: no "hold-and-wait-for-approval" branch. Every collaborator `Mark Done` fires the client-facing WA immediately (subject to the D-027 lifecycle gate and per-task `visibleToClient`).
- Message previews on [A9]: "Task blocked / Need help" template stays; a hypothetical "Task awaiting approval" template that was never authored is confirmed out of scope.
- [22-wireframe-review.md](./22-wireframe-review.md) items #2 (P/A indicators on cards) and #3 (approval toggle in drawer) become obsolete. Item #5 (Need help recovery path) is unaffected.

**Reversal cost:** Low. Both fields are additive if we re-introduce them. No data migration needed at re-introduction (default to `false`).

**Revisit when:** A paying customer's PM explicitly asks "how do I make the system wait for me to review this before the client sees it?" — and a manual "hold the task in `in_progress` until you're ready to mark it done" workaround is not enough. That would be evidence D-028's original concern was real. Until then, keep it out.

**Affects:** [firestore-data-model.md](./firestore-data-model.md), [figma-make-design-prompt.md](./figma-make-design-prompt.md), [19-open-questions.md](./19-open-questions.md) (Q51 remains closed; now closed by removal rather than opt-in), [22-wireframe-review.md](./22-wireframe-review.md), wireframes ([A5], [A5d], [A5f]).

---

## 2026-06-29 — No customer-facing project templates in MVP; Siapp Admin seeds a starter project, firms duplicate to create more (D-031)

**Decision:** Remove the customer-facing project-template engine (`workspaces/{wid}/templates/{tplid}`, "pick a template" wizard, template marketplace UI) from MVP scope. Replace it with two things:

1. **Siapp-Admin-seeded starter project.** During tenant provisioning ([Z2]), Siapp Admin runs an internal scaffolding script that creates one starter project for the new firm, pre-populated with the task list, phases, and dependencies appropriate for the firm's vertical (residential build or conveyancing). All other fields (assignees, dates, statuses, updates, documents, restrict-to-dept, WA toggles, % complete) are left empty/default. The project is created in `lifecycle: 'draft'`.
2. **Duplicate project** as the only firm-side path to scaffold a new project. From the projects list, the firm picks an existing project to duplicate. The duplicate copies **task titles, order, phase grouping, and dependency links** only — every other field is cleared and reset to defaults.

**Why:**

- **Templates are overkill for current evidence.** Two design partners. Zero data on what firms actually reuse across projects. Building a template authoring UI, version model, library browser, and "pick a template" wizard before the first paying customer is exactly the speculative surface [17-operating-cadence.md](./17-operating-cadence.md) tells us to defer.
- **Duplicate matches observed PM behaviour.** Across Asana, ClickUp, Linear, Notion projects, duplication beats template usage 10:1 in published telemetry. PMs hold onto a known-good project and copy it forward — they almost never browse template galleries after onboarding.
- **Cold-start covered by Siapp Admin.** With no template library, a brand-new tenant would have zero scaffolding to start from. The provisioning script ([Z2]) fills that gap by seeding one starter project — Siapp Admin already runs tenant provisioning manually in MVP (see [11-mvp-scope.md](./11-mvp-scope.md) onboarding flow and the user journey Siapp Admin lane), so this is one extra step in an already-manual flow.
- **Departments are unaffected.** Departments are workspace-scoped and seeded by the same provisioning script, separately from the starter project (per [D-025](#d-025--departments-for-internal-access-control)). That separation is correct and stays.
- **WhatsApp Content Templates (Twilio / Meta-approved messages) are NOT removed.** Those are a different surface — pre-approved WA message bodies sent at runtime. They remain in [11-mvp-scope.md](./11-mvp-scope.md) and [13-tech-architecture.md](./13-tech-architecture.md) unchanged.

**What duplicate carries vs clears:**

| Carried | Cleared / reset |
|---|---|
| Task titles | Assignees |
| Task order within phase | Due dates, start dates, ETAs |
| Phase / grouping | Status (back to `not_started`) |
| Dependency links between tasks | Updates / comments / notes |
| `restrictedToDepartments` per task | Documents / photos |
| `visibleToClient` per task | Client + collaborator assignments |
| WhatsApp trigger toggles (on/off per task) | % complete, history, audit entries |
| | `lifecycle` resets to `draft` |
| | `summary` recomputed |

The rule: **structure carries, content clears.** Anything you'd rebuild by hand on a fresh project (task titles, ordering, who-sees-what defaults) is worth copying. Anything that's specific to the old project's clients, dates, or execution state would be wrong on the new one.

**Consequences:**

- `workspaces/{wid}/templates/{tplid}` collection is removed from the MVP data model. The `templateId` field on `projects/{pid}` is removed. A new optional `duplicatedFromProjectId: string` field is added to `projects/{pid}` for audit/history.
- Provisioning script ([Z2]) gains a "create starter project" step that writes one project doc + phase docs + task docs from a hardcoded internal seed (one per vertical). The seed lives in code (`functions/src/provisioning/seeds/{residentialBuild,conveyancing}.ts`), not in Firestore.
- `[A3b]` Create project screen replaces the template-picker cards with a two-mode chooser: **Blank** or **Duplicate from existing**.
- User journey: Siapp Admin Step 5 changes from "Pick vertical template" to "Seed starter project". Firm Staff Step 3 changes from "Review departments + roles" to "Open starter project (seeded by Siapp)", and Step 4 changes from "Create first project" to "Customize tasks + dates".
- Roadmap entries that referenced "templates engine" (Sprint B in [12-product-roadmap.md](./12-product-roadmap.md)) are rewritten as "duplicate project + provisioning seeds". Custom template authoring UI and template marketplace move from v1.5 to v2 (or are killed pending evidence).
- Strategic-positioning docs that frame templates as a long-term moat ([04-product-strengths.md](./04-product-strengths.md), [02-competitive-analysis.md](./02-competitive-analysis.md), [07-gtm-strategy.md](./07-gtm-strategy.md)) keep the moat narrative but reframe the MVP delivery as "Siapp-curated starter projects per vertical + firm-driven duplication".

**Reversal cost:** Low. The `templates/` collection can be re-introduced as a new subcollection; the data model is additive. The `duplicatedFromProjectId` field is forward-compatible with a future `templateId`. No data migration needed at the point of re-introduction.

**Revisit when:** (a) ≥ 3 paying customers ask for an "add new project from template" path that duplicate doesn't satisfy, OR (b) we observe firms emailing us their playbooks asking us to encode them as reusable templates, OR (c) the marketplace thesis in [05-business-model.md](./05-business-model.md) gets prioritized for revenue diversification.

**Affects:** [firestore-data-model.md](./firestore-data-model.md), [11-mvp-scope.md](./11-mvp-scope.md), [13-tech-architecture.md](./13-tech-architecture.md), [12-product-roadmap.md](./12-product-roadmap.md), [20-access-control-departments.md](./20-access-control-departments.md), [01-overview.md](./01-overview.md), [04-product-strengths.md](./04-product-strengths.md), [07-gtm-strategy.md](./07-gtm-strategy.md), [10-customer-discovery-plan.md](./10-customer-discovery-plan.md), [21-cost-estimation.md](./21-cost-estimation.md), [figma-make-design-prompt.md](./figma-make-design-prompt.md), [README.md](./README.md), user journey, screen wireframes ([A3b], [Z2]).

---

## 2026-06-28 — MVP launches as a single tier; no custom domain, no theming differentiation, "Powered by Siapp" always shown (D-030)

**Decision:** MVP ships with one paid tier. Every paying workspace gets the same product surface: logo upload + a single primary brand colour, and the "Powered by Siapp" footer is rendered on every client portal and collaborator task page with no toggle to hide it. **No custom domain, no font/layout/CSS theming, no white-label, and no Business-tier-conditional UI in MVP.** The Trial → Standard → Business plan split documented in [06-pricing-model.md](./06-pricing-model.md) is the post-MVP roadmap, not what we build first.

**Why:**

- **Tiering before traction is wasted code.** We have zero paying customers. Building admin UI, billing logic, branding toggles, and a custom-domain pipeline before we know which features actually drive an upgrade is exactly the trap [17-operating-cadence.md](./17-operating-cadence.md) tells us to avoid.
- **Custom domains are expensive to ship safely.** TLS cert provisioning, DNS verification, edge routing, and the customer-support load of "my domain isn't working" easily eats a sprint per quarter. Defer until we have ≥ 1 customer who will pay extra specifically for it.
- **White-label conflicts with the PLG distribution loop.** Clients seeing "Powered by Siapp" on every portal is the cheapest acquisition channel we have. Burning that lever in MVP — before we can quantify what it's worth — is premature optimization in the wrong direction.
- **Single tier removes a whole class of bugs.** No per-tier feature gates, no upsell wall logic, no admin "plan change" path, no per-tier WA allowance arithmetic. The billing admin panel in [06-pricing-model.md](./06-pricing-model.md) collapses to "extend renewal date".
- **Brand-identity ([09-brand-identity.md](./09-brand-identity.md)) and pricing ([06-pricing-model.md](./06-pricing-model.md)) tier rules now describe a *post-MVP* state.** MVP rules are simpler and override.

**Consequences:**

- `workspaces.branding.customDomain` is removed from the MVP data model surface (the field is reserved for post-MVP; not written, not read, not validated in MVP code paths). `firestore-data-model.md` updated to reflect this.
- `workspaces.plan` enum still exists for forward compatibility, but MVP only sets it to `'trial'` (during the 30-day trial) or `'standard'` (after payment). `'business'` is reserved.
- A8 Branding screen: no custom-domain field, no Business-plan badge, no "Hide Siapp footer" toggle. Just logo + primary color + live preview.
- Client portal (B1, B2, B3, B4) and collaborator task page (C1) always render the "Powered by Siapp" footer.
- Pricing page (marketing) and admin panel ship with one plan only in MVP. The Standard vs Business comparison table in [06-pricing-model.md](./06-pricing-model.md) is documentation of the planned future, not built UI.

**Reversal cost:** Low. All the post-MVP tier work is additive — `customDomain` reappears as a single field, the per-tier UI is a feature flag, and the existing `plan` enum already has the slot for `'business'`. No data migration needed when we eventually tier.

**Revisit when:** ≥ 10 paying firms AND at least 3 of them have asked unprompted for either custom domain OR "remove your branding from my portal". Either signal is the cue to spec a Business tier and start building the toggles. Until then, do not entertain one-off white-label requests — they are a distraction.

---

## 2026-06-27 — Collaborator-uploaded docs are client-visible by default; collaborator can soft-delete their own uploads (D-029)

**Decision (two parts):**

1. **Visibility:** A document uploaded by a collaborator to a task inherits the parent task's `visibleToClient` flag at upload time — i.e. **if the task is client-visible, the doc is client-visible**. Applies identically to firm and collaborator uploads. Firm users can flip a single doc's `visibleToClient` after the fact without changing the task setting.
2. **Deletion:** A collaborator can **soft-delete a document they uploaded** to a task they are currently assigned to, provided `scanStatus != 'infected'`. Soft delete sets `deletedAt` / `deletedBy` / `deletedByType` and emits a `doc_deleted` entry in the task activity feed. Firm users can soft-delete any document. No hard delete is exposed in the UI — the retention job purges past `retentionUntil`.

**Why:**

- **Visibility default = inherit.** The task-level toggle is already the single source of truth for "what does the client see?". Adding a separate doc-level default would invite drift and make the UI confusing ("why is my photo on the client portal but this PDF isn't?"). Firms that need finer control still get the per-doc override after upload.
- **Collaborator delete = trust + practicality.** Collaborators routinely upload the wrong photo (camera roll mishaps) or a draft PDF before the final. Forcing them to ping the PM via WhatsApp to clear it creates friction and adds inbound noise. The blast radius is small: it's their own upload, on a task they own, and the activity feed records the deletion so nothing is silently disappeared.
- **Audit is preserved.** Soft delete means the Storage object stays until retention purge; the `updates/{updid}` row with `action: 'doc_added'` is never removed. A dispute can always reconstruct what was uploaded and when.
- **Infected-file carve-out.** A virus-flagged file cannot be deleted by anyone via the normal path — it stays quarantined for audit and is purged through the AV pipeline. Prevents a malicious collaborator from uploading + deleting to hide an attack attempt.

**Consequences:**

- Data model adds `deletedAt`, `deletedBy`, `deletedByType` to `documents/{did}`, and `doc_deleted` to the `updates.action` enum.
- Storage rules: collaborator's signed delete URL is issued by Cloud Run only after JWT validates the colid against `uploadedBy`.
- UI: collaborator's single-screen task page shows a "Delete" text link only on rows they uploaded; firm task detail shows delete on every row.
- Activity feed renders deleted-doc rows with strikethrough so the firm sees what was removed.
- Documents listings filter out `deletedAt != null` for all personas; firm-side has a hidden "Show deleted" admin filter for audit (out of scope for v1 UI; available via API).

**Reversal cost:** Low. Both halves are independent flags; either could be tightened later (e.g. require firm to approve doc deletion) without a data migration.

**Revisit when:** A dispute case shows a collaborator deleted evidence in a way that hurt the firm (file gone before screenshot/preserve), OR a client complaint shows we're leaking docs the firm didn't intend the client to see. Either signal raises the bar to firm-only delete or per-doc visibility default of `false`.

**Affects:** [firestore-data-model.md](./firestore-data-model.md), [figma-make-design-prompt.md](./figma-make-design-prompt.md). Related: [20-access-control-departments.md](./20-access-control-departments.md) (department restriction continues to take precedence over `visibleToClient`).

---

## 2026-06-27 — Collaborator `Mark Done` flows straight through; firm approval is opt-in (D-028) [SUPERSEDED by D-032]

> **Superseded 2026-07-12 by [D-032](#2026-07-12--remove-requires-photo--requires-firm-approval-toggles-from-mvp-d-032).** The `requiresFirmApproval` toggle is removed from MVP entirely — the "flows straight through" behaviour below is now the only behaviour. Kept here for the reasoning trail.

**Decision:** `tasks.requiresFirmApproval` defaults to **`false`**. When a collaborator taps **Mark Done**, the task moves to `status: 'done'` and the client-facing milestone WhatsApp + portal update fire immediately (subject to D-027 lifecycle gate and the per-task `visibleToClient` flag). Firms can opt-in to approval-before-broadcast per task (and per provisioning-seed `taskDef`) for sign-off-critical work.

**Why:**

- **Reduces PM friction.** The most common collaborator update is "delivered materials / site clean / coat 1 done". Forcing a PM tap on every one creates a bottleneck and trains PMs to rubber-stamp — which defeats the purpose of approval anyway.
- **Matches user expectation.** Trades and homeowners both expect "done = done". A 3-hour gap between collaborator marking done and client seeing it (because the PM is in a site meeting) erodes the trust the WhatsApp loop is supposed to build.
- **Opt-in covers the real risk.** Provisioning seeds can set `requiresFirmApproval: true` on the handful of structural / legal / sign-off-critical tasks where the PM genuinely needs to gate the message (e.g. *Structural completion certificate*, *Conveyancing completion*, *Final handover walkthrough*). Routine subtasks stay frictionless.
- **WhatsApp cost is a non-issue here.** Each milestone WA is ~RM 0.30; the cost of a PM bottleneck (lost client trust, "is anything happening?" inbound messages) is higher.

**Consequences:**

- Provisioning-seed `taskDefs` will be audited and approval flipped ON only for sign-off-critical tasks (target: <10% of tasks in any seed).
- `tasks.pendingApproval` and the amber "Pending review" pill remain in the data model and UI — they just activate less often.
- Activity feed still records the `'approved'` event when it does happen, so audit trail is unaffected.
- Closes [Q51](./19-open-questions.md) with the opposite of the original recommendation.

**Reversal cost:** Low — single field default flip + seed re-audit. No data migration (existing tasks keep whatever was set).

**Revisit when:** A pilot customer reports a complaint that "a collaborator told the client X before we'd confirmed it" more than once in a 60-day window. That would suggest we need a project-level default override (`project.defaultRequiresFirmApproval`) rather than only per-task.

**Affects:** [firestore-data-model.md](./firestore-data-model.md), [figma-make-design-prompt.md](./figma-make-design-prompt.md), [19-open-questions.md](./19-open-questions.md) (Q51 closed).

---

## 2026-06-27 — Project lifecycle gates all outbound notifications

| # | Decision | Decided | Supersedes |
|---|---|---|---|
| D-027 | **Every project carries a `lifecycle` field (`draft` → `published` → `completed` → `archived` → `deleted`); outbound WA/SMS and external access are gated by `lifecycle = 'published'`** | 2026-06-27 | — |

### D-027 — Project lifecycle & notification gate

- **What:** Projects gain a `lifecycle: 'draft' | 'published' | 'completed' | 'archived' | 'deleted'` field on top of the existing execution `status`. New projects are created in `draft`. While in `draft`, all outbound WhatsApp/SMS to clients and collaborators is suppressed, magic links are not issued, and the client portal returns a friendly "not started yet" state. PM explicitly **publishes** the project to start the outside-world communication. `completed` fires a one-time handover WA; `archived` and `deleted` revoke external access. Full spec: [firestore-data-model.md → Project lifecycle & notification gate](./firestore-data-model.md#project-lifecycle--notification-gate-d-027).
- **Why:**
  - A PM cloning a 60-task project, renaming tasks, assigning collaborators, and back-dating dependencies will inevitably trigger notification-worthy events. Without a gate, the first collaborator gets a midnight WhatsApp for a task that doesn't actually start for 3 months. That is a category of trust bug we cannot afford with pilot customers.
  - Configuration time is not the same as live time. Every other PM-style tool with external recipients (Asana guest links, Monday client view) has some version of this. Making it explicit and named avoids accidental sends.
  - It compresses to one well-known concept that maps to how firms already think ("not started", "in progress", "done", "shelved").
- **Why these five states and not three or seven:**
  - `draft`: pre-publish configuration; safe sandbox.
  - `published`: the live state; notifications fire; clients and collaborators have access.
  - `completed`: terminal-but-visible; handover sent; portal stays read-only so clients can still reference their project.
  - `archived`: terminal-and-hidden; revokes access; used when projects go stale or get shelved without a clean completion.
  - `deleted`: soft delete with a retention window before hard purge, per PDPA + [14-legal-compliance.md](./14-legal-compliance.md).
  - Rejected adding `paused` / `on_hold` to lifecycle — that's the existing `status` field's job. Pausing a project should not auto-revoke client access; the client should still see the pause.
- **Why lifecycle is separate from `status`:** `status` answers "is work happening?" (drives dashboards, filters, project health). `lifecycle` answers "can the system talk to outsiders about this?" (drives notifications, access). Orthogonal: a `status: on_hold` project can be `lifecycle: published` (client sees the pause); a `status: active` project can be `lifecycle: draft` (firm is configuring while working internally).
- **Defense in depth (three checkpoints):**
  1. `triggerNotifications` Cloud Function checks lifecycle before writing live to `outbox`. Suppressed entries are still written with `suppressed: true` for preview.
  2. The Cloud Tasks dispatcher re-checks lifecycle at enqueue time (race-safety between event and lifecycle change).
  3. Magic-link issuer + client portal handler both verify lifecycle on every request.
- **Quiet hours:** layered on top, applies only when `lifecycle = 'published'`. Default 21:00–08:00 Asia/Kuala_Lumpur. Messages held in `outbox` with `holdUntil` and dispatched at the next 08:00.
- **UI implications (for sprint design):**
  - "Publish project" is a prominent action on the project header during `draft`; replaced by a status badge in other states.
  - Publish dialog previews WA cost: *"This will send 1 welcome WhatsApp to the client and 3 task notifications to 2 collaborators. Estimated cost: 4 conversations."*
  - During `draft`, the activity feed shows "would have notified" markers on events that would otherwise fire WA, so PMs can audit the config before going live.
  - Bulk import of historical projects (Phase 2) lands them in `archived` so no notifications fire on import.
- **Data-model impact (additive, no breaking changes):**
  - `projects/{pid}` gains `lifecycle`, `publishedAt?`, `completedAt?`, `archivedAt?`, `deletedAt?`.
  - `outbox/{mid}` gains `suppressed: boolean`, `suppressedReason?: string`, `holdUntil?: Timestamp`.
  - New Cloud Functions: `firePublishWelcomeMessages`, `fireCompletionMessages`, `revokeExternalAccess`. Existing `triggerNotifications` updated to gate.
- **Affects:** [firestore-data-model.md](./firestore-data-model.md), [11-mvp-scope.md](./11-mvp-scope.md), [13-tech-architecture.md](./13-tech-architecture.md), [figma-make-design-prompt.md](./figma-make-design-prompt.md) (needs a publish-flow screen in the next iteration), [pm_ux/designs/user-journey.excalidraw](../designs/user-journey.excalidraw) (firm "Publish project" step belongs between "Assign task" and "Monitor dashboard").
- **Consequences (acknowledged):**
  - One extra PM action ("Publish") before notifications fire. Mitigated by the publish dialog clearly explaining what will happen, and by allowing duplicated or starter projects to be published immediately if the PM is confident.
  - Provisioning seeds with default notification toggles must include sane defaults — verified for the two seeded starter projects before launch.
  - Activity feed during `draft` shows "would have notified" markers — costs UI surface area but earns trust.
- **Reversal cost:** Low. If lifecycle proves unnecessary, treat every new project as `published` on create and ignore the field — no data migration.
- **Revisit when:** (a) Discovery surfaces that PMs find the publish step too heavy and consistently skip configuration safety, or (b) a fourth lifecycle state proves necessary (e.g. `paused-external` if customers ask to pause outbound without archiving).

---


| # | Decision | Decided | Supersedes |
|---|---|---|---|
| D-026 | **Ship v1 in English only; BM UI deferred to v1.5** | 2026-06-27 | [D-011](#d-011-related-supersession) (EN + BM at launch) |

### D-026 — English-only at v1, BM scaffolded but not shipped

- **What:** The firm app, client portal, and collaborator page ship at v1 in **English only**. Bahasa Malaysia UI moves to v1.5. WhatsApp/SMS message bodies and Twilio Content Templates still ship per-locale (EN at v1, BM ready when the UI ships).
- **Why:**
  - Scope. Two design partners are EN-comfortable; translation work is not on the critical path to first paying customer.
  - Avoids translation drift while the product surface is still moving every week.
  - Removes one full sprint (was Sprint E in [12-product-roadmap.md](./12-product-roadmap.md)) from Phase 1.
- **What stays in v1 anyway (scaffold, no strings):**
  - i18next + plugins installed per [D-023](#d-023--i18next-as-the-translation-layer); every UI string passes through `t()` from day one so the v1.5 BM add is content work, not refactor work.
  - `locale` field on user + workspace records; defaults to `en` and is the only value accepted at v1.
  - JSON namespace files exist with EN populated; `ms` files are empty placeholders.
  - Twilio Content Templates submitted in EN at launch; BM templates submitted alongside the v1.5 UI release.
- **Marketing/GTM impact:**
  - Launch website is English-only at v1; BM landing pages slip to Phase 2.
  - First two design partners + cold launch cohort are all English-capable; no localization gating.
  - CS / content-marketer hires no longer need BM as a hard requirement — preferred, not required, until the v1.5 BM launch is staffed.
- **Affects:** [11-mvp-scope.md](./11-mvp-scope.md), [12-product-roadmap.md](./12-product-roadmap.md), [13-tech-architecture.md](./13-tech-architecture.md), [07-gtm-strategy.md](./07-gtm-strategy.md), [09-brand-identity.md](./09-brand-identity.md), [02-competitive-analysis.md](./02-competitive-analysis.md), [03-target-market.md](./03-target-market.md), [04-product-strengths.md](./04-product-strengths.md), [06-pricing-model.md](./06-pricing-model.md), [16-team-hiring-plan.md](./16-team-hiring-plan.md), [figma-make-design-prompt.md](./figma-make-design-prompt.md), [01-overview.md](./01-overview.md).
- **Consequences (acknowledged):**
  - Slightly weakens the "local" brand pillar at launch; we lean harder on MYR pricing, FPX, CIDB/conveyancing templates, and WhatsApp-native UX to carry localization signal until BM ships.
  - Competitive matrix row "Bahasa Malaysia UI" downgrades from ✅ launch to ✅ v1.5; still a clear differentiator on the long arc, just not at the moment of first contact.
- **Reversal cost:** Low. Re-introducing BM = filling the `ms` JSON files and submitting BM Twilio templates. No data migration.
- **Revisit when:** (a) A design partner or paying customer explicitly blocks adoption on BM UI, or (b) we approach the v1.5 milestone and need to confirm scope. Pull BM forward if either fires.

---

## 2026-06-21 — Internal access control: Departments

| # | Decision | Decided | Supersedes |
|---|---|---|---|
| D-025 | **Internal need-to-know access = Departments (orthogonal to roles)** | 2026-06-21 | — |

### D-025 — Departments for internal access control

- **What:** A new workspace-scoped concept, **Departments** (e.g. Finance, Legal, Ops, HR, Admin), orthogonal to the existing role tier (owner/admin/pm/viewer). Members belong to zero or more departments. Tasks (and project-scoped documents) gain an optional `restrictedToDepartments: string[]` field. When non-empty, only `owner`, `admin`, and members of a listed department can see the task's description, updates/notes, and attached documents. Everyone else still sees the task header (title, status, assignee, due date) so project timelines and dashboards stay coherent. Full design in [20-access-control-departments.md](./20-access-control-departments.md).
- **Why "Departments" as the name:**
  - Matches how firms already talk ("send to Finance", "that's Legal's call").
  - Vertical-neutral — reads naturally for construction *and* law firms.
  - Doesn't collide with `role` (which is permission tier, not function).
  - Rejected alternatives: "Teams" (collides with MS Teams), "Groups" (too generic), "Practice Areas" (legal-specific), "Permission Groups" (IT plumbing language).
- **Why two orthogonal axes (role × department) instead of expanding roles:** A Finance person can be a PM *or* a viewer; conflating function with permission tier forces unnatural role combinations and explodes the role enum.
- **Why keep the task header visible to all:** Hiding tasks entirely breaks % complete, dependency graphs, and "my tasks" views. Header-visible + content-hidden matches the user's framing and the standard RBAC-for-actions / ABAC-for-content pattern.
- **Why ship in MVP, not v1.5:** Both pilot design partners have a real need — the construction firm has finance staff handling invoices; the law firm has solicitor-client privileged matter content. Deferring leaves a sharp edge in two of two pilots. Build a minimal version now: feature is hidden until an admin creates the first department, so SMB firms see zero overhead.
- **Data-model impact (no breaking changes):**
  - New collection `workspaces/{wid}/departments/{depId}`.
  - `members/{uid}` gains `departments: string[]`.
  - `tasks/{tid}` gains `restrictedToDepartments: string[]` (empty = unrestricted).
  - `documents/{did}` gains `restrictedToDepartments: string[]` (inherits task's by default for task-scoped docs).
  - Firebase Auth custom claims shape changes from `workspaces[wid] = 'role'` to `workspaces[wid] = { role, departments }`. Watch 1 KB claims budget; fallback is reading `members/{uid}` once per session.
  - Restricted task reads route through a Cloud Run projection endpoint to avoid leaking raw docs to unauthorized clients via devtools.
- **Affects:** [firestore-data-model.md](./firestore-data-model.md), [11-mvp-scope.md](./11-mvp-scope.md), [13-tech-architecture.md](./13-tech-architecture.md), [19-open-questions.md](./19-open-questions.md) (Q11, internal half).
- **Consequences (acknowledged):**
  - Configuration step exists, but is opt-in (hidden until first department is created).
  - Small UX surface on every task (a "Restricted to" chip), visible only to owner/admin/pm.
  - Notification renderer must respect departments before inlining `description` or notes into WhatsApp/email bodies — fallback to minimal template + link for unauthorized recipients.
  - Audit log diffs must redact restricted fields for non-authorized readers; basic redaction in v1, polish iteratively.
- **What this does NOT cover:** Client-facing document permissioning (still handled by `visibleToClient` / `visibleToCollaboratorIds` — unchanged). Project-level "this whole project is restricted" (workaround: provisioning seed or duplicate-source marks all tasks; revisit after 10 paying customers).
- **Reversal cost:** Low. Schema is additive; if departments prove unused, drop the UI surface and ignore the field — no data migration needed.
- **Revisit when:** (a) A pilot firm asks for project-level restriction not just task-level, or (b) custom claims hit the 1 KB ceiling, or (c) discovery surfaces a strong preference for "practice areas" or another label (handled cheaply via a per-workspace `departmentLabel` override).

---

## 2026-06-21 — Brand: Siapp (supersedes Melaka)

| # | Decision | Decided | Supersedes |
|---|---|---|---|
| D-024 | **Brand = Siapp** | 2026-06-21 | [D-018](#d-018--melakadev-brand-superseded) (Melaka) |

### D-024 — Siapp brand

- **What:** Product and company branded as **Siapp** (pronounced *syap*). Construction: *siap* (Malay/Manglish for "done, ready, complete") + *app*, collapsed via the shared "ap" sound. Both meanings preserved in one word.
- **Primary domain:** `siapp.app` (the TLD doubles the *siap + app* pun — the URL is the brand). Secondary: `siapp.my` (local trust). Defensive: `siapp.io`.
- **Why `.app`, not `.com`:** `siapp.com` is taken (squatter / parked). Decision: do **not** chase it. (a) The brand premise is *siap + app* — `.app` reinforces the meaning instead of leaving it implicit; (b) `.app` is on the HSTS preload list (TLS by default), Google-operated, no quality penalty; (c) `linear.app`, `vercel.app`, `loom.com→loom.app` show modern SaaS brands live happily outside `.com`; (d) capital better spent on trademark + design than on a 4–5-figure `.com` acquisition for a pre-launch product. Revisit only if `siapp.com` becomes available at <~$2k.
- **Why this supersedes Melaka:**
  - **Trademark cleanliness.** "Melaka" is geographically descriptive and hard to defend as a mark. "Siapp" is an invented spelling — distinctive, registrable, defensible.
  - **No category-naming trap.** Names what the product *feels like to use* (the satisfying "siap" of finishing a task), not where the founder is from.
  - **Globally pronounceable.** Reads as a brand name to non-Malay speakers (similar phonetic class to Snap, Zapp, Slack). Carries hidden cultural depth for SEA users without requiring it for comprehension.
  - **Verb-as-brand ambient marketing.** Every closed task is a small "siap" moment — the product feeling matches the brand name.
  - **Domain math is open.** `siapp.app` available at retail (~$15/yr), `siapp.my` ~RM 80/yr; full primary + local + defensive stack achievable for <$120/yr total.
- **Voice/tone implications:** Energetic, decisive, satisfied-craftsman. Less heritage/literary than Melaka. Better fit for a fast-shipping startup brand.
- **Pronunciation guidance for marketing:** Always state "*syap*" on first introduction. Tagline tests include *"Siapp. Done."* / *"Get it siapp."*
- **Consequences (acknowledged):**
  - One-time rename cost across all docs (this commit), social handles, future trademark filing
  - Slight pronunciation ambiguity for EN-only speakers on first read (mitigated by onboarding + audio in marketing)
  - Loses the Melaka historical-metaphor story (acceptable — that story was strong but the trademark risk was real)
  - `.com` mismatch: ~5% of traffic will type `siapp.com` and land on the squatter. Mitigate via SEO, paid search on "siapp", and prominent `siapp.app` on all marketing surfaces. Buy `siapp.com` opportunistically if it drops or is listed for sale at <~$2k.
- **Logo direction:** Wordmark with double-P play (twin checkmarks, twin pillars, twin "siap stamps"). Indigo + terracotta palette from prior brand work carries over.
- **Trademark plan:** File in MY (MyIPO Class 9 + 42), then SG, ID as expansion approaches. Distinctive spelling makes this materially easier than "Melaka" would have been.
- **Reversal cost:** Low at this moment (pre-launch, pre-customer). After 10+ paying customers, reversal cost becomes high. Decide now, commit.
- **Revisit when:** Never — brand is a one-way door post-launch.

---

## 2026-06-21 — i18n library: i18next

| # | Decision | Decided | Supersedes |
|---|---|---|---|
| D-023 | **i18n library = i18next (with react-i18next, ICU plugin)** | 2026-06-21 | Tentative "formatjs or i18next" mention in [13-tech-architecture.md](./13-tech-architecture.md) |

> **Note:** Library decision unchanged. Launch locale scope narrowed by [D-026](#d-026--english-only-at-v1-bm-scaffolded-but-not-shipped) — i18next ships at v1 with EN strings only; BM namespace files are empty placeholders until v1.5.

### D-023 — i18next as the translation layer

- **What:** i18next is the i18n core, used in both the React app (`react-i18next`) and the Express backend (for rendering non-template WhatsApp/SMS bodies and email content). One translation source of truth for both surfaces.
- **Why:**
  - Largest plugin ecosystem of any JS i18n library — lazy namespace loading, language detection, ICU, backend file loaders all first-party.
  - Works identically in React and Node — same JSON files power both surfaces, no string duplication.
  - Namespacing maps cleanly to our feature folders (`common`, `tasks`, `messages`, `portal`, `collaborator`, `admin`).
  - Designer/translator-friendly JSON; no compilation step like `formatjs`'s AST extraction.
- **Plugins locked:**
  - `i18next` — core.
  - `react-i18next` — React hooks (`useTranslation`) + `<Trans>` for interpolated JSX.
  - `i18next-browser-languagedetector` — detects locale from URL → cookie → `navigator.language` order.
  - `i18next-http-backend` — lazy-loads namespace JSON; BM bundles don't ship for EN users and vice versa.
  - `i18next-icu` — ICU MessageFormat plugin for plurals and gender-correct strings (matters for BM).
- **Translation file layout:** `apps/web/public/locales/{en,ms}/{common,tasks,messages,portal,collaborator,admin}.json`. Backend reads the same files from a shared package.
- **Tradeoffs accepted:**
  - JSON format is verbose vs. ICU `.po` files — accepted for tooling simplicity.
  - i18next's bundle is larger than `formatjs` runtime — offset by HTTP backend lazy loading.
- **What this does NOT cover:** WhatsApp Content Templates are managed in Twilio (Meta-approved), not in i18next JSON. i18next handles in-app strings, session-window WhatsApp reply bodies, and transactional email bodies.
- **Reversal cost:** Medium. Migrating to `formatjs` would require AST changes across every component. Decide now, commit.
- **Revisit when:** A third language ships AND translator workflow needs CAT-tool integration (Crowdin / Lokalise). Both support i18next JSON natively, so likely no migration needed.

---

## 2026-06-21 — Backend framework: Express 5

| # | Decision | Decided | Supersedes |
|---|---|---|---|
| D-022 | **Backend framework = Express 5 (TypeScript)** | 2026-06-21 | Prior implicit "Hono" reference in [13-tech-architecture.md](./13-tech-architecture.md) |

### D-022 — Express 5 as the HTTP framework

- **What:** Node.js + TypeScript backend on Cloud Run uses **Express 5** as the HTTP framework. Cloud Functions 2nd gen (Firestore triggers) remain on the Functions SDK; they don't need a web framework.
- **Why:**
  - **Industry standard.** Largest hiring pool, deepest Stack Overflow / LLM training coverage — relevant for solo-founder velocity and future hires.
  - **Express 5 closes the historical gaps:** native async/await error propagation, modern routing, built-in body parsing — no more `express-async-errors` or `body-parser`.
  - **Official Twilio and Stripe Node samples assume Express** — copy-paste fidelity for webhook signature validation and (Phase 2) Stripe events.
  - **Mature middleware ecosystem:** `helmet`, `cors`, `express-rate-limit`, `multer` if needed.
- **Tradeoffs accepted:**
  - Cold start ~250–400 ms on Cloud Run (vs ~50 ms for Hono). Mitigation: `min-instances=1` on the API service (~USD $5/mo) once paying customers exist.
  - No built-in TypeScript types for `Request` augmentation — we define an `AppRequest` discriminated-union type for auth context (firm staff vs. magic-link JWT).
  - No built-in validation — Zod is added as the validation layer with a thin `validate({ body, params, query })` middleware.
- **Standard library layer (built once, in `apps/api/src/lib/`):**
  1. `asyncHandler` — wraps async route handlers; errors flow to single error middleware.
  2. `validate(schemas)` — Zod-backed request validation middleware.
  3. `requireFirebaseAuth()` — verifies Firebase ID token; attaches typed `req.auth = { kind: 'firm', uid, workspaceId, role }`.
  4. `requireMagicLinkJWT()` — verifies magic-link JWT via `jose`; attaches `req.auth = { kind: 'collaborator' | 'client', subjectId, taskId | projectId, workspaceId }`.
  5. `requireTwilioSignature()` — validates `X-Twilio-Signature` before any side effect.
  6. `AppError` hierarchy — `ValidationError`, `NotFoundError`, `ForbiddenError`, `QuotaExceededError`. Single error middleware maps to status + structured Pino log.
- **Package set (locked):**
  - Runtime: `express@^5`, `zod`, `helmet`, `cors`, `pino`, `pino-http`, `firebase-admin`, `twilio`, `jose`.
  - Dev: `@types/express@^5`, `@types/cors`, `tsx`, `typescript`, `vitest`, `supertest`, `@types/supertest`.
  - **Not used:** `body-parser` (built into Express 5), `morgan` (replaced by `pino-http`), `jsonwebtoken` (replaced by `jose`), `winston` (replaced by `pino`), `express-async-errors` (Express 5 handles async natively).
- **Reversal cost:** Low for the first 4 weeks of Sprint A. Express's request/response API is widely emulated — moving to Fastify or Hono later is mechanical if cold-start cost ever dominates margin.
- **Revisit when:**
  - Cold-start latency becomes a customer-visible complaint AND `min-instances` cost exceeds USD $50/mo per service, OR
  - We need edge deployment (Cloudflare Workers / Vercel Edge) — would force a re-evaluation toward Hono.

---

## 2026-06-17 — Firestore data model (workspace-scoped subcollections)

| # | Decision | Decided | Supersedes |
|---|---|---|---|
| D-021 | **Workspace-scoped subcollections; tasks under projects; denormalized rollups** | 2026-06-17 | n/a — closes Q44 |

### D-021 — Firestore data model shape

- **What:** Everything customer-owned lives under `/workspaces/{wid}/…`. Tasks are a subcollection of projects. Updates are a subcollection of tasks. Project documents carry denormalized `summary` (counts, last activity) and denormalized owner/client names. Two top-level collections only: `users/` (firm staff Auth profiles) and `phoneIndex/` (cross-workspace phone lookup).
- **Why:**
  - Single security-rule check per workspace boundary (`request.auth.token.workspaces[wid] != null`)
  - Natural pagination and realtime listeners per project
  - Avoids N+1 reads on dashboard rendering (denormalized fields)
  - No top-level cross-tenant query risk
- **Three-actor access:**
  - Firm staff → Firestore client SDK + security rules
  - Clients & collaborators → never touch Firestore; routed through Cloud Run endpoint that validates magic-link JWT
- **One-way doors locked:** workspace scoping, tasks-under-projects, denormalized names
- **Consequences (acknowledged):**
  - Cross-workspace queries require BigQuery export
  - Free-text search requires Algolia/Typesense (Q50, deferred)
  - Hot docs (`projects.summary`, `usageCounters`) need debounced writes or sharded counters
- **Spec:** [firestore-data-model.md](./firestore-data-model.md)
- **Revisit when:** First customer needs cross-workspace task view (collaborator multi-firm dashboard) — handled in v2 via BigQuery + read-side cache; data model stays.

---

## 2026-06-17 — Brand: Melaka.dev (SUPERSEDED by D-024)

> **Superseded 2026-06-21** by [D-024](#d-024--siapp-brand). Kept for historical record per append-only policy.

| # | Decision | Decided | Supersedes |
|---|---|---|---|
| D-018 | **Brand = Melaka / melaka.dev** ⛔ superseded | 2026-06-17 | prior "CLINK" working name |

### D-018 — Melaka.dev brand (superseded)

- **What:** Product and company branded as **Melaka** (domain: melaka.dev). Former working name "CLINK" retired.
- **Why (at the time):**
  - Domain owned (melaka.dev ✓)
  - Strong local-first identity — unmistakably Malaysian, resonates with SEA SME buyers
  - Historical metaphor: Melaka was the trading port connecting East and West; we connect firms to clients
  - .dev TLD signals tech credibility without jargon
  - Two syllables, memorable, pronounceable in EN/BM/Mandarin
- **Why superseded:** Trademark risk on geographic term (MyIPO disallows or limits geographic-name marks); category-naming risk (heritage story, not product feel); .dev TLD reads "for developers" to non-technical B2B buyers. Replaced by **Siapp** ([D-024](#d-024--siapp-brand)) before launch — lower reversal cost now than later.

---

## 2026-06-17 — Manual billing for MVP

| # | Decision | Decided | Supersedes |
|---|---|---|---|
| D-019 | **Manual billing (invoice + bank transfer) at MVP; defer Stripe** | 2026-06-17 | prior "Stripe + FPX in MVP" plan |

### D-019 — Manual billing for MVP

- **What:** Customers pay founder directly via FPX bank transfer or invoice link. Founder upgrades workspace plan through admin panel. No Stripe, no FPX gateway, no webhooks at MVP.
- **Why:**
  - Saves 2–3 weeks of build time (Stripe integration + webhooks + invoice generation + dunning)
  - Eliminates a subprocessor DPA at launch
  - Direct customer contact during early sales — founder sees every transaction
  - Trivial to apply discounts, custom terms, design-partner deals
  - Zero Stripe fees (improves margin ~3.4% per transaction)
- **What we must build instead:**
  - Admin panel: workspace list, one-click plan change, seat adjustment, renewal extension, action audit log
  - Trial expiry automation: read-only after day 30, data preserved 90 days
  - Reminder emails at day 25 (trial ending) and renewal -30 days
- **Consequences:**
  - Doesn't scale — burns founder time on every renewal
  - No auto-renewal (customers must actively re-pay annually)
  - No self-serve checkout from pricing page (requires "Talk to us" form)
- **Migration trigger to Stripe:** ≥ 20 paying customers, OR billing admin > 4 hrs/week, OR first customer asks for auto-renewal. Existing customers stay on manual until natural renewal.
- **Revisit when:** Either migration trigger above hits.

---

## 2026-06-17 — Pricing tiers: Trial / Standard / Business

| # | Decision | Decided | Supersedes |
|---|---|---|---|
| D-020 | **Three tiers: Trial (30d free) → Standard (RM 79/seat annual) → Business (RM 149/seat annual)** | 2026-06-17 | prior 5-tier Starter/Team/Business/Scale/Enterprise plan |

### D-020 — Three-tier pricing

- **What:** Replace 5-tier plan with three: Trial, Standard, Business. Per-seat pricing.
- **Pricing:**
  - Trial: free, 30 days, 1 user / 3 projects / 30 conv
  - Standard: RM 99/seat/mo monthly, RM 79/seat/mo annual; 50 WhatsApp conv/seat included
  - Business: RM 179/seat/mo monthly, RM 149/seat/mo annual; 100 WhatsApp conv/seat + white-label + API
- **Why:** Simpler to communicate; cost-grounded (71%/67% gross margin); aligns with monthly-overhead solo-founder operation.
- **Future Scale/Enterprise tier** added when first prospect with > 20 seats appears.
- **Revisit when:** ≥ 100 paying customers OR clear data on price sensitivity from sales calls.

---

## 2026-06-17 — Tech stack baseline (Firebase / GCP / Twilio)

**Decisions captured from [19-open-questions.md](./19-open-questions.md).** Updates [13-tech-architecture.md](./13-tech-architecture.md).

| # | Decision | Decided | Supersedes |
|---|---|---|---|
| D-001 | **BSP = Twilio** (Q15) | 2026-06-17 | n/a |
| D-002 | **Auth = Firebase Auth** (Q16) | 2026-06-17 | prior shortlist WorkOS/Clerk/Supabase |
| D-003 | **Primary DB = Firestore** (Q17, Q18) | 2026-06-17 | prior Postgres + Drizzle/Prisma plan |
| D-004 | **Primary region = `asia-southeast1` (Singapore)** (Q19) | 2026-06-17 | n/a |
| D-005 | **Single app, single repo (monorepo)** (Q20, Q21) | 2026-06-17 | prior split-app plan |
| D-006 | **Queue = GCP Cloud Tasks (+ Pub/Sub where async fan-out needed)** (Q22) | 2026-06-17 | prior Graphile/BullMQ |
| D-007 | **Bearer tokens for sessions** (Q23) | 2026-06-17 | n/a |

### D-001 — Twilio as BSP

- **Why:** Mature, single vendor for WhatsApp + SMS, strong docs and SDKs, less moving parts during early build.
- **Consequences:** Higher per-conversation cost than 360dialog/Wati; margin sensitivity at scale.
- **Mitigation:** Keep the `MessageProvider` interface clean so we can dual-route or migrate later.
- **Revisit when:** Monthly BSP cost > 25% of subscription revenue, OR a single customer drives > RM 1,000 / mo in messaging.

### D-002 — Firebase Auth

- **Why:** Pairs natively with Firestore + Firebase Hosting; supports email/password, magic link, phone OTP, social, custom claims. Cheap at our scale.
- **Consequences:** Enterprise SSO/SAML requires Identity Platform tier (paid). Vendor lock-in for sessions.
- **Revisit when:** First enterprise prospect needs SAML, OR auth becomes a real differentiator (it won't).

### D-003 — Firestore as primary DB

- **Why:** Pairs with Firebase Auth, native realtime listeners (no SSE plumbing), security-rules-based tenancy, schema flexibility good for variable template shapes, no DB ops.
- **Consequences (honest):**
  - − No joins. Denormalize or do app-layer composition.
  - − Aggregations (counts, dashboards) are expensive and slow at scale; plan to pre-aggregate via Cloud Functions on writes.
  - − Query flexibility limited; every non-trivial filter needs a composite index.
  - − Reporting/BI needs BigQuery export.
  - − Vendor lock-in is real (Firestore data is not portable to Postgres without a migration project).
- **Mitigation:**
  - Treat **data model as a first-class artifact** ([see open question below](#new-open-questions-2026-06-17)). Get it reviewed before sprint 1.
  - Pre-aggregate dashboard metrics via `onWrite` Cloud Functions; don't compute in queries.
  - Export to BigQuery from Day 1 for analytics.
- **Revisit when:** Aggregation costs > 15% of GCP spend, OR a dashboard requirement can't be modeled cleanly.

### D-004 — Region `asia-southeast1` (Singapore)

- **Why:** Best MY/SG latency available; closest PDPA-friendly region; same region for Firestore + Cloud Run + Cloud Storage + Cloud Tasks to avoid cross-region cost & latency.
- **Consequences:** All sub-processor DPAs must list GCP Singapore region; PDPA notice updated accordingly.

### D-005 — Single app, single repo (monorepo)

- **Why:** Faster to ship, shared TS types, one deploy pipeline. Solo founder builds for now — minimize moving parts.
- **Consequences:** Firm UI and Client Portal UI ship in the same bundle by default. Client devices download more than they need.
- **Mitigation:** Aggressive route-based code splitting; client portal routes are isolated bundles. Treat firm/client as **two products in one repo** — separate component trees, separate design tokens.
- **Revisit when:** Client portal bundle for a cold-load > 200 KB compressed, OR firm-side iteration speed is blocked by client-portal review.

### D-006 — Cloud Tasks (+ Pub/Sub)

- **Why:** Native to GCP, no Redis/cluster to operate, integrates with Cloud Run handlers, has retries + delivery guarantees out of the box.
- **Use Cloud Tasks for:** outbound WhatsApp/SMS sends, scheduled reminders, retry-with-backoff.
- **Use Pub/Sub for:** fan-out (one task event → many listeners: audit log, analytics, dashboard pre-aggregation).
- **Use Cloud Scheduler for:** cron (daily digests, due-date scans).

### D-007 — Bearer tokens

- **Why:** Firebase Auth issues JWT ID tokens; natural fit for bearer. Easier for the client portal (mobile WebView, magic-link landing) than cookie-based sessions.
- **Consequences:** Must rotate / short-TTL tokens; XSS exposure for tokens in localStorage is real.
- **Mitigation:** Store tokens in memory + use refresh tokens via Firebase SDK (handles rotation). Strict CSP. No third-party scripts on the client portal.

---

## 2026-06-17 — Product scope decisions

| # | Decision | From |
|---|---|---|
| D-008 | **Both client portal AND firm app are the deciding wedge** (Q2) — invest in firm UI as heavily as client UI | Q2 |
| D-009 | **Per-seat pricing** (not per-project) — simplify the pricing matrix (Q4) | Q4 |
| D-010 | **Concierge MVP finding: internal progress tracking + client access are the two daily-fire workflows** (Q8) | Q8 |
| D-011 | **Languages at launch: EN + BM** (Q9) — Mandarin deferred | Q9 |

<a id="d-011-related-supersession"></a>

> **Superseded by [D-026](#d-026--english-only-at-v1-bm-scaffolded-but-not-shipped) (2026-06-27):** BM UI deferred to v1.5; v1 ships English only. Mandarin remains deferred.
| D-012 | **No offline support in v1** (Q12) — re-evaluate when site-engineer usage data exists | Q12 |
| D-013 | **WhatsApp + SMS as the *only* client-facing notification channels in Phase 1** (Q13) — no client email | Q13 |
| D-014 | **Theming yes, white-label no in v1** (Q14) — firm can change logo + colors; custom domain ships in v1.5 | Q14 |

### Implications cascaded

- [11-mvp-scope.md](./11-mvp-scope.md): drop email-to-client; move theming to in-scope; keep white-label custom domain out
- [06-pricing-model.md](./06-pricing-model.md): collapse multi-dimensional tiers to per-seat + message overages; clients remain unlimited & free
- [04-product-strengths.md](./04-product-strengths.md): "two distinct UI personalities" remains, both surfaces are wedge-critical

---

## 2026-06-17 — Company & entity decisions

| # | Decision | From |
|---|---|---|
| D-015 | **Solo founder** for now (Q26) | Q26 |
| D-016 | **No legal entity yet** (Q25) — operate as sole-prop / personal capacity through discovery; incorporate before signing the first paid contract or accepting any grant money | Q25 |
| D-017 | **Founder-disputes process: N/A** (Q41) — replaced with solo-founder operating safeguards (see implications below) | Q41 |

### Implications cascaded

- [16-team-hiring-plan.md](./16-team-hiring-plan.md): rewrite "founding team" section; replace co-founder governance with **solo-founder mitigations** (advisors as substitute sparring partners; early "founding engineer with co-founder-level equity" path; key-person insurance once revenue starts)
- [15-financial-plan.md](./15-financial-plan.md): remove "2 founders deferred salary"; clarify single-person personal runway; entity-formation costs deferred until first paid contract
- [14-legal-compliance.md](./14-legal-compliance.md): add an explicit **"before first paid contract"** sub-checklist for entity incorporation (Sdn Bhd or similar)
- [18-risk-register.md](./18-risk-register.md): elevate **R10 (founder split)** to **R10' (single-founder key-person risk)** with new mitigations

---

## New open questions (2026-06-17)

Decisions above introduce questions worth tracking. Add to [19-open-questions.md](./19-open-questions.md):

- **Q44 — Firestore data model**: who reviews the document/collection design before sprint 1? (Owner: founder + first engineer.) 🚫 Blocker.
- **Q45 — Solo-founder advisory bench**: which 2–3 advisors substitute for a co-founder sparring partner? (Owner: founder.) ⚠️ Important by Month 3.
- **Q46 — "Founding engineer with co-founder-level equity"**: is that the hiring posture, or hire as senior IC? (Owner: founder.) ⚠️ Important by Month 2.
- **Q47 — Entity timing**: trigger event = first paid LOI, first grant application, or first PII collected from a non-design-partner client. (Owner: founder + counsel.) 🚫 Blocker for *Phase 1 launch*, not for build start.
- **Q48 — Confirm clients remain unlimited & free across all per-seat tiers** (the wedge depends on this). (Owner: founder.) 🚫 Blocker for pricing page.
- **Q49 — Transactional email vs "no email Phase 1"** — clarify Q13: no *client* email, but **firm-side transactional email (signup, password reset, invoice receipts, breach notices)** is still required. Pick a provider (Postmark / SendGrid / Resend / Firebase Extensions). (Owner: founder.) ⚠️ Important by build start.
- **Q50 — Search**: Firestore native is weak; do we need Algolia/Typesense at v1 for project/task search across a workspace? (Owner: first engineer.) ⚠️ Important by Month 3.

---

## How to add a new decision

1. Append entry at the top under today's date.
2. Reference the question number(s) it closes.
3. Note consequences honestly — especially the negative ones.
4. Add a "Revisit when" trigger.
5. Update affected docs in the same commit if possible; link them.
