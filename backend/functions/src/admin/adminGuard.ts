/**
 * Shared guard used by every admin callable function.
 *
 * Checks:
 *  1. Caller is authenticated and has `isAdmin: true` custom claim.
 *  2. If `ADMIN_IP_ALLOWLIST` env var is set (comma-separated exact IPs),
 *     the caller IP must be in the list.
 *     If the env var is unset (dev / emulator), the IP check is skipped.
 */

import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

/**
 * Asserts the caller is a Siapp admin with an allowed source IP.
 * Throws `HttpsError('permission-denied')` on any failure.
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

  // 3. IP allowlist (optional — only enforced when the env var is set)
  const allowlistEnv = process.env['ADMIN_IP_ALLOWLIST'];
  if (allowlistEnv !== undefined && allowlistEnv.trim() !== '') {
    const allowedIps = allowlistEnv
      .split(',')
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0);

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
  } else {
    logger.warn(
      'assertAdminCall: ADMIN_IP_ALLOWLIST not set — skipping IP check (dev/emulator mode)',
    );
  }
}

/** Extract the caller's IP for audit logging. Returns undefined when unavailable. */
export function callerIp(context: CallableRequest<unknown>): string | undefined {
  const forwarded = context.rawRequest.headers['x-forwarded-for'] as string | undefined;
  return forwarded?.split(',')[0]?.trim() ?? context.rawRequest.ip;
}
