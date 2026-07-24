/**
 * Daily trial-expiry sweep (#24, D7). Trials whose `planExpiresAt` has
 * passed flip to `billingStatus: 'read_only'` — the rules-level
 * `workspaceActive` gate then denies every firm/portal/collab write while
 * reads stay open ("data preserved, read-only", D2/D3). Paid plans NEVER
 * auto-expire: a lapsed renewal is a founder judgment call in the admin
 * panel (D-019 manual workflow).
 *
 * Scheduled daily at 00:15 UTC (after dueSoonSweep). O(all trial
 * workspaces) — fine at design-partner scale.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { writeAuditLog } from '../lib/auditLog.js';

/**
 * True for a trial workspace whose expiry has passed and that is not
 * already read-only. Pure — unit-tests without emulators. Tolerates a
 * missing `billingStatus` (legacy docs = active) and a missing/odd
 * `planExpiresAt` (never expires — flag, don't cut).
 */
export function isExpiredTrial(wsData: Record<string, unknown>, now: Date): boolean {
  if (wsData['plan'] !== 'trial' || wsData['billingStatus'] === 'read_only') {
    return false;
  }
  const expiresAt = wsData['planExpiresAt'] as { toDate?: () => Date } | undefined;
  if (typeof expiresAt?.toDate !== 'function') {
    return false;
  }
  return expiresAt.toDate().getTime() <= now.getTime();
}

/** Runs one sweep as of `now`; returns the number of workspaces expired. */
export async function sweepTrialExpiry(now: Date): Promise<number> {
  const db = getFirestore();
  // Single equality query (auto-indexed); expiry + status filter in memory —
  // avoids a composite index at MVP trial counts.
  const trials = await db.collection('workspaces').where('plan', '==', 'trial').get();

  let expired = 0;
  for (const snap of trials.docs) {
    const data = snap.data();
    if (!isExpiredTrial(data, now)) {
      continue;
    }
    try {
      await snap.ref.update({ billingStatus: 'read_only', updatedAt: now });
      await writeAuditLog(snap.id, {
        actorType: 'system',
        actorId: '',
        action: 'billing.trial_expired',
        targetType: 'workspace',
        targetId: snap.id,
        before: { billingStatus: data['billingStatus'] ?? 'active' },
        after: { billingStatus: 'read_only' },
      });
      expired += 1;
    } catch (error) {
      // One bad workspace must not abort the whole sweep.
      logger.error('trialExpirySweep: expiry failed', { workspaceId: snap.id, error });
    }
  }
  return expired;
}
