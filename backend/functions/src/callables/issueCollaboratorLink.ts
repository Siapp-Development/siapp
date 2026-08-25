/**
 * issueCollaboratorLink (#127): firm owner/admin/pm surfaces the one durable,
 * collaborator-scoped access link for a collaborator. The single link exposes
 * every task assigned to that collaborator (subject to per-task visibility +
 * project-lifecycle gates re-checked in rules).
 *
 * DURABLE, RESET-ONLY (locked decision): Copy / Send-via-WhatsApp are
 * idempotent — while an active, unexpired link exists they return the SAME URL
 * every time (get-or-create), so earlier links keep working. The raw URL token
 * is persisted server-side (plaintext `token` on the magicLink doc, which is
 * Firestore rules-denied to ALL clients — see firestore.rules `magicLinks`) so
 * the URL can be re-surfaced without rotation. The `secretHash` is still the
 * only form compared on redeem.
 *
 * ONLY an explicit Reset (`reset: true`) rotates: it revokes the active link
 * and mints a fresh one, audited as 'collab_link.reset'. First-ever creation is
 * audited 'collab_link.issue'; re-surfacing an existing link is not audited
 * (lightweight get-or-create). Sliding expiry is refreshed by redeemCollabLink.
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
}

export interface IResolvedCollaboratorLink extends IIssuedCollaboratorLink {
  /** True when a fresh link was minted; false when an existing one was reused. */
  created: boolean;
}

/**
 * Revokes any active collaborator-scoped link for the collaborator and mints a
 * fresh one. This is the ROTATE path (explicit Reset / no re-surfaceable link).
 * Assumes the caller has already authorized and validated existence.
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
    // Durable, reset-only (#127): the raw URL token is retained so Copy/Send
    // can re-surface the SAME URL. magicLinks is denied to all clients in
    // firestore.rules, so this never leaves the Admin SDK. Redemption still
    // verifies against `secretHash`, never this field.
    token,
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

  return { url: buildCollabUrl(collabOrigin.value(), token), expiresAt, linkId: linkRef.id };
}

/**
 * GET-OR-CREATE (#127, durable/reset-only): returns the collaborator's active,
 * unexpired link URL unchanged when one with a re-surfaceable token exists;
 * otherwise mints a fresh one (which also revokes any stale/tokenless active
 * links). Never rotates a still-valid link — that is Reset's job.
 */
export async function getOrCreateCollaboratorLink(
  db: Firestore,
  workspaceId: string,
  collaboratorId: string,
  issuerUid: string,
): Promise<IResolvedCollaboratorLink> {
  const linksRef = db.collection(`workspaces/${workspaceId}/magicLinks`);
  const nowMs = Date.now();

  const active = await linksRef
    .where('audience', '==', 'collaborator')
    .where('scopeType', '==', 'collaborator')
    .where('subjectId', '==', collaboratorId)
    .where('revoked', '==', false)
    .get();

  for (const snap of active.docs) {
    const expiresAt = snap.get('expiresAt') as Timestamp | undefined;
    const token = snap.get('token');
    const expiresMs = typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : 0;
    if (expiresMs > nowMs && typeof token === 'string' && token !== '') {
      return {
        url: buildCollabUrl(collabOrigin.value(), token),
        expiresAt: expiresAt as Timestamp,
        linkId: snap.id,
        created: false,
      };
    }
  }

  const minted = await mintCollaboratorLink(db, workspaceId, collaboratorId, issuerUid);
  return { ...minted, created: true };
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

  if (reset) {
    // ROTATE: revoke the active link and mint a fresh one.
    const { url, expiresAt, linkId } = await mintCollaboratorLink(
      db,
      workspaceId,
      collaboratorId,
      issuer.uid,
    );
    await writeAuditLog(workspaceId, {
      actorType: 'user',
      actorId: issuer.uid,
      action: 'collab_link.reset',
      targetType: 'magicLink',
      targetId: linkId,
      after: { collaboratorId, expiresAt: expiresAt.toDate().toISOString() },
      ...callableRequestMeta(request),
    });
    return { url, expiresAt: expiresAt.toDate().toISOString() };
  }

  // GET-OR-CREATE: idempotent Copy/Send — reuse the active link if present.
  const { url, expiresAt, linkId, created } = await getOrCreateCollaboratorLink(
    db,
    workspaceId,
    collaboratorId,
    issuer.uid,
  );
  if (created) {
    // Only first-ever creation is audited; re-surfacing is not (lightweight).
    await writeAuditLog(workspaceId, {
      actorType: 'user',
      actorId: issuer.uid,
      action: 'collab_link.issue',
      targetType: 'magicLink',
      targetId: linkId,
      after: { collaboratorId, expiresAt: expiresAt.toDate().toISOString() },
      ...callableRequestMeta(request),
    });
  }

  return { url, expiresAt: expiresAt.toDate().toISOString() };
});
