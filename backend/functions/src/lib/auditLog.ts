/**
 * Workspace audit-log writer (#23, D5). Mirrors admin/writeAdminLog.ts but
 * targets `workspaces/{wid}/auditLog` (owner/admin-readable per rules;
 * client writes denied). The PDPA do-not-cut item is the WRITES — the audit
 * UI ships v1.5.
 *
 * Never throws into callers: a failed audit write is logged and swallowed so
 * it cannot break the action it records (same posture as the #18 enqueue).
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import type { CallableRequest } from 'firebase-functions/v2/https';

import type { TActorType, TAuditAction } from './activityDiff.js';

export interface IAuditEntry {
  actorType: TActorType;
  actorId: string;
  action: TAuditAction;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/** Writes one workspace audit-log entry. Log-and-continue on failure. */
export async function writeAuditLog(workspaceId: string, entry: IAuditEntry): Promise<void> {
  try {
    const ref = getFirestore().collection(`workspaces/${workspaceId}/auditLog`).doc();
    await ref.set({
      ...entry,
      id: ref.id,
      ts: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error('writeAuditLog: write failed', {
      workspaceId,
      action: entry.action,
      error,
    });
  }
}

/**
 * Best-effort caller IP + user agent off a callable request (D5: captured
 * where available; omitted on trigger-sourced entries).
 */
export function callableRequestMeta(
  request: CallableRequest<unknown>,
): Pick<IAuditEntry, 'ip' | 'userAgent'> {
  const meta: Pick<IAuditEntry, 'ip' | 'userAgent'> = {};
  const forwarded = request.rawRequest?.headers?.['x-forwarded-for'];
  const ip =
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ??
    request.rawRequest?.ip;
  if (typeof ip === 'string' && ip !== '') {
    meta.ip = ip;
  }
  const userAgent = request.rawRequest?.headers?.['user-agent'];
  if (typeof userAgent === 'string' && userAgent !== '') {
    meta.userAgent = userAgent;
  }
  return meta;
}
