---
title: "Figma Make Design Prompt"
status: draft
updated: 2026-07-12
---

# Figma Make Design Prompt

A single, paste-ready prompt for [Figma Make](https://www.figma.com/make/) to generate a high-level experience for Siapp covering the three actors: **internal firm staff, clients, collaborators**. Admin/founder screens are intentionally excluded — they are tracked separately.

## How to use this

1. Open Figma Make.
2. Paste the prompt in the [Full prompt](#full-prompt) section below.
3. After the first generation, use the follow-up prompts in [Iteration prompts](#iteration-prompts) to refine specific screens.
4. Export the screens into a Figma file for the engineer to reference during Sprint A.

## What the prompt produces (intent)

| Surface | Screens |
|---|---|
| **Internal (firm staff)** | Workspace dashboard, projects list, project detail (timeline), task detail with collaborator assignment, clients list, collaborators list, settings (branding + message previews) |
| **Client portal** | Magic-link landing, project status overview (mobile-first), milestone view, message thread |
| **Collaborator** | Single-screen task page (status buttons, ETA picker, photo upload, doc upload, notes, activity stream) |

## Design principles encoded in the prompt

- Two distinct UI personalities: dense + neutral for firms, spacious + warm for clients/collaborators
- Mobile-first for client and collaborator screens; desktop-first for firm
- Light mode default everywhere; dark mode supported on firm app only
- English only at v1 (BM screens deferred to v1.5 per D-026 — the BM iteration prompt below remains available for the v1.5 cycle)
- WhatsApp-native feel for collaborator screen
- No marketing fluff, no isometric illustrations, no stock photos

---

## Full prompt

> Copy from `---START---` to `---END---` and paste into Figma Make.

```
---START---

Design a high-fidelity, multi-screen experience for "Siapp" — a project management SaaS for small and mid-sized firms in Southeast Asia (Malaysia first), specifically construction contractors and law firms. The product's wedge is built-in client visibility: every project has a client portal and external collaborators (subcontractors, vendors) update progress via WhatsApp + a magic-link single-screen page.

# Brand

- Product name: Siapp (pronounced *syap*; from Malay *siap* = "done, ready" + *app*)
- Domain: siapp.app (primary — product + marketing), siapp.my (local)
- Tone: calm, confident, local, professional. Direct, no jargon. The brand celebrates the small satisfaction of finishing a task — quietly, not loudly.
- Logo: wordmark "Siapp" leaning into the double-P (read as twin checkmarks, twin pillars, or two "siap stamps"). Mark must survive at 16px on WhatsApp avatars.
- Primary color: deep indigo / slate blue (e.g. #1E2A52)
- Accent color: warm terracotta or amber, used sparingly for status (#D97A3C)
- Neutrals: high-contrast greys for firm UI; softer warm-greys for client/collaborator UI
- Typography: Inter (or similar grotesque). Headlines slightly heavier weight, no second face.
- Iconography: single-stroke, simple. No 3D, no isometric illustrations.
- Photography: avoid stock photos entirely

# Three distinct UI personalities

1. INTERNAL (firm staff) — desktop-first, dense, keyboard-friendly, light mode default with dark mode support. Data-rich tables and project timelines. Sidebar nav.
2. CLIENT PORTAL — mobile-first, spacious, summary-first, warm light mode only. No nav clutter. The client is here briefly.
3. COLLABORATOR PAGE — mobile-first, single screen, large tap targets, no navigation at all. Worksite-friendly. One-handed use.

# Languages

v1 ships in **English only** (per D-026). Use realistic Malaysian names (Ahmad, Siti, Lim, Tan, Raj) and Malaysian context (KL addresses, MYR pricing, CIDB references for construction) — the localization signal carries through naming, currency, and templates, not UI strings. BM screen variants (C2 below, plus the BM iteration prompt) are kept in this doc as the v1.5 deliverable spec; **do not generate them in the v1 design pass**.

# Screens required

## A. Internal firm app (desktop, ~1440px)

**Firm left-rail nav (identical across every A-screen).** Order: **Home · Projects · Clients · Collaborators · Messaging · Settings**. Do not render a **Templates** item (Templates are Siapp-admin only per [D-031](./decisions-log.md)) and do not render a **WhatsApp** item (renamed to **Messaging** in the 2026-07-12 wireframe-review pass — the category survives if SMS is added later).

A1. Workspace dashboard
- Sidebar (left): Home, Projects, Clients, Collaborators, Messaging, Settings
- Top bar: workspace switcher, search, **primary `+ New project` CTA (right of search)**, user menu — the CTA must be the visually dominant control on the screen. This is a Day-1 success metric ("Firm productive in < 1 hour").
- Main: 4 metric tiles (Active projects, Overdue tasks, This week's milestones, WhatsApp usage this month)
- Below: "**Needs your attention**" list with a one-line subtitle *"Only rows that need a decision (overdue, unpublished draft, blocked). Full list on Projects."* — rows have project name, client, overdue count, last activity, status pill. Never include zero-overdue / clean rows here — those live on A2.

A2. Projects list
- Page subtitle: *"Firm project inventory. All lifecycles; filter with the chips. See Home for the action-oriented view."*
- Sortable table: name, client, vertical (Construction/Legal), status, progress bar, due date, owner
- Filter chips at top: All / Active / Planning / On hold / Completed
- "+ New project" primary button top-right (matches the header CTA on A1)
- One row expanded showing a small inline summary

A3. Project detail — Timeline (only project-board view)
- Project header: name, client name, status, progress %, start date, target date, "Open client portal" link button
- Tab bar: **Timeline** (default and only board view), Documents, Activity, Settings. **No "Board" tab and no Kanban view** — removed in [D-033](./decisions-log.md).
- Timeline body: Gantt-style rows grouped by phase; a vertical "today" line; milestones rendered as diamond markers; overdue task bars in the warm accent color.
- **Timeline header controls (added in 2026-07-12 review pass):**
  - `→ Today` pill that scrolls the viewport to the today line (essential on 18-month residential builds).
  - `Jump to milestone ▾` secondary link that opens a lightweight popover listing milestones — selecting one scrolls the timeline to that diamond.
- Each phase-row header carries a `▾` collapse chevron. Collapsed phases render as a single one-line summary ("Site prep · 2 tasks · done · click ▾ to expand") and free vertical space for phases that still need attention.
- Task rows show: title, assignees (user avatars + collaborator icon mix), due date if set, restrict-to-departments chip when set, collaborator badge when assigned. **No `P` (photo) or `A` (approval) indicator** — those toggles were removed in [D-032](./decisions-log.md).
- Clicking a task row opens the task detail side panel (A5).
- "+ Add task" affordance in each phase row header.

A5. Task detail (side panel over timeline)
- **Drawer top:** a `Details · Activity` tab pair (two-tab pattern). Default is Details. The Activity feed no longer runs inline at the bottom — it lives on the Activity tab so a long form doesn't push it below the fold.
- Title, description editable
- Status dropdown (To do, In progress, Blocked, Done)
- Due date picker (optional — empty state reads "No due date" with a subtle "+ Set due date" link)
- Assignees row: chips for internal users (with avatar + initials) and a separate chip area for the assigned collaborator (with phone icon + name + trade). Per business rule, a task has at most ONE collaborator but can have multiple internal users.
- Two "+ Assign" controls side by side:
  - "+ Assign teammate" → opens internal-user picker (searchable list of workspace members with avatar, name, role)
  - "+ Assign collaborator" → opens collaborator picker (see A5b)
- **Sharing & access** — group the following two fields under a single **"Sharing & access"** section header (renamed from the generic "Settings" in the 2026-07-12 review pass) with a subtle group frame:
  - Toggle: **Visible to client** (single toggle). The former `Requires photo` and `Requires firm approval` toggles were removed in [D-032](./decisions-log.md) — do not render them.
  - **Restricted to (Departments)** — chip selector. Default is **"All departments"** (empty array = no restriction). When one or more departments are picked (e.g. `Finance`, `Legal`), only members of those departments (plus owners/admins) can see the task's description, notes, documents, and activity. Non-authorized members still see the task header in lists/timeline with a small colored "Restricted · Finance" badge. See [20-access-control-departments.md](./20-access-control-departments.md) and D-025.
    - Control is only visible to owner/admin/PM roles.
    - Default copy: "Pick one or more departments" — the selector is always visible when the viewer has permission; the seed vertical template (D-025) creates 5 departments at onboarding so this control is populated from day 1.
    - When the current viewer is **not** authorized, render the detail body as a single empty-state card: "This task contains restricted content visible to: Finance. Ask an admin for access if you need it." — do not silently hide.
- Notification preview banner when a collaborator is assigned: "Ahmad (Tiler) will receive a WhatsApp with a magic link to update this task. Cost: 1 WhatsApp conversation."
- Activity feed (on the **Activity** tab): chronological updates from users, collaborators, clients (document uploads), and system events. Collaborator and client entries all arrive via their web surfaces — **do not render a "via WhatsApp" source label** (inbound WA is not processed at MVP per [D-035](./decisions-log.md)). Deleted documents render as a muted strikethrough row ("Ahmad deleted invoice.pdf · 1h ago").
- Right column: attached photos thumbnails + documents list

A5b. Collaborator picker (modal launched from A5)
- Modal title: "Assign collaborator"
- Search field at top: search by name, phone, trade, or company
- Two tabs: "Recent" (collaborators used in the last 30 days) and "All"
- List rows: avatar/initials, name, trade, company, phone (masked except last 4), last task date. Each row tappable to assign.
- Sticky bottom: "+ Add new collaborator" secondary button — switches modal to inline form (A5c)
- Empty state when no collaborators exist: friendly illustration + "Add your first collaborator" CTA

A5c. Inline "Add new collaborator" form (within A5b modal)
- Fields: Name (required), Phone (required, with country code selector defaulting to +60), Email (optional), Company (optional), Trade/Role (optional, with suggested chips: Electrician, Plumber, Tiler, Surveyor, Subcontractor, Vendor, Other)
- Primary button: "Add and assign" → creates collaborator AND assigns to current task
- Secondary button: "Cancel"
- Validation messages inline (e.g. invalid phone format)
- Info note: "Collaborators are free — they don't count toward your seat limit."

A5d. Task row collaborator indicator (refinement of A3 timeline)
- On the timeline task row, when a collaborator is assigned, show a small badge on the row: phone-icon + collaborator first name + trade in muted text (e.g. "📱 Ahmad · Tiler").
- If the task has `restrictedToDepartments` set, show a small department-colored "Restricted · <dept>" chip on the row. Non-authorized viewers see the chip but cannot open the task detail body.
- **No "Pending review" pill and no `P` / `A` indicators** — the underlying `pendingApproval`, `requiresPhoto`, and `requiresFirmApproval` fields were removed in [D-032](./decisions-log.md).


A6. Clients list
- Table: name, company, phone, active projects count, last activity, language preference
- **Phone strategy:** show the full number in cleartext (e.g. `+60 12 345 6789`). Do **not** partially mask (per the 2026-07-12 review — halfway masking is the worst of both worlds). Hovering a row reveals `Copy · Call · WhatsApp` actions on the phone cell. Small annotation under the table: *"Hover a row to reveal Copy / Call / WhatsApp actions on the phone cell."*
- Row click opens client profile (out of scope for this generation)

A7. Collaborators list
- Table: name, trade/role, phone, company, active tasks count, last task date, status
- **`Active / Idle` definition:** *Active* = at least one task completed in the last 60 days. *Idle* = no completed task in 60+ days. Threshold is configurable in Settings → Team. Render this as a small tooltip on the Status column header + a one-line footer note under the table.
- "+ Invite collaborator" primary button — opens form with name, phone, optional email, optional company, optional trade

A8. Settings — Branding
- Logo upload + primary color picker only. **MVP has a single tier — no custom domain, no advanced theming, no white-label toggle.** Do NOT render a custom-domain field, a "Business plan" badge, or a "Hide Siapp footer" toggle. See [D-030](./decisions-log.md).
- Live preview of client portal showing the branding applied. Preview must always include the "Powered by Siapp" footer.

A8b. Settings — Departments
- List of departments (seeded by the vertical template per D-025) with member counts and a `+ New department` primary button.
- Each row has a `Delete` affordance. Deletion must show a required-fallback modal: *"12 tasks are restricted to Finance. Where should they go?"* with two choices —
  - **Reassign to another department** (dropdown of remaining departments), or
  - **Revert affected tasks to All departments** (removes the restriction).
  Both paths are logged to audit. Never soft-delete a department without resolving the restricted-task attachments.

A9. Settings — Message previews (firm-facing, read-only)
- **What this screen is.** A read-only preview gallery so firm staff can see the exact wording their clients and collaborators will receive over WhatsApp. The Twilio Content Templates themselves (Meta approval state, category, SID, submission history) are managed by Siapp engineering on [Z3] Template registry — they do **not** appear here.
- **What this screen is NOT.** No status column (Approved / Pending / Rejected). No edit button. No "submit for approval" affordance. No raw `{{1}} {{2}}` placeholders shown to firms. Reason: template state is a Siapp-Meta relationship, not a firm action surface; surfacing it creates support load and a false sense of control.
- **Layout.** Settings sidebar (Branding, Departments, **Message previews** active, Quiet hours, Billing). Main pane:
  - Page heading "Message previews" + one-line subtitle: "Here's what your clients and collaborators see over WhatsApp."
  - Language toggle at top right: **EN** (active) | **BM** (greyed out, "Coming in v1.5" tooltip per D-026).
  - Grouped by trigger family:
    - **Project lifecycle** — Project welcome (on publish), Project completed (handover).
    - **Task events** — Task assigned, Task done, Task blocked / Need help.
    - **Milestones** — Milestone reached.
  - Each card shows:
    - Friendly name ("Task completed notification") — never the Twilio template name (`task_done_v1`).
    - One-line trigger description ("Sent to the client when a task with 'Visible to client' is marked done, after the project is published").
    - **Sample preview bubble** styled like a WhatsApp message, with sample variables filled in (e.g. "Hi Aisha, *Foundation pour* on The Vue Phase 2 - Unit 12 is now complete. Track progress: siapp.link/abc123"). Use realistic Malaysian sample data.
    - "Used by N tasks in this workspace" small grey footer link → opens a side panel listing which tasks have this notification toggled on.
- **Empty state.** If no tasks in the workspace have any notification toggled on, show a neutral notice at the top: "No tasks are set up to notify clients yet. Open a task to turn notifications on." (single call-to-action, links to A2.)
- **Available variables panel** (right rail on A9). List the variables firms can reference when reading a preview: `{client.first_name}`, `{client.full_name}`, `{project.title}`, `{project.due_date}`, `{firm.name}`, `{firm.wa_phone}`, `{task.title}`, `{link}`. Footer note: *"Meta approval lives in Siapp admin."* — keeps the A9 (firm-facing preview) vs Siapp-admin (Meta approval) boundary crisp.
- **Accessibility.** Cards are keyboard-navigable. The preview bubble has `aria-label="Sample WhatsApp message for [trigger name]"`. The language toggle is a tab pattern with `role="tablist"`.

## A-Bill. Settings — Billing & usage

Destination screen for the A2 "WhatsApp usage at 85% of plan" banner. Firm owner-only surface; PMs see a read-only version.

- **Sidebar:** Settings sidebar with **Billing** active. Same nav order as A8 / A8b / A9.
- **Trial banner** (top): *"Trial ends 26 Jul 2026 (14 days). No credit card required until then."*
- **Current plan card** (left, ~50% width): plan name ("Team"), price ("RM 199 / mo, billed monthly — SGD equivalent charged in-app"), included caps ("5 seats · 300 WA conversations / mo · unlimited collaborators"), `Change plan` secondary button.
- **Usage panel** (right, warm-accent warning background at ≥85% used): "WhatsApp usage this month" heading, current-over-limit reading ("255 / 300 conversations"), horizontal usage bar filled 85% in warm accent, projection line ("Projected month-end: 340 (13% over cap). Overage: RM 0.30 per WA."), primary `Upgrade to Business` button in indigo.
- **Invoice history:** table with columns Month | Amount (MYR) | Status pill (Paid = success color) | Download (PDF link). Show 3 most recent rows.
- **Payment method:** card row "•••• 4242 · expires 08/29 · Wei Ling Tan" + `Update or replace card` link.
- **Plan comparison:** two side-by-side plan cards (Team = current, Business = upgrade target). Business highlighted in the primary indigo tint. `Upgrade →` primary CTA on the Business card.

## A-Onb. Owner first-run onboarding

First screen a firm owner sees after tapping the welcome-email magic link (post-provision). Full-screen desktop overlay, dismissible.

- Top header bar: title *"Welcome to Siapp, Wei Ling"*, right-side `Skip` link.
- 4-step progress bar (~50% filled at step 2). Steps below the bar: **1** Confirm workspace details · **2** Invite your team · **3** Add your first client · **4** Explore your starter project. Steps 1 and 2 marked complete with a success-color circle + number; steps 3–4 muted.
- **Active step content (step 2 — Invite your team):**
  - Heading + subline: *"Add the people who'll manage projects with you. Collaborators (subcontractors, vendors) are free and added later per task."*
  - Two invite rows (email + role dropdown + department multi-select), plus `+ Add another teammate` link.
  - Helper: *"Everyone you invite receives a magic-link email — no password to remember on first login."*
- **Side panel — "What's already set up":** indigo-tinted card listing the 6 provisioning side-effects (workspace slug, 5 seeded departments, starter residential-build project with 60 tasks, WA templates approved EN, 14-day trial started, no card required).
- **Bottom action row:** `← Back` (secondary), `Skip step` (secondary), `Next →` (primary indigo).

## B. Client portal (mobile, 390px)

**Mobile safe areas (rule for all B and C screens):** reserve the top 44pt for the notch/status bar and the bottom 34pt for the home-indicator gesture region. Never place a tappable control inside those zones. Draw a dashed reservation on the frames when producing wireframe-fidelity artifacts.

B1. Magic-link landing screen
- Firm's logo + name prominently (e.g. "Lim Builders")
- Welcome message in EN and BM toggle: "Welcome, Tan Sri Ahmad. Here's your project status."
- "Continue" button (no login, no password)
- Small "Powered by Siapp" footer — **always shown in MVP, no per-tier conditional** (D-030)

**B1x. Magic-link expired / invalid (error state).**
- Same brand header as B1.
- Danger-tinted card in the center: heading *"This link has expired"* + body *"Client access links stay live for 30 days. Please open the latest WhatsApp from your firm and tap the newest link."*
- Primary CTA (WhatsApp green): `Open WhatsApp with <firm name>` — deep-links to the firm's WA business number.
- Secondary muted line: *"Something else? Reply on WhatsApp and your firm will send a fresh link."*
- "Powered by Siapp" footer.

B2. Project status overview
- Project name, address, **start date**, target completion date (both dates shown in the header, e.g. "Started 04 Mar 2026 → Target 30 Nov 2026").
- Big progress circle (e.g. 64%).
- **Timespan bar** (D-034): a horizontal bar spanning `startDate` → `targetDate`, with a labelled "today" marker showing the current position and small tick marks for phase transitions. Segment fill = elapsed time; empty = remaining. Give the client a single-glance answer to "how long is this project and where are we?".
- "Next milestone" card — name, target date, status.
- Recent updates list: 3-4 timestamped items in plain language ("Roof installation completed", "Tiling started in Unit 12"). Tap any update → opens the message/photo.
- **Documents** section (D-034):
  - Header row: "Documents" label + secondary "Upload" button (opens the device file picker).
  - Compact list showing the 3 most recent shared documents (firm-uploaded documents where `visibleToClient: true`, plus any documents the client uploaded themselves). Each row: file icon by mime type, name (truncated), size, uploader label ("You" for the client's own uploads; firm member name otherwise), timestamp. Tap opens the file.
  - "See all documents" text link below the list when there are more than 3.
  - Empty state: "No shared documents yet. Tap Upload to share a signed contract, ID copy, or payment proof."
  - Client uploads land in the project's documents collection with `uploaderType: 'client'` and are visible to the firm immediately. Cap: 10 MB per file. Accepted mime types: PDF, JPG/PNG, DOCX. Show inline validation for oversized or unsupported files.
- Bottom: "Message on WhatsApp" button (opens the firm's WhatsApp deep link, pre-filled with the project reference). **There is no in-app chat in v1** — all two-way conversation happens in the client's existing WhatsApp.

**B2x. Client portal — zero-state (fresh publish).**
- Same B2 chrome, but every dynamic surface is empty:
  - Timespan bar renders with the today marker pinned to the far left (0% elapsed); label reads *"0% complete · just started · <N> days to go"*.
  - Milestones card: dashed border, copy *"Your firm hasn't scheduled any milestones yet. You'll see them here as soon as they do."*
  - Documents section: dashed empty card *"No shared documents yet. Tap Upload to share a signed contract, ID copy, or payment proof."*
  - Updates feed collapsed to a single note *"Meanwhile, feel free to share signed docs below."*
- WhatsApp CTA remains sticky at the bottom.

**B2y. Documents upload failure states.**
- Three stacked error rows within the Documents section (each ~66pt tall, danger-tinted for hard failures / warning-tinted for soft):
  1. **Oversized (danger).** *"site_walkthrough.mp4 — 38 MB · exceeds 10 MB client cap (D-034). Compress the video or send it over WhatsApp instead."*
  2. **Unsupported mime (danger).** *"receipt.heic — Unsupported format. Accepted: PDF, JPG, PNG, DOCX. Convert to PDF or JPG and try again."*
  3. **Quarantined by virus scan (warning).** *"contract_signed.pdf — Under review by our virus scanner (usually < 1 min). We'll notify your firm once it clears."*
- Below the error rows, one successful row for contrast: *"payment_slip.pdf — You · 84 KB · Uploaded — visible to firm"* in success-green.
- Footer note: *"Errors clear inline; successful uploads move to the shared list."*

B3. Milestones view
- Vertical timeline of project milestones
- Completed = filled indigo, current = warm accent, upcoming = grey outline
- Each milestone: name, target date, completed date if done, brief note

B4. Updates feed (read-only)
- **Read-only** chronological scroll of all client-visible updates. Not a chat — the client cannot type or post here.
- Each update card: timestamp, "from firm" attribution, plain-language body, optional photo thumbnail (tappable for full-screen).
- Photos inline; documents shown as a tappable file row with name + size.
- English at v1 (BM added in v1.5 per D-026).
- Sticky bottom CTA: "Reply on WhatsApp" — deep-links to the firm's WhatsApp with the relevant update referenced. This is the only client-side input affordance in v1; in-app messaging is explicitly out of scope ([11-mvp-scope.md](./11-mvp-scope.md)).

**B4x. Updates feed — empty state.**
- Same chrome as B4 with a `‹ Back` link and "Updates" heading + `<project name> · read-only` subline.
- Center of the frame: dashed illustration placeholder + heading *"No updates yet"* + body *"When <firm name> shares progress here, you'll see the latest first — with photos and documents inline."* + muted line *"Ping them on WhatsApp any time."*
- Sticky bottom CTA remains: `Reply on WhatsApp` (WhatsApp green).

## C. Collaborator task page (mobile, 390px) — THE SINGLE SCREEN

C1. Task page after tapping WhatsApp link
ONE scrollable mobile screen. NO navigation, NO menus. Top to bottom:

- Header: firm's logo + name (e.g. "Lim Builders") — small. "Powered by Siapp" footer is always shown at the bottom of the page in MVP (D-030).
- Task title (large): "Install bathroom tiles, Unit 12"
- Subtitle: project name + location (e.g. "The Vue, Cyberjaya")
- Meta row: Due date | Assigned to (Ahmad, Tiler) | Status pill
- Divider
- STATUS section: 4 large tap-target buttons (min 56px tall) in a 2x2 or vertical stack — "Not started" / "In progress" (highlighted as current) / "Done" / "Need help"
- DELAY section: "New ETA (optional)" date picker, shown collapsed by default with a "Set new ETA" link that expands the picker. Empty submission is valid.
- PHOTOS section: "+ Add photo" button, plus 2 placeholder thumbnails of already-uploaded photos
- DOCUMENTS section: "Upload file" button, list of uploaded docs with name + uploader. For docs the **current collaborator** uploaded, show a small text-link "Delete" on the right of the row (only on their own uploads, only if not yet quarantined). All other rows are read-only.
- NOTE section: large textarea + "Send update" primary button (full width)
- Divider
- ACTIVITY section at bottom: chronological list of recent updates ("You: photo added · 2h ago", "Sarah (PM): Ready when you can start, thanks · 1d ago"). Show 3-4 entries.

Visual rules for C1:
- Generous vertical spacing
- Large body text (min 16px)
- Buttons span full width on mobile
- Status buttons use color: indigo for current selection, neutral outline for others
- Sections clearly separated by 1px divider in soft warm grey
- Sticky bottom action area is NOT required — page scrolls naturally

**C1d. Need help — reason field (revealed when the collaborator taps "Need help").**
- Selecting "Need help" **reveals a required reason field** on the same page; the firm is not notified until the reason is submitted.
- Reason field: label *"What's blocking you?"* + helper *"Required before the firm is notified."* + textarea prefilled with a placeholder example ("Tiles delivered short by 4 boxes.").
- Optional photo attach slot below the textarea (single square, "+ Photo" affordance).
- Two-button action row: `Cancel` (secondary, closes the reveal without sending), `Send Need help` (danger-red primary, disabled until textarea has content).
- Confirmation preview under the buttons: *"Next: your firm gets a WhatsApp with the reason. You'll see a reply here — no further action needed until then."*

**C1x. Collaborator magic-link expired.**
- Same brand header + "Powered by Siapp" footer as C1.
- Danger-tinted center card: heading *"This task link has expired"* + body *"Task links stay live for 24 hours after the firm sends them. WhatsApp your firm and ask them to resend — they can do it with one tap."*
- Primary CTA (WhatsApp green): `Message <firm name> on WhatsApp`.

C2. Same screen, Bahasa Malaysia version *(v1.5 deliverable per D-026 — skip for v1 generation)*
- "Pasang jubin bilik air, Unit 12"
- Status buttons: "Belum mula" / "Sedang berjalan" / "Selesai" / "Perlu bantuan"
- Note button: "Hantar kemas kini"

# Additional generation rules

- Use realistic data, never lorem ipsum. Project names like "The Vue Phase 2", "Conveyancing — 14 Jalan Maarof", "Renovation — Ampang Hilir".
- Use realistic Malaysian phone numbers (+60 12 345 6789 format).
- Date format DD MMM YYYY (e.g. 18 Jul 2026).
- Currency MYR (e.g. RM 199).
- Status pills, badges, and buttons follow a consistent style across all screens.
- Avoid generic SaaS clichés (no rocket icons, no high-fives, no abstract gradients).
- Show empty states for the projects list ("No projects yet — create your first one") and the activity feed.
- Show one error/warning state somewhere (e.g. "WhatsApp usage at 85% of plan").

# Deliverable structure in Figma

Organize the output as separate frames in this order:
1. Style tokens (color, typography, spacing, iconography reference)
2. Internal app screens (A1–A9, including the collaborator assignment sub-flows A5b, A5c, A5d, plus **A-Bill** billing/usage and **A-Onb** owner first-run onboarding). **A4 is intentionally omitted** — the timeline is now the A3 project board (D-033).
3. Client portal screens (B1–B4) and their empty/error variants (**B1x** magic-link expired, **B2x** zero-state, **B2y** upload failure, **B4x** empty updates feed)
4. Collaborator task page (C1) and its two revealed / error states (**C1d** Need-help reason, **C1x** magic-link expired). C2 deferred to v1.5 per D-026.
5. Component library (buttons, inputs, status pills, avatars, task cards, milestone cards, collaborator chip)

Use frame names that match the codes above so they can be referenced in engineering tickets.

---END---
```

## Iteration prompts

Use these as follow-up prompts after the initial generation to refine specific areas without regenerating everything.

### Tighten the collaborator page

> Refocus the collaborator task page (C1). Make the 4 status buttons larger and stack them vertically. Increase padding around the photo and document sections. Replace the "Send update" button text with the actual action label ("Post update"). Add a small "Powered by Siapp" link in the very bottom of the page in light grey, 12px.

### Refine the collaborator assignment flow

> Polish screens A5b and A5c (collaborator picker and inline add form). Requirements:
> - A5b: show 8 collaborator rows visible without scrolling. Each row has avatar (initials on coloured circle), name (medium weight), trade in muted text below, phone masked as "+60 12 •••• 6789", and a small chevron on the right.
> - Tabs "Recent" and "All" sit at the top inside the modal with a count badge (e.g. "Recent · 5").
> - A5c: form fields stacked vertically, generous spacing. Trade chips below the Trade input — tapping a chip fills the input.
> - When transitioning from A5b to A5c (user taps "+ Add new collaborator"), animate slide-left and add a back arrow at the modal top-left.
> - The cost preview banner ("Cost: 1 WhatsApp conversation") should appear after assignment completes, in the task detail (A5), not in the picker.

### Improve the project detail board

> On screen A3 (Timeline), refine the task rows. Each row should clearly show: title (1-2 lines), assignee avatars (max 2 visible + count), a small icon for "collaborator assigned" if any assignee is external, due date if within 7 days (color-coded), and a restricted-to-department chip when set. Rows should be compact — aim for a bar height of ~24-28px on the timeline with a hover expansion. **Do not add photo-required or approval-required indicators** — those fields were removed in D-032.

### Add a dark mode pass

> Generate dark-mode variants of screens A1, A2, A3 only. Use a deep neutral background (not pure black), preserve the indigo brand color, adjust text contrast to WCAG AA. Do not produce dark mode for client portal or collaborator pages.

### Polish the client portal

> On screen B2, replace the progress circle with a horizontal progress bar at the top of the page that includes phase markers (e.g. "Foundation → Structure → MEP → Finishing → Handover"). Highlight the current phase. Keep everything else.

### Generate the BM version of internal screens *(v1.5 — do not run for v1)*

> Generate Bahasa Malaysia versions of screens A1 (dashboard) and A3 (project timeline). Translate all UI strings and use realistic Malaysian project names. Keep layouts and components identical to the English versions.

## What NOT to ask Figma Make for

- Admin/founder dashboard — covered separately (intentional scope cut)
- Pricing page or marketing site — separate brief
- Email templates — Figma is the wrong tool; use plain HTML mockups
- WhatsApp message previews — Twilio sandbox is more accurate

## Handoff to engineering

After iteration, export each frame as PNG + the live Figma URL. Reference them in tickets by frame code (A1, A3, C1, etc.) so the engineer can map directly from spec → ticket → component.

Pair this with [firestore-data-model.md](./firestore-data-model.md) so the engineer has visual + data spec in hand on day one of Sprint A.

## Related documents

- [09-brand-identity.md](./09-brand-identity.md) — brand pillars, voice, visual direction
- [11-mvp-scope.md](./11-mvp-scope.md) — which features must appear in the MVP screens
- [firestore-data-model.md](./firestore-data-model.md) — backing data shape for every screen
