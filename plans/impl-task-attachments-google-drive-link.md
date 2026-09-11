# Impl Plan — Task-detail Attachments: "Upload File" + "Google Drive" link attachments

**Surface:** Firm app (`dashboard.siapp.app`) only — `apps/web/src/surfaces/firm/...`
**Author:** Planner · **Date:** 2026-09-10
**Feature request:** In the task detail panel's Attachments block, replace the single icon "Attach file" button with two half-width buttons — **Upload File** (dashed outline, existing upload flow) and **Google Drive** (paste a Drive URL, attach as a link-type document, no bytes uploaded). Header shows an "Attachments" title with a right-aligned file **count**; each row shows icon + name + subtitle + `×` remove.

---

## ⚠️ OPEN QUESTIONS — need your decision before/while building

1. **No logged decision permits link-type attachments (scope flag).** `11-mvp-scope.md` frames Documents strictly as *upload / list / preview* of files; the decisions log (D-031, D-042, D-034) consistently treats attachments as uploaded bytes. Storing an external **link** as a `documents/{did}` record is a genuine model extension, not covered by any D-0nn. **Recommend logging a new decision** (e.g. "D-0xx: task attachments may be external links (Google Drive) stored as link-type document records") before merge. Please confirm you want this in MVP.
2. **Provider scope.** Request says "Google Drive". Do we hard-restrict the accepted host to `drive.google.com` / `docs.google.com` only (proposed), or accept any `https://` URL with Drive as a labelled default? Plan assumes **Drive-host-only** validation with a single `linkProvider: 'google_drive'`.
3. **Client/collaborator visibility of link attachments.** Plan makes link attachments inherit the task's `visibleToClient` / `restrictedToDepartments` exactly like file uploads (so they *can* surface in the portal/collab surfaces). Confirm that a Google Drive link appearing in the **client portal** is acceptable — the firm still controls it via the task's `visibleToClient` toggle, but the client would be sent off-platform to Google. If you'd rather keep links **firm-internal only** for MVP, say so and we force `visibleToClient=false` + a rules guard (simpler, less risk). *Default in this plan: inherit like files.*
4. **Google Drive brand mark.** `lucide-react@^0.468` has **no** Drive/Google brand icon and the repo has no existing inline brand SVG. Plan proposes a small **inline multicolour Drive triangle SVG** component in the firm surface. Confirm you're OK embedding a Google brand mark (trademark usage). Fallback: a neutral `Link`/`ExternalLink` lucide icon with the text label "Google Drive".

---

## Goal

Let firm members (owner/admin/pm with `canEdit`) attach a **Google Drive link** to a task alongside file uploads, from a redesigned two-button Attachments block in `TaskDetailPanel`. Link attachments are new **link-type** records in the existing per-project `documents` collection — no Storage bytes, no scanning — and inherit the task's client/department visibility just like file uploads. This extends the #14 Documents surface and the #23 task detail panel; it is additive and backward-compatible with all existing file documents. (See Open Question 1 — needs a new decisions-log entry; MVP scope `11-mvp-scope.md` currently lists Documents as file upload only.)

Bundle isolation (D-036/D-037) is respected: all new code lives under the firm surface tree and `@siapp/ui`; no client (`/p`) or collaborator (`/t`) bundle imports change.

---

## Touched surfaces & files

**Modify**

- `apps/web/src/surfaces/firm/projects/documents/useDocuments.ts`
  - `IDocumentRow` (near line 40): add `attachmentType: 'file' | 'link'`, `url: string`, `linkProvider: string`.
  - `mapDocument` (near line 68): read the new fields with backward-compatible defaults (missing → `'file'`, `url: ''`).
  - New writer `addLinkAttachment(...)` (near the writers section, ~line 355) — writes a link-type doc + reuses `appendDocActivity`.
  - New pure validator `validateDriveUrl(raw: string): string | null` (mirror of `validateDocumentFile`, ~line 366) — host check for `drive.google.com` / `docs.google.com`.
  - Extend `appendDocActivity` / `IDocActivityInput` (near line 460) so it can carry `url` instead of `storagePath`/`mimeType` for link activity.
- `apps/web/src/surfaces/firm/projects/documents/DocumentsSection.tsx`
  - `TaskAttachments` (export near line 482): new header with file **count**, two half-width buttons (`Upload File`, `Google Drive`), the add-link dialog, richer rows (icon, name, subtitle, `×` remove), and remove wiring to `softDeleteDocument`.
  - Keep the shared `UploadButton` (line 49) for the file path; the "Upload File" button reuses it (dashed outline variant — see Steps).
  - Add a small `GoogleDriveIcon` inline SVG component (or import — see Open Question 4) and an `AddDriveLinkDialog` sub-component (local to this file, function declaration, named — no default export needed since it's file-local).
- `packages/shared/src/firestoreTypes.ts`
  - `IProjectDocumentDoc` (near line 610): add optional `attachmentType?: TAttachmentType`, `url?: string`, `linkProvider?: TLinkProvider`; make `storagePath`, `sizeBytes`, `mimeType` conceptually file-only (keep as-is for backward compat — see Data model).
  - `ITaskUpdatePayload` (near line ~588): add optional `url?: string`.
- `packages/shared/src/enums.ts`
  - Add `export type TAttachmentType = 'file' | 'link';` and `export type TLinkProvider = 'google_drive';` next to `TDocumentScope` (~line 78). Re-export via the shared barrel if `firestoreTypes.ts` imports them (match existing `TDocumentScope`/`TUploaderType` import pattern).
- `firestore.rules`
  - Add a firm **link-create** branch to the `documents` `allow create` (block ~lines 555-608) using a new helper `validLinkDocumentCreate(wid, pid, did)` modelled on `validDocumentCreate` (~lines 375-404). No change to `get`/`list`/`update`/`delete` (soft-delete already works for link docs; `canSeeRestricted` already keys off `restrictedToDepartments`).

**Add (tests — see Test plan)**

- Extend `apps/web/src/surfaces/firm/projects/tasks/TaskDetailPanel.test.tsx`
- Extend `apps/web/src/surfaces/firm/projects/documents/DocumentsSection.test.tsx`
- Extend the firestore-rules test suite for the `documents` collection (locate existing `*.rules.test.ts` / emulator spec for documents and add link cases).

**No change**

- `storage.rules` — links write **no** bytes (explicitly verified: firm create path `workspaces/{wid}/projects/{pid}/{fileName}` stays file-only).
- `TaskDetailPanel.tsx` — the render block at ~lines 831-841 already passes every prop `TaskAttachments` needs (`taskVisibleToClient`, `taskRestrictedToDepartments`, `role`, `departments`, `uid`, `userName`, `canEdit`). No new props.

---

## Data model changes

### `documents/{did}` — new link-type record (backward compatible)

Discriminator: **`attachmentType: 'file' | 'link'`**, defaulted at read time so **existing file docs (which have no such field) map to `'file'`**. We deliberately **do not** add `attachmentType` to the file-create write path (keeps the existing `validDocumentCreate` `hasOnly` list and every current file doc untouched — zero migration).

| Field | File doc (existing) | Link doc (new) |
|---|---|---|
| `attachmentType` | *(absent → `'file'`)* | `'link'` (explicit) |
| `url` | *(absent)* | Drive URL string |
| `linkProvider` | *(absent)* | `'google_drive'` |
| `storagePath` | present, pattern-matched | **absent** |
| `sizeBytes` | present, >0 | **absent** |
| `mimeType` | present | **absent** |
| `name` | file name | Drive link display name (derived from URL or user-typed; see Steps) |
| `scope` / `scopeId` | `'task'` / taskId | `'task'` / taskId |
| `uploadedBy` / `uploaderType` | uid / `'firm_member'` | uid / `'firm_member'` |
| `uploadedAt` | serverTimestamp | serverTimestamp |
| `visibleToClient` | task's value | task's value (inherit) |
| `visibleToCollaboratorIds` | `[]` | `[]` |
| `restrictedToDepartments` | task's value | task's value (inherit) |
| `scanStatus` | `'pending'` | `'clean'` (nothing to scan) |
| `deletedAt` | `null` explicit | `null` explicit |

`mapDocument` defaults for backward compat: `attachmentType = data['attachmentType'] === 'link' ? 'link' : 'file'`; `url = String(data['url'] ?? '')`; `linkProvider = String(data['linkProvider'] ?? '')`. File-only fields keep their current defaults (`storagePath ?? ''`, `sizeBytes ?? 0`, `mimeType ?? ''`), which are harmless for link rows because the UI branches on `attachmentType`.

### Security-rules implications (multi-tenant isolation is non-negotiable)

- **Path scoping** stays intact — link docs live under `workspaces/{wid}/projects/{pid}/documents/{did}`; there is no cross-workspace surface.
- **New `validLinkDocumentCreate(wid, pid, did)`** (mirrors `validDocumentCreate` ~lines 375-404) requires:
  - `d.keys().hasOnly(['id','name','attachmentType','url','linkProvider','scope','scopeId','uploadedBy','uploaderType','uploadedAt','visibleToClient','visibleToCollaboratorIds','restrictedToDepartments','scanStatus','deletedAt'])` — note **no** `storagePath`/`sizeBytes`/`mimeType` keys allowed.
  - `d.id == did`, `d.name is string && size 1..255`.
  - `d.attachmentType == 'link'`.
  - `d.url is string && d.url.size() <= 2000 && (d.url.matches('https://drive\\.google\\.com/.*') || d.url.matches('https://docs\\.google\\.com/.*'))` — Drive-host allow-list (defence in depth vs. the client-side check; keep the regex simple/anchored, no user-controlled metachars).
  - `d.linkProvider == 'google_drive'`.
  - `d.scope == 'task' && d.scopeId is string && d.scopeId.size() > 0` (links are task-scoped only for MVP; do not allow project-scope link create unless you decide otherwise).
  - `d.uploadedBy == request.auth.uid && d.uploaderType == 'firm_member'`, `d.uploadedAt is timestamp`.
  - `d.visibleToClient is bool`, `d.visibleToCollaboratorIds is list && size == 0`, `d.restrictedToDepartments is list && size <= 10`, `d.scanStatus == 'clean'`, `d.deletedAt == null`.
- **Create branch** added to `allow create` under the existing firm branch, gated the same way: `hasRole(wid, ['owner','admin','pm']) && canSeeRestricted(wid, request.resource.data.restrictedToDepartments) && validLinkDocumentCreate(wid, pid, did)` — so a firm member can never create a link doc they couldn't see (parity with file create). **Portal/collab create branches are NOT extended** — only firm members get the Google Drive button.
- **Update (soft delete)** unchanged: existing rule permits only `deletedAt`/`deletedBy`/`deletedByType`, gated by `canSeeRestricted(...restrictionsOf(resource.data))`; works identically for link docs.
- **Task `updates` create** (verified ~lines 960-991): `doc_added`/`doc_deleted` are already allowed actions and the rule does **not** `hasOnly`-restrict `payload` keys (only `comment` validates `payload.text`). So writing `payload: { text: name, url }` for a link is accepted with **no rules change**.

---

## Steps (each independently verifiable)

1. **Shared enums/types.** Add `TAttachmentType` and `TLinkProvider` to `packages/shared/src/enums.ts`; extend `IProjectDocumentDoc` and `ITaskUpdatePayload` in `firestoreTypes.ts`. Build `packages/shared`. *Verify:* `pnpm --filter @siapp/shared build` / typecheck passes; new types exported from the barrel.

2. **Row type + mapper.** In `useDocuments.ts` add `attachmentType`/`url`/`linkProvider` to `IDocumentRow` and populate them in `mapDocument` with backward-compatible defaults. *Verify:* typecheck; existing DocumentsSection tests still pass (file rows unchanged).

3. **Link URL validator.** Add `validateDriveUrl(raw: string): string | null` in `useDocuments.ts` — trims, requires non-empty, parses via `URL`, requires `https:` protocol and host `drive.google.com` or `docs.google.com`; returns a friendly message otherwise (`'Enter a Google Drive share link (drive.google.com/…).'`). Pure function, no `any`. *Verify:* unit test table (valid/invalid hosts, non-URL, http).

4. **Writer `addLinkAttachment`.** Add `IAddLinkAttachmentInput { workspaceId, projectId, taskId, url, name, visibleToClient, restrictedToDepartments, uid, userName }` and `addLinkAttachment(input)`:
   - `writeBatch`; `doc(collection(... /documents))`; `batch.set` the link shape from the Data-model table (`attachmentType:'link'`, `linkProvider:'google_drive'`, `scanStatus:'clean'`, `deletedAt:null`, `visibleToCollaboratorIds:[]`, `scope:'task'`).
   - Reuse `appendDocActivity(batch, ws, proj, taskId, 'doc_added', { name, url, uid, userName })`.
   - `await batch.commit()`. No Storage call.
   Extend `IDocActivityInput` so `storagePath`/`mimeType` are optional and `url` optional; write only the provided payload keys. *Verify:* unit test asserts the batched doc shape and that no `uploadBytesResumable` is called.

5. **Google Drive icon.** Add a small named `GoogleDriveIcon` component (inline multicolour SVG, `aria-hidden`, `focusable="false"`, sized via `className`) in `DocumentsSection.tsx` (or a sibling `GoogleDriveIcon.tsx` under the documents folder). *Verify:* renders; see Open Question 4 for the trademark call / neutral fallback.

6. **Add-link dialog.** Add a file-local `AddDriveLinkDialog` using `@siapp/ui` `Dialog` (native `<dialog>`, modal focus containment + Esc + focus restore per its doc) + `Input`:
   - Fields: Drive URL (required, `type="url"`), optional display name (defaults to a derived label like "Google Drive file" or the URL's last path segment when empty).
   - Inline validation via `validateDriveUrl`; disable submit until valid; show an `Alert` on invalid.
   - On submit → `addLinkAttachment(...)` with the task's inherited `visibleToClient` / `restrictedToDepartments`; close on success; surface a friendly error on failure.
   - a11y: dialog has an accessible name (title `id` → `aria-labelledby`), the URL `Input` has an associated `<label>`, Cancel + Attach buttons, keyboard operable. *Verify:* component test (open, type invalid → error + disabled, type valid → enabled → submit calls writer, cancel closes).

7. **`TaskAttachments` redesign.** In the header row: title "Attachments" + right-aligned count (`{n} file{n===1?'':'s'}` using `docsState.rows.length` when `ready`). Below the list, when `canEdit`, render two buttons side-by-side each `flex-1`:
   - **Upload File** — dashed-border outline button with an upload icon (`Upload` from lucide); it opens the file picker. Reuse `UploadButton` but render it as a **full-width text+icon** button. Cleanest: extend `IUploadButtonProps` with an optional `className`/`fullWidth` and an optional leading `icon` in text mode (today `icon` forces icon-only) — add a `variant` escape so the outline/dashed style applies. Keep the change minimal and covered by the existing pre-check flow (`validateDocumentFile`, `onPick`, `onInvalid`).
   - **Google Drive** — solid-border button with `GoogleDriveIcon` + "Google Drive"; opens `AddDriveLinkDialog`.
   *Verify:* both buttons render with accessible names; file button still triggers the hidden input.

8. **Row rendering.** Update the `TaskAttachments` list `<li>`:
   - Leading icon: file → `FileText`/`Paperclip`; link → `GoogleDriveIcon`.
   - Name; subtitle: file → `formatBytes(row.sizeBytes)` + `• Uploaded {date}`; link → provider label (e.g. "Google Drive link") — **no size**.
   - Primary action: file → existing `downloadDocument(row.storagePath, row.name)`; link → an anchor `href={row.url}` `target="_blank"` `rel="noopener noreferrer"` styled as a button ("Open") with an `ExternalLink` icon.
   - `×` **remove** button (`aria-label={`Remove ${row.name}`}`, `X` icon) → `softDeleteDocument(...)`. Reuse the existing `TaskDetailPanel` confirm pattern if one exists, or delete directly with an optimistic disabled state; keep consistent with the current attachments UX (today TaskAttachments has no delete — adding `×` is in scope per the request). *Verify:* remove calls `softDeleteDocument` with the row.

9. **Firestore rules.** Add `validLinkDocumentCreate` helper + the firm link-create branch to the `documents` `allow create`. Do not touch `get`/`list`/`update`/`delete`. *Verify:* `firebase emulators` rules tests (see Test plan) pass, including the negative cases.

10. **Wire-through check.** Confirm `TaskDetailPanel.tsx` still compiles with no prop changes. *Verify:* `pnpm --filter web typecheck`, build, lint.

11. **Green gate.** `pnpm -w build && pnpm -w lint && pnpm -w typecheck && pnpm -w test` (or the repo's task equivalents) all pass. No `any`, no `console.log`, named exports, function-declaration components.

---

## Test plan (for Tester)

**`useDocuments` unit tests (new)**
- `validateDriveUrl`: accepts `https://drive.google.com/file/d/…`, `https://docs.google.com/document/…`; rejects `http://…`, `https://evil.com/…`, non-URL strings, empty.
- `addLinkAttachment`: writes a `documents` doc with `attachmentType:'link'`, `linkProvider:'google_drive'`, `scanStatus:'clean'`, `deletedAt:null`, inherited `visibleToClient`/`restrictedToDepartments`, and **no** `storagePath`/`sizeBytes`/`mimeType`; appends a `doc_added` update with `payload.url`; does **not** call Storage upload. (Mock `firebase/firestore` `writeBatch`/`serverTimestamp` per the existing test style.)

**`DocumentsSection.test.tsx` (extend, mock pattern at ~lines 7-20: `vi.mock('./useDocuments.ts', …)`)**
- `TaskAttachments` renders **two** buttons ("Upload File", "Google Drive") when `canEdit`, and neither when `!canEdit`.
- Header shows the correct file **count** ("2 files" / "1 file" / hidden or "0 files" when empty).
- Google Drive dialog: opens, invalid URL → error + submit disabled, valid URL → submit enabled → calls the mocked `addLinkAttachment` with inherited visibility.
- Link row renders as an external link (`target="_blank"`, `rel` includes `noopener`), shows provider label, **no** size text; file row still shows size + download.
- `×` remove calls the mocked `softDeleteDocument` with the row.
- a11y: buttons/inputs have accessible names; dialog is labelled (RTL `getByRole('dialog', { name })`).

**`TaskDetailPanel.test.tsx` (extend, mock at ~lines 18-36 / 98-103)**
- Panel still renders Attachments with the two buttons given the mocked `useDocuments` state; add a mocked `addLinkAttachment` to the `vi.mock('../documents/useDocuments.ts', …)` factory so the new export exists.

**Firestore rules tests (extend the documents rules spec)**
- Firm owner/admin/pm **can** create a valid link doc (task scope, Drive host, inherited restriction they can see).
- **Reject:** link doc with `storagePath`/`sizeBytes`/`mimeType` present (extra keys); non-Drive `url`; `scanStatus != 'clean'`; `linkProvider != 'google_drive'`; `scope == 'project'`; `visibleToCollaboratorIds` non-empty; `restrictedToDepartments` the creator can't see; `viewer`/non-member creator; other workspace's path (isolation).
- **Soft delete** of a link doc allowed for firm (only `deletedAt`/`deletedBy`/`deletedByType`); hard delete denied.
- Existing **file** create/list/get/update tests still pass unchanged (backward compat).

---

## Out of scope

- Any change to the full **Documents tab** (`DocumentsSection` main view) beyond the shared `UploadButton` tweak — no Google Drive button there.
- **Project-scoped** link attachments (links are task-scoped only for MVP).
- Google **OAuth / Picker / Drive API** integration, file import, thumbnails, or permission/preview of Drive content — we store a user-pasted URL only.
- Portal (`/p`) and collaborator (`/t`) surfaces gaining a Google Drive **create** button (they may *see* inherited link rows per Open Question 3, but cannot create).
- Other providers (Dropbox, OneDrive), virus scanning of links, link liveness/health checks.
- Data migration/backfill of existing file docs (none needed — defaults handle them).

---

## Risks / open questions

- **Scope/decision gap (blocking-ish):** link attachments aren't in `11-mvp-scope.md` and no D-0nn covers them — see Open Question 1. Recommend a new decisions-log entry before merge so this doesn't contradict the logged product scope.
- **Client sees off-platform Drive links** if inherited visibility surfaces them in the portal (Open Question 3). If undesirable, force `visibleToClient=false` for links + a rules assertion (`d.attachmentType == 'link' ==> d.visibleToClient == false`).
- **Trademark:** embedding the Google Drive brand mark (Open Question 4). Neutral `ExternalLink` fallback keeps us clear if you'd rather not ship the brand SVG.
- **Broken/private links:** we can't verify the Drive link resolves or is shared; recipients may hit Google's permission wall. Acceptable for MVP (firm-controlled), but note it in UX copy ("Make sure the link's sharing is set for your recipients").
- **`UploadButton` refactor blast radius:** it's shared with the main Documents tab. The "Upload File" restyle must stay backward-compatible with the icon-only usage there — keep the change purely additive (optional props), covered by existing DocumentsSection tests.
- **URL length/normalisation:** we cap `url` at 2000 chars in rules; extremely long Drive URLs are rare but confirm the cap.
