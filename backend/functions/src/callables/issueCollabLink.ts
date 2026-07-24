/**
 * issueCollabLink (#22, E1): firm owner/admin/pm mints a collaborator task
 * magic link for a collaborator-type assignee of a task on a
 * published/completed project (D-027 gate). Department need-to-know applies:
 * a pm can only issue links for tasks they can see.
 *
 * One active link per (task, collaborator): raw secrets are never at rest
 * (only their SHA-256), so an existing link's URL can never be re-surfaced —
 * every call revokes any active link for the pair and mints a fresh one.
 * `reset: true` records the rotation as an explicit 'collab_link.reset'
 * audit entry (vs 'collab_link.issue'). Revocation is soft (Q1): it blocks
 * re-redemption; already-signed-in sessions are bounded by the lifecycle +
 * visibility re-checks in rules.
 */

import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';

import {
  COLLAB_LINK_TTL_MS,
  buildCollabUrl,
  generatePortalToken,
  hashSecret,
} from '../lib/portalTokens.js';
import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';

/** Apex origin carried in collab URLs (D-036: /t lives on siapp.app). */
const collabOrigin = defineString('PORTAL_ORIGIN', { default: 'https://siapp.app' });

/** Lifecycles a collab link may be issued for (D-027 external-access gate). */
export const COLLAB_ISSUABLE_LIFECYCLES = ['published', 'completed'] as const;

export interface ICollabIssueGateInput {
  projectExists: boolean;
  lifecycle: unknown;
  taskExists: boolean;
  /** Raw task `assignees` field. */
  assignees: unknown;
  /** Raw task `visibleToCollaboratorIds` field. */
  visibleToCollaboratorIds: unknown;
  collaboratorId: string;
}

/** True when `assignees` contains a collaborator-type entry with this id. */
export function isCollaboratorAssignee(assignees: unknown, collaboratorId: string): boolean {
  if (!Array.isArray(assignees)) {
    return false;
  }
  return assignees.some((entry) => {
    const assignee = entry as { type?: unknown; id?: unknown } | null;
    return assignee?.type === 'collaborator' && assignee.id === collaboratorId;
  });
}

/** True when the visibility list is empty (= all assignees) or contains the id. */
export function passesCollabVisibility(
  visibleToCollaboratorIds: unknown,
  collaboratorId: string,
): boolean {
  if (!Array.isArray(visibleToCollaboratorIds)) {
    // Docs written before the field existed behave like an empty list.
    return true;
  }
  return (
    visibleToCollaboratorIds.length === 0 || visibleToCollaboratorIds.includes(collaboratorId)
  );
}

/**
 * Why a collab link cannot be issued for this (task, collaborator), or null
 * when it can. Pure so the gate unit-tests without emulators.
 */
export function collabIssueBlocker(
  input: ICollabIssueGateInput,
): 'not-found' | 'not-published' | 'task-not-found' | 'not-assigned' | 'not-visible' | null {
  if (!input.projectExists) {
    return 'not-found';
  }
  if (
    typeof input.lifecycle !== 'string' ||
    !(COLLAB_ISSUABLE_LIFECYCLES as readonly string[]).includes(input.lifecycle)
  ) {
    return 'not-published';
  }
  if (!input.taskExists) {
    return 'task-not-found';
  }
  if (!isCollaboratorAssignee(input.assignees, input.collaboratorId)) {
    return 'not-assigned';
  }
  if (!passesCollabVisibility(input.visibleToCollaboratorIds, input.collaboratorId)) {
    return 'not-visible';
  }
  return null;
}

interface IIssuerAuth {
  uid: string;
  role: string;
  departments: string[];
}

function requireIssuer(request: CallableRequest, workspaceId: string): IIssuerAuth {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  const workspaces = request.auth?.token['workspaces'] as
    | Record<string, { role?: unknown; departments?: unknown }>
    | undefined;
  const entry = workspaces?.[workspaceId];
  const role = entry?.role;
  if (role !== 'owner' && role !== 'admin' && role !== 'pm') {
    throw new HttpsError('permission-denied', 'Your role cannot issue task links.');
  }
  const departments = Array.isArray(entry?.departments)
    ? entry.departments.filter((d): d is string => typeof d === 'string')
    : [];
  return { uid, role, departments };
}

/**
 * Department need-to-know for the issuer (20-access-control): owner/admin
 * always pass; a pm needs an overlap with the task's restriction list.
 */
export function issuerCanSeeTask(
  role: string,
  issuerDepartments: readonly string[],
  taskRestrictions: unknown,
): boolean {
  if (role === 'owner' || role === 'admin') {
    return true;
  }
  const restrictions = Array.isArray(taskRestrictions)
    ? taskRestrictions.filter((d): d is string => typeof d === 'string')
    : [];
  return restrictions.length === 0 || restrictions.some((d) => issuerDepartments.includes(d));
}

export const issueCollabLink = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  const projectId = typeof data['projectId'] === 'string' ? data['projectId'] : '';
  const taskId = typeof data['taskId'] === 'string' ? data['taskId'] : '';
  const collaboratorId = typeof data['collaboratorId'] === 'string' ? data['collaboratorId'] : '';
  const reset = data['reset'] === true;
  if (!workspaceId || !projectId || !taskId || !collaboratorId) {
    throw new HttpsError(
      'invalid-argument',
      'workspaceId, projectId, taskId and collaboratorId are required.',
    );
  }

  const issuer = requireIssuer(request, workspaceId);

  const db = getFirestore();
  const [projectSnap, taskSnap] = await Promise.all([
    db.doc(`workspaces/${workspaceId}/projects/${projectId}`).get(),
    db.doc(`workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`).get(),
  ]);

  if (!issuerCanSeeTask(issuer.role, issuer.departments, taskSnap.get('restrictedToDepartments'))) {
    throw new HttpsError('permission-denied', 'You cannot see this task.');
  }

  const blocker = collabIssueBlocker({
    projectExists: projectSnap.exists,
    lifecycle: projectSnap.get('lifecycle'),
    taskExists: taskSnap.exists,
    assignees: taskSnap.get('assignees'),
    visibleToCollaboratorIds: taskSnap.get('visibleToCollaboratorIds'),
    collaboratorId,
  });
  if (blocker === 'not-found' || blocker === 'task-not-found') {
    throw new HttpsError('not-found', 'Task not found.');
  }
  if (blocker === 'not-published') {
    throw new HttpsError('failed-precondition', 'Publish the project before sharing task links.');
  }
  if (blocker === 'not-assigned') {
    throw new HttpsError(
      'failed-precondition',
      'Assign the collaborator to the task before sharing a link.',
    );
  }
  if (blocker === 'not-visible') {
    throw new HttpsError(
      'failed-precondition',
      'This task is not visible to that collaborator.',
    );
  }

  const linksRef = db.collection(`workspaces/${workspaceId}/magicLinks`);
  const now = Timestamp.now();

  // Revoke every active link for this (task, collaborator) pair — one active
  // link invariant. Soft revoke (Q1): blocks re-redemption only.
  const active = await linksRef
    .where('audience', '==', 'collaborator')
    .where('scopeType', '==', 'task')
    .where('scopeId', '==', taskId)
    .where('subjectId', '==', collaboratorId)
    .where('revoked', '==', false)
    .get();
  const rotated = !active.empty;
  for (const snap of active.docs) {
    await snap.ref.update({
      revoked: true,
      revokedAt: FieldValue.serverTimestamp(),
      revokedBy: issuer.uid,
    });
  }

  const { shortCode, secret, token } = generatePortalToken();
  const linkRef = linksRef.doc();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + COLLAB_LINK_TTL_MS);
  await linkRef.set({
    id: linkRef.id,
    shortCode,
    secretHash: hashSecret(secret),
    audience: 'collaborator',
    scopeType: 'task',
    scopeId: taskId,
    subjectId: collaboratorId,
    // #22: scopeId carries the task id, so redemption needs the project path.
    projectId,
    issuedAt: now,
    expiresAt,
    useCount: 0,
    revoked: false,
    createdBy: issuer.uid,
  });

  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: issuer.uid,
    action: reset || rotated ? 'collab_link.reset' : 'collab_link.issue',
    targetType: 'magicLink',
    targetId: linkRef.id,
    after: {
      projectId,
      taskId,
      collaboratorId,
      expiresAt: expiresAt.toDate().toISOString(),
    },
    ...callableRequestMeta(request),
  });

  return {
    url: buildCollabUrl(collabOrigin.value(), token),
    expiresAt: expiresAt.toDate().toISOString(),
  };
});
