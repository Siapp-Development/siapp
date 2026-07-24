/**
 * deletePersonalData (#26, D3/D4): owner/admin-only PDPA erasure for one
 * client or collaborator.
 *
 * Erase-by-anonymization, in place — the doc id and non-PII shape survive so
 * projects, tasks and history stay coherent:
 *
 *   1. `pdpa.delete_request` audit entry (the request trail exists even if
 *      a later step fails).
 *   2. Anonymize the subject doc + set the server-only `pdpaErased` freeze
 *      marker (rules deny every further firm update on erased docs).
 *   3. Revoke the subject's live magic links.
 *   4. Scrub name denorms: `projects.clientNameDenorm` (clients);
 *      task `assignees[]` name+phone, task-update `authorNameDenorm`, and
 *      activity `actorNameDenorm` (collaborators).
 *   5. Redact message-queue PII in place (D6): `recipientPhone` plus any
 *      template variable equal to the pre-erasure name/phone.
 *   6. `pdpa.delete_fulfilled` audit entry with per-collection counts.
 *
 * Scrub failures are LOUD (unlike audit writes): a partial erasure must
 * surface to the firm, not be logged and forgotten — the response is the
 * firm's PDPA compliance evidence. Idempotent: re-running on an erased
 * subject re-scans and succeeds (D3).
 *
 * D4: deliberately does NOT call assertWorkspaceActive — PDPA erasure is a
 * legal obligation that applies precisely when a firm is lapsing, so
 * read-only workspaces can still erase (same posture as exportProject).
 * D7: existing audit-log payloads are retained as-is (legal-obligation
 * basis) — only the queue docs are redacted.
 *
 * Request/response mirror IDeletePersonalDataRequest/Response in
 * packages/shared/src/callableTypes.ts — functions cannot import
 * @siapp/shared (source-only package).
 */

import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type UpdateData,
} from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';
import { requireOwnerAdminClaims } from '../lib/callableAuth.js';
import {
  ANONYMIZED_CLIENT_NAME,
  ANONYMIZED_COLLABORATOR_NAME,
  PDPA_REDACTED,
  buildAnonymizedClientFields,
  buildAnonymizedCollaboratorFields,
  redactMessagePii,
} from '../lib/pdpa.js';

/** Firestore batch hard limit is 500; stay comfortably under. */
const BATCH_LIMIT = 400;

// ── Mirrored contract types (see header) ────────────────────────────────────

export type TPdpaSubjectType = 'client' | 'collaborator';

export interface IPdpaScrubCounts {
  projects: number;
  tasks: number;
  taskUpdates: number;
  activity: number;
  messages: number;
  magicLinks: number;
}

export interface IDeletePersonalDataResult {
  scrubbed: IPdpaScrubCounts;
}

// ── Pure helpers (exported for unit tests) ──────────────────────────────────

export interface IDeletePersonalDataArgs {
  workspaceId: string;
  subjectType: TPdpaSubjectType;
  subjectId: string;
}

/** Validates the callable payload; throws invalid-argument otherwise. */
export function parseDeletePersonalDataArgs(data: unknown): IDeletePersonalDataArgs {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Record<
    string,
    unknown
  >;
  const workspaceId = record['workspaceId'];
  const subjectType = record['subjectType'];
  const subjectId = record['subjectId'];
  if (
    typeof workspaceId !== 'string' ||
    workspaceId === '' ||
    typeof subjectId !== 'string' ||
    subjectId === '' ||
    (subjectType !== 'client' && subjectType !== 'collaborator')
  ) {
    throw new HttpsError(
      'invalid-argument',
      'workspaceId, subjectType (client|collaborator) and subjectId are required.',
    );
  }
  return { workspaceId, subjectType, subjectId };
}

/**
 * Anonymizes the subject's entries in a task `assignees[]` array — name AND
 * phone (assignee entries denormalize both). Returns null when nothing
 * matched (no write needed; keeps re-runs cheap and idempotent).
 */
export function scrubAssignees(
  assignees: unknown,
  subjectId: string,
  anonymizedName: string,
): unknown[] | null {
  if (!Array.isArray(assignees)) {
    return null;
  }
  let changed = false;
  const next = assignees.map((raw) => {
    const entry = raw as Record<string, unknown> | null;
    if (
      typeof entry !== 'object' ||
      entry === null ||
      entry['type'] !== 'collaborator' ||
      entry['id'] !== subjectId
    ) {
      return raw as unknown;
    }
    const scrubbed: Record<string, unknown> = { ...entry, name: anonymizedName };
    if (typeof entry['phone'] === 'string' && entry['phone'] !== PDPA_REDACTED) {
      scrubbed['phone'] = PDPA_REDACTED;
    }
    if (JSON.stringify(scrubbed) === JSON.stringify(entry)) {
      return raw as unknown;
    }
    changed = true;
    return scrubbed;
  });
  return changed ? next : null;
}

// ── Batched-update collector ─────────────────────────────────────────────────

interface IPendingUpdate {
  ref: DocumentReference;
  data: UpdateData<DocumentData>;
}

async function commitUpdates(db: Firestore, updates: IPendingUpdate[]): Promise<void> {
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const { ref, data } of updates.slice(i, i + BATCH_LIMIT)) {
      batch.update(ref, data);
    }
    await batch.commit();
  }
}

// ── Scrub passes ─────────────────────────────────────────────────────────────

async function revokeMagicLinks(
  db: Firestore,
  args: IDeletePersonalDataArgs,
  uid: string,
): Promise<number> {
  const snap = await db
    .collection(`workspaces/${args.workspaceId}/magicLinks`)
    .where('audience', '==', args.subjectType)
    .where('subjectId', '==', args.subjectId)
    .where('revoked', '==', false)
    .get();
  const updates: IPendingUpdate[] = snap.docs.map((doc) => ({
    ref: doc.ref,
    data: { revoked: true, revokedAt: FieldValue.serverTimestamp(), revokedBy: uid },
  }));
  await commitUpdates(db, updates);
  return updates.length;
}

/** Clients: `clientNameDenorm` on every linked project. */
async function scrubClientDenorms(
  db: Firestore,
  args: IDeletePersonalDataArgs,
  counts: IPdpaScrubCounts,
): Promise<void> {
  const snap = await db
    .collection(`workspaces/${args.workspaceId}/projects`)
    .where('clientId', '==', args.subjectId)
    .get();
  const updates: IPendingUpdate[] = [];
  for (const doc of snap.docs) {
    if (doc.get('clientNameDenorm') !== ANONYMIZED_CLIENT_NAME) {
      updates.push({ ref: doc.ref, data: { clientNameDenorm: ANONYMIZED_CLIENT_NAME } });
    }
  }
  await commitUpdates(db, updates);
  counts.projects = updates.length;
}

/**
 * Collaborators: assignee entries on every task, `authorNameDenorm` on their
 * task updates, and `actorNameDenorm` on their activity entries. Firestore
 * cannot query inside arrays-of-objects, so tasks are scanned per project —
 * fine at MVP scale (~60 tasks/project) for a rare compliance operation.
 */
async function scrubCollaboratorDenorms(
  db: Firestore,
  args: IDeletePersonalDataArgs,
  counts: IPdpaScrubCounts,
): Promise<void> {
  const projectsSnap = await db.collection(`workspaces/${args.workspaceId}/projects`).get();
  const taskUpdates: IPendingUpdate[] = [];
  const updateDocUpdates: IPendingUpdate[] = [];
  const activityUpdates: IPendingUpdate[] = [];

  for (const project of projectsSnap.docs) {
    const tasksSnap = await project.ref.collection('tasks').get();
    for (const task of tasksSnap.docs) {
      const scrubbed = scrubAssignees(
        task.get('assignees'),
        args.subjectId,
        ANONYMIZED_COLLABORATOR_NAME,
      );
      if (scrubbed !== null) {
        taskUpdates.push({ ref: task.ref, data: { assignees: scrubbed } });
      }
      const updatesSnap = await task.ref
        .collection('updates')
        .where('authorType', '==', 'collaborator')
        .where('authorId', '==', args.subjectId)
        .get();
      for (const update of updatesSnap.docs) {
        if (update.get('authorNameDenorm') !== ANONYMIZED_COLLABORATOR_NAME) {
          updateDocUpdates.push({
            ref: update.ref,
            data: { authorNameDenorm: ANONYMIZED_COLLABORATOR_NAME },
          });
        }
      }
    }

    const activitySnap = await project.ref
      .collection('activity')
      .where('actorType', '==', 'collaborator')
      .where('actorId', '==', args.subjectId)
      .get();
    for (const entry of activitySnap.docs) {
      if (entry.get('actorNameDenorm') !== ANONYMIZED_COLLABORATOR_NAME) {
        activityUpdates.push({
          ref: entry.ref,
          data: { actorNameDenorm: ANONYMIZED_COLLABORATOR_NAME },
        });
      }
    }
  }

  await commitUpdates(db, taskUpdates);
  await commitUpdates(db, updateDocUpdates);
  await commitUpdates(db, activityUpdates);
  counts.tasks = taskUpdates.length;
  counts.taskUpdates = updateDocUpdates.length;
  counts.activity = activityUpdates.length;
}

/** D6: redact queue-doc PII in place — the docs remain send evidence. */
async function redactMessages(
  db: Firestore,
  args: IDeletePersonalDataArgs,
  subject: { name: string; phone: string | null },
): Promise<number> {
  const snap = await db
    .collection(`workspaces/${args.workspaceId}/messages`)
    .where('recipientType', '==', args.subjectType)
    .where('recipientId', '==', args.subjectId)
    .get();
  const updates: IPendingUpdate[] = [];
  for (const doc of snap.docs) {
    const redaction = redactMessagePii(doc.data(), subject);
    if (redaction !== null) {
      updates.push({ ref: doc.ref, data: redaction });
    }
  }
  await commitUpdates(db, updates);
  return updates.length;
}

// ── Callable ─────────────────────────────────────────────────────────────────

export const deletePersonalData = onCall(async (request): Promise<IDeletePersonalDataResult> => {
  const args = parseDeletePersonalDataArgs(request.data);
  const uid = requireOwnerAdminClaims(request.auth, args.workspaceId);
  // D4: no assertWorkspaceActive — erasure must work on lapsed workspaces.

  const db = getFirestore();
  const collection = args.subjectType === 'client' ? 'clients' : 'collaborators';
  const subjectRef = db.doc(`workspaces/${args.workspaceId}/${collection}/${args.subjectId}`);
  const subjectSnap = await subjectRef.get();
  if (!subjectSnap.exists) {
    throw new HttpsError('not-found', `The ${args.subjectType} record does not exist.`);
  }
  const subjectData = subjectSnap.data() ?? {};
  const alreadyErased =
    typeof subjectData['pdpaErased'] === 'object' && subjectData['pdpaErased'] !== null;
  // Pre-erasure identity for the message-variable redaction pass. On a
  // re-run the doc is already anonymous, so only literal-phone matches
  // remain possible — which is exactly the leftover PII a re-run targets.
  const subject = {
    name: typeof subjectData['name'] === 'string' ? subjectData['name'] : '',
    phone:
      typeof subjectData['phone'] === 'string' && subjectData['phone'] !== ''
        ? subjectData['phone']
        : null,
  };
  const meta = callableRequestMeta(request);

  await writeAuditLog(args.workspaceId, {
    actorType: 'user',
    actorId: uid,
    action: 'pdpa.delete_request',
    targetType: args.subjectType,
    targetId: args.subjectId,
    // No PII in the payload — the entry outlives the erasure (D7).
    after: { alreadyErased },
    ...meta,
  });

  const counts: IPdpaScrubCounts = {
    projects: 0,
    tasks: 0,
    taskUpdates: 0,
    activity: 0,
    messages: 0,
    magicLinks: 0,
  };

  try {
    // Downstream scrubs run first: they need the pre-erasure identity
    // captured above, and if any of them fail the subject doc keeps its
    // name/phone so a re-run can still match message `variables`. The
    // subject doc is anonymized last, as the commit point of the erasure.
    counts.magicLinks = await revokeMagicLinks(db, args, uid);

    if (args.subjectType === 'client') {
      await scrubClientDenorms(db, args, counts);
    } else {
      await scrubCollaboratorDenorms(db, args, counts);
    }

    counts.messages = await redactMessages(db, args, subject);

    const anonymized =
      args.subjectType === 'client'
        ? buildAnonymizedClientFields(FieldValue.delete())
        : buildAnonymizedCollaboratorFields(FieldValue.delete());
    await subjectRef.update({
      ...anonymized,
      // Keep the original requestedBy/at as erasure evidence on re-runs.
      ...(alreadyErased
        ? {}
        : { pdpaErased: { requestedBy: uid, at: FieldValue.serverTimestamp() } }),
    });
  } catch (error) {
    // LOUD failure (unlike audit writes): a partial erasure must surface.
    throw new HttpsError(
      'internal',
      'Personal-data deletion did not complete — run it again to finish the remaining scrubs.',
      { scrubbed: counts, cause: error instanceof Error ? error.message : String(error) },
    );
  }

  await writeAuditLog(args.workspaceId, {
    actorType: 'user',
    actorId: uid,
    action: 'pdpa.delete_fulfilled',
    targetType: args.subjectType,
    targetId: args.subjectId,
    after: { alreadyErased, scrubbed: { ...counts } },
    ...meta,
  });

  return { scrubbed: counts };
});
