/**
 * `adminAdjustWorkspace` callable — mutates plan / seat count / renewal date
 * / billing status on an existing workspace. Guarded by `assertAdminCall`.
 * #24: plan or seat changes recompute the WA allowance in the same patch;
 * `billingStatus` is the founder's manual read-only lever (D7).
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';

import type { TBillingStatus, TWorkspacePlan } from './adminTypes.js';
import { assertAdminCall, callerIp } from './adminGuard.js';
import { writeAdminLog } from './writeAdminLog.js';
import { includedForPlan } from '../lib/billing.js';
import { writeAuditLog } from '../lib/auditLog.js';

export interface IAdjustInput {
  wid: string;
  plan?: TWorkspacePlan;
  seatLimit?: number;
  /** ISO 8601 date string */
  planExpiresAt?: string;
  billingStatus?: TBillingStatus;
}

export interface IAdjustResult {
  ok: boolean;
}

export async function adjustWorkspace(
  request: CallableRequest<IAdjustInput>,
): Promise<IAdjustResult> {
  assertAdminCall(request);

  const { wid, plan, seatLimit, planExpiresAt, billingStatus } = request.data;

  if (
    typeof wid !== 'string' ||
    wid.trim() === ''
  ) {
    throw new HttpsError('invalid-argument', 'wid is required');
  }

  if (
    plan === undefined &&
    seatLimit === undefined &&
    planExpiresAt === undefined &&
    billingStatus === undefined
  ) {
    throw new HttpsError(
      'invalid-argument',
      'At least one of plan, seatLimit, planExpiresAt, or billingStatus must be provided',
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

  if (billingStatus !== undefined) {
    if (!['active', 'read_only'].includes(billingStatus)) {
      throw new HttpsError('invalid-argument', 'billingStatus must be active or read_only');
    }
    patch['billingStatus'] = billingStatus;
  }

  // #24: plan/seat changes imply a new WA allowance (D-020 arithmetic) —
  // recomputed in the same patch so allowance and plan can never drift.
  if (plan !== undefined || seatLimit !== undefined) {
    const effectivePlan = plan ?? (before['plan'] as TWorkspacePlan);
    const effectiveSeats =
      seatLimit ?? (typeof before['seatLimit'] === 'number' ? before['seatLimit'] : 1);
    patch['whatsappAllowance.includedPerPeriod'] = includedForPlan(effectivePlan, effectiveSeats);
  }

  await wsRef.update(patch);

  // Determine the action for the audit log.
  // If multiple fields changed, log the most significant one.
  const action =
    plan !== undefined
      ? 'workspace.plan_change'
      : seatLimit !== undefined
        ? 'workspace.seat_adjust'
        : planExpiresAt !== undefined
          ? 'workspace.renewal_adjust'
          : 'workspace.status_change';

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

  // #23 Q2: mirror into the workspace's own auditLog so firm owners can see
  // plan/seat adjustments in their trail. Before is limited to patched keys.
  const beforeSubset: Record<string, unknown> = {};
  for (const key of Object.keys(patch)) {
    beforeSubset[key] = before[key] ?? null;
  }
  await writeAuditLog(wid, {
    actorType: 'admin',
    actorId: request.auth!.uid,
    action: 'admin.workspace_adjust',
    targetType: 'workspace',
    targetId: wid,
    before: beforeSubset,
    after: patch,
    ip: callerIp(request),
  });

  return { ok: true };
}
