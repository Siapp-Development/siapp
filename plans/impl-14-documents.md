# Implementation plan — #14 Documents: upload, list, preview (firm side)

## Context

Issue #14 (M1 — Firm app core): firm-side document handling on projects and tasks — upload to Cloud Storage with per-workspace rules, list, in-browser preview, plus storage-rules tests (acceptance: cross-workspace access denied). The `IProjectDocumentDoc` schema (packages/shared/src/firestoreTypes.ts:366) and Firestore document *read* rules (get/list split with `canSeeRestrictedList`, on the #44 branch) already exist; `storage.rules` is a deny-all stub; `apps/web/src/lib/firebase.ts` already exports `storage` wired to the emulator (port 9199); no upload UI exists anywhere yet.

**Base branch**: `main` AFTER PR #44 merges (user-approved — user merges #44 first, then `feat/14-documents` off main). Committed plan copy: `plans/impl-14-documents.md`.

## Approved scope decisions

1. **Direct SDK + Storage rules** (user-approved): client uploads via `firebase/storage` SDK; storage.rules enforce claims membership, 25 MB cap, mime allowlist. Preview/download via `getBlob()` — rules-enforced, no public URLs. No signing callables.
2. **Preview = PDF + images inline** (user-approved): iframe/img over blob object-URLs; Office files download-only. `image/svg+xml` excluded from the allowlist (script-in-preview risk).
3. **Both project- and task-scoped docs** (user-approved): Documents tab on ProjectDetailPage lists all; TaskDetailPanel gains an attachments area (uploads inherit the task's `restrictedToDepartments` + `visibleToClient`, append `doc_added` activity).
4. **Soft delete only** (data model): owner/admin/pm set `deletedAt/deletedBy/deletedByType`; Storage object stays; hard delete denied.
5. **No virus scan yet** (Q57 open): create pins `scanStatus: 'pending'`; UI shows a badge, never blocks download.
6. **`deletedAt: null` written explicitly at create** — Firestore `where('deletedAt','==',null)` does not match missing fields, and every list query filters on it. Type becomes `deletedAt: Date | null`.
7. **Accepted tradeoffs (flag in PR)**: storage read is workspace-member-wide (department need-to-know enforced only at the Firestore-metadata layer; paths carry unguessable uuids); orphaned storage objects when the metadata write fails (GC follow-up); production bucket needs CORS config for `getBlob` (deploy-time op).

## Steps

### 0. Setup
- After #44 merges: `git checkout main && git pull`, branch `feat/14-documents`.
- Copy this plan to `plans/impl-14-documents.md`.

### 1. Shared (`packages/shared/src`)
- `constants.ts`: `MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024`; `ALLOWED_DOCUMENT_MIME_TYPES` (pdf; png/jpeg/webp/gif; docx/xlsx/pptx + legacy doc/xls/ppt — 11 entries, **no svg**); `PREVIEWABLE_MIME_TYPES` (pdf + the 4 image types).
- `firestoreTypes.ts`: `IProjectDocumentDoc.deletedAt?: Date` → `deletedAt: Date | null` (comment: null written at create so `== null` list filters match).

### 2. Rules

**2a. `storage.rules`** — replace deny-all stub:
- Helpers: `isFirmMember(wid)` / `hasRole(wid, roles)` from custom claims (same shape as firestore.rules).
- `match /workspaces/{wid}/projects/{pid}/{fileName}` (single segment — `client-uploads/**` deliberately not matched):
  - `allow read: if isFirmMember(wid)` (tradeoff comment per decision 7).
  - `allow create: if hasRole(wid, ['owner','admin','pm']) && request.resource.size <= 25 * 1024 * 1024 && request.resource.contentType in [11 allowlist strings]` (parity with shared constant enforced by a rules test).
  - `allow update, delete: if false` (objects immutable; soft delete keeps bytes).
- `match /workspaces/{wid}/projects/{pid}/client-uploads/{fileName}`: read for firm members, `write: if false` (portal #21/#22 writes server-side later).
- No catch-all allow — everything else stays denied.

**2b. `firestore.rules`** — documents write path + updates-action widening:
- Add top-level `validDocumentCreate(wid, pid, did)` next to `validProjectFields`:
  - `keys().hasOnly(['id','name','mimeType','sizeBytes','storagePath','scope','scopeId','uploadedBy','uploaderType','uploadedAt','visibleToClient','visibleToCollaboratorIds','restrictedToDepartments','scanStatus','deletedAt'])` (`retentionUntil` absent → not client-writable)
  - `id == did`; name string 1–255; mimeType string; `sizeBytes is int && > 0 && <= 25*1024*1024`
  - `storagePath.matches('workspaces/' + wid + '/projects/' + pid + '/[^/]+')` (comment: wid/pid are alphanumeric auto-ids, no regex-metachar risk; single segment blocks `client-uploads/` nesting)
  - `scope in ['project','task']`; `scope == 'project' ? scopeId == pid : scopeId is string && scopeId.size() > 0`
  - `uploadedBy == request.auth.uid`; `uploaderType == 'firm_member'`; `uploadedAt is timestamp`
  - `visibleToClient is bool`; `visibleToCollaboratorIds is list && size() == 0`; `restrictedToDepartments is list`; `scanStatus == 'pending'`; `deletedAt == null`
- In `match /documents/{did}` (keep existing get/list): replace `allow write: if false` with:
  - `create`: `hasRole(['owner','admin','pm']) && canSeeRestricted(wid, request.resource.data.restrictedToDepartments) && validDocumentCreate(wid, pid, did)`
  - `update` (soft-delete transition only, no rename): same roles && `canSeeRestricted(wid, restrictionsOf(resource.data))` && `resource.data.deletedAt == null` && `diff().affectedKeys().hasOnly(['deletedAt','deletedBy','deletedByType'])` && `deletedAt is timestamp` && `deletedBy == request.auth.uid` && `deletedByType == 'firm_member'`
  - `delete: if false`
- Widen the tasks `updates` create rule action allowlist: `['comment','status_change','eta_change','assigned','doc_added','doc_deleted']` (payload is already just `is map` — `{text, storagePath, mimeType}` passes).
- No composite indexes expected (all-equality + one array-contains merge via single-field indexes); verify in emulator, don't add speculatively.

### 3. Rules tests + storage harness (`backend/rules-tests`)
- Root `package.json`: `test:rules` script → `firebase emulators:exec --only firestore,storage "..."` (CI calls `pnpm test:rules`, no workflow change). `@firebase/rules-unit-testing` 5.0.1 supports `storage:` config + `ctx.storage()` (compat API) + `clearStorage()`.
- `src/helpers.ts`: add `createStorageTestEnv(projectId)` — `initializeTestEnvironment({ projectId, storage: { host, port, rules: readFileSync('../../../storage.rules') } })` (host/port from `FIREBASE_STORAGE_EMULATOR_HOST`, fallback 127.0.0.1:9199). Leave `createTestEnv` untouched.
- `src/documents.test.ts` (conventions from tasks.test.ts: `dbAs(role, wid, departments)`, `validDocPayload(id, extra)` factory, seedWorkspace/seedDoc):
  - create: owner/admin/pm allow, viewer deny, cross-workspace deny; uploadedBy spoof deny; `uploaderType:'client'` deny; `scanStatus:'clean'` deny; sizeBytes > 25 MB deny; storagePath wrong wid / wrong pid / `client-uploads/` nested deny; extra key (`retentionUntil`) deny; `deletedAt` missing deny; non-empty `visibleToCollaboratorIds` deny; pm restricted-to-foreign-dept deny, pm in-dept allow; `scope:'project'` with `scopeId != pid` deny.
  - update: soft delete allow for 3 roles (exact 3 keys, pinned); viewer deny; deletedBy spoof deny; touching name/scanStatus/storagePath deny; double-delete deny; out-of-dept pm deny.
  - delete: deny all roles.
  - list: `where('restrictedToDepartments','==',[]) + where('deletedAt','==',null)` allow for viewer; per-dept array-contains allow for in-dept pm; unconstrained deny for pm/viewer, allow for owner.
- `src/storage.test.ts` (new harness): cross-workspace read+write denied (headline acceptance criterion); unauthenticated denied; viewer read allow / write deny; pm `put()` allow; oversize (25 MB + 1) deny; `application/zip` and `image/svg+xml` deny; **every `ALLOWED_DOCUMENT_MIME_TYPES` entry allow (shared/rules parity test)**; overwrite deny; delete deny; path outside match deny; `client-uploads/` write deny + member read allow. Seed via `withSecurityRulesDisabled`; `clearStorage()` before `cleanup()`.

### 4. Web data layer (`apps/web/src/surfaces/firm/projects/documents/useDocuments.ts`)
- `IDocumentRow` defensive mapping (pattern: `mapProject` in useProjects.ts).
- `useDocuments(workspaceId, projectId, role, departments, filter?: {scope, scopeId})` — clone the useTasks merged-query pattern: owner/admin single `onSnapshot`; pm/viewer `where('restrictedToDepartments','==',[])` + one `array-contains` per claim dept, Map-deduped; **every query adds `where('deletedAt','==',null)`**; `filter` appends scope/scopeId clauses (TaskDetailPanel case); client-side sort `uploadedAt` desc (no orderBy → list rule stays provable, no composite indexes). Dept key stabilized via `join('\u0000')` like useTasks.
- Writers:
  - `uploadDocument({workspaceId, projectId, file, scope, scopeId, visibleToClient, restrictedToDepartments, uid, userName, onProgress})`: `crypto.randomUUID()` + sanitized filename → `storagePath = workspaces/{wid}/projects/{pid}/{uuid}-{safeName}`; `uploadBytesResumable(ref(storage, storagePath), file, {contentType: file.type})` with progress; on completion one `writeBatch`: documents doc (auto-id, full shape, `uploadedAt: serverTimestamp()`, `scanStatus:'pending'`, `deletedAt: null`, `visibleToCollaboratorIds: []`) + when `scope==='task'` an updates doc (`action:'doc_added'`, `payload:{text: name, storagePath, mimeType}`, id/authorId/authorNameDenorm/source per the #13 addTaskUpdate shape — reuse/extract it from useTasks.ts). Batch failure after bytes landed → orphan accepted (comment + PR note).
  - `softDeleteDocument({...})`: `updateDoc` with exactly `{deletedAt: serverTimestamp(), deletedBy: uid, deletedByType: 'firm_member'}`; task-scoped → batch with `doc_deleted` activity entry.
  - `downloadDocument(storagePath, name)`: `getBlob` → object URL → anchor click → revoke. `getPreviewUrl(storagePath)`: object URL for preview (caller revokes). Comment: production needs bucket CORS for getBlob.

### 5. Web UI
- `documents/DocumentsSection.tsx` (Documents tab body): upload control for owner/admin/pm (hidden `<input type="file" accept={ALLOWED_DOCUMENT_MIME_TYPES.join(',')}>` behind a Button); client-side size/type pre-checks with Alert; inline options row before submit — `visibleToClient` checkbox (default off) + `restrictedToDepartments` chip selector (reuse the TaskDetailPanel dept-chip pattern; hidden when no departments exist, D-004); progress bar during upload. List rows: name, `formatBytes` size, uploader, date, "Project"/"Task" scope chip, restricted chip, "Scan pending" badge, Preview button (PREVIEWABLE_MIME_TYPES only), Download, Delete (owner/admin/pm, inline confirm per ProjectDetailPage pattern).
- `documents/DocumentPreview.tsx`: inline Card (no Dialog primitive) — `<img>` for images, `<iframe title={name}>` for PDF; close revokes the object URL.
- `tasks/TaskDetailPanel.tsx` (modify): "Attachments" area — `useDocuments(..., {scope:'task', scopeId: task.id})` compact list + upload button inheriting the task's restriction/visibleToClient (no selector shown).
- `projects/ProjectDetailPage.tsx` (modify): extend the tab union/array with "Documents"; pass workspaceId/role/departments/uid/userName down. Thread `departments` from FirmShell if #44 didn't already.

### 6. Web tests (mock data-layer wholesale, `vi.hoisted` + `vi.mock`)
- `DocumentsSection.test.tsx`: list render (size formatting, chips, scan badge); viewer sees no upload/delete; type/size pre-check rejection; upload calls `uploadDocument` with selected options; delete confirm flow; preview button only on previewable types.
- `DocumentPreview.test.tsx`: iframe for PDF, img for image.
- `TaskDetailPanel.test.tsx` (extend): attachments render; upload args inherit task restriction/visibility.

### 7. Verify
- `pnpm turbo typecheck lint test build`; root `pnpm test:rules` (now boots firestore + storage; env: `PATH=/opt/homebrew/opt/node@22/bin:...`, `JAVA_HOME=/opt/homebrew/opt/openjdk@21`); `node scripts/check-bundle-isolation.mjs`.
- Emulator smoke (`--project siapp-prod`; storage emulator included): as pm upload PDF → row + preview + download via getBlob; dept-restricted upload → invisible to out-of-dept pm, visible to owner; oversize/zip rejected; task attachment → appears in panel + Documents tab + `doc_added` in activity feed; soft delete → row gone, object retained, viewer has no delete; REST negative: create doc with `scanStatus:'clean'` → PERMISSION_DENIED; watch for composite-index suggestions (expect none).
- Flag explicitly: UI not browser-verified unless a browser is available.

### 8. Ship
- Conventional commit, push, PR against `main` using `.github/pull_request_template.md`. PR body flags the decision-7 tradeoffs + production CORS TODO.

## Critical files
- `storage.rules` (rewrite), `firestore.rules` (documents writes + updates action allowlist)
- `backend/rules-tests/src/{documents.test.ts,storage.test.ts,helpers.ts}`, root `package.json` (test:rules script)
- `packages/shared/src/{constants.ts,firestoreTypes.ts}`
- `apps/web/src/surfaces/firm/projects/documents/{useDocuments.ts,DocumentsSection.tsx,DocumentPreview.tsx}` (new)
- `apps/web/src/surfaces/firm/projects/{ProjectDetailPage.tsx,tasks/TaskDetailPanel.tsx}`, possibly `FirmShell.tsx`

## Out of scope (follow-ups)
Client/collaborator uploads + `client-uploads/` write rules (#21/#22); virus-scan pipeline (Q57); rename; hard delete/purge/trash/restore; `retentionUntil` enforcement; orphaned-object GC; thumbnails; drag-and-drop/multi-file; shareable download URLs; audit log (#23); production bucket CORS (deploy-time op, noted in PR).
