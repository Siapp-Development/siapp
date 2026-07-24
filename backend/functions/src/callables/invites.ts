/**
 * Invite lifecycle callables (#11): create / accept / revoke / resend.
 *
 * All invite mutations are server-side (firestore.rules denies every client
 * write on `invites`): the raw token is generated here, only its SHA-256 hash
 * is persisted, and acceptance is the only path that creates a member doc —
 * which keeps the syncMemberClaims trigger trustworthy.
 */

import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';

import {
  INVITE_TTL_MS,
  buildInviteUrl,
  generateInviteToken,
  hashInviteToken,
  inviteAcceptBlocker,
  isInviteRole,
  normalizeEmail,
  tokenMatchesHash,
  type TInviteErrorCode,
} from '../lib/invites.js';
import { postmarkServerToken, sendInviteEmail } from '../lib/mail.js';
import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';
import { assertWorkspaceActive } from '../lib/workspaceStatus.js';

/** Dashboard origin used in emailed invite links. */
const appOrigin = defineString('APP_ORIGIN', { default: 'https://dashboard.siapp.app' });

interface IClaimedWorkspaces {
  [wid: string]: { role?: unknown; departments?: unknown };
}

function claimedWorkspaces(request: CallableRequest): IClaimedWorkspaces {
  const raw = request.auth?.token['workspaces'];
  return typeof raw === 'object' && raw !== null ? (raw as IClaimedWorkspaces) : {};
}

function requireAuth(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  return uid;
}

/** Owner/admin gate from custom claims — same source of truth as the rules. */
function requireWorkspaceAdmin(request: CallableRequest, workspaceId: string): string {
  const uid = requireAuth(request);
  const role = claimedWorkspaces(request)[workspaceId]?.role;
  if (role !== 'owner' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only the workspace owner or an admin can do this.');
  }
  return uid;
}

function requireStringField(request: CallableRequest, field: string): string {
  const value = (request.data as Record<string, unknown> | undefined)?.[field];
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpsError('invalid-argument', `Missing required field: ${field}`);
  }
  return value;
}

function inviteError(code: TInviteErrorCode, message: string): HttpsError {
  return new HttpsError('failed-precondition', message, { code });
}

export const createInvite = onCall({ secrets: [postmarkServerToken] }, async (request) => {
  const workspaceId = requireStringField(request, 'workspaceId');
  const uid = requireWorkspaceAdmin(request, workspaceId);
  await assertWorkspaceActive(workspaceId); // #24 D2: read-only gate

  const email = normalizeEmail(requireStringField(request, 'email'));
  if (email === null) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }
  const role = requireStringField(request, 'role');
  if (!isInviteRole(role)) {
    throw new HttpsError('invalid-argument', 'Invites can only grant admin, pm or viewer.');
  }

  const db = getFirestore();
  const workspaceRef = db.doc(`workspaces/${workspaceId}`);
  const workspaceSnap = await workspaceRef.get();
  if (!workspaceSnap.exists) {
    throw new HttpsError('not-found', 'Workspace not found.');
  }

  const invitesRef = workspaceRef.collection('invites');
  const duplicates = await invitesRef
    .where('email', '==', email)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  if (!duplicates.empty) {
    throw new HttpsError(
      'already-exists',
      'A pending invite for this email already exists. Resend or revoke it instead.',
    );
  }

  const token = generateInviteToken();
  const inviteRef = invitesRef.doc();
  const now = Timestamp.now();
  const inviterName =
    (typeof request.auth?.token['name'] === 'string' && request.auth.token['name']) ||
    request.auth?.token['email'] ||
    'A teammate';

  await inviteRef.set({
    id: inviteRef.id,
    email,
    role,
    status: 'pending',
    tokenHash: hashInviteToken(token),
    invitedBy: uid,
    invitedByNameDenorm: inviterName,
    createdAt: now,
    expiresAt: Timestamp.fromMillis(now.toMillis() + INVITE_TTL_MS),
  });

  const inviteUrl = buildInviteUrl(appOrigin.value(), workspaceId, inviteRef.id, token);
  const emailSent = await sendInviteEmail({
    to: email,
    workspaceName: String(workspaceSnap.get('name') ?? 'a Siapp workspace'),
    inviterName: String(inviterName),
    role,
    inviteUrl,
  });

  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: uid,
    action: 'invite.create',
    targetType: 'invite',
    targetId: inviteRef.id,
    after: { email, role },
    ...callableRequestMeta(request),
  });

  return { inviteId: inviteRef.id, inviteUrl, emailSent };
});

export const revokeInvite = onCall(async (request) => {
  const workspaceId = requireStringField(request, 'workspaceId');
  const uid = requireWorkspaceAdmin(request, workspaceId);
  const inviteId = requireStringField(request, 'inviteId');

  const db = getFirestore();
  const inviteRef = db.doc(`workspaces/${workspaceId}/invites/${inviteId}`);
  await db.runTransaction(async (txn) => {
    const snap = await txn.get(inviteRef);
    if (!snap.exists) {
      throw inviteError('invite/not-found', 'Invite not found.');
    }
    if (snap.get('status') !== 'pending') {
      throw inviteError('invite/already-used', 'Only pending invites can be revoked.');
    }
    txn.update(inviteRef, {
      status: 'revoked',
      revokedAt: FieldValue.serverTimestamp(),
      revokedBy: uid,
    });
  });

  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: uid,
    action: 'invite.revoke',
    targetType: 'invite',
    targetId: inviteId,
    ...callableRequestMeta(request),
  });

  return { ok: true };
});

export const resendInvite = onCall({ secrets: [postmarkServerToken] }, async (request) => {
  const workspaceId = requireStringField(request, 'workspaceId');
  const callerUid = requireWorkspaceAdmin(request, workspaceId);
  const inviteId = requireStringField(request, 'inviteId');

  const db = getFirestore();
  const inviteRef = db.doc(`workspaces/${workspaceId}/invites/${inviteId}`);

  // Rotate the token first (old link dead), then email the fresh one.
  const token = generateInviteToken();
  const now = Timestamp.now();
  const invite = await db.runTransaction(async (txn) => {
    const snap = await txn.get(inviteRef);
    if (!snap.exists) {
      throw inviteError('invite/not-found', 'Invite not found.');
    }
    if (snap.get('status') !== 'pending') {
      throw inviteError('invite/already-used', 'Only pending invites can be resent.');
    }
    txn.update(inviteRef, {
      tokenHash: hashInviteToken(token),
      expiresAt: Timestamp.fromMillis(now.toMillis() + INVITE_TTL_MS),
    });
    return snap.data() as Record<string, unknown>;
  });

  const workspaceSnap = await db.doc(`workspaces/${workspaceId}`).get();
  const inviteUrl = buildInviteUrl(appOrigin.value(), workspaceId, inviteId, token);
  const emailSent = await sendInviteEmail({
    to: String(invite['email']),
    workspaceName: String(workspaceSnap.get('name') ?? 'a Siapp workspace'),
    inviterName: String(invite['invitedByNameDenorm'] ?? 'A teammate'),
    role: String(invite['role']),
    inviteUrl,
  });

  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: callerUid,
    action: 'invite.resend',
    targetType: 'invite',
    targetId: inviteId,
    ...callableRequestMeta(request),
  });

  return { inviteId, inviteUrl, emailSent };
});

export const acceptInvite = onCall(async (request) => {
  const uid = requireAuth(request);
  const workspaceId = requireStringField(request, 'workspaceId');
  const inviteId = requireStringField(request, 'inviteId');
  const token = requireStringField(request, 'token');
  await assertWorkspaceActive(workspaceId); // #24 D2: read-only gate

  const callerEmail = normalizeEmail(request.auth?.token.email);
  if (callerEmail === null) {
    throw new HttpsError('failed-precondition', 'Your account has no email address.');
  }
  // Invites are email-bound; an unverified address must not unlock one
  // (password signups verify via the emailed link on the accept page).
  if (request.auth?.token.email_verified !== true) {
    throw inviteError(
      'invite/email-unverified',
      'Verify your email address, then try the invite link again.',
    );
  }

  // MVP guard — one workspace per user (decided 2026-07-18). Isolated clause:
  // deleting it (plus a workspace switcher) is the whole multi-workspace path.
  if (Object.keys(claimedWorkspaces(request)).length > 0) {
    throw inviteError('invite/already-in-workspace', 'This account already belongs to a workspace.');
  }

  const db = getFirestore();
  const workspaceRef = db.doc(`workspaces/${workspaceId}`);
  const inviteRef = workspaceRef.collection('invites').doc(inviteId);
  const memberRef = workspaceRef.collection('members').doc(uid);

  const displayName =
    (typeof request.auth?.token['name'] === 'string' && request.auth.token['name']) || callerEmail;

  const accepted = await db.runTransaction(async (txn) => {
    const [inviteSnap, memberSnap, workspaceSnap] = await Promise.all([
      txn.get(inviteRef),
      txn.get(memberRef),
      txn.get(workspaceRef),
    ]);

    if (!inviteSnap.exists || !workspaceSnap.exists) {
      throw inviteError('invite/not-found', 'This invite link is invalid.');
    }
    const tokenHash = String(inviteSnap.get('tokenHash') ?? '');
    if (!tokenMatchesHash(token, tokenHash)) {
      throw inviteError('invite/not-found', 'This invite link is invalid.');
    }

    const expiresAt = inviteSnap.get('expiresAt') as Timestamp;
    const blocker = inviteAcceptBlocker(
      { status: inviteSnap.get('status'), expiresAtMs: expiresAt.toMillis() },
      Date.now(),
    );
    if (blocker === 'invite/expired' && inviteSnap.get('status') === 'pending') {
      txn.update(inviteRef, { status: 'expired' });
    }
    if (blocker !== null) {
      const messages: Record<string, string> = {
        'invite/expired': 'This invite has expired. Ask for a new one.',
        'invite/revoked': 'This invite was revoked.',
        'invite/already-used': 'This invite has already been used.',
      };
      throw inviteError(blocker, messages[blocker] ?? 'This invite can no longer be used.');
    }

    if (normalizeEmail(inviteSnap.get('email')) !== callerEmail) {
      throw inviteError(
        'invite/email-mismatch',
        'This invite was sent to a different email address.',
      );
    }
    if (memberSnap.exists) {
      throw inviteError('invite/already-member', 'You are already a member of this workspace.');
    }

    const role = String(inviteSnap.get('role'));
    txn.set(memberRef, {
      uid,
      email: callerEmail,
      displayName,
      role,
      departments: [],
      seatActive: true,
      joinedAt: FieldValue.serverTimestamp(),
      invitedBy: String(inviteSnap.get('invitedBy') ?? ''),
    });
    txn.update(inviteRef, {
      status: 'accepted',
      acceptedBy: uid,
      acceptedAt: FieldValue.serverTimestamp(),
    });

    return { role, workspaceSlug: String(workspaceSnap.get('slug') ?? '') };
  });

  // Deterministic claims for the immediate redirect; the syncMemberClaims
  // trigger will rebuild the same payload (idempotent) and the
  // claimsUpdatedAt stamp tells the signed-in client to refresh its token.
  await getAuth().setCustomUserClaims(uid, {
    workspaces: { [workspaceId]: { role: accepted.role, departments: [] } },
  });
  await db
    .doc(`users/${uid}`)
    .set({ claimsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });

  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: uid,
    action: 'invite.accept',
    targetType: 'invite',
    targetId: inviteId,
    after: { role: accepted.role },
    ...callableRequestMeta(request),
  });

  logger.info(`acceptInvite: ${uid} joined ${workspaceId} as ${accepted.role}`);
  return { workspaceId, workspaceSlug: accepted.workspaceSlug, role: accepted.role };
});
