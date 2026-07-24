/**
 * Read-only workspace guard for mutating callables (#24, D2). The rules
 * `workspaceActive` gate covers direct client writes; every callable that
 * mutates firm/portal/collab data through the Admin SDK (which bypasses
 * rules) must call this first. Redeem callables stay open — read access is
 * preserved on read-only workspaces (D3).
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

/**
 * Throws `failed-precondition` when the workspace is read-only. A missing
 * `billingStatus` (legacy docs) and a missing workspace doc are treated as
 * active — matching the rules helper.
 */
export async function assertWorkspaceActive(workspaceId: string): Promise<void> {
  const snap = await getFirestore().doc(`workspaces/${workspaceId}`).get();
  if (snap.get('billingStatus') === 'read_only') {
    throw new HttpsError(
      'failed-precondition',
      'This workspace is read-only — its plan has expired. Contact Siapp to reactivate.',
      { code: 'workspace_read_only' },
    );
  }
}
