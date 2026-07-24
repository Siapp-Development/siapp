/**
 * issuePortalLink (#21, D2): firm owner/admin/pm mints a client portal magic
 * link for a published/completed project (D-027 gate) with a linked client.
 *
 * One active link per (project, client): raw secrets are never at rest
 * (only their SHA-256), so an existing link's URL can never be re-surfaced —
 * every call revokes any active link for the pair and mints a fresh one.
 * `reset: true` records the rotation as an explicit 'portal_link.reset'
 * audit entry (vs 'portal_link.issue'). Revocation is soft (Q1): it blocks
 * re-redemption; already-signed-in sessions are bounded by the lifecycle
 * re-check in rules.
 */

import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';

import {
  PORTAL_LINK_TTL_MS,
  buildPortalUrl,
  generatePortalToken,
  hashSecret,
} from '../lib/portalTokens.js';
import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';
import { assertWorkspaceActive } from '../lib/workspaceStatus.js';

/** Apex origin carried in portal URLs (D-036: portal lives on siapp.app). */
const portalOrigin = defineString('PORTAL_ORIGIN', { default: 'https://siapp.app' });

/** Lifecycles a portal link may be issued for (D-027 external-access gate). */
export const PORTAL_ISSUABLE_LIFECYCLES = ['published', 'completed'] as const;

export interface IIssueGateInput {
  projectExists: boolean;
  lifecycle: unknown;
  clientId: unknown;
}

/**
 * Why a portal link cannot be issued for this project, or null when it can.
 * Pure so the gate unit-tests without emulators.
 */
export function issueBlocker(
  input: IIssueGateInput,
): 'not-found' | 'not-published' | 'no-client' | null {
  if (!input.projectExists) {
    return 'not-found';
  }
  if (
    typeof input.lifecycle !== 'string' ||
    !(PORTAL_ISSUABLE_LIFECYCLES as readonly string[]).includes(input.lifecycle)
  ) {
    return 'not-published';
  }
  if (typeof input.clientId !== 'string' || input.clientId === '') {
    return 'no-client';
  }
  return null;
}

function requireIssuerUid(request: CallableRequest, workspaceId: string): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  const workspaces = request.auth?.token['workspaces'] as
    | Record<string, { role?: unknown }>
    | undefined;
  const role = workspaces?.[workspaceId]?.role;
  if (role !== 'owner' && role !== 'admin' && role !== 'pm') {
    throw new HttpsError('permission-denied', 'Your role cannot issue portal links.');
  }
  return uid;
}

export const issuePortalLink = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  const projectId = typeof data['projectId'] === 'string' ? data['projectId'] : '';
  const reset = data['reset'] === true;
  if (!workspaceId || !projectId) {
    throw new HttpsError('invalid-argument', 'workspaceId and projectId are required.');
  }

  const uid = requireIssuerUid(request, workspaceId);
  await assertWorkspaceActive(workspaceId); // #24 D2: read-only gate

  const db = getFirestore();
  const projectSnap = await db.doc(`workspaces/${workspaceId}/projects/${projectId}`).get();
  const blocker = issueBlocker({
    projectExists: projectSnap.exists,
    lifecycle: projectSnap.get('lifecycle'),
    clientId: projectSnap.get('clientId'),
  });
  if (blocker === 'not-found') {
    throw new HttpsError('not-found', 'Project not found.');
  }
  if (blocker === 'not-published') {
    throw new HttpsError(
      'failed-precondition',
      'Publish the project before sharing a portal link.',
    );
  }
  if (blocker === 'no-client') {
    throw new HttpsError('failed-precondition', 'Link a client to the project first.');
  }
  const clientId = projectSnap.get('clientId') as string;

  const linksRef = db.collection(`workspaces/${workspaceId}/magicLinks`);
  const now = Timestamp.now();

  // Revoke every active link for this (project, client) pair — one active
  // link invariant. Soft revoke (Q1): blocks re-redemption only.
  const active = await linksRef
    .where('audience', '==', 'client')
    .where('scopeType', '==', 'project')
    .where('scopeId', '==', projectId)
    .where('subjectId', '==', clientId)
    .where('revoked', '==', false)
    .get();
  const rotated = !active.empty;
  for (const snap of active.docs) {
    await snap.ref.update({
      revoked: true,
      revokedAt: FieldValue.serverTimestamp(),
      revokedBy: uid,
    });
  }

  const { shortCode, secret, token } = generatePortalToken();
  const linkRef = linksRef.doc();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + PORTAL_LINK_TTL_MS);
  await linkRef.set({
    id: linkRef.id,
    shortCode,
    secretHash: hashSecret(secret),
    audience: 'client',
    scopeType: 'project',
    scopeId: projectId,
    subjectId: clientId,
    issuedAt: now,
    expiresAt,
    useCount: 0,
    revoked: false,
    createdBy: uid,
  });

  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: uid,
    action: reset || rotated ? 'portal_link.reset' : 'portal_link.issue',
    targetType: 'magicLink',
    targetId: linkRef.id,
    after: { projectId, clientId, expiresAt: expiresAt.toDate().toISOString() },
    ...callableRequestMeta(request),
  });

  return {
    url: buildPortalUrl(portalOrigin.value(), token),
    expiresAt: expiresAt.toDate().toISOString(),
  };
});
