/**
 * `adminAdjustWorkspace` callable — mutates plan / seat count / renewal date
 * on an existing workspace. Guarded by `assertAdminCall`.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import type { TWorkspacePlan } from './adminTypes.js';
import { assertAdminCall, callerIp } from './adminGuard.js';
import { writeAdminLog } from './writeAdminLog.js';

export interface IAdjustInput {
  wid: string;
  plan?: TWorkspacePlan;
  seatLimit?: number;
  /** ISO 8601 date string */
  planExpiresAt?: string;
}

export interface IAdjustResult {
  ok: boolean;
}

export async function adjustWorkspace(
  request: CallableRequest<IAdjustInput>,
): Promise<IAdjustResult> {
  assertAdminCall(request);

  const { wid, plan, seatLimit, planExpiresAt } = request.data;

  if (
    typeof wid !== 'string' ||
    wid.trim() === ''
  ) {
    throw new HttpsError('invalid-argument', 'wid is required');
  }

  if (plan === undefined && seatLimit === undefined && planExpiresAt === undefined) {
    throw new HttpsError(
      'invalid-argument',
      'At least one of plan, seatLimit, or planExpiresAt must be provided',
    );
  }

  const db = getFirestore();
  const wsRef = db.doc(`workspaces/${wid}`);
  const wsSnap = await wsRef.get();

  if (!wsSnap.exists) {
    throw new HttpsError('not-found', `Workspace ${wid} not found`);
  }

  const before = wsSnap.data() as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (plan !== undefined) {
    if (!['trial', 'standard', 'business'].includes(plan)) {
      throw new HttpsError('invalid-argument', 'plan must be trial, standard, or business');
    }
    patch['plan'] = plan;
  }

  if (seatLimit !== undefined) {
    if (
      typeof seatLimit !== 'number' ||
      !Number.isInteger(seatLimit) ||
      seatLimit < 1 ||
      seatLimit > 100
    ) {
      throw new HttpsError('invalid-argument', 'seatLimit must be an integer between 1 and 100');
    }
    patch['seatLimit'] = seatLimit;
  }

  if (planExpiresAt !== undefined) {
    const ts = Date.parse(planExpiresAt);
    if (Number.isNaN(ts)) {
      throw new HttpsError(
        'invalid-argument',
        'planExpiresAt must be a valid ISO 8601 date string',
      );
    }
    patch['planExpiresAt'] = new Date(planExpiresAt);
  }

  await wsRef.update(patch);

  // Determine the action for the audit log.
  // If multiple fields changed, log the most significant one.
  const action =
    plan !== undefined
      ? 'workspace.plan_change'
      : seatLimit !== undefined
        ? 'workspace.seat_adjust'
        : 'workspace.renewal_adjust';

  await writeAdminLog({
    actorUid: request.auth!.uid,
    actorEmail: (request.auth!.token as Record<string, string>)['email'] ?? '',
    action,
    targetType: 'workspace',
    targetId: wid,
    before,
    after: patch,
    ip: callerIp(request),
  });

  return { ok: true };
}
