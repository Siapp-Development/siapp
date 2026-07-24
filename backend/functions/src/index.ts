/**
 * Cloud Functions 2nd gen — Firestore triggers + callables.
 *
 * Implemented:
 *   - onWorkspaceMemberWrite → syncMemberClaims (#9) + recountSeats (#11)
 *   - Invite lifecycle callables + setMemberDepartments (#11)
 *   - setProjectLifecycle (#12): D-027 lifecycle transitions + publish preview.
 *   - getRestrictedTaskHeaders (#13): safe projection of restricted tasks.
 *   - onTaskWrite → recomputeProjectSummary (#12) + collaborator lastTaskAt (#16)
 *     + WhatsApp notification enqueue (#18)
 *   - updateNotificationSettings (#18): owner/admin quiet-hours settings.
 *   - onDueSoonSweep (#18): daily due-soon notification sweep (08:00 MYT).
 *   - onClientWrite / onCollaboratorWrite → syncPhoneIndex (#16)
 *   - adminProvisionWorkspace (#10): create workspace + first owner + starter project.
 *   - adminAdjustWorkspace (#10): mutate plan / seats / expiry.
 *   - adminImpersonateUser (#10): mint custom token for support impersonation.
 *
 * Remaining stubs arrive in later tickets:
 *   - Activity / audit log capture (#23)
 *
 * Each export is discovered by the Functions runtime.
 * Deploy: `pnpm --filter @siapp/functions deploy`
 *         or `firebase deploy --only functions` from repo root.
 */

// Region must be set before the hoisted imports below register any function.
import './globalOptions.js';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

import { recountSeats } from './triggers/recountSeats.js';
import { recomputeProjectSummary } from './triggers/projectSummary.js';
import { syncMemberClaims } from './triggers/syncMemberClaims.js';
import { collaboratorIdsToStamp, stampCollaboratorLastTask } from './lib/lastTaskAt.js';
import { syncPhoneIndex } from './lib/phoneIndex.js';
import { enqueueTaskEvent } from './lib/enqueueNotifications.js';
import { triggersFor } from './lib/notifyConfig.js';
import { sweepDueSoon } from './scheduled/dueSoonSweep.js';
import { provisionWorkspace } from './admin/provisionWorkspace.js';
import { adjustWorkspace } from './admin/adjustWorkspace.js';
import { impersonateUser } from './admin/impersonateUser.js';

initializeApp();

// ── Team invites & departments callables (#11) ─────────────────────────────

export { acceptInvite, createInvite, resendInvite, revokeInvite } from './callables/invites.js';
export { setMemberDepartments } from './callables/setMemberDepartments.js';

// ── Projects lifecycle callable (#12) ───────────────────────────────────────

export { setProjectLifecycle } from './callables/setProjectLifecycle.js';

// ── Tasks callables (#13) ───────────────────────────────────────────────────

export { getRestrictedTaskHeaders } from './callables/getRestrictedTaskHeaders.js';

// ── Notification settings callable (#18) ────────────────────────────────────

export { updateNotificationSettings } from './callables/updateNotificationSettings.js';

// ── Admin callables (#10) ───────────────────────────────────────────────────

/** Provisions a new workspace, first owner member, and starter project. */
export const adminProvisionWorkspace = onCall(provisionWorkspace);

/** Adjusts plan / seat limit / expiry on an existing workspace. */
export const adminAdjustWorkspace = onCall(adjustWorkspace);

/** Mints a Firebase custom token for support impersonation. */
export const adminImpersonateUser = onCall(impersonateUser);

// ── Firestore triggers ──────────────────────────────────────────────────────

/**
 * Maintains pre-aggregated `project.summary` counters whenever a task
 * document is created, updated, or deleted — see `triggers/projectSummary.ts`.
 * #16: additionally stamps `lastTaskAt` on collaborator assignees when the
 * task transitions to done (A7 Active/Idle derivation).
 * #18: status transitions enqueue WhatsApp notification records (D4) —
 * see `lib/enqueueNotifications.ts`.
 *
 * Collection path: `workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}`
 */
export const onTaskWrite = onDocumentWritten(
  'workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}',
  async (event) => {
    await recomputeProjectSummary(event.params.workspaceId, event.params.projectId);
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const stampIds = collaboratorIdsToStamp(before, after);
    if (stampIds.length > 0) {
      await stampCollaboratorLastTask(event.params.workspaceId, stampIds);
    }
    const notifyTrigger = triggersFor(before, after);
    if (notifyTrigger !== null && after !== undefined) {
      try {
        const projectSnap = await getFirestore()
          .doc(`workspaces/${event.params.workspaceId}/projects/${event.params.projectId}`)
          .get();
        await enqueueTaskEvent({
          workspaceId: event.params.workspaceId,
          projectId: event.params.projectId,
          taskId: event.params.taskId,
          trigger: notifyTrigger === 'blocked' ? 'task_blocked' : 'task_status_change',
          taskData: after,
          projectData: projectSnap.data(),
        });
      } catch (error) {
        // Notification enqueue must never break summary/claim maintenance.
        logger.error('onTaskWrite: notification enqueue failed', {
          workspaceId: event.params.workspaceId,
          projectId: event.params.projectId,
          taskId: event.params.taskId,
          error,
        });
      }
    }
  },
);

// ── Scheduled functions (#18) ───────────────────────────────────────────────

/**
 * Daily due-soon sweep at 00:00 UTC = 08:00 MYT (D5) — the moment quiet
 * hours end, so due-soon messages never need holding.
 */
export const onDueSoonSweep = onSchedule('0 0 * * *', async () => {
  const written = await sweepDueSoon(new Date());
  logger.info('onDueSoonSweep: sweep complete', { written });
});

/**
 * Syncs Firebase Auth custom claims whenever a member document changes
 * (member added, removed, or role/departments updated) — see
 * `triggers/syncMemberClaims.ts`.
 *
 * Collection path: `workspaces/{workspaceId}/members/{memberId}`
 */
export const onWorkspaceMemberWrite = onDocumentWritten(
  'workspaces/{workspaceId}/members/{memberId}',
  async (event) => {
    await syncMemberClaims(event);
    await recountSeats(event.params.workspaceId);
  },
);

/** E.164 phone off a trigger snapshot; null when absent or not a string. */
function phoneOf(snap: { exists: boolean; get(field: string): unknown } | undefined): string | null {
  if (snap === undefined || !snap.exists) {
    return null;
  }
  const value = snap.get('phone');
  return typeof value === 'string' && value !== '' ? value : null;
}

/**
 * Updates the cross-workspace phone index whenever a client or collaborator
 * is added, updated, or deleted (#16) — see `lib/phoneIndex.ts`.
 *
 * Collection path: `workspaces/{workspaceId}/clients/{clientId}`
 */
export const onClientWrite = onDocumentWritten(
  'workspaces/{workspaceId}/clients/{clientId}',
  async (event) => {
    await syncPhoneIndex({
      workspaceId: event.params.workspaceId,
      type: 'client',
      refId: event.params.clientId,
      beforePhone: phoneOf(event.data?.before),
      afterPhone: phoneOf(event.data?.after),
    });
  },
);

/**
 * Updates the cross-workspace phone index for collaborator changes (#16).
 *
 * Collection path: `workspaces/{workspaceId}/collaborators/{collaboratorId}`
 */
export const onCollaboratorWrite = onDocumentWritten(
  'workspaces/{workspaceId}/collaborators/{collaboratorId}',
  async (event) => {
    await syncPhoneIndex({
      workspaceId: event.params.workspaceId,
      type: 'collaborator',
      refId: event.params.collaboratorId,
      beforePhone: phoneOf(event.data?.before),
      afterPhone: phoneOf(event.data?.after),
    });
  },
);
