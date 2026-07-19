/**
 * Shared guard used by every admin callable function.
 *
 * Checks:
 *  1. Caller is authenticated and has `isAdmin: true` custom claim.
 *  2. The ID token carries a second-factor signal (#10: Google SSO + MFA
 *     required). Skipped in the emulator.
 *  3. Caller IP is in `ADMIN_IP_ALLOWLIST` (comma-separated exact IPs).
 *     Fails closed when the env var is unset/empty outside the emulator —
 *     a misconfiguration must not silently remove the IP restriction.
 */

import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

function isEmulator(): boolean {
  return process.env['FUNCTIONS_EMULATOR'] === 'true';
}

/**
 * Asserts the caller is a Siapp admin, signed in with MFA, from an allowed
 * source IP. Throws `HttpsError` on any failure.
 * Call at the top of every admin callable function handler.
 */
export function assertAdminCall(context: CallableRequest<unknown>): void {
  // 1. Auth presence
  if (context.auth === undefined || context.auth === null) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }

  // 2. isAdmin claim
  const token = context.auth.token as Record<string, unknown>;
  if (token['isAdmin'] !== true) {
    throw new HttpsError('permission-denied', 'Not a Siapp admin');
  }

  // 3. MFA — the `firebase.sign_in_second_factor` claim is only present when
  // the session was established with a second factor.
  const firebaseClaims = token['firebase'] as
    | { sign_in_second_factor?: unknown }
    | undefined;
  const usedSecondFactor =
    typeof firebaseClaims?.sign_in_second_factor === 'string' &&
    firebaseClaims.sign_in_second_factor !== '';
  if (!usedSecondFactor) {
    if (isEmulator()) {
      logger.warn('assertAdminCall: no second factor on token — allowed (emulator mode)');
    } else {
      throw new HttpsError(
        'permission-denied',
        'Multi-factor authentication is required for admin access',
      );
    }
  }

  // 4. IP allowlist
  const allowlistEnv = process.env['ADMIN_IP_ALLOWLIST'];
  const allowedIps = (allowlistEnv ?? '')
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0);

  if (allowedIps.length === 0) {
    if (isEmulator()) {
      logger.warn('assertAdminCall: ADMIN_IP_ALLOWLIST not set — skipping IP check (emulator mode)');
      return;
    }
    logger.error('assertAdminCall: ADMIN_IP_ALLOWLIST not configured — failing closed');
    throw new HttpsError('failed-precondition', 'Admin IP allowlist is not configured');
  }

  const callerIp =
    (context.rawRequest.headers['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim() ?? context.rawRequest.ip;

  if (callerIp === undefined || callerIp === '') {
    logger.warn('assertAdminCall: could not determine caller IP; denying');
    throw new HttpsError('permission-denied', 'IP not permitted');
  }

  if (!allowedIps.includes(callerIp)) {
    logger.warn({ callerIp }, 'assertAdminCall: caller IP not in allowlist');
    throw new HttpsError('permission-denied', 'IP not permitted');
  }
}

/** Extract the caller's IP for audit logging. Returns undefined when unavailable. */
export function callerIp(context: CallableRequest<unknown>): string | undefined {
  const forwarded = context.rawRequest.headers['x-forwarded-for'] as string | undefined;
  return forwarded?.split(',')[0]?.trim() ?? context.rawRequest.ip;
}
