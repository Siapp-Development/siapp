/**
 * In-app notification inbox fan-out (#134). Option A: one document per
 * recipient per source event, written under each recipient's member
 * subcollection (`workspaces/{wid}/members/{uid}/notifications/{nid}`).
 *
 * This is an internal firm-member channel and is intentionally independent of
 * the outbound WhatsApp/SMS pipeline (D-035) — no quiet hours, consent, or
 * opt-out gating applies. Department need-to-know (D-025) IS honoured at
 * write time via `canReceive`, so every doc a member can read is already
 * need-to-know-eligible.
 *
 * The mapping/resolution functions here are pure (no Admin SDK side effects)
 * so they unit-test without emulators. `createNotification`/`trimNotifications`
 * are the only I/O helpers and mirror `lib/activityLog.ts`'s create/idempotency
 * posture (ALREADY_EXISTS = gRPC code 6 = dedupe doing its job).
 *
 * Functions cannot import `@siapp/shared`, so the shared enums are mirrored
 * locally (kept in lockstep with `packages/shared/src/enums.ts`).
 */

import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { errorPayload } from './errors.js';

/** Mirrors `TNotificationKind` in `@siapp/shared`. */
export type TNotificationKind =
  | 'mention'
  | 'task_assigned'
  | 'task_comment'
  | 'task_status_changed'
  | 'task_blocked'
  | 'task_due_soon'
  | 'task_overdue'
  | 'client_document_uploaded'
  | 'collaborator_note_added'
  | 'collaborator_need_help'
  | 'project_published'
  | 'project_completed'
  | 'project_archived';

/** Mirrors `TActorType` in `@siapp/shared`. */
export type TActorType = 'user' | 'collaborator' | 'client' | 'system' | 'admin';

/** Mirrors `TMemberRole` in `@siapp/shared`. */
export type TMemberRole = 'owner' | 'admin' | 'pm' | 'viewer';

/** Retention caps (per recipient inbox). */
export const NOTIFICATION_RETENTION_MAX = 100;
export const NOTIFICATION_RETENTION_DAYS = 90;

/** Minimal member projection needed for the department gate. */
export interface IMemberInfo {
  uid: string;
  role: TMemberRole;
  departments: string[];
}

/**
 * Maps a project-activity action to an inbox kind, or `null` when the action
 * should not produce a notification. `newStatus` disambiguates a status
 * change into `task_blocked` (mirrors the WhatsApp `blocked` trigger).
 */
export function kindForActivity(action: string, newStatus?: string | null): TNotificationKind | null {
  switch (action) {
    case 'task_assigned':
      return 'task_assigned';
    case 'task_status_changed':
      return newStatus === 'blocked' ? 'task_blocked' : 'task_status_changed';
    case 'client_document_uploaded':
      return 'client_document_uploaded';
    case 'collaborator_note_added':
      return 'collaborator_note_added';
    case 'collaborator_need_help':
      return 'collaborator_need_help';
    case 'project_published':
      return 'project_published';
    case 'project_completed':
      return 'project_completed';
    case 'project_archived':
      return 'project_archived';
    default:
      return null;
  }
}

/**
 * Department need-to-know gate, mirroring `canSeeRestrictedList` in
 * firestore.rules: owner/admin always qualify; an empty restriction list is
 * unrestricted; otherwise the member needs at least one intersecting
 * department. Claims aren't available in triggers, so the member doc's
 * `role`/`departments` are the source of truth.
 */
export function canReceive(member: IMemberInfo, restrictedToDepartments: string[]): boolean {
  if (member.role === 'owner' || member.role === 'admin') {
    return true;
  }
  if (restrictedToDepartments.length === 0) {
    return true;
  }
  return restrictedToDepartments.some((dep) => member.departments.includes(dep));
}

/** Resolved recipient: a member uid plus the kind their row should carry. */
export interface IResolvedRecipient {
  uid: string;
  kind: TNotificationKind;
}

export interface IResolveRecipientsInput {
  /** Kind applied to watcher/assignee/participant candidates. */
  kind: TNotificationKind;
  /** Actor uid — always excluded from the recipient set. */
  actorId: string;
  /** Copied from the source task/doc; [] = unrestricted. */
  restrictedToDepartments: string[];
  /** uid → member projection; a uid absent here is not a firm member. */
  memberIndex: Map<string, IMemberInfo>;
  /** Task user-assignee uids (watchers). */
  taskAssigneeUids?: string[];
  /** Distinct prior user commenter uids (watchers). */
  priorCommenterUids?: string[];
  /** Project participant uids (assignees ∪ ownerUid) — lifecycle/client-doc. */
  projectParticipantUids?: string[];
  /** @mentioned uids — always resolve to `mention` (highest priority). */
  mentionedUids?: string[];
}

/**
 * Builds the deduped recipient set for one source event. Mentions always win
 * over watcher/assignee kinds (a mentioned assignee gets `mention`, not
 * `task_comment`). The actor is excluded, non-members are dropped, and the
 * department gate is applied. Output is sorted by uid for determinism.
 */
export function resolveRecipients(input: IResolveRecipientsInput): IResolvedRecipient[] {
  const { kind, actorId, restrictedToDepartments, memberIndex } = input;

  // priority 0 = mention (wins on collision), priority 1 = watcher/participant.
  const candidates: Array<{ uid: string; kind: TNotificationKind; priority: number }> = [];
  for (const uid of input.mentionedUids ?? []) {
    candidates.push({ uid, kind: 'mention', priority: 0 });
  }
  const watchers = new Set<string>([
    ...(input.taskAssigneeUids ?? []),
    ...(input.priorCommenterUids ?? []),
    ...(input.projectParticipantUids ?? []),
  ]);
  for (const uid of watchers) {
    candidates.push({ uid, kind, priority: 1 });
  }

  const best = new Map<string, { kind: TNotificationKind; priority: number }>();
  for (const candidate of candidates) {
    if (candidate.uid === actorId || candidate.uid === '') {
      continue;
    }
    const member = memberIndex.get(candidate.uid);
    if (member === undefined) {
      continue;
    }
    if (!canReceive(member, restrictedToDepartments)) {
      continue;
    }
    const existing = best.get(candidate.uid);
    if (existing === undefined || candidate.priority < existing.priority) {
      best.set(candidate.uid, { kind: candidate.kind, priority: candidate.priority });
    }
  }

  return [...best.entries()]
    .map(([uid, value]) => ({ uid, kind: value.kind }))
    .sort((a, b) => a.uid.localeCompare(b.uid));
}

/** Denormalized fields shared by every notification a source event fans out. */
export interface INotificationDenorm {
  actorType: TActorType;
  actorId: string;
  actorNameDenorm: string;
  projectId: string;
  projectNameDenorm: string;
  taskId: string | null;
  taskTitleDenorm: string | null;
  excerpt: string | null;
  sourceActivityId: string | null;
}

/** The notification payload written under a recipient (minus its `id`). */
export interface INotificationPayload extends INotificationDenorm {
  kind: TNotificationKind;
  read: boolean;
  readAt: null;
  at: FieldValue;
}

/** Builds a notification payload with server-timestamped `at` + unread state. */
export function buildNotification(
  kind: TNotificationKind,
  denorm: INotificationDenorm,
): INotificationPayload {
  return {
    kind,
    at: FieldValue.serverTimestamp(),
    read: false,
    readAt: null,
    ...denorm,
  };
}

/**
 * Creates one notification doc with a deterministic id (`create()` so
 * at-least-once trigger delivery cannot double-write). Returns true when
 * written, false on a dedupe hit or write failure. Never throws.
 */
export async function createNotification(
  db: Firestore,
  workspaceId: string,
  recipientUid: string,
  nid: string,
  payload: INotificationPayload,
): Promise<boolean> {
  const ref = db.doc(`workspaces/${workspaceId}/members/${recipientUid}/notifications/${nid}`);
  try {
    await ref.create({ ...payload, id: nid });
    return true;
  } catch (error) {
    if ((error as { code?: number }).code === 6) {
      logger.debug('createNotification: dedupe hit', { id: nid, recipientUid });
    } else {
      logger.error('createNotification: write failed', {
        workspaceId,
        recipientUid,
        nid,
        err: errorPayload(error),
      });
    }
    return false;
  }
}

/** Trim candidate — id plus its resolved `at` in ms (null = pending/unknown). */
export interface ITrimCandidate {
  id: string;
  atMs: number | null;
}

/**
 * Pure retention selection: given a recipient's notifications sorted newest
 * first, returns the ids to delete — anything beyond the latest
 * `NOTIFICATION_RETENTION_MAX`, plus anything older than
 * `NOTIFICATION_RETENTION_DAYS`. Pending timestamps (atMs null) are never
 * age-trimmed.
 */
export function notificationsToTrim(sortedDescByAt: ITrimCandidate[], nowMs: number): string[] {
  const cutoffMs = nowMs - NOTIFICATION_RETENTION_DAYS * 86_400_000;
  const ids: string[] = [];
  sortedDescByAt.forEach((candidate, index) => {
    if (index >= NOTIFICATION_RETENTION_MAX) {
      ids.push(candidate.id);
      return;
    }
    if (candidate.atMs !== null && candidate.atMs < cutoffMs) {
      ids.push(candidate.id);
    }
  });
  return ids;
}

/**
 * Enforces the retention caps for one recipient after a create. Reads only
 * that member's notifications (bounded — the cap keeps it ~100) and deletes
 * the over-cap / expired ids. Never throws.
 */
export async function trimNotifications(
  db: Firestore,
  workspaceId: string,
  recipientUid: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    const col = db.collection(`workspaces/${workspaceId}/members/${recipientUid}/notifications`);
    const snap = await col.orderBy('at', 'desc').get();
    const candidates: ITrimCandidate[] = snap.docs.map((doc) => {
      const at = doc.get('at');
      return {
        id: doc.id,
        atMs: at instanceof Timestamp ? at.toMillis() : null,
      };
    });
    const ids = notificationsToTrim(candidates, now.getTime());
    if (ids.length === 0) {
      return;
    }
    const batch = db.batch();
    for (const id of ids) {
      batch.delete(col.doc(id));
    }
    await batch.commit();
  } catch (error) {
    logger.error('trimNotifications: failed', {
      workspaceId,
      recipientUid,
      err: errorPayload(error),
    });
  }
}

/**
 * Reads `role`/`departments` for a set of candidate uids into an index the
 * department gate can use. Missing/legacy member docs are skipped (a uid with
 * no member doc is not a current firm member). Reads are bounded by the
 * candidate count.
 */
export async function loadMemberIndex(
  db: Firestore,
  workspaceId: string,
  uids: Iterable<string>,
): Promise<Map<string, IMemberInfo>> {
  const unique = [...new Set([...uids].filter((uid) => uid !== ''))];
  const index = new Map<string, IMemberInfo>();
  await Promise.all(
    unique.map(async (uid) => {
      const snap = await db.doc(`workspaces/${workspaceId}/members/${uid}`).get();
      if (!snap.exists) {
        return;
      }
      const role = snap.get('role');
      const departments = snap.get('departments');
      index.set(uid, {
        uid,
        role: isMemberRole(role) ? role : 'viewer',
        departments: Array.isArray(departments)
          ? departments.filter((dep): dep is string => typeof dep === 'string')
          : [],
      });
    }),
  );
  return index;
}

function isMemberRole(value: unknown): value is TMemberRole {
  return value === 'owner' || value === 'admin' || value === 'pm' || value === 'viewer';
}

/** Extracts distinct user-type assignee uids from a task's `assignees` array. */
export function userAssigneeUids(assignees: unknown): string[] {
  if (!Array.isArray(assignees)) {
    return [];
  }
  const uids = new Set<string>();
  for (const entry of assignees) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      (entry as { type?: unknown }).type === 'user' &&
      typeof (entry as { id?: unknown }).id === 'string'
    ) {
      uids.add((entry as { id: string }).id);
    }
  }
  return [...uids];
}
