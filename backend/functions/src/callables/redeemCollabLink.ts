/**
 * redeemCollabLink (#127): unauthenticated callable — the URL token is the
 * credential. Sibling of redeemPortalLink sharing lib/portalTokens.js:
 * verifies shortCode + secret hash, revocation and expiry, then mints a
 * Firebase custom token with collaborator-scoped claims `{ collab: { wid,
 * colid, linkId } }` and returns the firm branding + collaborator identity.
 *
 * The single link exposes EVERY task assigned to the collaborator; the /t
 * surface live-queries the collaborator's assigned-tasks mirror (rules-gated),
 * so no single task is pinned or snapshotted here.
 *
 * Sliding expiry (#127, R4): a successful redeem extends `expiresAt` by the
 * full COLLAB_LINK_TTL — active collaborators never lapse while abandoned
 * links still expire.
 *
 * Anti-enumeration posture: every failure (unknown code, wrong secret,
 * revoked, expired, missing collaborator/workspace) throws the SAME uniform
 * 'collab/invalid_or_expired' error; hash comparison is constant-time.
 */

import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { COLLAB_LINK_TTL_MS, collabUid, parsePortalToken, verifySecret } from '../lib/portalTokens.js';

export interface ICollabLinkCheckInput {
  audience: unknown;
  scopeType: unknown;
  revoked: unknown;
  /** Milliseconds since epoch, or null when the field is unreadable. */
  expiresAtMs: number | null;
}

/**
 * Why a looked-up link doc cannot be redeemed as a collaborator-scoped link
 * (secret already verified), or null when it is redeemable. Pure so it
 * unit-tests without emulators. Old task-scoped links (`scopeType: 'task'`)
 * fail the audience check → uniform invalid_or_expired (migration, #127).
 */
export function collabLinkBlocker(
  input: ICollabLinkCheckInput,
  nowMs: number,
): 'audience' | 'revoked' | 'expired' | null {
  if (input.audience !== 'collaborator' || input.scopeType !== 'collaborator') {
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
  const collaboratorId = linkSnap.get('subjectId');
  if (workspaceRef === null || typeof collaboratorId !== 'string') {
    throw collabInvalidOrExpired();
  }
  const workspaceId = workspaceRef.id;

  const [collaboratorSnap, workspaceSnap] = await Promise.all([
    db.doc(`workspaces/${workspaceId}/collaborators/${collaboratorId}`).get(),
    workspaceRef.get(),
  ]);
  if (!collaboratorSnap.exists || !workspaceSnap.exists) {
    throw collabInvalidOrExpired();
  }

  const firmName = typeof workspaceSnap.get('name') === 'string' ? workspaceSnap.get('name') : '';
  const collaboratorName =
    typeof collaboratorSnap.get('name') === 'string' ? collaboratorSnap.get('name') : '';

  const uid = collabUid(workspaceId, collaboratorId);
  const customToken = await getAuth().createCustomToken(uid, {
    collab: {
      wid: workspaceId,
      colid: collaboratorId,
      linkId: linkSnap.id,
    },
  });

  // Sliding expiry (R4): extend the TTL from now on every successful redeem.
  await linkSnap.ref.update({
    useCount: FieldValue.increment(1),
    lastUsedAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + COLLAB_LINK_TTL_MS),
  });

  const branding = (workspaceSnap.get('branding') ?? {}) as Record<string, unknown>;
  return {
    status: 'ok',
    customToken,
    workspaceId,
    collaboratorId,
    firmName,
    branding: {
      firmName,
      ...(stringOrUndefined(branding['logoUrl']) !== undefined
        ? { logoUrl: branding['logoUrl'] }
        : {}),
      ...(stringOrUndefined(branding['primaryColor']) !== undefined
        ? { primaryColor: branding['primaryColor'] }
        : {}),
    },
    collaborator: { name: collaboratorName },
  };
});
