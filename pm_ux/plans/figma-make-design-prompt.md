---
title: "Figma Make Design Prompt"
status: draft
updated: 2026-06-27
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
| **Internal (firm staff)** | Workspace dashboard, projects list, project detail (Kanban + timeline), task detail with collaborator assignment, clients list, collaborators list, settings (branding + message previews) |
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

1. INTERNAL (firm staff) — desktop-first, dense, keyboard-friendly, light mode default with dark mode support. Data-rich tables and Kanban boards. Sidebar nav.
2. CLIENT PORTAL — mobile-first, spacious, summary-first, warm light mode only. No nav clutter. The client is here briefly.
3. COLLABORATOR PAGE — mobile-first, single screen, large tap targets, no navigation at all. Worksite-friendly. One-handed use.

# Languages

v1 ships in **English only** (per D-026). Use realistic Malaysian names (Ahmad, Siti, Lim, Tan, Raj) and Malaysian context (KL addresses, MYR pricing, CIDB references for construction) — the localization signal carries through naming, currency, and templates, not UI strings. BM screen variants (C2 below, plus the BM iteration prompt) are kept in this doc as the v1.5 deliverable spec; **do not generate them in the v1 design pass**.

# Screens required

## A. Internal firm app (desktop, ~1440px)

A1. Workspace dashboard
- Sidebar (left): Projects, Clients, Collaborators, Settings
- Top bar: workspace switcher, search, user menu
- Main: 4 metric tiles (Active projects, Overdue tasks, This week's milestones, WhatsApp usage this month)
- Below: "Projects needing attention" list — 5 rows with project name, client, overdue count, last activity, status pill

A2. Projects list
- Sortable table: name, client, vertical (Construction/Legal), status, progress bar, due date, owner
- Filter chips at top: All / Active / Planning / On hold / Completed
- "+ New project" primary button top-right
- One row expanded showing a small inline summary

A3. Project detail — Kanban view
- Project header: name, client name, status, progress %, target date, "Open client portal" link button
- Tab bar: Board, Timeline, Documents, Activity, Settings
- Board view: 4 columns (To do, In progress, Blocked, Done) with task cards
- Task cards show: title, assignees (user avatar + collaborator icon mix), due date **if set** (omit the row entirely when absent — due date is optional), indicators for photo-required + approval-needed
- "+ Add task" at bottom of each column

A4. Project detail — Timeline view (same project, different tab)
- Gantt-style timeline grouped by phase
- Today line clearly marked
- Milestones called out as diamonds
- Overdue tasks in warm accent color

A5. Task detail (modal or side panel over Kanban)
- Title, description editable
- Status dropdown (To do, In progress, Blocked, Done)
- Due date picker (optional — empty state reads "No due date" with a subtle "+ Set due date" link)
- Assignees row: chips for internal users (with avatar + initials) and a separate chip area for the assigned collaborator (with phone icon + name + trade). Per business rule, a task has at most ONE collaborator but can have multiple internal users.
- Two "+ Assign" controls side by side:
  - "+ Assign teammate" → opens internal-user picker (searchable list of workspace members with avatar, name, role)
  - "+ Assign collaborator" → opens collaborator picker (see A5b)
- Toggles: Requires photo (default off), Requires firm approval (default off — opt-in for tasks where the PM wants to review before the client sees it / gets a WA), Visible to client
- **Restricted to (Departments)** — chip selector below the toggles. Default is **"All departments"** (empty array = no restriction). When one or more departments are picked (e.g. `Finance`, `Legal`), only members of those departments (plus owners/admins) can see the task's description, notes, documents, and activity. Non-authorized members still see the task header in lists/Kanban with a small colored "Restricted · Finance" badge. See [20-access-control-departments.md](./20-access-control-departments.md) and D-025.
  - Control is only visible to owner/admin/PM roles.
  - Selector hidden entirely until the workspace has at least one department defined (discoverability rule).
  - When the current viewer is **not** authorized, render the detail body as a single empty-state card: "This task contains restricted content visible to: Finance. Ask an admin for access if you need it." — do not silently hide.
- Notification preview banner when a collaborator is assigned: "Ahmad (Tiler) will receive a WhatsApp with a magic link to update this task. Cost: 1 WhatsApp conversation."
- Activity feed below: chronological updates from users, collaborators (with source label "via WhatsApp" or "via web"), and system events. Deleted documents render as a muted strikethrough row ("Ahmad deleted invoice.pdf · 1h ago").
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

A5d. Task card collaborator indicator (refinement of A3)
- On Kanban task cards, when a collaborator is assigned, show a small badge below the assignee avatars: phone-icon + collaborator first name + trade in muted text (e.g. "📱 Ahmad · Tiler")
- If the task has `pendingApproval: true` (collaborator marked done, awaiting PM sign-off), show an amber "Pending review" pill on the card
- If the task has `restrictedToDepartments` set, show a small department-colored "Restricted · <dept>" chip in the card header row. Non-authorized viewers see the chip but cannot open the task detail body.


A6. Clients list
- Table: name, company, phone, active projects count, last activity, language preference
- Row click opens client profile (out of scope for this generation)

A7. Collaborators list
- Table: name, trade/role, phone, company, active tasks count, last task date, status
- "+ Invite collaborator" primary button — opens form with name, phone, optional email, optional company, optional trade

A8. Settings — Branding
- Logo upload + primary color picker only. **MVP has a single tier — no custom domain, no advanced theming, no white-label toggle.** Do NOT render a custom-domain field, a "Business plan" badge, or a "Hide Siapp footer" toggle. See [D-030](./decisions-log.md).
- Live preview of client portal showing the branding applied. Preview must always include the "Powered by Siapp" footer.

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
- **Accessibility.** Cards are keyboard-navigable. The preview bubble has `aria-label="Sample WhatsApp message for [trigger name]"`. The language toggle is a tab pattern with `role="tablist"`.

## B. Client portal (mobile, 390px)

B1. Magic-link landing screen
- Firm's logo + name prominently (e.g. "Lim Builders")
- Welcome message in EN and BM toggle: "Welcome, Tan Sri Ahmad. Here's your project status."
- "Continue" button (no login, no password)
- Small "Powered by Siapp" footer — **always shown in MVP, no per-tier conditional** (D-030)

B2. Project status overview
- Project name, address, target completion date
- Big progress circle (e.g. 64%)
- "Next milestone" card — name, target date, status
- Recent updates list: 3-4 timestamped items in plain language ("Roof installation completed", "Tiling started in Unit 12")
- Tap any update → opens the message/photo
- Bottom: "Message on WhatsApp" button (opens the firm's WhatsApp deep link, pre-filled with the project reference). **There is no in-app chat in v1** — all two-way conversation happens in the client's existing WhatsApp.

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
2. Internal app screens (A1–A9, including the collaborator assignment sub-flows A5b, A5c, A5d)
3. Client portal screens (B1–B4)
4. Collaborator task page (C1; C2 deferred to v1.5 per D-026)
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

> On screen A3 (Kanban), redesign the task cards. Each card should clearly show: title (1-2 lines), assignee avatars (max 2 visible + count), a small icon for "collaborator assigned" if any assignee is external, due date if within 7 days (color-coded), and indicator dots for "requires photo" and "requires approval". Cards should be compact — aim for 80-100px tall.

### Add a dark mode pass

> Generate dark-mode variants of screens A1, A2, A3 only. Use a deep neutral background (not pure black), preserve the indigo brand color, adjust text contrast to WCAG AA. Do not produce dark mode for client portal or collaborator pages.

### Polish the client portal

> On screen B2, replace the progress circle with a horizontal progress bar at the top of the page that includes phase markers (e.g. "Foundation → Structure → MEP → Finishing → Handover"). Highlight the current phase. Keep everything else.

### Generate the BM version of internal screens *(v1.5 — do not run for v1)*

> Generate Bahasa Malaysia versions of screens A1 (dashboard) and A3 (project Kanban). Translate all UI strings and use realistic Malaysian project names. Keep layouts and components identical to the English versions.

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
