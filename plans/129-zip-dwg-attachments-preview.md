# Impl plan #129 — Zip attachments everywhere, zip-contents preview, and .dwg support

> GitHub issue: Siapp-Development/siapp#129
> Scope & design decisions in this plan are pre-approved. Read-only research complete; this is the file-by-file build spec for the Builder.

## Goal
Make `.zip` uploads accepted on all three upload surfaces (firm project/task docs, client portal, collaborator `/t`), add a lightweight client-side **zip-contents preview** (read-only list of entry names + uncompressed sizes) on the firm Documents surface, and add `.dwg` (AutoCAD) as an accepted attachment type everywhere. The single source of truth for accepted types is `packages/shared/src/constants.ts`, mirrored verbatim into `storage.rules` and `firestore.rules`; parity is enforced by tests in `backend/rules-tests/src/`. Multi-tenant workspace isolation and D-036 bundle isolation are unchanged — no cross-surface imports are introduced (the shared helper lives in `@siapp/shared`, which every surface already imports).

## Design decisions (documented, pre-approved direction)

### DWG content-type normalization
Browsers report the MIME type of `.dwg` files inconsistently (frequently `''`, sometimes `application/octet-stream`, `application/acad`, or `image/vnd.dwg`). All three upload paths currently (a) validate against the allowlist using `file.type` and (b) write `file.type` as both the Storage object `contentType` and the Firestore `mimeType`. If `file.type` is empty/non-standard, validation fails and — even if it passed — the Storage object would carry a `contentType` not in `storage.rules`, so the upload would be rejected by rules.

**Decision:** normalize by **filename extension**. Add a pure helper in `@siapp/shared`:

```ts
// packages/shared/src/uploads.ts
export const DWG_CONTENT_TYPE = 'image/vnd.dwg';
/** Pin the IANA-registered image/vnd.dwg for .dwg files (browsers report their MIME inconsistently); pass every other type through unchanged. */
export function resolveUploadContentType(fileName: string, browserType: string): string {
  if (fileName.toLowerCase().endsWith('.dwg')) {
    return DWG_CONTENT_TYPE;
  }
  return browserType;
}
```

Every upload path computes `const contentType = resolveUploadContentType(file.name, file.type)` and uses that value for BOTH the allowlist check AND the value written to Storage `contentType` + Firestore `mimeType`. This guarantees the bytes and the metadata always carry `image/vnd.dwg`, which is in all three allowlists and both rules files. Non-`.dwg` files are unaffected.

### Native picker `.dwg` acceptance
Because browsers may not map `image/vnd.dwg` to `.dwg` in the file picker, append the literal extension token `.dwg` to each `accept` string (in addition to the MIME list derived from constants). This is advisory only; validation is the real gate.

### Zip-contents preview approach
- **Library:** `jszip` (added to `apps/web/package.json`).
- **Data source:** reuse the existing rules-enforced blob flow — `getPreviewUrl(storagePath)` returns a `blob:` object URL (via `getBlob`). The zip view `fetch()`es that local object URL to get a `Blob`, then `JSZip.loadAsync(blob)`. `loadAsync` parses the archive's directory into memory but does NOT decompress entry contents, so it stays lightweight; no extra network round-trip (the blob is local).
- **Rendering:** a **flat, alphabetically-sorted full-path list** (not a tree — simplest, accessible). Directory entries are shown with a trailing `/` and no size; file entries show a formatted uncompressed size. Files inside the zip are never rendered/extracted.
- **Uncompressed size:** JSZip's public API does not expose per-entry uncompressed size; it is read from the parsed entry's internal `_data.uncompressedSize` via a narrowly-typed cast (NOT `any`) — see Risks. This avoids decompressing entries just to measure them.
- **States:** loading (`role="status"` "Reading archive…"), error (`role="alert"` friendly message for corrupt/unreadable archives), empty (archive with no entries).

### Preview gating (why NOT add zip to `PREVIEWABLE_MIME_TYPES`)
`PREVIEWABLE_MIME_TYPES` documents the subset the app renders inline via `<img>`/`<iframe>`; a zip is neither. To keep that constant's meaning clean, zip is gated by a **dedicated `isZipContentType()` check** layered on top of `isPreviewable()`, not by adding zip to the shared constant. `.dwg` is intentionally NOT previewable and is NOT added to `PREVIEWABLE_MIME_TYPES`.

## Touched surfaces & files

Surfaces affected: firm app (`dashboard.siapp.app`) Documents/Attachments UI; client portal (`siapp.app/p/*`) upload; collaborator (`siapp.app/t/*`) upload. Rules + shared constants are cross-surface. No marketing/admin surface changes. Bundle isolation (D-036) preserved — only `@siapp/shared` is added as a dependency edge, which all surfaces already have.

### Shared constants + helper
1. `packages/shared/src/constants.ts`
   - `ALLOWED_DOCUMENT_MIME_TYPES` (firm): add `'image/vnd.dwg'`. (zip already present — verify, keep.)
   - `COLLAB_ALLOWED_DOCUMENT_MIME_TYPES`: add `'image/vnd.dwg'`. (zip already present — verify, keep.)
   - `CLIENT_ALLOWED_DOCUMENT_MIME_TYPES`: add `'application/zip'`, `'application/x-zip-compressed'`, and `'image/vnd.dwg'`. Update the JSDoc (it currently says "PDF, images and Word only … a deliberate subset").
   - `PREVIEWABLE_MIME_TYPES`: **unchanged** (no zip, no dwg).
2. `packages/shared/src/uploads.ts` (NEW): `DWG_CONTENT_TYPE` + `resolveUploadContentType()` as above.
3. `packages/shared/src/index.ts`: add `export * from './uploads.ts';`.

### Security rules (mirror constants verbatim)
4. `storage.rules`
   - `isAllowedContentType()`: add `'image/vnd.dwg'`.
   - `isClientAllowedContentType()`: add `'application/zip'`, `'application/x-zip-compressed'`, `'image/vnd.dwg'`.
   - `isCollabAllowedContentType()`: add `'image/vnd.dwg'`.
5. `firestore.rules`
   - Client portal doc mime list in `validPortalDocumentCreate` (~L377–384): add `'image/vnd.dwg'` (zip already present).
   - Collaborator doc mime list in `validCollabDocumentCreate` (~L422–429): add `'image/vnd.dwg'` (zip already present).
   - NOTE: the firm `validDocumentCreate` (~L325) only checks `d.mimeType is string` (no allowlist) — **no change needed**; the firm mime gate lives solely in `storage.rules`.

### Firm upload + preview (web)
6. `apps/web/src/surfaces/firm/projects/documents/useDocuments.ts`
   - `validateDocumentFile(file)`: compute `const contentType = resolveUploadContentType(file.name, file.type)` and test the allowlist against `contentType` instead of `file.type`.
   - `uploadDocument()`: compute `contentType` once and use it for `uploadBytesResumable(..., { contentType })` AND the Firestore `mimeType` field (currently both use `file.type`). Also use it for the `appendDocActivity` `mimeType` payload.
   - Import `resolveUploadContentType` from `@siapp/shared`.
7. `apps/web/src/surfaces/firm/projects/documents/zip.ts` (NEW)
   - Export `isZipContentType(mimeType: string): boolean` → `mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed'`.
   - Export `interface IZipEntry { path: string; isDirectory: boolean; sizeBytes: number }`.
   - Export `async function readZipEntries(blob: Blob): Promise<IZipEntry[]>` → `JSZip.loadAsync(blob)`, iterate entries, map to `IZipEntry` (read uncompressed size via a narrowly-typed cast of the JSZip object — see Risks), sort by `path` (localeCompare). No `console.*`.
8. `apps/web/src/surfaces/firm/projects/documents/DocumentPreview.tsx`
   - Restructure the render branching:
     - `mimeType.startsWith('image/')` → `<img>` (unchanged).
     - `isZipContentType(mimeType)` → render the new `<ZipContents url={url} name={name} />` view.
     - `mimeType === 'application/pdf'` → `<iframe>` (was the catch-all `else`).
     - else → accessible "No preview available — download to view." block (covers dwg/docx/etc. defensively).
   - Add a `ZipContents` subcomponent (or a sibling file `ZipContentsPreview.tsx` — Builder's call, keep it in the same folder) that: on mount `fetch(url).then(r => r.blob())` → `readZipEntries(blob)`; holds `loading | ready | error` state; renders an accessible `<table>` (columns Name / Size, `<caption className="sr-only">Contents of {name}</caption>`) or a `<ul>` list; directory rows show trailing `/` and an em-dash for size; file rows use `formatBytes`. Loading = `role="status"`; error = `role="alert"` with a friendly corrupt-archive message. Reuse `formatBytes` from `./formatBytes.ts`.
9. `apps/web/src/surfaces/firm/projects/documents/DocumentsSection.tsx`
   - `FILE_INPUT_ACCEPT`: change to `` `${ALLOWED_DOCUMENT_MIME_TYPES.join(',')},.dwg` ``.
   - `isPreviewable(mimeType)`: return `PREVIEWABLE_MIME_TYPES.includes(mimeType) || isZipContentType(mimeType)` (import `isZipContentType` from `./zip.ts`). This makes the "Preview" action appear for zip rows and route into `DocumentPreview`.
   - No other logic changes (blob URL lifecycle/revoke already handled by the existing `preview` state + effect).

### Client portal upload (web)
10. `apps/web/src/surfaces/portal/documents/usePortalDocuments.ts`
    - `validateClientFile`: change signature to `{ name: string; size: number; type: string }`; compute `resolveUploadContentType(name, type)` and test the allowlist against it.
    - `uploadPortalDocument`: compute `contentType = resolveUploadContentType(file.name, file.type)` and use it for `uploadBytesResumable(..., { contentType })` AND the Firestore `mimeType`.
    - Import `resolveUploadContentType` from `@siapp/shared`.
11. `apps/web/src/surfaces/portal/documents/usePortalDocumentUpload.ts`
    - `startUpload(file)` already passes a `File` to `validateClientFile` — update the call site to pass `{ name: file.name, size: file.size, type: file.type }` (or pass `file` if the validator signature accepts a structural superset; keep it explicit).
    - `accept`: change to `` `${CLIENT_ALLOWED_DOCUMENT_MIME_TYPES.join(',')},.dwg` ``.

### Collaborator upload (web)
12. `apps/web/src/surfaces/collab/useCollabTask.ts`
    - `validateCollabFile`: change signature to `{ name: string; size: number; type: string }`; compute `resolveUploadContentType(name, type)` and test the allowlist against it.
    - `uploadCollabDocument`: compute `contentType = resolveUploadContentType(file.name, file.type)` and use it for `uploadBytesResumable(..., { contentType })` AND the Firestore `mimeType`.
    - Import `resolveUploadContentType` from `@siapp/shared`.
13. `apps/web/src/surfaces/collab/CollabUploader.tsx`
    - Replace the hard-coded `accept="image/*,.pdf,.doc,.docx,.zip"` with `` accept={`${COLLAB_ALLOWED_DOCUMENT_MIME_TYPES.join(',')},.dwg`} `` (import the constant from `@siapp/shared`). Update `handleFile`'s call to `validateCollabFile(file)` to pass the `{ name, size, type }` shape (or `file`).
    - Copy tweak: the helper text/error string ("Images, PDF, Word, or ZIP") may optionally mention CAD/DWG — keep minimal; not required.

### Dependency
14. `apps/web/package.json`: add `"jszip"` to `dependencies` (pin a current 3.x, e.g. `"^3.10.1"`). Run the workspace install so `pnpm-lock.yaml` updates.

## Data model changes
No new collections or fields. The only change to persisted data is that `documents/{did}.mimeType` (and the Storage object `contentType`) may now be `image/vnd.dwg`, `application/zip`, or `application/x-zip-compressed` on surfaces where they previously weren't allowed. Security-rules implications:
- `storage.rules` create allowlists and `firestore.rules` `validPortalDocumentCreate` / `validCollabDocumentCreate` mime lists gain `image/vnd.dwg` (client also gains zip). Everything else (size caps, path pinning, identity-field pinning, workspace-scoped `isFirmMember`/`isPortalClient`/`isCollabPrincipal` gates, immutability) is unchanged. **Workspace isolation is untouched** — no path or claim logic changes.
- Constants ↔ storage.rules ↔ firestore.rules parity must remain exact after the edits (client & collab lists include zip + dwg; firm list includes zip + dwg; firm firestore rule stays allowlist-free by design).

## Steps (each independently verifiable)
1. **Shared helper + constants.** Add `packages/shared/src/uploads.ts`, export it from `index.ts`, and add the mime entries to the three allowlists in `constants.ts`. Verify: `pnpm --filter @siapp/shared build`/typecheck passes; `import { resolveUploadContentType } from '@siapp/shared'` resolves.
2. **storage.rules.** Add `image/vnd.dwg` to all three `is*AllowedContentType()` functions and zip to `isClientAllowedContentType()`. Verify by inspection against constants.
3. **firestore.rules.** Add `image/vnd.dwg` to the client (~L377) and collab (~L422) mime lists. Verify by inspection.
4. **Rules-tests parity + additions** (see Test plan). Verify: `pnpm --filter @siapp/rules-tests test` (or the repo's rules-test command) green.
5. **Firm upload path.** Edit `useDocuments.ts` (validate + upload use `resolveUploadContentType`). Verify: unit test for `validateDocumentFile` accepts a `.dwg` File with empty `type`.
6. **Zip util + preview.** Add `zip.ts`; add `jszip` dep; restructure `DocumentPreview.tsx` (image / zip / pdf / no-preview) and add the `ZipContents` view; extend `isPreviewable` + `FILE_INPUT_ACCEPT` in `DocumentsSection.tsx`. Verify: component tests below.
7. **Portal upload path.** Edit `usePortalDocuments.ts` + `usePortalDocumentUpload.ts` (validator signature, accept list, contentType normalization). Verify: existing `usePortalDocuments.test.ts` updated + green.
8. **Collab upload path.** Edit `useCollabTask.ts` + `CollabUploader.tsx` (validator signature, accept from constant, contentType normalization). Verify: component test for accept list.
9. **Full gate.** Run the verification checklist below.

## Test plan (for Tester)
Rules tests (`backend/rules-tests/src/`) — the storage parity loops auto-extend from the shared constants; add explicit coverage where lists are hard-coded:
- `storage.test.ts`: parity loop over `ALLOWED_DOCUMENT_MIME_TYPES` already covers `image/vnd.dwg`/zip once constants change — confirm it passes; keep the `image/svg+xml` deny case.
- `portalStorage.test.ts`: parity loop over `CLIENT_ALLOWED_DOCUMENT_MIME_TYPES` now includes zip + dwg — confirm green. Keep the spreadsheet-deny negative. Optionally add an explicit `image/vnd.dwg` success assertion.
- `collabStorage.test.ts`: parity loop over `COLLAB_ALLOWED_DOCUMENT_MIME_TYPES` now includes dwg — confirm green. Optionally add explicit `image/vnd.dwg` success.
- `collab.test.ts` (firestore-level): the "rejects bad storage paths, mime types and sizes" case asserts `mimeType: 'application/zip'` **succeeds**; add a case asserting `mimeType: 'image/vnd.dwg'` **succeeds** (mirrors the new firestore.rules list). Keep the `application/x-msdownload` reject.
- ALSO UPDATE (not in the issue's list but required for firestore parity): `portal.test.ts` (`validPortalDocumentCreate`) — add positive cases asserting `mimeType: 'application/zip'` and `mimeType: 'image/vnd.dwg'` **succeed** for a client upload (they previously would have failed the firestore list / were absent from constants). Keep the spreadsheet-reject.

Web component/unit tests (`apps/web/src`):
- `useDocuments` (or a new `useDocuments.test.ts`): `validateDocumentFile` accepts a `File` named `plan.dwg` with `type: ''` (returns null) and that `resolveUploadContentType('plan.dwg','') === 'image/vnd.dwg'`.
- `DocumentPreview.test.tsx`: (a) renders the zip-contents list for a zip mimeType — mock `fetch`/`JSZip` or pass a real small zip Blob via `jszip` and assert entry names + sizes render and the table/list is accessible; (b) renders the "No preview available" branch for a non-previewable type (e.g. `application/msword` or `image/vnd.dwg`); (c) images/pdf branches still render `<img>`/`<iframe>`.
- `DocumentsSection.test.tsx`: the file input `accept` includes `.dwg`; a zip row shows a "Preview" action (isPreviewable true for zip).
- `usePortalDocuments.test.ts`: update `validateClientFile` calls to the new `{ name, size, type }` shape; add a `.dwg` (empty type) accept case and a zip accept case; assert `accept` string / upload `contentType` normalization if covered.
- New `CollabUploader.test.tsx` (none exists today): assert the `accept` attribute is derived from `COLLAB_ALLOWED_DOCUMENT_MIME_TYPES` and includes `.dwg`; assert a `.dwg`/zip file passes `validateCollabFile`.
- Zip util `zip.test.ts`: `readZipEntries` on a small in-memory zip (built with `jszip`) returns sorted entries with correct paths + uncompressed sizes; `isZipContentType` truth table; corrupt input rejects/throws so the component's error branch triggers.
- Accessibility: the zip list/table and the no-preview block must be reachable and labelled (caption/heading, `role=status`/`role=alert` on loading/error); run the existing axe helper if the suite uses one.

Conventions: TypeScript strict (no `any`; use narrow interfaces + `unknown` casts), named exports, function-declaration components, no `console.log`, existing styling/`cn` patterns.

## Verification checklist
- [ ] `pnpm -w build` (all packages) succeeds.
- [ ] `pnpm -w lint` clean (no new eslint errors; no `any`, no `console.*`).
- [ ] `pnpm -w typecheck` (or `tsc -b`) clean.
- [ ] `pnpm --filter @siapp/web test` green (new + updated component/unit tests).
- [ ] Rules tests green: `storage.test.ts`, `portalStorage.test.ts`, `collabStorage.test.ts`, `collab.test.ts`, `portal.test.ts`.
- [ ] Manual parity re-read: `constants.ts` ↔ `storage.rules` ↔ `firestore.rules` all agree (firm: +dwg; client: +zip +dwg; collab: +dwg; firm firestore stays allowlist-free).
- [ ] `pnpm-lock.yaml` updated for `jszip`.

## Out of scope
- Server-side zip inspection, virus scanning of archive contents, or extracting/previewing files INSIDE a zip (only the entry listing is rendered).
- Adding inline preview to the portal (`PortalDocumentsSection`) or collaborator (`CollabUploader`) surfaces — both remain download/open-in-new-tab only; "consistent behavior" here means we do NOT regress them into inline preview. The zip-contents preview is firm-surface only (the only surface with a `getBlob`-based preview flow + `DocumentPreview`).
- Rendering `.dwg` previews (DWG is not browser-previewable; only the "no preview" branch + download).
- Changing size caps, retention, soft-delete, scan pipeline, or any workspace-isolation logic.
- Backfilling existing documents' `mimeType`.

## Risks / open questions
- **JSZip uncompressed-size access:** the public API does not expose per-entry uncompressed size without decompressing. The plan reads it from the parsed entry's internal `_data.uncompressedSize` via a narrowly-typed cast (define a minimal `interface` and cast through `unknown`, not `any`). This relies on a JSZip 3.x internal field (stable in practice). If the team rejects touching internals, the fallback is to omit sizes (names/folders only) or to `await entry.async('uint8array')` per entry (heavier). **Confirm the cast is acceptable, or pick a fallback.**
- **`.dwg` MIME normalization is extension-based**, so a file named `.dwg` is always uploaded as `image/vnd.dwg` regardless of true bytes (consistent with how the existing code trusts `file.type`). Acceptable given no server-side content sniffing exists (same trust model as today).
- **`accept` duplication of `,.dwg`** across three surfaces is intentional (advisory only). No shared constant introduced to avoid over-engineering; flag if a single source is preferred.
- **`portal.test.ts` is not in the issue's enumerated test list** but must be updated for firestore-level client mime parity (issue listed the storage-level `portalStorage.test.ts`). Included above.
- **No decision-log entry defines the mime allowlist** (D-034/D-029 cover portal/collab uploads but not specific types); this change does not contradict any logged decision. D-036 bundle isolation preserved.
