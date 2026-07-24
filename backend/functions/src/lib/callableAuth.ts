/**
 * Shared callable auth gate (#25/#26). Extracted from exportProject so the
 * PDPA deletePersonalData callable reuses the exact same owner/admin
 * posture. Pure apart from HttpsError — unit-tests without emulators.
 */

import { HttpsError } from 'firebase-functions/v2/https';

/** Minimal claims-bearing view of `request.auth`, so tests stay pure. */
export interface IAuthLike {
  uid?: string;
  token: Record<string, unknown>;
}

/**
 * Asserts the caller is an owner or admin of {workspaceId} per custom
 * claims and returns the uid. Stricter than the pm-inclusive editor checks
 * elsewhere — the export (#25) and PDPA erasure (#26 D4) acceptance
 * criteria both say owner/admin only.
 */
export function requireOwnerAdminClaims(auth: IAuthLike | undefined, workspaceId: string): string {
  if (!auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  const workspaces = auth.token['workspaces'] as Record<string, { role?: unknown }> | undefined;
  const role = workspaces?.[workspaceId]?.role;
  if (role !== 'owner' && role !== 'admin') {
    throw new HttpsError(
      'permission-denied',
      'Only the workspace owner or an admin can perform this action.',
    );
  }
  return auth.uid;
}
