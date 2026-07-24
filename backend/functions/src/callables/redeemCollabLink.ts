/**
 * redeemCollabLink (#22): unauthenticated callable — the URL token is the
 * credential. Sibling of redeemPortalLink sharing lib/portalTokens.js:
 * verifies shortCode + secret hash, revocation, expiry, the D-027 lifecycle
 * gate, and re-verifies assignment + collaborator visibility, then mints a
 * Firebase custom token with collab claims `{ collab: { wid, pid, tid,
 * colid, linkId } }` and returns the firm branding snapshot plus a task
 * snapshot for first paint.
 *
 * Anti-enumeration posture: every failure (unknown code, wrong secret,
 * revoked, expired, unassigned, archived/deleted project) throws the SAME
 * uniform 'collab/invalid_or_expired' error; hash comparison is
 * constant-time.
 */

import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { collabUid, parsePortalToken, verifySecret } from '../lib/portalTokens.js';
import {
  isCollaboratorAssignee,
  passesCollabVisibility,
} from './issueCollabLink.js';

export interface ICollabLinkCheckInput {
  audience: unknown;
  scopeType: unknown;
  revoked: unknown;
  /** Milliseconds since epoch, or null when the field is unreadable. */
  expiresAtMs: number | null;
}

/**
 * Why a looked-up link doc cannot be redeemed as a collaborator link
 * (secret already verified), or null when it is redeemable. Pure so it
 * unit-tests without emulators.
 */
export function collabLinkBlocker(
  input: ICollabLinkCheckInput,
  nowMs: number,
): 'audience' | 'revoked' | 'expired' | null {
  if (input.audience !== 'collaborator' || input.scopeType !== 'task') {
    return 'audience';
  }
  if (input.revoked !== false) {
    return 'revoked';
  }
  if (input.expiresAtMs === null || input.expiresAtMs <= nowMs) {
    return 'expired';
  }
  return null;
}

/** The single uniform failure — callers cannot distinguish why (C1x). */
export function collabInvalidOrExpired(): HttpsError {
  return new HttpsError('permission-denied', 'This link is no longer valid.', {
    code: 'collab/invalid_or_expired',
  });
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export const redeemCollabLink = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const parsed = parsePortalToken(data['token']);
  if (parsed === null) {
    throw collabInvalidOrExpired();
  }

  const db = getFirestore();
  // Collection-group lookup by shortCode (field-override index in
  // firestore.indexes.json) — shared with portal links.
  const lookup = await db
    .collectionGroup('magicLinks')
    .where('shortCode', '==', parsed.shortCode)
    .limit(1)
    .get();
  if (lookup.empty) {
    throw collabInvalidOrExpired();
  }
  const linkSnap = lookup.docs[0];
  const secretHash = linkSnap.get('secretHash');
  if (typeof secretHash !== 'string' || !verifySecret(parsed.secret, secretHash)) {
    throw collabInvalidOrExpired();
  }

  const expiresAt = linkSnap.get('expiresAt') as { toMillis?: () => number } | undefined;
  const blocked = collabLinkBlocker(
    {
      audience: linkSnap.get('audience'),
      scopeType: linkSnap.get('scopeType'),
      revoked: linkSnap.get('revoked'),
      expiresAtMs: typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : null,
    },
    Date.now(),
  );
  if (blocked !== null) {
    throw collabInvalidOrExpired();
  }

  const workspaceRef = linkSnap.ref.parent.parent;
  const taskId = linkSnap.get('scopeId');
  const collaboratorId = linkSnap.get('subjectId');
  const projectId = linkSnap.get('projectId');
  if (
    workspaceRef === null ||
    typeof taskId !== 'string' ||
    typeof collaboratorId !== 'string' ||
    typeof projectId !== 'string'
  ) {
    throw collabInvalidOrExpired();
  }
  const workspaceId = workspaceRef.id;

  const [projectSnap, taskSnap, workspaceSnap] = await Promise.all([
    db.doc(`workspaces/${workspaceId}/projects/${projectId}`).get(),
    db.doc(`workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`).get(),
    workspaceRef.get(),
  ]);
  if (!projectSnap.exists || !taskSnap.exists || !workspaceSnap.exists) {
    throw collabInvalidOrExpired();
  }

  const firmName = typeof workspaceSnap.get('name') === 'string' ? workspaceSnap.get('name') : '';
  const lifecycle = projectSnap.get('lifecycle');
  if (lifecycle === 'draft') {
    // Distinguishable on purpose: a valid link to a not-yet-published
    // project is guidance, not an auth failure (portal precedent).
    return { status: 'not_started', firmName };
  }
  if (lifecycle !== 'published' && lifecycle !== 'completed') {
    throw collabInvalidOrExpired();
  }

  // Re-verify assignment + visibility at redemption time — unassignment
  // since issuance closes the link even before the step-7 revocation lands.
  if (
    !isCollaboratorAssignee(taskSnap.get('assignees'), collaboratorId) ||
    !passesCollabVisibility(taskSnap.get('visibleToCollaboratorIds'), collaboratorId)
  ) {
    throw collabInvalidOrExpired();
  }

  const uid = collabUid(workspaceId, taskId, collaboratorId);
  const customToken = await getAuth().createCustomToken(uid, {
    collab: {
      wid: workspaceId,
      pid: projectId,
      tid: taskId,
      colid: collaboratorId,
      linkId: linkSnap.id,
    },
  });

  await linkSnap.ref.update({
    useCount: FieldValue.increment(1),
    lastUsedAt: FieldValue.serverTimestamp(),
  });

  const branding = (workspaceSnap.get('branding') ?? {}) as Record<string, unknown>;
  const dueDate = taskSnap.get('dueDate') as { toDate?: () => Date } | undefined;
  return {
    status: 'ok',
    customToken,
    workspaceId,
    projectId,
    taskId,
    collaboratorId,
    branding: {
      firmName,
      ...(stringOrUndefined(branding['logoUrl']) !== undefined
        ? { logoUrl: branding['logoUrl'] }
        : {}),
      ...(stringOrUndefined(branding['primaryColor']) !== undefined
        ? { primaryColor: branding['primaryColor'] }
        : {}),
    },
    task: {
      title: typeof taskSnap.get('title') === 'string' ? taskSnap.get('title') : '',
      description:
        typeof taskSnap.get('description') === 'string' ? taskSnap.get('description') : '',
      status: typeof taskSnap.get('status') === 'string' ? taskSnap.get('status') : 'todo',
      dueDate:
        typeof dueDate?.toDate === 'function' ? dueDate.toDate().toISOString().slice(0, 10) : null,
      projectName:
        typeof projectSnap.get('name') === 'string' ? projectSnap.get('name') : '',
    },
  };
});
