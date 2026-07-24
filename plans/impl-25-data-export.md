---
title: "Implementation plan — #25 Data export (per-project JSON + CSV)"
status: draft
updated: 2026-07-24
---

# Implementation plan — #25 Data export — per-project JSON + CSV

## Goal

Let firms get their data out of Siapp, per project, in JSON and CSV — the MVP "Admin & ops: Data export (per project, JSON + CSV)" line in [pm_ux/plans/11-mvp-scope.md](../pm_ux/plans/11-mvp-scope.md) and part of the PDPA posture ([pm_ux/plans/14-legal-compliance.md](../pm_ux/plans/14-legal-compliance.md): data portability / trust). A new owner/admin-only callable `exportProject` assembles a complete JSON snapshot of one project server-side (Admin SDK, bypassing rules but re-asserting role via custom claims, same pattern as [deleteTask.ts](../backend/functions/src/callables/deleteTask.ts)); the firm web app offers "Download JSON" and per-entity "Download CSV" from the project Details tab, generating CSVs client-side from the same payload. Documents are **listed** (metadata + `storagePath`); the browser resolves fresh short-lived download URLs via the existing client-SDK `getDownloadURL` pattern — no binary bundling and no admin-SDK signed URLs at MVP.

No logged decision (D-0nn) covers export directly; this plan aligns with D-019 (read-only expiry — see D4 below), D-027 (lifecycle), D-036 (bundle isolation), and the #23/#24 callable conventions. No decisions are contradicted.

## Acceptance criteria mapping

| Issue criterion | Where it lands |
|---|---|
| Export a project as JSON and CSV (tasks, updates, activity) | `exportProject` callable returns full JSON (project, phases, tasks, per-task updates, activity, milestones, documents metadata); web generates `tasks.csv`, `updates.csv`, `activity.csv`, `documents.csv` from that payload (D2) |
| Documents listed with signed URLs or bundled | Listed with metadata + `storagePath`; web resolves fresh `getDownloadURL` links on render/click — "signed URLs" satisfied via Firebase tokened URLs, no bundling (D3) |
| Only owner/admin can export | Callable asserts `role in ['owner','admin']` from custom claims (stricter than the pm-inclusive editor check); UI button hidden for pm/viewer; server check is authoritative |

## Touched surfaces & files

**Surfaces:** firm app (`dashboard.siapp.app`) + backend functions only. Apex, `siapp.app/p/*` client portal, `siapp.app/t/*` collaborator, and admin bundles untouched — D-036 bundle isolation unaffected; `scripts/check-bundle-isolation.mjs` must stay green.

Create:

- `backend/functions/src/callables/exportProject.ts` — callable + exported pure helpers (`requireOwnerAdminClaims`, `serializeExport` / timestamp→ISO conversion) for unit testing. NodeNext ESM with `.js` import extensions; region comes from `globalOptions.ts`; **cannot import `@siapp/shared`** (source-only package) so the export payload types are mirrored locally (same convention as the other callables).
- `backend/functions/src/callables/exportProject.test.ts` — pure-function tests (auth blocker, serialization), mirroring [issuePortalLink.test.ts](../backend/functions/src/callables/issuePortalLink.test.ts) style.
- `apps/web/src/surfaces/firm/projects/export/ExportSection.tsx` — Details-tab card: "Download JSON", per-entity "Download CSV" buttons, document list note. Owner/admin-gated by the `role` prop already threaded through `ProjectDetailPage`.
- `apps/web/src/surfaces/firm/projects/export/ExportSection.test.tsx`
- `apps/web/src/surfaces/firm/projects/export/exportCsv.ts` — pure CSV serializers (tasks/updates/activity/documents rows; RFC-4180 quoting, UTF-8 BOM for Excel) + Blob/anchor download helper.
- `apps/web/src/surfaces/firm/projects/export/exportCsv.test.ts`

Modify:

- `backend/functions/src/index.ts` — export `exportProject` (wiring + header comment line).
- `backend/functions/src/lib/activityDiff.ts` — extend `TAuditAction` union with `'project.export'` (D5).
- `packages/shared/src/callableTypes.ts` — `IExportProjectRequest` / `IExportProjectResponse` (consumed by web only; functions mirror locally).
- `apps/web/src/lib/callables.ts` (+ its test) — typed `exportProject` wrapper.
- `apps/web/src/surfaces/firm/projects/ProjectDetailPage.tsx` (+ test) — render `ExportSection` in the Details tab when `role` is owner/admin.
- `pm_ux/plans/firestore-data-model.md` — no schema change; optional one-line note that `project.export` audit action exists (documentation only, if the Builder touches this file at all).

**No `firestore.rules` / `storage.rules` changes — confirmed.** The callable reads via Admin SDK (bypasses rules); the `auditLog` collection already exists with owner/admin read + `write: false`; document downloads reuse the existing firm-member Storage read rules already exercised by `DocumentsSection` / `getDownloadURL`.

## Data model changes

**None.** No new collections or fields. Multi-tenant isolation is preserved because every read in the callable is rooted at `workspaces/{wid}/projects/{pid}/…` after the claims check proves the caller belongs to `{wid}` with owner/admin role — identical posture to `deleteTask`. One new **value** in the audit-log `action` field (`'project.export'`), which is schemaless in Firestore and additive in the `TAuditAction` TS union.

## Design

### Export payload (assembled server-side)

```
{
  exportVersion: 1,
  exportedAt: ISO string,
  workspaceId, projectId,
  project: {…},                      // project doc, timestamps → ISO strings
  phases: […],
  milestones: […],
  tasks: [{ …task, updates: […] }],  // updates nested per task (natural CSV split still easy)
  activity: […],                     // projects/{pid}/activity — #23 project feed
  documents: [{ id, name, mimeType, sizeBytes, storagePath, scope, scopeId,
                uploadedBy, uploaderType, uploadedAt, visibleToClient,
                restrictedToDepartments, scanStatus, deletedAt?, … }],
}
```

- All `Timestamp`s converted to ISO-8601 strings by a pure `serializeExport` helper (unit-tested).
- Task `updates` fetched per task (MVP scale: ~60 tasks × small update streams). Reads are sequential-batched (e.g. `Promise.all` in chunks) to keep the callable well under timeout.
- **Restricted tasks are included.** Export is owner/admin-only and owner/admin bypass department need-to-know by definition (see 20-access-control-departments.md), so no filtering is needed — but the payload retains `restrictedToDepartments` so the export is faithful.
- Internal-only collections are **excluded**: `magicLinks` (secrets), `messages` (workspace-level, not project-scoped), notification queue internals.

### Size limits & fallback

Callable responses are capped at ~10 MB. MVP projects (≤ ~100 tasks, activity in the hundreds, documents as metadata only) land well under 1 MB. The callable defensively measures the serialized payload and throws `resource-exhausted` with a clear message if it exceeds ~9 MB. **Fallback plan (not built now):** if real projects hit the cap, switch delivery to a staged export file written to `workspaces/{wid}/exports/{exportId}.json` in Storage + return a download path — the callable signature (`{ workspaceId, projectId }` in, versioned envelope out) is forward-compatible with that change.

### CSV generation — client-side

CSVs are derived in the browser from the JSON payload by pure serializers in `exportCsv.ts`. Justification: (a) one server round-trip serves both formats; (b) no new server deps (no csv/zip packages in functions); (c) serializers are trivially unit-testable with Vitest in the web package; (d) functions can't import `@siapp/shared`, so keeping CSV shaping out of functions avoids more mirrored code. Server-side CSV was rejected: it would triple the response size (JSON + N CSVs) or require multiple callables.

### Web flow

1. Details tab (owner/admin only) shows an "Export project data" card.
2. Click "Download JSON" → invoke `exportProject` wrapper → `Blob` + temporary anchor download (`{project-name}-export-{date}.json`). Payload cached in component state for subsequent CSV clicks.
3. CSV buttons (`tasks.csv`, `updates.csv`, `activity.csv`, `documents.csv`) serialize from the cached payload (fetch first if not cached).
4. `documents.csv` includes `storagePath`; the on-screen document list in the card offers per-file "Get link" resolving `getDownloadURL(ref(storage, storagePath))` — same client pattern as [useDocuments.ts](../apps/web/src/surfaces/firm/projects/documents/useDocuments.ts) — so links are fresh, short-lived Firebase tokened URLs and work identically in emulator and prod. Admin-SDK `getSignedUrl` was rejected: it needs a service-account key / IAM signBlob in prod and behaves differently in the emulator.
5. Loading/error states use the existing callable error-mapping pattern from `ProjectDetailPage`. All buttons are real `<button>`s with accessible names; downloads announce via `aria-live` status text (accessibility instructions apply).

## Decision points

- **D1 — Export delivery mechanism: direct callable JSON response (recommended)** vs staged Storage file.
  - *Direct callable (recommended):* zero infra, no retention/cleanup of export artifacts, no new Storage rules, instant download. Safe at MVP scale; ~10 MB cap guarded with a clear error and a documented fallback path (above).
  - *Staged Storage file:* needed only for large exports; adds lifecycle cleanup, Storage rules or signed-URL plumbing, and async UX. Defer until a real project trips the cap.
- **D2 — CSV shape: one CSV per entity, generated client-side, separate downloads (recommended)** vs single flattened CSV vs client-side zip.
  - Tasks/updates/activity/documents have disjoint columns; flattening loses fidelity and confuses spreadsheet users. Separate downloads avoid adding a zip dependency (e.g. jszip) for a rarely-used flow — revisit zipping if users ask. JSON remains the canonical "everything" artifact.
- **D3 — Documents handling: list with metadata + storagePath, fresh client-SDK download URLs on demand (recommended)** vs admin-SDK signed URLs in the payload vs bundling binaries.
  - Client-SDK `getDownloadURL` reuses proven rules + works in emulator and prod without service-account signing. Embedding signed URLs in the export file would bake expiring links into an artifact meant for long-term retention — misleading. Binary bundling blows the size cap and adds zip/staging complexity; explicitly out of scope at MVP (the firm can download individual files via the existing Documents tab).
- **D4 — Export allowed when workspace is `read_only`: YES (recommended).** The callable deliberately does **not** call `assertWorkspaceActive`. Export is a read; PDPA/data-portability posture requires data-out precisely when a firm is lapsing. Consistent with #24 D3 ("read access is preserved on read-only workspaces"). ⚠️ Flag: `assertWorkspaceActive`'s doc comment says "every callable that mutates … must call this" — export doesn't mutate firm data (the audit write in D5 is server-internal logging, not customer data mutation), so skipping it is compliant, but the callable header must state this explicitly so Validator doesn't flag it.
- **D5 — Audit logging: YES (recommended).** Every export writes `writeAuditLog(wid, { action: 'project.export', targetType: 'project', targetId: pid, actorType: 'user', actorId: uid, after: { taskCount, activityCount, documentCount }, …callableRequestMeta })`. Data exfiltration events are exactly what an audit log is for (PDPA do-not-cut). Log-and-continue semantics (existing writer) mean a failed audit write never blocks the export. **No project activity entry** — exports are firm-internal and must never surface in the client-visible feed.
- **D6 — Soft-deleted documents: include, flagged (recommended)** vs exclude. Include docs with `deletedAt` set (fields intact) so the export faithfully reconstructs history — matching the D-029 audit posture ("a dispute can always reconstruct what was uploaded and when"). The UI document list and `documents.csv` carry a `deleted` column; "Get link" is disabled for deleted/`infected` docs.

## Steps

1. **Shared types** — add `IExportProjectRequest` / `IExportProjectResponse` (+ payload sub-types) to `packages/shared/src/callableTypes.ts`; export from `index.ts`. Verify: `pnpm --filter @siapp/shared typecheck` (or workspace typecheck) green.
2. **Callable** — create `backend/functions/src/callables/exportProject.ts`: locally-mirrored types, `requireOwnerAdminClaims` (owner/admin only — no pm), reads project → 404 if missing, gathers phases/milestones/tasks(+updates)/activity/documents, `serializeExport` timestamp conversion, ~9 MB guard, D5 audit write, **no** `assertWorkspaceActive` (D4, documented in header). Verify: functions typecheck + lint.
3. **Wire** — export `exportProject` from `backend/functions/src/index.ts`; extend `TAuditAction` with `'project.export'` in `lib/activityDiff.ts`. Verify: functions build green; emulator smoke shows the function registered.
4. **Callable tests** — `exportProject.test.ts`: claims blocker (viewer/pm/other-workspace/unauthenticated rejected; owner/admin pass), `serializeExport` (Timestamp→ISO, nested updates, soft-deleted doc passthrough), size-guard threshold. Verify: `pnpm --filter @siapp/functions test`.
5. **Web wrapper** — add `exportProject` to `apps/web/src/lib/callables.ts` + wrapper test. Verify: web typecheck + test.
6. **CSV serializers** — `exportCsv.ts` with `tasksToCsv`, `updatesToCsv`, `activityToCsv`, `documentsToCsv`, `downloadBlob` helper; RFC-4180 quoting (commas, quotes, newlines), UTF-8 BOM. Verify: `exportCsv.test.ts` green.
7. **UI** — `ExportSection.tsx` in the Details tab of `ProjectDetailPage` (owner/admin only): JSON download, four CSV downloads, document list with on-demand `getDownloadURL` links, loading/error/`aria-live` states. Verify: component tests + manual emulator walkthrough.
8. **Full gate** — `build`, `lint`, `typecheck`, `test` green across workspace; `scripts/check-bundle-isolation.mjs` green; emulator end-to-end: owner exports a seeded project (JSON opens, CSVs open in a spreadsheet, doc link downloads), viewer sees no export UI and gets `permission-denied` calling directly, read-only workspace still exports.

## Test plan

**Functions unit (Vitest, pure — matching existing callable-test style):**
- `requireOwnerAdminClaims`: unauthenticated → `unauthenticated`; viewer/pm/no-entry/wrong-workspace → `permission-denied`; owner + admin pass.
- `serializeExport`: Timestamps → ISO at every depth; updates nested under their task; soft-deleted + infected documents pass through with flags; unknown/legacy fields tolerated; deterministic ordering (tasks by `order`, activity by `at` desc).
- Size guard: payload over threshold → `resource-exhausted`.
- Read-only workspace: no `assertWorkspaceActive` invocation (assert by construction/test that a `read_only` workspace does not throw).

**Web unit/component (Vitest + RTL):**
- `exportCsv`: header rows, quoting/escaping (comma, quote, newline, unicode), empty collections → header-only file, BOM present.
- `callables.exportProject` wrapper: passes request, returns `.data`.
- `ExportSection`: hidden for pm/viewer, rendered for owner/admin; JSON click invokes the (mocked) wrapper and triggers a download; CSV buttons reuse the cached payload; error path renders the mapped message; doc "Get link" calls mocked `getDownloadURL`; disabled for deleted/infected docs; accessible names + `aria-live` status assertions.
- `ProjectDetailPage`: Details tab shows/hides `ExportSection` by role.

**Rules tests:** none required (no rules changes). Optionally one guard test in `backend/rules-tests` asserting clients still cannot write `auditLog` — already covered by #23 suites; skip unless Validator asks.

**Manual emulator walkthrough:** step 8 above.

## Out of scope

- Workspace-level or all-projects bulk export (MVP line is per-project).
- Binary document bundling / zip archives (D3); staged Storage export files (D1 fallback, only if size demands).
- Scheduled/automated exports, export to BigQuery (separate analytics track per decisions log).
- PDPA deletion-request endpoint (separate MVP line item).
- Audit-log **UI** (v1.5 per #23) — this issue only adds one new audit action value.
- Export of workspace-level collections (`messages`, `clients` beyond the project's denormalized client fields, `usageCounters`).

## Risks / open questions

1. **Payload growth** — a long-running published project with chatty updates could approach the 10 MB cap post-MVP. Mitigated by the guard + documented staged-file fallback (D1). Needs no human call now.
2. **PII in exports** — the payload contains client/collaborator names and phone numbers (denormalized on tasks/assignees). This is the point of data portability, but the firm becomes the data controller for the downloaded file. Open question for legal copy: should the UI show a one-line PDPA reminder ("This file contains personal data — handle per your PDPA obligations")? Recommend yes; needs a human call on wording.
3. **`documents.csv` URLs** — CSV carries `storagePath`, not URLs (D3). If a design partner expects clickable links in the CSV, we'd need embedded expiring URLs (misleading in an archive). Watch feedback; do not pre-build.
4. **Owner/admin only vs pm** — the issue says owner/admin; pm users manage projects daily and may ask for export. Deliberately strict per acceptance criteria; loosening later is a one-line claims-check change + UI gate.
5. **Client-side memory** — generating CSVs from a multi-MB JSON in the browser is fine at MVP scale; no streaming needed.

## Approved decisions (auto-approved — user unavailable, recommendations taken)

- **D1**: Direct callable JSON response (~9 MB guard; staged-Storage fallback documented, not built).
- **D2**: One CSV per entity (tasks/updates/activity/documents), generated client-side from the JSON payload; separate downloads, no zip dependency.
- **D3**: Documents as metadata + storagePath; UI resolves fresh links via client-SDK getDownloadURL; no binary bundling.
- **D4**: Export allowed on read_only workspaces (export is a read; PDPA data-out; consistent with #24 D3).
- **D5**: project.export audit entry per export with entity counts; not client-visible.
- **D6**: Soft-deleted documents included, flagged (D-029 audit-reconstruction posture).

## Verification & live smoke (post-build)

- `pnpm turbo run build lint typecheck test`: 18/18 green. Bundle isolation: pass. 40 new tests (14 callable, 17 CSV serializers, 7 ExportSection, 1 wrapper, 1 detail-page gating).
- Live smoke against emulators:
  - Export section renders in project Details tab (owner); JSON download works ("JSON export downloaded." status, documents list appears).
  - Direct callable as owner: exportVersion 1, project + 1 task with 5 nested updates, 12 activity entries, 3 documents with storagePath + deleted flag.
  - Viewer direct call → PERMISSION_DENIED ("Only the workspace owner or an admin can export project data.").
  - D5: 2 `project.export` entries in `workspaces/{wid}/auditLog` (one per successful export).
  - D4: export succeeds while `billingStatus: read_only`; baseline restored after.
  - Tasks CSV downloads with status announcement; document "Get link" resolves a working `getDownloadURL` link (emulator Storage URL opens).
