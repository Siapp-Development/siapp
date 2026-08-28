# impl-138 — Project description, publish polish, tasks overflow menu, drop Milestones

Issue: Siapp-Development/siapp#138 · Surface: **firm app** (`dashboard.siapp.app`) only.

## Goal

Four small, related improvements to the firm **Projects** surface
(`apps/web/src/surfaces/firm/projects/`), all within MVP scope (#12 projects
CRUD/lifecycle, D-027 publish flow):

1. Add an optional free-text **`description`** to projects, shown on the projects
   list rows and the project detail header, and editable in `ProjectForm`.
2. Polish the existing **Publish** button/dialog: add a "publish" icon and enrich
   the confirmation copy so PMs understand the consequences (WhatsApp messages +
   est. cost, client gains portal access) — the D-027 preview mechanism is unchanged.
3. Add a **kebab (⋯) overflow menu** to the project detail/tasks header with
   *Mark as Completed*, *Archive Project*, *Copy client link*, reusing the exact
   role/lifecycle gating already used by `LifecycleActions` and `PortalLinkCard`.
4. **Remove the Milestones editor** from the Project Detail view (D-042 already
   dropped milestones from the client portal; they are no longer surfaced in the
   firm UI). Delete the web `milestones/` folder + its test. **Keep** milestone
   support in shared types / backend export / rules (still used by project export).

All changes are confined to the firm bundle + shared types + `firestore.rules`;
no client/collaborator/admin bundle is touched (D-036 bundle isolation preserved).

There is **no logged decision** for a project `description` field or a project
overflow menu; nothing here contradicts an existing decision. Milestone removal
is consistent with **D-042** (portal single-screen, milestones no longer shown).

---

## Touched surfaces & files

### Create
- `apps/web/src/surfaces/firm/projects/ProjectActionsMenu.tsx` — new kebab overflow menu.
- `apps/web/src/surfaces/firm/projects/ProjectActionsMenu.test.tsx` — menu tests.
- `apps/web/src/surfaces/firm/projects/projectLifecycle.ts` — extracted `LIFECYCLE_ACTIONS`
  map + error-message helpers (shared by `LifecycleActions` and the new menu so the
  gating is identical). *(Optional but recommended to avoid duplicating the gating map.)*

### Modify
- `packages/shared/src/firestoreTypes.ts` — add `description?: string` to `IProjectDoc`.
- `firestore.rules` — allowlist + validate `description` on project create/update.
- `apps/web/src/surfaces/firm/projects/useProjects.ts` — `IProjectRow.description`,
  `mapProject`, `IProjectFormValues.description`, `createProject`, `updateProject`.
- `apps/web/src/surfaces/firm/projects/ProjectForm.tsx` — description textarea field.
- `apps/web/src/surfaces/firm/projects/ProjectsListPage.tsx` — render description in row.
- `apps/web/src/surfaces/firm/projects/ProjectDetailPage.tsx` — render description under
  the title; mount `ProjectActionsMenu` in the header; remove `MilestonesEditor`
  import + render; consume extracted `projectLifecycle.ts`.
- `apps/web/src/surfaces/firm/projects/PublishProjectDialog.tsx` — add publish icon +
  enrich dialog body.

### Delete
- `apps/web/src/surfaces/firm/projects/milestones/MilestonesEditor.tsx`
- `apps/web/src/surfaces/firm/projects/milestones/MilestonesEditor.test.tsx`
- `apps/web/src/surfaces/firm/projects/milestones/useMilestones.ts`
  (whole `milestones/` folder). **Verify first** (`grep -r "milestones/"` under
  `apps/web/src`) that nothing else imports it — current analysis shows only
  `ProjectDetailPage.tsx` does.

### Tests to update
- `apps/web/src/surfaces/firm/projects/ProjectDetailPage.test.tsx`
- `apps/web/src/surfaces/firm/projects/ProjectsListPage.test.tsx`
- `apps/web/src/surfaces/firm/projects/PublishProjectDialog.test.tsx`

---

## Data model changes

**Field:** `description?: string` on `workspaces/{wid}/projects/{pid}`.
Optional, free text. Recommended max length **2000 chars** (matches milestone
`description`; task `description` is 5000 — pick one and mirror it in rules + the
`ProjectForm` client-side guard). Absent ⇒ treat as `''` in `mapProject`.

### `firestore.rules` (project match block ≈ lines 798–879)
1. Create allowlist `hasOnly([...])` (≈810–816): add `'description'`.
2. Update main-branch diff allowlist `hasOnly([...])` (≈847–851): add `'description'`.
   (Tags-only branch ≈868–877 stays as-is.)
3. `validProjectFields()` (≈314–330): add
   `(!('description' in d) || (d.description is string && d.description.size() <= 2000))`.

Multi-tenant isolation is unaffected — `description` is just another field inside the
already workspace-scoped, role-gated project doc; no new collection, no new read path.
The tags-only update branch must **not** be widened.

### `useProjects.ts`
- `IProjectRow`: add `description: string`.
- `mapProject`: `description: typeof data['description'] === 'string' ? data['description'] : ''`.
- `IProjectFormValues`: add `description: string`.
- `createProject`: include `...(values.description !== '' ? { description: values.description } : {})`.
- `updateProject`: `description: values.description !== '' ? values.description : deleteField()`.
  (`deleteField()` still counts as an affected key `description`, which the widened
  allowlist now permits.)

`IProjectDoc` in shared gains `description?: string` (line ~433, next to `name`).

---

## Steps (each independently verifiable)

**1. Shared type + rules (data foundation).**
- Add `description?: string` to `IProjectDoc`.
- Update the two allowlists + `validProjectFields()` in `firestore.rules`.
- Verify: `pnpm --filter @siapp/shared build` typechecks; rules tests still pass
  (add a rules test asserting a 2001-char description is rejected and a valid one
  accepted — see Test plan).

**2. Read/write plumbing (`useProjects.ts`).**
- Add `description` to `IProjectRow`, `mapProject`, `IProjectFormValues`,
  `createProject`, `updateProject`.
- Verify: typecheck; existing project tests compile.

**3. `ProjectForm` field.**
- Add a labelled **`<textarea id="project-description">`** ("Description (optional)")
  bound to a `description` state var seeded from `project?.description ?? prefill?.description ?? ''`.
  Use a plain textarea styled like the existing `<select>`s
  (`rounded-md border border-border bg-background px-3 py-2 text-sm`, ~3 rows) —
  `@siapp/ui` has **no Textarea primitive** and `Input` is single-line; do **not**
  add a shared primitive for this (scope). Include `description: description.trim()`
  in the submitted values, and a client-side length guard mirroring the rules limit.
- Verify: create + edit forms render the field and round-trip a value.

**4. Projects list row.**
- In `ProjectListItem` (`ProjectsListPage.tsx`), render the description under the
  title/status line when non-empty, muted and clamped
  (`<p className="mt-1 text-sm text-muted-foreground line-clamp-2">{project.description}</p>`).
- Verify: a project with a description shows it; one without renders nothing extra.

**5. Detail header description.**
- In `ProjectDetailPage.tsx`, under the `<h1>`/badge/publish row (after the
  tags block, ~line 258), render the description when non-empty (muted, e.g.
  `max-w-3xl text-sm text-muted-foreground`). This is the "detail/tasks header"
  because the header sits above all tabs.
- Verify: description appears on the detail page header regardless of active tab.

**6. Publish icon + enriched dialog (`PublishProjectDialog.tsx`).**
- Import `Send` from `lucide-react` (the repo's icon library; same named-import
  pattern as `Plus` in `ProjectsListPage.tsx`). Render it inside the button before
  the label: `<Send className="h-4 w-4" aria-hidden />` `Publish`.
  *(Alternate icons available: `Megaphone`, `Rocket`, `Upload` — see open questions.)*
- Enrich the `ConfirmDialog` body (keep the existing dry-run preview line intact so
  its assertion still works) by adding a short explanatory list of what publish does:
  - the client gains access to the project portal,
  - a welcome + task WhatsApp notifications are sent,
  - the existing dynamic line: `N WhatsApp message(s) will be sent — est. RM X.XX`
    (or "No WhatsApp messages will be sent"),
  - note that publishing can't be undone (only Complete/Archive/Delete afterwards).
  Keep copy static except the preview line, which stays driven by
  `preview.waCount` / `preview.estimatedCostMyr`.
- Verify: button shows an icon (`aria-hidden` svg); dialog explains consequences;
  dry-run + confirm flow unchanged.

**7. Extract lifecycle gating (`projectLifecycle.ts`).**
- Move `LIFECYCLE_ACTIONS`, `PROJECT_ERROR_MESSAGES`, `lifecycleErrorMessage` out of
  `ProjectDetailPage.tsx` into `projectLifecycle.ts`; import them back into
  `LifecycleActions` (unchanged behaviour) and the new menu. This guarantees the
  menu's gating is *identical* to the Details-tab buttons.
- Verify: `LifecycleActions` behaves exactly as before (existing tests pass).

**8. `ProjectActionsMenu.tsx` (kebab overflow menu).**
- Props: `{ workspaceId, project: IProjectRow, role: TMemberRole }`.
- Trigger: icon button with `MoreVertical` from `lucide-react`,
  `aria-haspopup="menu"`, `aria-expanded`, `aria-label="Project actions"`.
- Use the existing **`Popover`** primitive (`@siapp/ui`) for open/close, outside
  pointer-down dismissal, Escape, and focus restore. Layer **menu semantics** the
  Popover doesn't provide: panel `role="menu"`, items `role="menuitem"` buttons,
  ArrowDown/ArrowUp/Home/End roving focus, focus the first item on open. (Popover
  already handles Escape + outside click + return focus to trigger.)
- Menu items, gated exactly like the current buttons/card:
  - **Mark as Completed** — shown only when the `'complete'` action is available for
    `project.lifecycle`+`role` per `LIFECYCLE_ACTIONS` (i.e. published, owner/admin/pm).
    On click, call `setProjectLifecycle({ workspaceId, projectId, action: 'complete' })`.
  - **Archive Project** — shown when `'archive'` is available
    (published → owner/admin; completed → owner/admin/pm). Calls
    `setProjectLifecycle({ ..., action: 'archive' })`.
  - **Copy client link** — shown when `PortalLinkCard`'s conditions hold: role in
    owner/admin/pm **and** `lifecycle in {published, completed}` **and** `clientId !== ''`.
    On click, call `issuePortalLink({ workspaceId, projectId })` (from `@/lib/callables`)
    and `navigator.clipboard.writeText(url)`; show a transient `role="status"`
    confirmation and fall back to displaying the URL if clipboard is denied — mirror
    `PortalLinkCard.issue(false)`. **Note:** issuing rotates the link (invalidates
    prior links) — same semantics as the card's "Copy portal link".
  - If **no** items are available for the current lifecycle/role, render nothing
    (no empty kebab).
- Reuse the same error mapping (`lifecycleErrorMessage`) for lifecycle actions; show
  errors inline (e.g. an `Alert` near the trigger). Match current behaviour: complete
  and archive run immediately (no extra confirm), consistent with `LifecycleActions`.
- Mount in the `ProjectDetailPage` header row (next to `LifecycleBadge` /
  `PublishProjectDialog`, ~line 243) so it's visible on the default Tasks tab.
- Verify: menu opens with keyboard, items reflect gating, actions call the right
  callables, closes/return-focus works.

**9. Remove Milestones from Detail.**
- Delete the `MilestonesEditor` import (line 23) and its render (line 414) in
  `ProjectDetailPage.tsx`.
- Delete the `milestones/` folder (component, hook, test) after confirming no other
  web importer. **Do not** touch `IMilestoneDoc` (shared), `exportProject.ts`
  (backend), or the `match /milestones/{mid}` rules — project export still uses them.
- Verify: detail page renders without milestones; `grep milestone apps/web/src`
  returns nothing.

---

## Test plan (for Tester)

**Rules tests** (firestore rules suite):
- Accept a project create/update with a valid `description` (owner/admin/pm).
- Reject a `description` over the max length (e.g. 2001 chars).
- Reject a non-string `description`.
- Confirm the **tags-only** update branch still rejects a `description` change (must
  not be widened).

**`useProjects` / mapping:** `mapProject` returns `''` for a missing `description`
and the string when present; `createProject` omits the field when empty and includes
it when set; `updateProject` emits `deleteField()` when cleared.

**`ProjectForm.test`** *(add if not present, else extend the ProjectsList create test):*
description entered → present in submitted `values`. Note the ProjectsListPage
create-draft test asserts the `createProject` args — if it uses an exact object,
update it to include `description: ''` (or switch to `objectContaining`).

**`ProjectsListPage.test.tsx`:** add a row-render assertion that a project's
`description` text appears; a project without one renders no description node. Update
the `useProjects` mock rows to include `description`.

**`ProjectDetailPage.test.tsx`:**
- Add: description renders in the header when set.
- Add: overflow menu — for a published project as owner, opening the kebab shows
  *Mark as Completed*, *Archive Project*, *Copy client link*; as a pm on published,
  *Archive Project* is hidden (owner/admin only); a draft project with no client
  shows no *Copy client link*. Clicking *Mark as Completed* calls
  `setProjectLifecycle({... action:'complete'})`; *Copy client link* calls
  `issuePortalLink`.
- **Remove** any `MilestonesEditor` mock/assertion (the component no longer imports
  it). Update the section-component mock list accordingly.
- Keep existing publish dry-run/confirm + lifecycle-action + role-gating tests green.

**`PublishProjectDialog.test.tsx`:** keep the preview/zero/confirm/cancel/error/axe
tests. Add: the Publish button contains an icon (`aria-hidden` svg); the enriched
body mentions client access / messages. Keep the dynamic preview line assertion
(`3 WhatsApp messages … RM 1.50`) working — don't remove that line from the body.

**`ProjectActionsMenu.test.tsx`** (new): trigger has `aria-haspopup="menu"`;
opening focuses the first `menuitem`; ArrowDown/ArrowUp move focus; Escape closes and
restores focus to the trigger; items reflect lifecycle/role gating; axe clean.

**Delete** `milestones/MilestonesEditor.test.tsx` with the folder.

Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and the rules test suite.

---

## Out of scope

- Showing `description` in the **client portal**, **collaborator**, or **admin**
  surfaces (firm-only per this issue; portal is D-042 single-screen).
- Rich text / markdown for the description (plain text only).
- A reusable `DropdownMenu` or `Textarea` primitive in `@siapp/ui` (kept local to
  avoid scope creep; revisit if a second consumer appears).
- Any change to milestone **data**, **backend export**, or **rules** — only the firm
  UI editor is removed.
- New confirmation dialogs for Complete/Archive from the menu (parity with existing
  `LifecycleActions` which runs them immediately).
- Changing the publish server logic / cost model (D-027 preview mechanism unchanged).

---

## Risks / open questions

1. **Menu placement.** Recommended: the shared detail **header** (visible on the
   default Tasks tab and all tabs). The issue says "project tasks view." Confirm the
   header is acceptable, or restrict to the Tasks tab only. This also creates a second
   entry point for Complete/Archive alongside the Details-tab `LifecycleActions` — is
   that intended (recommended: yes, they reuse the same logic)?
2. **"Copy client link" rotates the link.** `issuePortalLink` mints a fresh link and
   invalidates previous ones every call (same as `PortalLinkCard`). Acceptable from a
   quick kebab action, or should the menu item deep-link to the Details tab's
   PortalLinkCard instead? Recommended: reuse `issuePortalLink` directly for a true
   one-click copy, with a visible "earlier links stop working" hint.
3. **Description max length.** Proposed **2000** (milestone precedent); task uses 5000.
   Confirm the limit — it must match between `firestore.rules` and the `ProjectForm`
   client guard.
4. **Publish icon choice.** Proposed **`Send`** (messages go out). Alternatives:
   `Megaphone`, `Rocket`, `Upload`. Confirm preference.
5. **No Textarea primitive.** Using a plain styled `<textarea>` in `ProjectForm`
   (consistent with the existing plain `<select>`s). OK, or add a `Textarea` to
   `@siapp/ui`? Recommended: keep local.
6. **Milestone deletion scope.** Deleting only the web `milestones/` folder; shared
   `IMilestoneDoc`, backend `exportProject`, and `match /milestones/{mid}` rules stay
   (project export still emits milestones). Confirm we are **not** also removing the
   export's milestones payload.
