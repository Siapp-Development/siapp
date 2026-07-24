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
 *     + PII audit-log capture (#23)
 *   - adminProvisionWorkspace (#10): create workspace + first owner + starter project.
 *   - adminAdjustWorkspace (#10): mutate plan / seats / expiry (+ #23 workspace
 *     audit mirror).
 *   - adminImpersonateUser (#10): mint custom token for support impersonation
 *     (+ #23 workspace audit mirror).
 *   - Activity / audit log capture (#23): onTaskWrite / onProjectWrite /
 *     onProjectDocumentWrite → project activity timeline; sensitive callables
 *     + member/client/collaborator triggers → workspace auditLog.
 *   - deleteTask (#23, Q5): attributed task hard-delete.
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
import {
  deriveDocumentActivity,
  deriveMemberAudit,
  derivePersonAudit,
  deriveProjectActivity,
  deriveTaskActivity,
} from './lib/activityDiff.js';
import {
  createActorNameResolver,
  taskDeletedActivityId,
  writeProjectActivity,
} from './lib/activityLog.js';
import { writeAuditLog } from './lib/auditLog.js';
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
export { deleteTask } from './callables/deleteTask.js';

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
 * #23: writes project activity timeline entries (task created / status /
 * assignees / due date; deterministic event-id doc ids for idempotency) plus
 * a system-actor `task_deleted` fallback that dedupes against the attributed
 * entry the deleteTask callable writes (Q5).
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
    let lifecycleSuppressed = false;
    if (notifyTrigger !== null && after !== undefined) {
      try {
        const projectSnap = await getFirestore()
          .doc(`workspaces/${event.params.workspaceId}/projects/${event.params.projectId}`)
          .get();
        const written = await enqueueTaskEvent({
          workspaceId: event.params.workspaceId,
          projectId: event.params.projectId,
          taskId: event.params.taskId,
          trigger: notifyTrigger === 'blocked' ? 'task_blocked' : 'task_status_change',
          taskData: after,
          projectData: projectSnap.data(),
        });
        // D-027 §5: records were enqueued but lifecycle-suppressed — the
        // matching activity entry carries the "would have notified" marker.
        lifecycleSuppressed = written > 0 && projectSnap.get('lifecycle') !== 'published';
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

    // #23 activity capture — non-fatal, same posture as the enqueue block.
    try {
      const resolveActorName = createActorNameResolver();
      if (after === undefined && before !== undefined) {
        // Fallback for deletes that bypassed the deleteTask callable: same
        // deterministic id, so create() no-ops when already attributed (Q5).
        await writeProjectActivity(
          event.params.workspaceId,
          event.params.projectId,
          {
            action: 'task_deleted',
            actorType: 'system',
            actorId: '',
            actorNameDenorm: 'A team member',
            taskId: event.params.taskId,
            taskTitleDenorm: typeof before['title'] === 'string' ? before['title'] : '',
            restrictedToDepartments: Array.isArray(before['restrictedToDepartments'])
              ? (before['restrictedToDepartments'] as string[])
              : [],
            payload: {},
          },
          taskDeletedActivityId(event.params.taskId),
        );
      } else {
        const events = deriveTaskActivity(event.params.taskId, before, after);
        for (const [index, derived] of events.entries()) {
          await writeProjectActivity(
            event.params.workspaceId,
            event.params.projectId,
            {
              action: derived.action,
              actorType: derived.actorType,
              actorId: derived.actorUid ?? '',
              actorNameDenorm: await resolveActorName(derived.actorUid),
              ...(derived.taskId !== undefined ? { taskId: derived.taskId } : {}),
              ...(derived.taskTitleDenorm !== undefined
                ? { taskTitleDenorm: derived.taskTitleDenorm }
                : {}),
              restrictedToDepartments: derived.restrictedToDepartments,
              payload: derived.payload,
              ...(derived.action === 'task_status_changed' && lifecycleSuppressed
                ? { wouldHaveNotified: true }
                : {}),
            },
            `${event.id}_${index}`,
          );
        }
      }
    } catch (error) {
      logger.error('onTaskWrite: activity capture failed', {
        workspaceId: event.params.workspaceId,
        projectId: event.params.projectId,
        taskId: event.params.taskId,
        error,
      });
    }
  },
);

/**
 * Project activity capture (#23): `project_created` and client link/unlink
 * entries. Lifecycle transitions are written inline by setProjectLifecycle
 * (D3) — this trigger deliberately ignores lifecycle/summary-only writes.
 *
 * Collection path: `workspaces/{workspaceId}/projects/{projectId}`
 */
export const onProjectWrite = onDocumentWritten(
  'workspaces/{workspaceId}/projects/{projectId}',
  async (event) => {
    try {
      const events = deriveProjectActivity(event.data?.before?.data(), event.data?.after?.data());
      const resolveActorName = createActorNameResolver();
      for (const [index, derived] of events.entries()) {
        await writeProjectActivity(
          event.params.workspaceId,
          event.params.projectId,
          {
            action: derived.action,
            actorType: derived.actorType,
            actorId: derived.actorUid ?? '',
            actorNameDenorm:
              derived.actorUid !== null ? await resolveActorName(derived.actorUid) : 'A team member',
            restrictedToDepartments: derived.restrictedToDepartments,
            payload: derived.payload,
          },
          `${event.id}_${index}`,
        );
      }
    } catch (error) {
      logger.error('onProjectWrite: activity capture failed', {
        workspaceId: event.params.workspaceId,
        projectId: event.params.projectId,
        error,
      });
    }
  },
);

/**
 * Document activity capture (#23): `doc_added` on metadata create and
 * `doc_deleted` on the #14 soft-delete diff. uploaderType 'client' entries
 * attribute actorType 'client' (D-034 forward-compat for #21/#22 uploads).
 *
 * Collection path: `workspaces/{workspaceId}/projects/{projectId}/documents/{documentId}`
 */
export const onProjectDocumentWrite = onDocumentWritten(
  'workspaces/{workspaceId}/projects/{projectId}/documents/{documentId}',
  async (event) => {
    try {
      const events = deriveDocumentActivity(
        event.params.documentId,
        event.data?.before?.data(),
        event.data?.after?.data(),
      );
      const resolveActorName = createActorNameResolver();
      for (const [index, derived] of events.entries()) {
        await writeProjectActivity(
          event.params.workspaceId,
          event.params.projectId,
          {
            action: derived.action,
            actorType: derived.actorType,
            actorId: derived.actorUid ?? '',
            actorNameDenorm:
              derived.actorType === 'user'
                ? await resolveActorName(derived.actorUid)
                : derived.actorType === 'client'
                  ? 'Client'
                  : derived.actorType === 'collaborator'
                    ? 'Collaborator'
                    : 'A team member',
            ...(derived.docId !== undefined ? { docId: derived.docId } : {}),
            ...(derived.docNameDenorm !== undefined
              ? { docNameDenorm: derived.docNameDenorm }
              : {}),
            restrictedToDepartments: derived.restrictedToDepartments,
            payload: derived.payload,
          },
          `${event.id}_${index}`,
        );
      }
    } catch (error) {
      logger.error('onProjectDocumentWrite: activity capture failed', {
        workspaceId: event.params.workspaceId,
        projectId: event.params.projectId,
        documentId: event.params.documentId,
        error,
      });
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
 * #23: member add/remove/role-change writes a workspace audit entry (D5).
 * Member docs are server-written only, so trigger capture is complete;
 * actor is 'system' (the originating callable also logs, attributed).
 *
 * Collection path: `workspaces/{workspaceId}/members/{memberId}`
 */
export const onWorkspaceMemberWrite = onDocumentWritten(
  'workspaces/{workspaceId}/members/{memberId}',
  async (event) => {
    await syncMemberClaims(event);
    await recountSeats(event.params.workspaceId);
    for (const audit of deriveMemberAudit(
      event.params.memberId,
      event.data?.before?.data(),
      event.data?.after?.data(),
    )) {
      await writeAuditLog(event.params.workspaceId, {
        actorType: 'system',
        actorId: '',
        ...audit,
      });
    }
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
 * #23: PII create/update writes a workspace audit entry (D5, PDPA trail);
 * create attributes via `createdBy`, updates record as 'system' (D4 note).
 *
 * Collection path: `workspaces/{workspaceId}/clients/{clientId}`
 */
export const onClientWrite = onDocumentWritten(
  'workspaces/{workspaceId}/clients/{clientId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    await syncPhoneIndex({
      workspaceId: event.params.workspaceId,
      type: 'client',
      refId: event.params.clientId,
      beforePhone: phoneOf(event.data?.before),
      afterPhone: phoneOf(event.data?.after),
    });
    for (const audit of derivePersonAudit('client', event.params.clientId, before, after)) {
      const createdBy = audit.action === 'client.create' ? after?.['createdBy'] : undefined;
      await writeAuditLog(event.params.workspaceId, {
        actorType: typeof createdBy === 'string' && createdBy !== '' ? 'user' : 'system',
        actorId: typeof createdBy === 'string' ? createdBy : '',
        ...audit,
      });
    }
  },
);

/**
 * Updates the cross-workspace phone index for collaborator changes (#16).
 * #23: PII audit trail — create attributes via `invitedBy` (D4 note).
 *
 * Collection path: `workspaces/{workspaceId}/collaborators/{collaboratorId}`
 */
export const onCollaboratorWrite = onDocumentWritten(
  'workspaces/{workspaceId}/collaborators/{collaboratorId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    await syncPhoneIndex({
      workspaceId: event.params.workspaceId,
      type: 'collaborator',
      refId: event.params.collaboratorId,
      beforePhone: phoneOf(event.data?.before),
      afterPhone: phoneOf(event.data?.after),
    });
    for (const audit of derivePersonAudit(
      'collaborator',
      event.params.collaboratorId,
      before,
      after,
    )) {
      const invitedBy = audit.action === 'collaborator.create' ? after?.['invitedBy'] : undefined;
      await writeAuditLog(event.params.workspaceId, {
        actorType: typeof invitedBy === 'string' && invitedBy !== '' ? 'user' : 'system',
        actorId: typeof invitedBy === 'string' ? invitedBy : '',
        ...audit,
      });
    }
  },
);
