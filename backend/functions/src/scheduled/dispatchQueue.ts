/**
 * Outbound message dispatcher (#133, the deferred #19). A scheduled sweep (see
 * `onMessageDispatchSweep` in `index.ts`, every 1 min — O-3) consumes
 * `queued`, non-suppressed, past-`holdUntil` WhatsApp docs under
 * `workspaces/{workspaceId}/messages`, sends them via the injected provider,
 * and records `sent`/`failed` + `providerSid`/`errorCode` back on the doc.
 *
 * A scheduled sweep (not an `onDocumentCreated` trigger) is the sole consumer
 * because `holdUntil` (quiet hours) means a doc can be `queued` at create time
 * but must not send until later; a periodic sweep naturally re-evaluates
 * `holdUntil <= now`, and one consumer keeps the send path idempotent.
 *
 * Idempotency (O-2): each candidate is CLAIMED under a transaction
 * (`dispatch.claimedAt`/`dispatch.attempts`) before any network call, so
 * overlapping sweeps cannot double-send. A crash after claim leaves the doc
 * `queued` with a `claimedAt`; the next sweep reclaims it once the claim is
 * stale (O-4: 5 min), bounded by `MAX_ATTEMPTS` (then left `queued`).
 *
 * Per-workspace, per-doc sequential awaits with per-doc try/catch (mirrors
 * `dueSoonSweep.ts`): one send failure never aborts the batch. Full-collection
 * iteration is an inherited scale gap (no pagination) — fine at MVP volume.
 */

import { Timestamp, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

import { errorPayload } from '../lib/errors.js';
import type { IMessageProvider, IQueuedMessage, ISendResult } from '../lib/messaging/provider.js';
import type { TNotificationTrigger } from '../lib/messaging/contentSids.js';

/** Reclaim a claimed-but-unfinished doc after this window (O-4). */
export const STALE_CLAIM_MS = 5 * 60 * 1000;
/** Give up claiming after this many attempts; leave `queued` (O-4). */
export const MAX_DISPATCH_ATTEMPTS = 3;

/** Reads `.toMillis()`/`.toDate()` off a Firestore Timestamp-like value. */
function timestampToMillis(value: unknown): number | null {
  const ts = value as { toMillis?: () => number; toDate?: () => Date } | undefined;
  if (typeof ts?.toMillis === 'function') {
    return ts.toMillis();
  }
  if (typeof ts?.toDate === 'function') {
    return ts.toDate().getTime();
  }
  return null;
}

/**
 * PURE dispatch filter (unit-tested without emulators). True iff the doc is a
 * WhatsApp message ready to send as of `now`: `status === 'queued'`, not
 * suppressed, `holdUntil` absent or in the past, and a non-empty
 * `recipientPhone`. SMS is out of scope (O-5).
 */
export function selectDispatchable(data: Record<string, unknown>, now: Date): boolean {
  if (data['status'] !== 'queued' || data['suppressed'] === true) {
    return false;
  }
  if (data['channel'] !== 'whatsapp') {
    return false;
  }
  const phone = data['recipientPhone'];
  if (typeof phone !== 'string' || phone.length === 0) {
    return false;
  }
  const holdUntil = data['holdUntil'];
  if (holdUntil !== undefined && holdUntil !== null) {
    const holdMs = timestampToMillis(holdUntil);
    if (holdMs !== null && holdMs > now.getTime()) {
      return false;
    }
  }
  return true;
}

export interface IClaimDecision {
  claim: boolean;
  nextAttempts: number;
  reason: 'ok' | 'not_queued' | 'in_flight' | 'max_attempts';
}

/**
 * PURE claim decision (unit-tested). Decides whether the current sweep may
 * claim the doc, honouring an in-flight claim, the stale-claim reclaim window,
 * and the attempt ceiling.
 */
export function claimDecision(data: Record<string, unknown>, nowMs: number): IClaimDecision {
  if (data['status'] !== 'queued') {
    return { claim: false, nextAttempts: 0, reason: 'not_queued' };
  }
  const dispatch = (data['dispatch'] ?? {}) as { claimedAt?: unknown; attempts?: unknown };
  const attempts = typeof dispatch.attempts === 'number' ? dispatch.attempts : 0;
  const claimedMs = timestampToMillis(dispatch.claimedAt);
  if (claimedMs !== null && nowMs - claimedMs < STALE_CLAIM_MS) {
    // Another sweep holds a fresh claim / send is in flight.
    return { claim: false, nextAttempts: attempts, reason: 'in_flight' };
  }
  if (attempts >= MAX_DISPATCH_ATTEMPTS) {
    // Terminal fallback (O-4): leave `queued` for human/alerting.
    return { claim: false, nextAttempts: attempts, reason: 'max_attempts' };
  }
  return { claim: true, nextAttempts: attempts + 1, reason: 'ok' };
}

/** Builds the provider payload from a queue doc. */
function toQueuedMessage(id: string, data: Record<string, unknown>): IQueuedMessage {
  const rawVariables = data['variables'];
  const variables =
    typeof rawVariables === 'object' && rawVariables !== null
      ? (rawVariables as Record<string, string>)
      : {};
  const locale = typeof data['locale'] === 'string' ? (data['locale'] as string) : undefined;
  return {
    id,
    channel: 'whatsapp',
    recipientPhone: data['recipientPhone'] as string,
    templateName: typeof data['templateName'] === 'string' ? (data['templateName'] as string) : '',
    variables,
    trigger: data['trigger'] as TNotificationTrigger,
    ...(locale !== undefined ? { locale } : {}),
  };
}

export interface IDispatchStats {
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Attempts to claim one doc under a transaction. Returns the attempts count
 * when claimed, or `null` when skipped (not queued, in-flight, or maxed out).
 */
async function claimMessage(
  db: FirebaseFirestore.Firestore,
  ref: FirebaseFirestore.DocumentReference,
  now: Date,
): Promise<number | null> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      return null;
    }
    const decision = claimDecision(snap.data() ?? {}, now.getTime());
    if (!decision.claim) {
      return null;
    }
    tx.update(ref, {
      'dispatch.claimedAt': Timestamp.fromDate(now),
      'dispatch.attempts': decision.nextAttempts,
    });
    return decision.nextAttempts;
  });
}

/** Writes the send outcome back onto the doc. */
async function recordResult(
  ref: FirebaseFirestore.DocumentReference,
  result: ISendResult,
  now: Date,
): Promise<void> {
  if (result.ok) {
    await ref.update({
      status: 'sent',
      providerSid: result.providerSid ?? '',
      sentAt: Timestamp.fromDate(now),
    });
  } else {
    await ref.update({
      status: 'failed',
      errorCode: result.errorCode ?? 'unknown',
      failedAt: Timestamp.fromDate(now),
    });
  }
}

/**
 * Runs one dispatch sweep as of `now` using the given provider. Iterates every
 * workspace's `messages` subcollection (no cross-tenant collectionGroup query),
 * claims each dispatchable doc, sends it, and records the result.
 */
export async function sweepMessageQueue(
  now: Date,
  provider: IMessageProvider,
): Promise<IDispatchStats> {
  const db = getFirestore();
  const stats: IDispatchStats = { sent: 0, failed: 0, skipped: 0 };

  const workspaces = await db.collection('workspaces').get();
  for (const workspaceSnap of workspaces.docs) {
    // Single-field equality query (auto-indexed); the remaining
    // suppressed/holdUntil/channel/phone filters run in memory (D5 pattern).
    const queued = await workspaceSnap.ref
      .collection('messages')
      .where('status', '==', 'queued')
      .get();

    for (const messageSnap of queued.docs) {
      const data = messageSnap.data();
      if (!selectDispatchable(data, now)) {
        continue;
      }
      try {
        const attempts = await claimMessage(db, messageSnap.ref, now);
        if (attempts === null) {
          // Claimed by another sweep, in flight, or attempt ceiling reached.
          stats.skipped += 1;
          continue;
        }
        const result = await provider.send(toQueuedMessage(messageSnap.id, data));
        await recordResult(messageSnap.ref, result, now);
        if (result.ok) {
          stats.sent += 1;
        } else {
          stats.failed += 1;
        }
      } catch (error) {
        // One bad message must not abort the whole sweep.
        stats.failed += 1;
        logger.error('dispatchQueue: dispatch failed', {
          workspaceId: workspaceSnap.id,
          messageId: messageSnap.id,
          err: errorPayload(error),
        });
      }
    }
  }
  return stats;
}
