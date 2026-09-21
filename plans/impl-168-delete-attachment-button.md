# Impl Plan — #168 Delete-attachment button (client portal + collaborator portal)

Issue: Siapp-Development/siapp#168
Status: DRAFT — needs product approval on the permission decision (see Open Questions)

## Goal

Let clients (on the `siapp.app/p/*` portal Documents section) and collaborators (on the
`siapp.app/t/*` Files list) remove attachments they uploaded, using the codebase's existing
**soft-delete** model (`deletedAt` / `deletedBy` / `deletedByType`; Storage bytes retained). Today
`firestore.rules` only lets firm owner/admin/pm soft-delete (`deletedByType == 'firm_member'`), so
this is a scoped extension of the `documents/{did}` `allow update` rule plus thin data hooks and UI
in the two surfaces. Ties to D-034 (client uploads + shared documents), D-042 (single-screen
portal), the collaborator upload work (#22/#127, "D-f"), and the soft-delete posture established in
#14. No new logged decision exists for "who may delete uploads" — this plan proposes one and flags
it for the decisions log (see Open Questions).

## Recommended product / permission decision (needs approval)

Clients and collaborators may soft-delete **only their own uploads**, never firm- or
peer-uploaded documents, never external Google-Drive link rows (D-043 links are firm-created only):

- **Client:** allowed when `resource.data.uploaderType == 'client'` **and**
  `resource.data.uploadedBy == request.auth.token.portal.cid`.
- **Collaborator:** allowed when `resource.data.uploaderType == 'collaborator'` **and**
  `resource.data.uploadedBy == request.auth.token.collab.colid`, and the collaborator is still
  assigned to the doc's task (`collabAssignedTaskAt(wid, pid, resource.data.scopeId)`).

> IMPORTANT CORRECTION to the issue text: the issue suggests gating on
> `uploadedBy == request.auth.uid`. That is **wrong for this codebase**. `uploadCollabDocument`
> writes `uploadedBy: collaboratorId` (the **colid**, not the anon auth uid) and
> `visibleToCollaboratorIds: [collaboratorId]`; `uploadPortalDocument` writes
> `uploadedBy: clientId` (the **cid**). `request.auth.uid` is the anonymous session uid
> (`portal_<wid>_<pid>_<cid>` / `collab_<wid>_<colid>`) and does **not** equal `uploadedBy`.
> The correct owner field is `uploadedBy == portal.cid` / `uploadedBy == collab.colid`.

New `deletedByType` values: `'client'` and `'collaborator'`. These already exist in the shared type
(`TUploaderType = 'firm_member' | 'collaborator' | 'client'`, used by
`IProjectDocumentBaseDoc.deletedByType?: TUploaderType`), so **no `packages/shared` change is
required**.

`deletedBy` for self-deletes is set to the principal's stable id (`cid` / `colid`) to mirror
`uploadedBy` and keep ownership traceable (the firm branch keeps `deletedBy == request.auth.uid`).

## Touched surfaces & files

Bundles stay isolated per D-036 — portal and collab code stay in their own surface folders; the only
shared artifact is `firestore.rules`.

Create: none (all edits to existing files).

Modify:
1. `firestore.rules` — `match /documents/{did}` `allow update` block (approx. lines 1120–1130).
2. `apps/web/src/surfaces/portal/documents/usePortalDocuments.ts` — add `uploadedBy` to
   `IPortalDocument` + mapper; add `softDeletePortalDocument(...)`.
3. `apps/web/src/surfaces/portal/sections/PortalDocumentsSection.tsx` — delete button + confirm UX
   for own file rows.
4. `apps/web/src/surfaces/collab/useCollabTask.ts` — add `uploadedBy` to `ICollabDocument` + mapper;
   add `softDeleteCollabDocument(...)`.
5. `apps/web/src/surfaces/collab/CollabUploader.tsx` — delete button + confirm UX for own file rows.

Tests:
6. `backend/rules-tests/src/documents.test.ts` — new allow/deny cases for client + collaborator
   self-delete.
7. `apps/web/src/surfaces/portal/sections/PortalDocumentsSection.test.tsx` — button visibility +
   interaction.
8. `apps/web/src/surfaces/collab/CollabUploader.test.tsx` — button visibility + interaction.

## Data model changes

No new collections or fields. Reuses the existing soft-delete triple on
`workspaces/{wid}/projects/{pid}/documents/{did}`:

- `deletedAt: Timestamp` (was `null`)
- `deletedBy: string` — `cid` for client deletes, `colid` for collaborator deletes
- `deletedByType: 'client' | 'collaborator'` (new principal values; already valid `TUploaderType`)

Security-rules implications (multi-tenant isolation is non-negotiable):
- Identity gates `isPortalClient(wid, pid)` / `isCollabWorkspace(wid)` already bind the caller to the
  workspace + project (portal) / workspace (collab) via minted claims; the new update branches keep
  those gates so no cross-workspace or cross-project write is possible.
- The `affectedKeys().hasOnly([...])` diff restriction is preserved, so clients/collaborators can
  only ever touch the soft-delete triple — no rename, no `scanStatus`, no `visibleTo*` escalation.
- `resource.data.deletedAt == null` precondition blocks double-delete.
- Ownership pin (`uploadedBy == cid/colid` + matching `uploaderType`) prevents deleting firm- or
  peer-authored rows.

Activity: the `onProjectDocumentWrite` Cloud Function (`backend/functions/src/index.ts` +
`deriveDocumentActivity` in `backend/functions/src/lib/activityDiff.ts`) already derives a
`doc_deleted` activity entry when `deletedAt` transitions null→timestamp, and already resolves
collaborator/client actor names. So the client/collab hooks must **not** (and by rules **cannot**)
write task `updates` themselves — activity is server-derived. This differs from the firm
`softDeleteDocument`, which appends `doc_deleted` client-side for task-scoped docs.

## Steps (ordered, each independently verifiable)

### 1. Firestore rules — extend `documents/{did}` `allow update`
Replace the single firm-only clause with a disjunction of three self-delete branches sharing the
common diff/precondition guards. Target shape:

```
allow update: if resource.data.deletedAt == null
  && request.resource.data.diff(resource.data).affectedKeys()
      .hasOnly(['deletedAt', 'deletedBy', 'deletedByType'])
  && request.resource.data.deletedAt is timestamp
  && (
    // Firm members (existing behaviour, unchanged)
    (hasRole(wid, ['owner', 'admin', 'pm'])
      && workspaceActive(wid)
      && canSeeRestricted(wid, restrictionsOf(resource.data))
      && request.resource.data.deletedBy == request.auth.uid
      && request.resource.data.deletedByType == 'firm_member')
    // Portal client — own uploads only
    || (isPortalClient(wid, pid)
      && portalProjectLive(wid, pid)
      && workspaceActive(wid)
      && resource.data.uploaderType == 'client'
      && resource.data.uploadedBy == request.auth.token.portal.cid
      && request.resource.data.deletedBy == request.auth.token.portal.cid
      && request.resource.data.deletedByType == 'client')
    // Collaborator — own uploads only, still assigned to the task
    || (isCollabWorkspace(wid)
      && projectLive(wid, pid)
      && workspaceActive(wid)
      && resource.data.uploaderType == 'collaborator'
      && resource.data.uploadedBy == request.auth.token.collab.colid
      && collabAssignedTaskAt(wid, pid, resource.data.scopeId)
      && request.resource.data.deletedBy == request.auth.token.collab.colid
      && request.resource.data.deletedByType == 'collaborator')
  );
allow delete: if false;
```

Notes / verifiable properties:
- Firm branch behaviour is byte-for-byte equivalent to today (guards just hoisted into the shared
  prefix). The existing "denies deletedByType: 'client' for owner" test still fails-closed: owner is
  not `isPortalClient`, and the firm branch forces `'firm_member'`.
- `workspaceActive(wid)` on the portal/collab branches mirrors the create rule's billing gate (D-3:
  writes blocked on `read_only`). **Flag for approval** — see Open Questions (deletes-during-suspension).
- Hard delete stays `false`.

Enumerate ALLOW cases:
- A1 firm owner/admin/pm soft-deletes any visible doc (need-to-know respected) → allow.
- A2 portal client soft-deletes a doc where `uploaderType=='client'` & `uploadedBy==cid`, project
  live, workspace active → allow.
- A3 collaborator soft-deletes a doc where `uploaderType=='collaborator'` & `uploadedBy==colid`,
  assigned to `scopeId` task, project live, workspace active → allow.

Enumerate DENY cases:
- D1 client deletes a firm-uploaded (`uploaderType=='firm_member'`) or link doc → deny.
- D2 client deletes another client's upload (`uploadedBy != cid`) → deny.
- D3 collaborator deletes a firm/client/peer doc or a doc on a task they're no longer assigned to → deny.
- D4 client/collab writes `deletedByType` mismatching their principal (e.g. client writes
  `'firm_member'`, or collab writes `'client'`) → deny.
- D5 client/collab spoofs `deletedBy` to another id → deny.
- D6 any update touching a key outside the triple (rename, `scanStatus`, `visibleToClient`,
  `visibleToCollaboratorIds`) → deny.
- D7 double soft-delete (`resource.data.deletedAt != null`) → deny.
- D8 cross-workspace / cross-project principal (claims bind wid/pid) → deny.
- D9 hard `delete` for anyone → deny.
- D10 write on a `read_only` workspace (if the `workspaceActive` gate is approved) → deny.

### 2. `usePortalDocuments.ts` — expose owner + soft-delete writer
- Add `uploadedBy: string` to `IPortalDocument` and set it in `mapDocument`
  (`String(data['uploadedBy'] ?? '')`).
- Add imports `updateDoc`, `serverTimestamp` from `firebase/firestore`.
- Add:
```
export async function softDeletePortalDocument(options: {
  workspaceId: string; projectId: string; clientId: string; documentId: string;
}): Promise<void> {
  const { workspaceId, projectId, clientId, documentId } = options;
  await updateDoc(
    doc(db, `workspaces/${workspaceId}/projects/${projectId}/documents/${documentId}`),
    { deletedAt: serverTimestamp(), deletedBy: clientId, deletedByType: 'client' },
  );
}
```
- Single `updateDoc` (no batch, no activity append — server trigger derives `doc_deleted`).
- After success the live query (`where('deletedAt','==',null)`) drops the row automatically.

### 3. `PortalDocumentsSection.tsx` — delete UX
- A row is deletable when `interactive && row.attachmentType === 'file' &&
  row.uploaderType === 'client' && row.uploadedBy === clientId`.
- Local state for the in-flight/confirming row (mirror the firm inline-confirm pattern in
  `DocumentsSection.tsx` — no shared confirm dialog exists; do NOT use `window.confirm`).
  Suggested: `const [pending, setPending] = useState<{ id: string; phase: 'confirm' | 'deleting' | 'error' } | null>(null)`.
- Placement: alongside the existing Download button in the row's right-hand controls; wrap in a
  small action group. Add `print:hidden`.
- Confirm flow: first click → inline "Delete this file?" with **Delete** / **Cancel** buttons
  (accessible `<button>`s, not color-only — include text labels + `sr-only` file name). On confirm →
  `phase: 'deleting'`, call `softDeletePortalDocument`, on error set `phase: 'error'` with a
  `role="alert"` retry message; on success the row disappears via the snapshot.
- Accessibility: keyboard-focusable buttons, `focus-visible:outline` classes matching the existing
  Download button, `aria-label`/`sr-only` naming the file, `role="status"`/`role="alert"` for
  progress/error, disabled state while deleting. No reliance on color alone.
- Reuse existing Tailwind tokens (`border-border`, `text-destructive`, `hover:bg-muted`, etc.).

### 4. `useCollabTask.ts` — expose owner + soft-delete writer
- Add `uploadedBy: string` to `ICollabDocument` and set it in `mapDocument`.
- Add imports `updateDoc`, `serverTimestamp` from `firebase/firestore`.
- Add:
```
export async function softDeleteCollabDocument(options: {
  workspaceId: string; projectId: string; collaboratorId: string; documentId: string;
}): Promise<void> {
  const { workspaceId, projectId, collaboratorId, documentId } = options;
  await updateDoc(
    doc(db, `workspaces/${workspaceId}/projects/${projectId}/documents/${documentId}`),
    { deletedAt: serverTimestamp(), deletedBy: collaboratorId, deletedByType: 'collaborator' },
  );
}
```

### 5. `CollabUploader.tsx` — delete UX
- A row is deletable when `row.attachmentType === 'file' &&
  row.uploaderType === 'collaborator' && row.uploadedBy === collaboratorId`.
- Add a delete control in the row next to the "Open" button, mirroring the existing button classes
  (`min-h-11`, `rounded-lg border border-border`, `focus-visible:outline` …). Include a `lucide-react`
  icon (e.g. `Trash2`) with a visible text label (not icon-only) for accessibility.
- Inline confirm + loading/error states reusing the component's `aria-live` / `role="alert"`
  patterns already present for uploads. Consider a per-row delete state map keyed by `row.id`.
- On success the `useCollabDocuments` snapshot drops the row.

### 6. Rules tests (`backend/rules-tests/src/documents.test.ts`)
Extend the existing `describe('document soft delete (update)')` (and reuse `dbAsPortal` /
`dbAsCollab` helpers already defined). Seed docs owned by the principal under test.
- Portal client:
  - allow: client soft-deletes own upload (`uploaderType:'client'`, `uploadedBy:'client1'`, project
    `proj1`) with `{deletedAt, deletedBy:'client1', deletedByType:'client'}`.
  - deny: client deletes a firm doc; client deletes a doc with `uploadedBy` of another cid; client
    writes `deletedByType:'firm_member'`; client spoofs `deletedBy`; client touches an extra key;
    double-delete.
- Collaborator:
  - Seed a task `task1` with `assigneeCollaboratorIds: ['col1']` (+ `collaboratorCanSeeAllAttachments`
    / `visibleToClient` / `restrictedToDepartments` so `collabAssignedTaskAt` passes) and a
    collab-owned doc (`scope:'task'`, `scopeId:'task1'`, `uploaderType:'collaborator'`,
    `uploadedBy:'col1'`).
  - allow: collaborator soft-deletes own upload with `deletedByType:'collaborator'`,
    `deletedBy:'col1'`.
  - deny: collaborator deletes a firm/client doc; deletes a doc on a task they're not assigned to;
    wrong `deletedByType`; spoofed `deletedBy`; extra key; double-delete.
- Regression: keep the existing owner/admin/pm allow, viewer deny, need-to-know, hard-delete-denied,
  and the "owner + deletedByType:'client' denied" case green.

### 7. Component tests
- `PortalDocumentsSection.test.tsx` (mocks `usePortalDocuments` via `usePortalDocumentsMock`, add a
  spy for `softDeletePortalDocument`):
  - Delete button shown only for `uploaderType:'client'` + matching `uploadedBy` file rows; hidden
    for firm rows, link rows, and when `interactive={false}`.
  - Confirm → calls `softDeletePortalDocument` with the right ids; Cancel does nothing; error path
    renders `role="alert"`.
- `CollabUploader.test.tsx` (existing firebase mocks; spy `softDeleteCollabDocument`):
  - Delete button shown only for own collaborator file rows; hidden for firm/client/link rows.
  - Confirm calls the writer with correct args; loading/error states render.

### 8. Verification
Run `pnpm --filter @siapp/rules-tests test` (rules), `pnpm --filter web test` (component), plus
typecheck/lint/build. Validator gate before PR.

## Test plan (summary for Tester)

- Rules: allow/deny matrix A1–A3 / D1–D10 above (client + collaborator branches, firm regression).
- Portal component: conditional button rendering by ownership/type/interactive; confirm/cancel/error.
- Collab component: conditional button rendering by ownership/type; confirm/cancel/error.
- No test should assert the hooks write task `updates` — activity is server-derived by
  `onProjectDocumentWrite` (out of scope to test here; already covered by functions tests).

## Out of scope

- Hard delete / actual Storage byte removal / retention GC (soft-delete only; bytes retained).
- Deleting firm- or peer-authored documents, or external Google-Drive **link** rows (D-043 links are
  firm-created; clients/collab never created them).
- Firm `DocumentsSection` UI/behaviour changes.
- `onProjectDocumentWrite` / `deriveDocumentActivity` changes — it already emits `doc_deleted` for
  client/collab deletes.
- `packages/shared` changes (`TUploaderType` already includes `'client'`/`'collaborator'`).
- Undo/restore of a deleted attachment; admin-side "deleted by client" surfacing beyond existing
  activity.
- Any marketing/admin surface.

## Risks / open questions

1. **Permission model approval + decisions-log entry.** No logged decision governs who may delete
   uploads. This plan proposes "own uploads only." Needs product sign-off and a new `D-0nn` entry in
   `pm_ux/plans/decisions-log.md` before shipping (Planner cannot log it; flag to human).
2. **Issue's `uploadedBy == request.auth.uid` is incorrect** for this codebase — the real owner field
   is `uploadedBy == portal.cid` / `collab.colid`. Plan uses the corrected gate. Confirm agreement.
3. **Delete during billing suspension (`read_only`).** Plan gates portal/collab deletes on
   `workspaceActive(wid)` for parity with uploads (D-3). Alternative: allow self-deletes even when
   read_only (reduces stored bytes, arguably client-friendly). Needs a call — trivially toggled by
   dropping the `workspaceActive` conjunct on those two branches.
4. **Multiple clients per project.** If a project can have >1 client identity (cid), the "shared by
   you" label and delete button correctly key off `uploadedBy == clientId`; the rule enforces it too,
   so a mis-shown button would fail-closed. Confirm the portal only ever exposes one cid per session
   (it does via minted claims).
5. **Collaborator reassignment.** A collaborator loses delete ability if unassigned from the task
   (`collabAssignedTaskAt`). Intended, but worth confirming with product (a collaborator who uploaded
   then got unassigned can no longer clean up their own file — firm can).
6. **Confirmation UX consistency.** There is no shared confirm-dialog component; firm docs use an
   inline `Alert` confirm. Plan mirrors that inline pattern per surface. If a shared confirm component
   is desired, that's a separate refactor (out of scope here).
