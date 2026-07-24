/**
 * updateNotificationSettings (#18, D1): owner/admin edit the workspace
 * quiet-hours window. The workspace doc is client-write-denied in rules
 * (it also carries plan/seats/allowance), so — like setProjectLifecycle —
 * the privileged mutation flows through a callable that validates the
 * window server-side and merges only the `notifications` map. Timezone is
 * pinned to Asia/Kuala_Lumpur at MVP (D6); the client cannot change it.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';

import { MYT_TIMEZONE, isValidTimeString, type IQuietHours } from '../lib/quietHours.js';
import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';
import { assertWorkspaceActive } from '../lib/workspaceStatus.js';

function requireWorkspaceAdmin(request: CallableRequest, workspaceId: string): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  const workspaces = request.auth?.token['workspaces'] as
    | Record<string, { role?: unknown }>
    | undefined;
  const role = workspaces?.[workspaceId]?.role;
  if (role !== 'owner' && role !== 'admin') {
    throw new HttpsError('permission-denied', 'Only the workspace owner or an admin can do this.');
  }
  return uid;
}

/**
 * Validated quiet-hours settings from an untrusted callable payload.
 * Exported for unit tests.
 *
 * @throws HttpsError('invalid-argument') on any malformed field.
 */
export function parseQuietHoursInput(raw: unknown): IQuietHours {
  if (typeof raw !== 'object' || raw === null) {
    throw new HttpsError('invalid-argument', 'quietHours is required.');
  }
  const qh = raw as Record<string, unknown>;
  if (typeof qh['enabled'] !== 'boolean') {
    throw new HttpsError('invalid-argument', 'quietHours.enabled must be a boolean.');
  }
  if (!isValidTimeString(qh['start']) || !isValidTimeString(qh['end'])) {
    throw new HttpsError(
      'invalid-argument',
      'quietHours.start and quietHours.end must be HH:mm times.',
    );
  }
  if (qh['timezone'] !== undefined && qh['timezone'] !== MYT_TIMEZONE) {
    throw new HttpsError('invalid-argument', `Only ${MYT_TIMEZONE} is supported.`);
  }
  return {
    enabled: qh['enabled'],
    start: qh['start'],
    end: qh['end'],
    timezone: MYT_TIMEZONE,
  };
}

export const updateNotificationSettings = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  if (!workspaceId) {
    throw new HttpsError('invalid-argument', 'workspaceId is required.');
  }
  const actorUid = requireWorkspaceAdmin(request, workspaceId);
  await assertWorkspaceActive(workspaceId); // #24 D2: read-only gate
  const quietHours = parseQuietHoursInput(data['quietHours']);

  const db = getFirestore();
  const workspaceRef = db.doc(`workspaces/${workspaceId}`);
  const snap = await workspaceRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Workspace not found.');
  }

  // Merge-not-clobber: only the notifications map + updatedAt change.
  await workspaceRef.set(
    { notifications: { quietHours }, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  // #23 (D5): settings change → attributed audit entry with before/after.
  const beforeNotifications = snap.get('notifications') as Record<string, unknown> | undefined;
  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: actorUid,
    action: 'settings.notifications_change',
    targetType: 'workspace',
    targetId: workspaceId,
    before: { quietHours: beforeNotifications?.['quietHours'] ?? null },
    after: { quietHours: { ...quietHours } },
    ...callableRequestMeta(request),
  });

  return { quietHours };
});
