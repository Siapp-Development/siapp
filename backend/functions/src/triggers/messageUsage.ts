/**
 * WhatsApp usage counting (#24, D4): every non-suppressed queue record in
 * `workspaces/{wid}/messages` counts one conversation at ENQUEUE time —
 * a deliberate, temporary divergence from firestore-data-model.md's
 * "counted on Twilio webhook delivery" until #19/#20 exist (nothing is
 * dispatched yet, so delivery-time counting would count nothing).
 *
 * Transactionally bumps `whatsappAllowance.used` (with the D4 month-rollover
 * reset — trials keep their one-time pool) and the `usageCounters/{YYYY-MM}`
 * rollup. Crossing 90% of the allowance enqueues ONE owner WhatsApp DM per
 * period into the same messages queue (D5): deterministic id
 * `quota90_{wid}_{period}` + create() so re-crossings after a rollover can
 * fire again but never twice inside a period. Quota DMs and suppressed
 * records are skipped so the alert can never count itself.
 */

import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { USAGE_ALERT_AT, crossedThreshold, periodKey, rollAllowance } from '../lib/billing.js';
import { holdUntilFor, resolveQuietHours } from '../lib/quietHours.js';

// Mirrors WA_UTILITY_COST_MYR in @siapp/shared (source-only package this
// NodeNext build cannot consume) — pm_ux/plans/21-cost-estimation.md §2.8.
const WA_UTILITY_COST_MYR = 0.1;

/**
 * True when a freshly created message doc counts against the allowance.
 * Pure — unit-tests without emulators.
 */
export function countsAgainstAllowance(messageData: Record<string, unknown>): boolean {
  return messageData['suppressed'] !== true && messageData['trigger'] !== 'wa_quota_90';
}

function toDate(value: unknown, fallback: Date): Date {
  const maybe = value as { toDate?: () => Date } | undefined;
  return typeof maybe?.toDate === 'function' ? maybe.toDate() : fallback;
}

interface IUsageResult {
  prevUsed: number;
  newUsed: number;
  included: number;
}

/** Handles one message-created event; exported for direct invocation in tests. */
export async function recordMessageUsage(
  workspaceId: string,
  messageData: Record<string, unknown>,
  now: Date = new Date(),
): Promise<void> {
  if (!countsAgainstAllowance(messageData)) {
    return;
  }

  const db = getFirestore();
  const wsRef = db.doc(`workspaces/${workspaceId}`);
  const period = periodKey(now);
  const counterRef = db.doc(`workspaces/${workspaceId}/usageCounters/${period}`);

  const result = await db.runTransaction<IUsageResult | null>(async (txn) => {
    const wsSnap = await txn.get(wsRef);
    // Firestore transactions require every read before the first write.
    const counterSnap = await txn.get(counterRef);
    const wsData = wsSnap.data();
    if (wsData === undefined) {
      return null;
    }
    const plan = wsData['plan'] as 'trial' | 'standard' | 'business';
    const allowance = (wsData['whatsappAllowance'] ?? {}) as Record<string, unknown>;
    const included = typeof allowance['includedPerPeriod'] === 'number'
      ? allowance['includedPerPeriod']
      : 0;
    const rolled = rollAllowance(
      plan,
      {
        used: typeof allowance['used'] === 'number' ? allowance['used'] : 0,
        periodStart: toDate(allowance['periodStart'], now),
      },
      now,
    );
    const newUsed = rolled.used + 1;

    txn.update(wsRef, {
      'whatsappAllowance.used': newUsed,
      'whatsappAllowance.periodStart': Timestamp.fromDate(rolled.periodStart),
    });
    if (counterSnap.exists) {
      txn.update(counterRef, {
        whatsappConv: (counterSnap.get('whatsappConv') as number | undefined ?? 0) + 1,
        computedAt: Timestamp.fromDate(now),
      });
    } else {
      txn.set(counterRef, {
        period,
        whatsappConv: 1,
        computedAt: Timestamp.fromDate(now),
      });
    }
    return { prevUsed: rolled.used, newUsed, included };
  });

  if (
    result === null ||
    !crossedThreshold(result.prevUsed, result.newUsed, result.included, USAGE_ALERT_AT)
  ) {
    return;
  }

  try {
    await enqueueQuotaAlert(workspaceId, period, result, now);
  } catch (error) {
    logger.error('recordMessageUsage: quota alert enqueue failed', { workspaceId, error });
  }
}

/**
 * D5: the once-per-period 90% owner DM. Sits `queued` until the #19
 * dispatcher exists; missing owner phone degrades to a suppressed
 * `no_phone` record (the 70% in-app banner is then the only warning).
 */
async function enqueueQuotaAlert(
  workspaceId: string,
  period: string,
  usage: IUsageResult,
  now: Date,
): Promise<void> {
  const db = getFirestore();
  const wsSnap = await db.doc(`workspaces/${workspaceId}`).get();
  const wsData = wsSnap.data();
  const ownerId = typeof wsData?.['ownerId'] === 'string' ? wsData['ownerId'] : '';
  const ownerSnap = ownerId !== '' ? await db.doc(`users/${ownerId}`).get() : null;
  const phone = ownerSnap?.get('phone');
  const ownerPhone = typeof phone === 'string' && phone !== '' ? phone : null;
  const holdUntil = holdUntilFor(now, resolveQuietHours(wsData));

  const id = `quota90_${workspaceId}_${period}`;
  const ref = db.doc(`workspaces/${workspaceId}/messages/${id}`);
  try {
    await ref.create({
      id,
      channel: 'whatsapp',
      recipientPhone: ownerPhone ?? '',
      recipientType: 'member',
      recipientId: ownerId,
      templateName: 'wa_quota_90_v1',
      variables: {
        firmName: typeof wsData?.['name'] === 'string' ? wsData['name'] : '',
        used: String(usage.newUsed),
        included: String(usage.included),
      },
      status: 'queued',
      trigger: 'wa_quota_90',
      ...(ownerId === '' || ownerPhone === null
        ? { suppressed: true, suppressedReason: ownerId === '' ? 'no_recipient' : 'no_phone' }
        : holdUntil !== null
          ? { holdUntil: Timestamp.fromDate(holdUntil) }
          : {}),
      dedupeKey: id,
      costEstimateMyr: WA_UTILITY_COST_MYR,
      createdAt: Timestamp.fromDate(now),
    });
  } catch (error) {
    // ALREADY_EXISTS (gRPC code 6) = once-per-period dedupe doing its job.
    if ((error as { code?: number }).code === 6) {
      logger.debug('enqueueQuotaAlert: dedupe hit', { id });
    } else {
      throw error;
    }
  }
}
