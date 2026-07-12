---
title: "MVP Scope"
status: draft
updated: 2026-07-12
---

# MVP Scope (v1)

The **minimum** product that lets the two design partners run real projects end-to-end and lets us collect a paying customer. Anything not on this list is v1.5 or later.

## Definition of v1 done

A new firm can, **without our help**:

1. Receive a Siapp-Admin-provisioned workspace (with a starter project seeded for their vertical), customize the starter project (in `draft`) and have it ready in < 1 hour.
2. Add their team and assign tasks while in `draft` — no notifications fire.
3. Add a client and a collaborator to the draft project.
4. Toggle WhatsApp notifications on specific tasks.
5. **Publish the project.** The client receives a welcome WhatsApp; pre-assigned collaborators receive their first task WhatsApp.
6. Subsequent task events fire WhatsApp per the per-task toggles.
7. The client visits the portal via the WhatsApp link and sees correct, current status.
8. Pay us in MYR.

If any of those steps requires a phone call to us, v1 isn't done.

## In scope — v1

### Firm app
- Sign-in (email + password, Google OAuth); workspace + first admin user provisioned by Siapp Admin during onboarding (no self-serve workspace creation in MVP)
- Roles: owner, admin, PM, viewer
- **Departments** (optional, hidden until first one is created) for need-to-know access to sensitive tasks/notes/docs (e.g. Finance, Legal) — see [20-access-control-departments.md](./20-access-control-departments.md)
- Invite team via email
- **Starter project + Duplicate** (D-031): Siapp Admin seeds **one** starter project per tenant during provisioning, pre-populated with task list + phases + dependencies for the firm's vertical (residential build or conveyancing). Subsequent projects are created via **Blank** or **Duplicate from existing** (copies task titles + order + phase grouping + dependencies + per-task visibility/department/WA toggles; clears assignees, dates, statuses, updates, documents, % complete). No customer-facing template authoring or template library in MVP.
- **Projects**: name, client, status, dates, % complete (computed from tasks)
- **Project lifecycle** (D-027): every project starts as `draft` and must be **published** before any outbound WhatsApp/SMS fires or any client/collaborator can access the portal/task page. Subsequent states: `completed`, `archived`, `deleted` (soft). Publish dialog shows the count and cost of WAs that will fire on transition. See [firestore-data-model.md](./firestore-data-model.md#project-lifecycle--notification-gate-d-027).
- **Tasks**: title, assignee, due date, status, notes (markdown), document attachments
- **Documents**: upload, list, basic preview (PDF, image, common Office files via in-browser viewer)
- **Notes** per task with @mentions
- **Notifications config**: per task, toggle on/off; choose trigger (status change, due-date approaching, blocked); choose recipients (client, internal). **All outbound is gated by `project.lifecycle = 'published'`** — during `draft`, events write a preview record but no message is sent.
- **Quiet hours**: workspace-level setting (default 21:00–08:00 Asia/Kuala_Lumpur); outbound WA queued during quiet hours dispatches at the next 08:00.
- **Client management**: add client (name, phone, email, language preference), assign to project
- **Activity log** per project (read-only timeline)
- **Dashboards**: my tasks, overdue, this week, project list with health
- English-only UI at v1 (localization deferred — see deferred list)
- Mobile-responsive web (PWA installable)

### Client portal
- Magic-link access (no password required for v1)
- Per-project page: project name, firm branding, **project start date + target date**, **timespan bar** showing elapsed vs remaining with a "today" marker (D-034), current phase, % complete, next milestone with date, recent updates feed, shared documents
- **Client document upload** (D-034): clients can upload files (PDF / image / DOCX up to 10 MB per file) into the project's shared documents. Uploads are always visible to the firm; firm-side activity feed records `client_document_uploaded` events.
- Mobile-first
- English-only at v1 (BM/EN auto-detect + user override deferred)
- Footer: "Powered by Siapp" (free + Team tiers) or firm-branded (Business+)

### Messaging
- **WhatsApp** via BSP (start with one; abstract for future swap)
  - Outbound templated messages, approved by Meta
  - Variables auto-filled from task/project
  - Delivery + read receipts logged
  - Inbound replies attach to the task's note thread
- **SMS fallback** for clients who haven't opted in to WhatsApp
- **No email notifications in MVP** — WhatsApp + SMS only (aligned with Q13). Auth/magic-link, team invites, and founder-issued billing emails are operational and stay.

### Billing (manual at MVP — D-019)
- **No Stripe / FPX integration in MVP.** Customers pay founder directly via FPX bank transfer or invoice link.
- MYR pricing, three tiers: **Trial** (30d free) → **Standard** (RM 79/seat annual) → **Business** (RM 149/seat annual)
- Trial: self-serve signup, auto-expires to read-only after 30 days
- Upgrade: customer emails/replies → founder issues invoice → on payment, admin panel one-click upgrade
- In-app overage forecast for WhatsApp messaging (banner at 70%, WhatsApp DM to workspace owner at 90%)
- Future migration to Stripe + FPX gateway when ≥ 20 customers or > 4 hrs/week billing admin

### Admin & ops
- Audit log (per workspace)
- Data export (per project, JSON + CSV)
- **Admin panel (founder-only) — critical for manual billing:**
  - Workspace list: plan, seats, MRR, expiry, last activity
  - One-click plan change (Trial → Standard → Business)
  - One-click seat count + renewal date adjustment
  - Impersonate user (for support)
  - Audit log of all admin actions

### Non-functional
- PDPA-aligned data handling (consent capture, deletion request endpoint)
- Backups + point-in-time restore for DB
- Uptime monitoring + status page
- Sentry-style error tracking

## Out of scope — explicitly deferred

| Feature | Why deferred | Earliest reconsidered |
|---|---|---|
| Native iOS/Android apps | PWA is enough | After v1.5 retention proven |
| Custom template authoring UI | Use Siapp-Admin starter project + firm Duplicate first (D-031) | v2 |
| Time tracking & billing | Different product surface | v2 (or integrate) |
| Gantt charts & resource planning | Procore territory | Never (out of scope as product) |
| E-signature | Integrate (DocuSign/Hellosign) when asked | v1.5 |
| Accounting integration (SQL Account, AutoCount) | High value but slow build; partner first | v2 |
| White-label custom domains | Wait for Business tier traction | v1.5 |
| SSO (SAML) | Enterprise-only | v2 |
| API for external developers | Premature | v2 |
| AI features (drafting messages, summarizing) | Cool, not the wedge | After v1 launched |
| Chinese / Tamil / Bahasa Indonesia UI | Stage by market | Per geo expansion |
| In-app chat between firm and client | Could replace WhatsApp for some; don't compete with the channel | Re-evaluate Year 2 |
| Multi-workspace per firm | Most SME firms don't need it | When asked by 3 paying customers |
| Public template marketplace | Defer template authoring UI first; revisit when paying customers ask (D-031) | v2 |
| Bahasa Malaysia UI (firm app + client portal) | Ship English-only first to cut scope; design partners are EN-comfortable | v1.5, before broader MY GTM push |

## Starter projects at v1 launch (Siapp-Admin provisioning seeds, D-031)

Two internal seeds, hardcoded in the provisioning script and run by Siapp Admin when a new tenant is created. **Not** exposed as a customer-facing template library.

1. **Residential build (MY) — design + build, 9–18 months**
   - Phases: Design → Approvals (BPlan, CFO) → Site prep → Structural → MEP → Finishing → Handover
   - ~60 tasks, default per-task visibility / department / WA toggles set; assignees + dates left blank for the firm to fill in.
2. **Property conveyancing (MY) — buyer-side, ~3–6 months**
   - Phases: Engagement → Title search → SPA → Loan → Stamp duty → Transfer → Vacant possession
   - ~30 tasks, same scaffold approach.

Three more seeds added by month 9: commercial fit-out, residential renovation, civil litigation (MY). All remain internal — firms only see them as a pre-populated starter project after provisioning.

## Tech preconditions (decisions that must land before sprint 1)

- See [tech architecture](./13-tech-architecture.md). Open until that's accepted.
- WhatsApp BSP chosen and sandbox account live (Twilio per D-001).
- Business bank account (Maybank/CIMB) ready to receive FPX transfers — for manual billing (D-019).
- Domain + email infra (Postmark/SES) live.

## Scope-cut rules during build

If we run hot on schedule, cut in this order:
1. SMS fallback (keep WhatsApp).
2. GrabPay (keep FPX + card).
3. Document preview (keep upload + download).
4. Activity log UI (keep DB writes; ship UI v1.5).
5. Second provisioning seed (launch with residential build only; conveyancing goes v1.5).

Do **not** cut:
- The client portal (it's the wedge).
- WhatsApp notifications (it's the channel advantage).
- Audit log writes (PDPA risk).

Localization (BM) is **already deferred** to v1.5 — do not pull it back in to v1 even if schedule allows.

## Success criteria for v1 launch

- Two design partners running 100% of their new projects in Siapp
- Self-serve signup → first WhatsApp sent < 24h for ≥ 5 cold signups
- Logo retention ≥ 90% over first 3 months
- Median time-to-first-project < 1 hour for new signups
- < 1 P1 incident / month during first 3 months
