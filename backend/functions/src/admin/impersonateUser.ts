/**
 * `adminImpersonateUser` callable — mints a Firebase custom token for a
 * target user so a Siapp admin can sign in as that user for support.
 *
 * Guarded by `assertAdminCall`. Cannot impersonate other admins.
 * All impersonation actions are audit-logged.
 */

import { getAuth } from 'firebase-admin/auth';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import { assertAdminCall, callerIp } from './adminGuard.js';
import { writeAdminLog } from './writeAdminLog.js';

export interface IImpersonateInput {
  targetUid: string;
  /** Required free-text reason for audit trail. */
  reason: string;
}

export interface IImpersonateResult {
  customToken: string;
}

export async function impersonateUser(
  request: CallableRequest<IImpersonateInput>,
): Promise<IImpersonateResult> {
  assertAdminCall(request);

  const { targetUid, reason } = request.data;

  if (typeof targetUid !== 'string' || targetUid.trim() === '') {
    throw new HttpsError('invalid-argument', 'targetUid is required');
  }
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new HttpsError('invalid-argument', 'reason is required for the audit trail');
  }

  const auth = getAuth();

  // Verify the target user exists.
  const targetUser = await auth.getUser(targetUid).catch((err: unknown) => {
    const isNotFound =
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'auth/user-not-found';
    if (isNotFound) {
      throw new HttpsError('not-found', `User ${targetUid} not found`);
    }
    throw err;
  });

  // Prevent admins from impersonating other admins.
  const targetClaims = targetUser.customClaims as Record<string, unknown> | undefined;
  if (targetClaims?.['isAdmin'] === true) {
    throw new HttpsError(
      'permission-denied',
      'Cannot impersonate a Siapp admin account',
    );
  }

  // Mint a custom token for the target user with an impersonation claim.
  const customToken = await auth.createCustomToken(targetUid, {
    impersonatedBy: request.auth!.uid,
  });

  await writeAdminLog({
    actorUid: request.auth!.uid,
    actorEmail: (request.auth!.token as Record<string, string>)['email'] ?? '',
    action: 'user.impersonate',
    targetType: 'user',
    targetId: targetUid,
    after: { reason: reason.trim() },
    ip: callerIp(request),
  });

  return { customToken };
}
