# impl-124 — Task Detail drawer → modal + standardize modal forms

GitHub issue: Siapp-Development/siapp #124
Surface: firm app only (`dashboard.siapp.app`). No client `/p`, collaborator `/t`, marketing, or admin code is touched.

## Goal

Convert the firm-app **Task Detail** from a right-side `Drawer` into a centered, ClickUp-inspired **modal**: a two-column layout on web (LEFT = form + attachments, RIGHT = Activity feed + composer), collapsing to a single-column **Details / Activity** tabbed layout on mobile within the *same* component. **The existing explicit `Save changes` button and its `handleSave` activity-log semantics are kept as-is (auto-save was investigated and dropped per user decision).** Move **Delete task** to an icon button at the top of the modal, and replace **Close** and the **attachment** action with accessible icon buttons. Finally, apply the same modal-based form pattern to **New Project**, **Clients**, and **Collaborators**. This is a UI-consistency/quality deliverable; there are no MVP-scope feature additions and no data-model changes. All work is inside the firm bundle, so surface/bundle isolation (D-036 URL surfaces / D-037 physical bundle isolation) is unaffected.

> **Decision-log note / flag:** Issue #124 cites "D-036 bundle isolation". In `pm_ux/plans/decisions-log.md`, **D-036** is actually the *URL-surface / subdomain* decision and **D-037** is *physical bundle isolation*. Neither is contradicted by this work (everything stays in `apps/web` firm surface). No logged decision governs modal-vs-drawer or task-detail UI, so nothing here overrides a binding decision. D-038 (design system lives in `packages/ui`) is respected by extending `Dialog` rather than hand-rolling a modal.

## Touched surfaces & files

### `packages/ui` (design system — additive, backward-compatible)
- **Modify** `packages/ui/src/components/Dialog.tsx` — add an optional `size` prop (`'sm' | 'lg'`, default `'sm'`). `'sm'` keeps today's `max-w-md`; `'lg'` yields a wide, height-capped shell for the 2-column task modal (e.g. `w-full max-w-4xl max-h-[90vh] overflow-hidden`). Default preserves every existing caller (`ConfirmDialog`, etc.).
- **Modify** `packages/ui/src/components/Button.tsx` — add a `size: 'icon'` variant to `buttonVariants` (`h-8 w-8 p-0 inline-flex items-center justify-center`). Additive cva key; no existing usage changes. This replaces the duplicated `ICON_BUTTON_CLASS` string literals currently in `ClientsListPage.tsx` and `CollaboratorsListPage.tsx` and standardizes the new icon buttons.
- **Modify** `packages/ui/src/index.ts` only if new types need re-export (none expected; `size` is already part of `IButtonProps` via cva, `IDialogProps` gains an optional field).

### Firm app — Task Detail
- **Modify** `apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.tsx` — the bulk of the work: new 2-column/responsive shell, header icon buttons (Delete/Close), optional auto-save engine + save-status indicator, snapshot-based activity diffing, `ConfirmDialog` for delete. (~885 lines today.)
- **Modify** `apps/web/src/surfaces/firm/projects/tasks/TasksSection.tsx` — replace the `<Drawer>` mount (~line 862) with `<Dialog size="lg" aria-label={…}>`. The restricted-task branch (lines ~868–888) also moves into the `Dialog` and its "Close" becomes an icon button. `onClose` prop wiring unchanged.
- **Modify** `apps/web/src/surfaces/firm/projects/documents/DocumentsSection.tsx` (`TaskAttachments`) — replace the text "Attach file"/"Download" controls with `Paperclip` / `Download` icon buttons carrying `aria-label`s. (Scope-limited to the attachment action referenced by #124 item 4; keep behavior identical.)

### Firm app — New Project modal
- **Modify** `apps/web/src/surfaces/firm/projects/ProjectsListPage.tsx` — wrap the existing inline `<Card>` create flow (lines ~155–275) in `<Dialog size="lg" aria-labelledby=…>`; `creating` becomes the modal `open` state, `openCreateCard()` opens it, `onClose` clears it. The Blank/Duplicate chooser + `ProjectForm` + duplicate `<select>` move inside unchanged. `ProjectForm` keeps its own explicit Cancel/submit footer (auto-save is **not** applied here — item 2 targets Task Detail only).

### Firm app — Clients + Collaborators modal (shared shell)
- **Rename + convert** `apps/web/src/surfaces/firm/clients/ContactDrawer.tsx` → `ContactModal.tsx`: render `<Dialog size="lg" aria-label={label}>` instead of `<Drawer>`, keep the same public props (`open, onClose, title, label, children`), header `<h2>` + `X` icon close button, scrollable body that mounts children only when `open`. Converting this one shell covers both consumers.
- **Modify** `apps/web/src/surfaces/firm/clients/ClientsListPage.tsx` (import ~:21, render ~:206) and `apps/web/src/surfaces/firm/collaborators/CollaboratorsListPage.tsx` (import ~:33, render ~:344) — update the import name/path to `ContactModal`. Props are unchanged. `ClientForm`/`CollaboratorForm` keep their explicit Save footers.

### Tests (co-located; see Test plan for specifics)
- `apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.test.tsx`
- `apps/web/src/surfaces/firm/projects/tasks/TasksSection.test.tsx`
- `apps/web/src/surfaces/firm/clients/ClientsListPage.test.tsx`
- `apps/web/src/surfaces/firm/collaborators/CollaboratorsListPage.test.tsx`
- `apps/web/src/surfaces/firm/projects/ProjectsListPage.test.tsx`
- `packages/ui/src/components/Dialog.test.tsx` (extend for the `size` prop)
- New: `packages/ui/src/components/Button.test.tsx` or extend existing Button test for the `icon` size (if a Button test exists).

## Data model changes

**None.** No Firestore collections or fields are added or changed. `updateTask` and `addTaskUpdate` in `useTasks.ts` are reused verbatim; the written field set is identical, so **firestore.rules require no changes** and multi-tenant workspace isolation is untouched. Auto-save simply calls the same `updateTask(workspaceId, projectId, taskId, values, wasDone, uid)` and `addTaskUpdate(...)` writers already validated by rules (`updatedBy == auth.uid`, append-only `updates`). Confirm during implementation that no new field enters the `updateTask` payload.

## Design approach — the two things #124 explicitly asks to nail

### A. The large 2-column modal + mobile-tab collapse in one component

- **Shell:** extend `Dialog` with `size="lg"` (chosen over a brand-new `ModalShell` to honor "prefer reusing/extending `Dialog`", D-038, and avoid new primitives/deps). Native `<dialog>` continues to provide focus trap, Escape, and focus restore for free.
- **Layout inside `TaskDetailPanel`:** a single DOM using Tailwind responsive classes — no separate mobile/desktop trees:
  - Header row (always visible): title + top-right icon buttons (Delete `Trash2`, Close `X`), plus a save-status indicator region.
  - A tablist (`role="tablist"` Details/Activity) rendered but `md:hidden` — only interactive on mobile.
  - Body wrapper: `grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]` (LEFT flexible = form + attachments; RIGHT fixed-ish = Activity).
  - **LEFT column** wrapper class: `cn('min-w-0', tab !== 'details' && 'hidden', 'md:block')`.
  - **RIGHT column** (Activity) wrapper class: `cn('min-w-0', tab !== 'activity' && 'hidden', 'md:block')`.
  - Net effect: on `md+` both columns always render (tabs hidden/ignored); on `<md` the `tab` state shows exactly one column and the tabs switch them. Scrolling: each column scrolls within the height-capped shell (`overflow-y-auto` per column, header sticky).
- The existing `ActivityFeed` sub-component moves into the RIGHT column unchanged (comment feed + `@mention` typeahead + markdown composer). The Details form + `CollabLinkButton` section + `TaskAttachments` move into the LEFT column.

### B. Save behavior — **explicit Save button retained (auto-save dropped)**

**Decision (user, 2026-08-24): do NOT implement auto-save. Keep the current explicit `Save changes` button and its existing `handleSave` logic unchanged.**

- The existing `handleSave` (diffing the form against the immutable `task` prop and appending `status_change` / `eta_change` / `assigned` activity entries) is **preserved verbatim**. No `lastPersistedRef`, no debounce engine, no save-status indicator.
- The `Save changes` button moves into the LEFT column of the new 2-column layout (in the details form footer), keeping the same wiring, `pending` state, and error `Alert`.
- The read-only (`!canEdit`) path is unchanged — render the existing read-only `<dl>`, no Save/Delete controls.
- This keeps `TaskDetailPanel.test.tsx`'s existing `Save changes` assertions valid, so those selectors do **not** break.

### C. Icon buttons (delete / close / attachment)

- **Delete task:** `Trash2` icon, `Button size="icon" variant="ghost"` (or destructive-tinted), `aria-label="Delete task"`, top-right of modal header. Clicking opens the shared **`ConfirmDialog`** (`variant="destructive"`, title "Delete this task?", description "Its activity history is removed too. This cannot be undone.", `confirmLabel="Delete task"`, `pending` bound to delete state) — replacing the current inline `Alert` confirm block (lines ~838–864). `onConfirm` → existing `handleDelete` → `deleteTask` callable → `onDeleted`.
- **Close:** `X` icon, `Button size="icon" variant="ghost"`, `aria-label="Close"`, calls `onClose`. Replaces the text "Close" button (line ~447) and the restricted-branch Close (~874).
- **Attachment action:** in `TaskAttachments`, the attach control becomes a `Paperclip` icon button `aria-label="Attach file"` (keeping the hidden file input + `data-testid="document-file-input"` intact), and per-file Download becomes a `Download` icon button `aria-label="Download"`. Icons come from `lucide-react` (already a dependency; `X`, `Trash2`, `Plus`, `Pencil` etc. already used across the firm surface). Every icon button has a text `aria-label` and remains keyboard-operable (native `<button>`).

## Steps (each independently verifiable)

1. **`packages/ui` Dialog `size` prop.** Add `size?: 'sm' | 'lg'` to `IDialogProps`; map to width/height classes via `cn`; default `'sm'` = current. Update `Dialog.test.tsx` to assert both sizes render and that default equals prior `max-w-md`. *Verify:* `pnpm --filter @siapp/ui test` green; existing `ConfirmDialog` snapshot/behavior unchanged.
2. **`packages/ui` Button `icon` size.** Add `size: 'icon'` cva variant. *Verify:* Button test renders an icon-sized button; typecheck passes.
3. **Convert `ContactDrawer` → `ContactModal`.** Swap `Drawer`→`Dialog size="lg"`, keep props/markup, keep `X` close (now `Button size="icon"`). Update imports in `ClientsListPage.tsx` and `CollaboratorsListPage.tsx`. *Verify:* both list pages compile; `ClientsListPage.test.tsx` / `CollaboratorsListPage.test.tsx` still find `role="dialog"` by `name` (native `<dialog>` + `aria-label` preserved). Update any test text that literally says "drawer".
4. **New Project → modal.** In `ProjectsListPage.tsx`, wrap the inline create flow in `Dialog size="lg"` with an `aria-labelledby` pointing at the "New project" heading; drive `open` from `creating`. *Verify:* `ProjectsListPage.test.tsx` — clicking "New project" opens a `dialog`; Blank/Duplicate + "Create draft" still work (add a `getByRole('dialog')` assertion).
5. **TasksSection mount swap.** Replace `<Drawer aria-label=…>` with `<Dialog size="lg" aria-label=…>`; move restricted-task branch inside; convert its Close to an icon button. *Verify:* `TasksSection.test.tsx` still asserts an open dialog named `Task: Second` after selecting a row (aria-label preserved) and stays open across reorder.
6. **TaskDetailPanel layout.** Introduce the 2-column responsive grid + `md:hidden` tablist; move ActivityFeed to RIGHT, form + `CollabLinkButton` + `TaskAttachments` + the existing `Save changes` footer to LEFT; header with title + Delete/Close icon buttons. *Verify:* renders both columns at `md+` (jsdom width assumptions noted), tabs switch on mobile, `Save changes` still works.
7. **Delete via ConfirmDialog.** Replace inline delete `Alert` with `ConfirmDialog`. *Verify:* `TaskDetailPanel.test.tsx` delete flow updated to open confirm and click destructive confirm.
8. **Attachment icon buttons.** Update `TaskAttachments` controls to icon buttons with aria-labels; preserve file input + testids. *Verify:* attachment tests query by new `aria-label`s (`Attach file`, `Download`).
9. **Full sweep.** Run build + lint + typecheck + all affected test files; run axe checks on the modal. *Verify:* Validator gate green.

## Test plan (Vitest + RTL + axe — for the Tester)

**Selectors that WILL break and must be updated:**
- `TaskDetailPanel.test.tsx`: `Save changes` selectors (~:127,151,167,244,277,302,316,340) **stay valid** (explicit Save is retained). Delete flow (~:363–368) must open `ConfirmDialog` and click its destructive confirm. Attachment queries `Attach file`/`Download` (~:468,496) become icon-button `aria-label` queries. Close-button query changes from text "Close" to `aria-label="Close"` icon button.
- `TasksSection.test.tsx`: `getByRole('dialog', {name:'Task: Second'})` (~:386) — keep working by preserving the `Dialog aria-label`; only wording of test names ("drawer") is cosmetic.
- `ClientsListPage.test.tsx`: `Save changes` (~:148) stays (forms keep explicit save); `role="dialog"` name `New client` (~:196) survives; rename "drawer" wording.
- `ProjectsListPage.test.tsx`: add `dialog` assertion around the create flow.

**New / expanded coverage:**
1. **Save unchanged:** existing `handleSave` activity-diff tests continue to pass (`status_change`/`eta_change`/`assigned` appended on Save) — verify they still hold after the layout move.
2. **Read-only (`!canEdit`):** no Delete/Save controls, read-only `<dl>` shown.
3. **Responsive/tab behavior:** tablist present and switches columns (mobile assumption); both columns present in DOM for desktop layout.
4. **Delete:** `ConfirmDialog` opens, destructive confirm calls `deleteTask` + `onDeleted`; cancel closes without deleting.
5. **A11y (axe):** modal has accessible name; Delete/Close/Attach/Download icon buttons expose aria-labels; no violations. Confirm Escape/focus-restore still work (native `<dialog>`).
6. **`Dialog.test.tsx`:** `size="lg"` renders wide shell; default unchanged. **Button:** `size="icon"` variant renders.
7. **ContactModal consumers:** Clients/Collaborators create+edit still open a named `dialog` and submit.

## Out of scope

- No auto-save for New Project / Client / Collaborator forms — they keep explicit Save (item 2 targets Task Detail only).
- No changes to Firestore schema, security rules, indexes, callables, or the notification backend.
- No changes to the append-only activity data shape, `useTasks` writers, or the `@mention`/markdown behavior of the comment composer.
- No redesign of the task *list/board* rows, filters, or DnD (#98) — only the detail surface.
- No deletion of the `Drawer` primitive (other surfaces may still use it); we only stop using it for these four flows.
- No new runtime dependencies (icons from existing `lucide-react`; debounce implemented inline/local hook, no lib).
- Client `/p`, collaborator `/t`, marketing apex, and `admin.siapp.app` surfaces are untouched.

## Risks / open questions

1. **Auto-save: RESOLVED — dropped.** User elected to keep the existing explicit `Save changes` button. No notification-timing change; `handleSave` semantics preserved verbatim.
2. **jsdom + responsive layout:** the two-column vs tab collapse relies on `md:` breakpoints; jsdom has no real viewport, so tests assert DOM presence/tab logic rather than computed layout. Visual correctness needs manual/de-facto verification.
3. **Rename `ContactDrawer`→`ContactModal`:** mechanical but touches two importers (+ any test referencing the file name). Alternative is keeping the filename to minimize churn; recommend renaming for clarity — confirm acceptable.
4. **`Dialog size="lg"` width for very wide content:** the sharing/notify fieldset is tall; ensure the height-capped shell scrolls per-column without clipping the sticky header. Tune `max-h`/`overflow` during implementation.
5. **Decision-ID mismatch in the issue** (D-036 vs D-037) — flagged above; no binding decision is contradicted, but confirm the reviewer is aware the isolation reference is D-037.
6. **Restricted-task branch** in `TasksSection` must render acceptably inside a centered `size="lg"` modal (it's a short message) — trivial, but confirm it doesn't look oversized; consider a `size="sm"` conditional for that branch.

---

### 5-line summary
- Extend `packages/ui` `Dialog` with a `size="lg"` variant (+ a `Button` `icon` size) and reuse it for all four flows instead of building a new primitive — honors D-038, no new deps.
- Rebuild `TaskDetailPanel` as a single responsive component: 2-column (form+attachments | activity) at `md+`, collapsing to the existing Details/Activity tabs below `md` via Tailwind `md:hidden`/`hidden` toggles.
- **Auto-save was investigated and dropped (user decision); the existing explicit `Save changes` button and `handleSave` diff semantics are kept verbatim.**
- Delete/Close/Attach/Download become accessible `lucide-react` icon buttons; delete confirms via the existing `ConfirmDialog`; New Project inline card and `ContactDrawer`→`ContactModal` (Clients+Collaborators) become `Dialog`-based modals keeping their explicit Save footers.
- No data-model or firestore.rules changes; the main test churn is the delete-confirm rewrite and icon-button/close `aria-label` selectors in `TaskDetailPanel.test.tsx`.

### Resolved decisions (user, 2026-08-24)
1. **Auto-save: dropped.** Keep the existing explicit `Save changes` button.
2. **Scope: the four named surfaces only** (Task Detail, New Project, Clients, Collaborators) — no additional surfaces.
3. **Rename `ContactDrawer` → `ContactModal`: approved.**
4. **Delete confirmation retained** on the new top icon button (via `ConfirmDialog`).
