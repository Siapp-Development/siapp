/**
 * exportProject (#25): owner/admin-only per-project data export.
 *
 * Assembles a complete, versioned JSON snapshot of one project (project doc,
 * phases, milestones, tasks with nested update streams, activity feed and
 * documents metadata) via the Admin SDK. Rules are bypassed, so the claims
 * check below re-asserts owner/admin membership on {workspaceId} before any
 * read — same posture as deleteTask. Restricted tasks are included: export
 * is owner/admin-only and those roles bypass department need-to-know by
 * definition. Internal-only collections (magicLinks, messages, notification
 * queue) are excluded.
 *
 * D1: direct callable response with a ~9 MB guard (staged-Storage fallback
 *     documented in the plan, not built).
 * D3: documents are metadata + storagePath only — the web app resolves
 *     fresh download URLs via the client SDK; no binaries, no signed URLs.
 * D4: deliberately does NOT call assertWorkspaceActive — export is a read
 *     (the D5 audit write is server-internal logging, not customer-data
 *     mutation), and the PDPA data-portability posture requires data-out
 *     precisely when a firm is lapsing. Read-only workspaces still export;
 *     consistent with #24 D3.
 * D5: every export writes a 'project.export' audit entry with entity counts
 *     (log-and-continue — a failed audit write never blocks the export).
 * D6: soft-deleted documents are included with a `deleted` flag so the
 *     export faithfully reconstructs history (D-029 audit posture).
 *
 * Payload types mirror IExportProjectResponse in
 * packages/shared/src/callableTypes.ts — functions cannot import
 * @siapp/shared (source-only package).
 */

import { getFirestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';

/** Bump when the payload shape changes. */
export const EXPORT_VERSION = 1 as const;

/**
 * Callable responses are capped at ~10 MB; refuse just under it with a clear
 * error instead of an opaque transport failure.
 */
export const MAX_EXPORT_BYTES = 9 * 1024 * 1024;

/** Tasks per parallel updates-fetch batch (MVP scale: ~60 tasks). */
const UPDATES_FETCH_CHUNK = 20;

// ── Mirrored payload types (see header) ─────────────────────────────────────

export type TExportRecord = { id: string } & Record<string, unknown>;

export interface IExportTaskRecord {
  id: string;
  updates: TExportRecord[];
  [key: string]: unknown;
}

export interface IExportDocumentRecord {
  id: string;
  deleted: boolean;
  [key: string]: unknown;
}

export interface IExportProjectPayload {
  exportVersion: 1;
  exportedAt: string;
  workspaceId: string;
  projectId: string;
  project: TExportRecord;
  phases: TExportRecord[];
  milestones: TExportRecord[];
  tasks: IExportTaskRecord[];
  activity: TExportRecord[];
  documents: IExportDocumentRecord[];
}

// ── Pure helpers (exported for unit tests) ──────────────────────────────────

/** Minimal claims-bearing view of `request.auth`, so tests stay pure. */
export interface IAuthLike {
  uid?: string;
  token: Record<string, unknown>;
}

/**
 * Asserts the caller is an owner or admin of {workspaceId} per custom
 * claims and returns the uid. Stricter than the pm-inclusive editor checks
 * elsewhere — the issue's acceptance criteria say owner/admin only.
 */
export function requireOwnerAdminClaims(auth: IAuthLike | undefined, workspaceId: string): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  const workspaces = auth.token['workspaces'] as Record<string, { role?: unknown }> | undefined;
  const role = workspaces?.[workspaceId]?.role;
  if (role !== 'owner' && role !== 'admin') {
    throw new HttpsError(
      'permission-denied',
      'Only the workspace owner or an admin can export project data.',
    );
  }
  return auth.uid;
}

function isTimestampLike(value: unknown): value is { toDate: () => Date } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  );
}

/**
 * Deep-converts Firestore Timestamps (anything with a toDate()) to ISO-8601
 * strings at every depth; arrays and plain objects are walked, scalars pass
 * through untouched.
 */
export function toIsoDeep(value: unknown): unknown {
  if (isTimestampLike(value)) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(toIsoDeep);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        toIsoDeep(entry),
      ]),
    );
  }
  return value;
}

/** A raw Firestore doc before serialization. */
export interface IRawDoc {
  id: string;
  data: Record<string, unknown>;
}

export interface IExportSource {
  workspaceId: string;
  projectId: string;
  exportedAt: Date;
  project: IRawDoc;
  phases: IRawDoc[];
  milestones: IRawDoc[];
  tasks: Array<IRawDoc & { updates: IRawDoc[] }>;
  activity: IRawDoc[];
  documents: IRawDoc[];
}

function toRecord(doc: IRawDoc): TExportRecord {
  return { ...(toIsoDeep(doc.data) as Record<string, unknown>), id: doc.id };
}

function numberField(data: Record<string, unknown>, field: string): number {
  const value = data[field];
  return typeof value === 'number' ? value : 0;
}

function timeField(data: Record<string, unknown>, field: string): number {
  const value = data[field];
  return isTimestampLike(value) ? value.toDate().getTime() : 0;
}

/**
 * Builds the versioned export envelope from raw docs: Timestamps → ISO
 * strings at every depth, deterministic ordering (phases/tasks by `order`,
 * activity by `at` desc, updates by `createdAt` asc, id as tiebreak), and
 * the D6 `deleted` flag on soft-deleted documents. Pure — unit-tested
 * without emulators.
 */
export function serializeExport(source: IExportSource): IExportProjectPayload {
  const byOrder = (a: IRawDoc, b: IRawDoc): number =>
    numberField(a.data, 'order') - numberField(b.data, 'order') || a.id.localeCompare(b.id);

  const tasks = [...source.tasks]
    .sort(byOrder)
    .map((task): IExportTaskRecord => ({
      ...toRecord(task),
      updates: [...task.updates]
        .sort(
          (a, b) =>
            timeField(a.data, 'createdAt') - timeField(b.data, 'createdAt') ||
            a.id.localeCompare(b.id),
        )
        .map(toRecord),
    }));

  const documents = source.documents.map((doc): IExportDocumentRecord => {
    const record = toRecord(doc);
    return { ...record, deleted: record['deletedAt'] != null };
  });

  return {
    exportVersion: EXPORT_VERSION,
    exportedAt: source.exportedAt.toISOString(),
    workspaceId: source.workspaceId,
    projectId: source.projectId,
    project: toRecord(source.project),
    phases: [...source.phases].sort(byOrder).map(toRecord),
    milestones: [...source.milestones].sort((a, b) => a.id.localeCompare(b.id)).map(toRecord),
    tasks,
    activity: [...source.activity]
      .sort((a, b) => timeField(b.data, 'at') - timeField(a.data, 'at') || a.id.localeCompare(b.id))
      .map(toRecord),
    documents,
  };
}

/**
 * Throws `resource-exhausted` when the serialized payload exceeds the
 * callable-response guard (D1). `maxBytes` is injectable for tests.
 */
export function assertExportSize(payload: unknown, maxBytes: number = MAX_EXPORT_BYTES): void {
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > maxBytes) {
    throw new HttpsError(
      'resource-exhausted',
      'This project is too large for a direct export. Contact support for a staged export.',
    );
  }
}

// ── Callable ─────────────────────────────────────────────────────────────────

function rawDoc(snap: QueryDocumentSnapshot): IRawDoc {
  return { id: snap.id, data: snap.data() as Record<string, unknown> };
}

export const exportProject = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  const projectId = typeof data['projectId'] === 'string' ? data['projectId'] : '';
  if (!workspaceId || !projectId) {
    throw new HttpsError('invalid-argument', 'workspaceId and projectId are required.');
  }

  const uid = requireOwnerAdminClaims(request.auth, workspaceId);
  // D4: no assertWorkspaceActive — export is a read and must keep working on
  // read_only (lapsed) workspaces for PDPA data portability. See header.

  const db = getFirestore();
  const projectRef = db.doc(`workspaces/${workspaceId}/projects/${projectId}`);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) {
    throw new HttpsError('not-found', 'Project not found.');
  }

  const [phasesSnap, milestonesSnap, tasksSnap, activitySnap, documentsSnap] = await Promise.all([
    projectRef.collection('phases').get(),
    projectRef.collection('milestones').get(),
    projectRef.collection('tasks').get(),
    projectRef.collection('activity').get(),
    projectRef.collection('documents').get(),
  ]);

  // Per-task update streams, fetched in bounded parallel chunks.
  const tasks: Array<IRawDoc & { updates: IRawDoc[] }> = [];
  const taskDocs = tasksSnap.docs;
  for (let i = 0; i < taskDocs.length; i += UPDATES_FETCH_CHUNK) {
    const chunk = taskDocs.slice(i, i + UPDATES_FETCH_CHUNK);
    const updateSnaps = await Promise.all(
      chunk.map((taskSnap) => taskSnap.ref.collection('updates').get()),
    );
    chunk.forEach((taskSnap, index) => {
      tasks.push({ ...rawDoc(taskSnap), updates: updateSnaps[index].docs.map(rawDoc) });
    });
  }

  const payload = serializeExport({
    workspaceId,
    projectId,
    exportedAt: new Date(),
    project: { id: projectSnap.id, data: projectSnap.data() as Record<string, unknown> },
    phases: phasesSnap.docs.map(rawDoc),
    milestones: milestonesSnap.docs.map(rawDoc),
    tasks,
    activity: activitySnap.docs.map(rawDoc),
    documents: documentsSnap.docs.map(rawDoc),
  });

  assertExportSize(payload);

  // D5: audit the exfiltration event with entity counts. Log-and-continue —
  // no project activity entry (exports must never surface client-side).
  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: uid,
    action: 'project.export',
    targetType: 'project',
    targetId: projectId,
    after: {
      taskCount: payload.tasks.length,
      updateCount: payload.tasks.reduce((sum, task) => sum + task.updates.length, 0),
      activityCount: payload.activity.length,
      documentCount: payload.documents.length,
      phaseCount: payload.phases.length,
      milestoneCount: payload.milestones.length,
    },
    ...callableRequestMeta(request),
  });

  return payload;
});
