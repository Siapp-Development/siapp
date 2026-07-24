/**
 * redeemPortalLink (#21, D1): unauthenticated callable — the URL token is
 * the credential. Verifies shortCode + secret hash, revocation, expiry and
 * the D-027 lifecycle gate, then mints a Firebase custom token with portal
 * claims `{ portal: { wid, pid, cid, linkId } }` and returns the firm
 * branding snapshot (D6) so the portal never needs a workspace-doc read.
 *
 * Anti-enumeration posture: every failure (unknown code, wrong secret,
 * revoked, expired, archived/deleted project) throws the SAME uniform
 * 'portal/invalid_or_expired' error; hash comparison is constant-time.
 */

import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { parsePortalToken, portalUid, verifySecret } from '../lib/portalTokens.js';

export interface ILinkCheckInput {
  audience: unknown;
  scopeType: unknown;
  revoked: unknown;
  /** Milliseconds since epoch, or null when the field is unreadable. */
  expiresAtMs: number | null;
}

/**
 * Why a looked-up link doc cannot be redeemed (secret already verified), or
 * null when it is redeemable. Pure so it unit-tests without emulators.
 */
export function linkBlocker(
  input: ILinkCheckInput,
  nowMs: number,
): 'audience' | 'revoked' | 'expired' | null {
  if (input.audience !== 'client' || input.scopeType !== 'project') {
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

/** The single uniform failure — callers cannot distinguish why (D2). */
export function invalidOrExpired(): HttpsError {
  return new HttpsError('permission-denied', 'This link is no longer valid.', {
    code: 'portal/invalid_or_expired',
  });
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export const redeemPortalLink = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const parsed = parsePortalToken(data['token']);
  if (parsed === null) {
    throw invalidOrExpired();
  }

  const db = getFirestore();
  // Collection-group lookup by shortCode (field-override index in
  // firestore.indexes.json). shortCodes are unique with overwhelming
  // probability; limit(1) keeps the failure mode uniform regardless.
  const lookup = await db
    .collectionGroup('magicLinks')
    .where('shortCode', '==', parsed.shortCode)
    .limit(1)
    .get();
  if (lookup.empty) {
    throw invalidOrExpired();
  }
  const linkSnap = lookup.docs[0];
  const secretHash = linkSnap.get('secretHash');
  if (typeof secretHash !== 'string' || !verifySecret(parsed.secret, secretHash)) {
    throw invalidOrExpired();
  }

  const expiresAt = linkSnap.get('expiresAt') as { toMillis?: () => number } | undefined;
  const blocked = linkBlocker(
    {
      audience: linkSnap.get('audience'),
      scopeType: linkSnap.get('scopeType'),
      revoked: linkSnap.get('revoked'),
      expiresAtMs: typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : null,
    },
    Date.now(),
  );
  if (blocked !== null) {
    throw invalidOrExpired();
  }

  const workspaceRef = linkSnap.ref.parent.parent;
  const projectId = linkSnap.get('scopeId');
  const clientId = linkSnap.get('subjectId');
  if (workspaceRef === null || typeof projectId !== 'string' || typeof clientId !== 'string') {
    throw invalidOrExpired();
  }
  const workspaceId = workspaceRef.id;

  const [projectSnap, workspaceSnap] = await Promise.all([
    db.doc(`workspaces/${workspaceId}/projects/${projectId}`).get(),
    workspaceRef.get(),
  ]);
  if (!projectSnap.exists || !workspaceSnap.exists) {
    throw invalidOrExpired();
  }

  const firmName = typeof workspaceSnap.get('name') === 'string' ? workspaceSnap.get('name') : '';
  const lifecycle = projectSnap.get('lifecycle');
  if (lifecycle === 'draft') {
    // Distinguishable on purpose: a valid link to a not-yet-published
    // project is guidance, not an auth failure (B1x vs "not started").
    return { status: 'not_started', firmName };
  }
  if (lifecycle !== 'published' && lifecycle !== 'completed') {
    throw invalidOrExpired();
  }

  const uid = portalUid(workspaceId, projectId, clientId);
  const customToken = await getAuth().createCustomToken(uid, {
    portal: { wid: workspaceId, pid: projectId, cid: clientId, linkId: linkSnap.id },
  });

  await linkSnap.ref.update({
    useCount: FieldValue.increment(1),
    lastUsedAt: FieldValue.serverTimestamp(),
  });

  const branding = (workspaceSnap.get('branding') ?? {}) as Record<string, unknown>;
  const plan = workspaceSnap.get('plan');
  return {
    status: 'ok',
    customToken,
    workspaceId,
    projectId,
    branding: {
      firmName,
      ...(stringOrUndefined(branding['logoUrl']) !== undefined
        ? { logoUrl: branding['logoUrl'] }
        : {}),
      ...(stringOrUndefined(branding['primaryColor']) !== undefined
        ? { primaryColor: branding['primaryColor'] }
        : {}),
    },
    tier: plan === 'standard' || plan === 'business' ? plan : 'trial',
  };
});
