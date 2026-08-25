/**
 * issueCollaboratorLink (#127): firm owner/admin/pm mints (or resets) the one
 * durable, collaborator-scoped access link for a collaborator. The single link
 * exposes every task assigned to that collaborator (subject to per-task
 * visibility + project-lifecycle gates re-checked in rules).
 *
 * One active link per collaborator: raw secrets are never at rest (only their
 * SHA-256), so an existing link's URL can never be re-surfaced — every issue
 * revokes any active collaborator-scoped link and mints a fresh one. `reset:
 * true` records the rotation as an explicit 'collab_link.reset' audit entry
 * (vs 'collab_link.issue'). Sliding expiry is refreshed by redeemCollabLink.
 */

import { FieldValue, Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';

import {
  COLLAB_LINK_TTL_MS,
  buildCollabUrl,
  generatePortalToken,
  hashSecret,
} from '../lib/portalTokens.js';
import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';
import { assertWorkspaceActive } from '../lib/workspaceStatus.js';

/** Apex origin carried in collab URLs (D-036: /t lives on siapp.app). */
const collabOrigin = defineString('PORTAL_ORIGIN', { default: 'https://siapp.app' });

export interface IIssuerAuth {
  uid: string;
  role: string;
}

/** Owner/admin/pm gate — collaborator links are not department-scoped. */
export function requireCollabLinkIssuer(
  request: CallableRequest,
  workspaceId: string,
): IIssuerAuth {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  const workspaces = request.auth?.token['workspaces'] as
    | Record<string, { role?: unknown }>
    | undefined;
  const role = workspaces?.[workspaceId]?.role;
  if (role !== 'owner' && role !== 'admin' && role !== 'pm') {
    throw new HttpsError('permission-denied', 'Your role cannot issue collaborator links.');
  }
  return { uid, role };
}

export interface IIssuedCollaboratorLink {
  url: string;
  expiresAt: Timestamp;
  linkId: string;
  /** True when an existing active link was revoked in favour of this one. */
  rotated: boolean;
}

/**
 * Revokes any active collaborator-scoped link for the collaborator and mints a
 * fresh one. Shared by the issue + send callables. Assumes the caller has
 * already authorized and validated workspace/collaborator existence.
 */
export async function mintCollaboratorLink(
  db: Firestore,
  workspaceId: string,
  collaboratorId: string,
  issuerUid: string,
): Promise<IIssuedCollaboratorLink> {
  const linksRef = db.collection(`workspaces/${workspaceId}/magicLinks`);
  const now = Timestamp.now();

  // One active link invariant: soft-revoke every active collaborator-scoped
  // link for this collaborator (blocks re-redemption of prior URLs).
  const active = await linksRef
    .where('audience', '==', 'collaborator')
    .where('scopeType', '==', 'collaborator')
    .where('subjectId', '==', collaboratorId)
    .where('revoked', '==', false)
    .get();
  const rotated = !active.empty;
  for (const snap of active.docs) {
    await snap.ref.update({
      revoked: true,
      revokedAt: FieldValue.serverTimestamp(),
      revokedBy: issuerUid,
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
    scopeType: 'collaborator',
    scopeId: collaboratorId,
    subjectId: collaboratorId,
    issuedAt: now,
    expiresAt,
    useCount: 0,
    revoked: false,
    createdBy: issuerUid,
  });

  return { url: buildCollabUrl(collabOrigin.value(), token), expiresAt, linkId: linkRef.id, rotated };
}

export const issueCollaboratorLink = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  const collaboratorId = typeof data['collaboratorId'] === 'string' ? data['collaboratorId'] : '';
  const reset = data['reset'] === true;
  if (!workspaceId || !collaboratorId) {
    throw new HttpsError('invalid-argument', 'workspaceId and collaboratorId are required.');
  }

  const issuer = requireCollabLinkIssuer(request, workspaceId);
  await assertWorkspaceActive(workspaceId); // #24 D2: read-only gate

  const db = getFirestore();
  const collaboratorSnap = await db
    .doc(`workspaces/${workspaceId}/collaborators/${collaboratorId}`)
    .get();
  if (!collaboratorSnap.exists) {
    throw new HttpsError('not-found', 'Collaborator not found.');
  }

  const { url, expiresAt, linkId, rotated } = await mintCollaboratorLink(
    db,
    workspaceId,
    collaboratorId,
    issuer.uid,
  );

  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: issuer.uid,
    action: reset || rotated ? 'collab_link.reset' : 'collab_link.issue',
    targetType: 'magicLink',
    targetId: linkId,
    after: {
      collaboratorId,
      expiresAt: expiresAt.toDate().toISOString(),
    },
    ...callableRequestMeta(request),
  });

  return {
    url,
    expiresAt: expiresAt.toDate().toISOString(),
  };
});
