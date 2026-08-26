/**
 * Cloud Functions 2nd gen — Firestore triggers + callables.
 *
 * Implemented:
 *   - onWorkspaceMemberWrite → syncMemberClaims (#9) + recountSeats (#11)
 *   - onUserProfileWrite → syncMemberProfile (#104): fan displayName/photoUrl
 *     to member docs.
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
 *   - exportProject (#25): owner/admin per-project JSON export (audit-logged).
 *   - deletePersonalData (#26): owner/admin PDPA erasure — anonymize +
 *     freeze a client/collaborator, revoke links, scrub denorms, redact
 *     message-queue PII (audit-logged request + fulfilled pair).
 *
 * Each export is discovered by the Functions runtime.
 * Deploy: `pnpm --filter @siapp/functions deploy`
 *         or `firebase deploy --only functions` from repo root.
 */

// Region must be set before the hoisted imports below register any function.
import './globalOptions.js';

import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

import { recountSeats } from './triggers/recountSeats.js';
import { recomputeProjectSummary } from './triggers/projectSummary.js';
import { syncMemberClaims } from './triggers/syncMemberClaims.js';
import { syncMemberProfile } from './triggers/syncMemberProfile.js';
import { notifyInboxOnActivity } from './triggers/notifyInboxOnActivity.js';
import { notifyInboxOnComment } from './triggers/notifyInboxOnComment.js';
import { collaboratorIdsToStamp, stampCollaboratorLastTask } from './lib/lastTaskAt.js';
import { applyMirrorOps, diffTaskMirror, refreshProjectMirror } from './lib/assignedTasksMirror.js';
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
import { errorPayload } from './lib/errors.js';
import { writeAuditLog } from './lib/auditLog.js';
import { sweepDueSoon } from './scheduled/dueSoonSweep.js';
import { sweepTrialExpiry } from './scheduled/trialExpirySweep.js';
import { recordMessageUsage } from './triggers/messageUsage.js';
import { provisionWorkspace } from './admin/provisionWorkspace.js';
import { adjustWorkspace } from './admin/adjustWorkspace.js';
import { impersonateUser } from './admin/impersonateUser.js';
import { getWorkspaceOwner } from './admin/getWorkspaceOwner.js';

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

// ── Client portal callables (#21) ────────────────────────────────────────

export { issuePortalLink } from './callables/issuePortalLink.js';
export { redeemPortalLink } from './callables/redeemPortalLink.js';

// ── Data export callable (#25) ──────────────────────────────────────────────

export { exportProject } from './callables/exportProject.js';
// ── PDPA deletion callable (#26) ────────────────────────────────────────

export { deletePersonalData } from './callables/deletePersonalData.js';
// ── Collaborator task-page callables (#22) ────────────────────────────

export { issueCollaboratorLink } from './callables/issueCollaboratorLink.js';
export { sendCollaboratorLink } from './callables/sendCollaboratorLink.js';
export { redeemCollabLink } from './callables/redeemCollabLink.js';
export { submitCollabUpdate } from './callables/submitCollabUpdate.js';
// ── Admin callables (#10) ───────────────────────────────────────────────────

/** Provisions a new workspace, first owner member, and starter project. */
export const adminProvisionWorkspace = onCall(provisionWorkspace);

/** Adjusts plan / seat limit / expiry on an existing workspace. */
export const adminAdjustWorkspace = onCall(adjustWorkspace);

/** Mints a Firebase custom token for support impersonation. */
export const adminImpersonateUser = onCall(impersonateUser);

/** Resolves a workspace owner's name/email/UID for the admin detail page (#113). */
export const adminGetWorkspaceOwner = onCall(getWorkspaceOwner);

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
      // Best-effort: a stamping failure must not fail the trigger, which
      // would retry and re-run the (already committed) summary recompute.
      try {
        await stampCollaboratorLastTask(event.params.workspaceId, stampIds);
      } catch (err) {
        logger.error('onTaskWrite: lastTaskAt stamping failed', {
          workspaceId: event.params.workspaceId,
          collaboratorIds: stampIds,
          error: err,
        });
      }
    }
    // #127: fan the task's assignee diff out to each collaborator's
    // assignedTasks mirror (add/remove/update). Non-fatal: a mirror failure
    // must not fail the trigger (which would re-run the summary recompute).
    try {
      const mirrorOps = diffTaskMirror({
        projectId: event.params.projectId,
        taskId: event.params.taskId,
        before,
        after,
        project: {},
      });
      if (mirrorOps.length > 0) {
        const projectSnap = await getFirestore()
          .doc(`workspaces/${event.params.workspaceId}/projects/${event.params.projectId}`)
          .get();
        // Re-diff with the real project snapshot so set ops carry
        // projectName/lifecycle; deletes are unaffected.
        const ops = diffTaskMirror({
          projectId: event.params.projectId,
          taskId: event.params.taskId,
          before,
          after,
          project: { name: projectSnap.get('name'), lifecycle: projectSnap.get('lifecycle') },
        });
        await applyMirrorOps(
          event.params.workspaceId,
          event.params.projectId,
          event.params.taskId,
          ops,
        );
      }
    } catch (error) {
      logger.error('onTaskWrite: assignedTasks mirror fan-out failed', {
        workspaceId: event.params.workspaceId,
        projectId: event.params.projectId,
        taskId: event.params.taskId,
        err: errorPayload(error),
      });
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
          err: errorPayload(error),
        });
      }
    }

    // #23 activity capture — non-fatal, same posture as the enqueue block.
    try {
      const resolveActorName = createActorNameResolver(event.params.workspaceId);
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
            visibleToClient: false,
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
              actorNameDenorm: await resolveActorName(derived.actorUid, derived.actorType),
              ...(derived.taskId !== undefined ? { taskId: derived.taskId } : {}),
              ...(derived.taskTitleDenorm !== undefined
                ? { taskTitleDenorm: derived.taskTitleDenorm }
                : {}),
              restrictedToDepartments: derived.restrictedToDepartments,
              visibleToClient: derived.visibleToClient,
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
        err: errorPayload(error),
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
            visibleToClient: derived.visibleToClient,
            payload: derived.payload,
          },
          `${event.id}_${index}`,
        );
      }
    } catch (error) {
      logger.error('onProjectWrite: activity capture failed', {
        workspaceId: event.params.workspaceId,
        projectId: event.params.projectId,
        err: errorPayload(error),
      });
    }

    // #127: refresh projectName/lifecycle across this project's assignedTasks
    // mirror docs on rename or lifecycle change. Non-fatal, same posture as
    // the activity block; skipped on summary-only / no-op writes.
    try {
      const before = event.data?.before?.data();
      const after = event.data?.after?.data();
      if (after !== undefined && before !== undefined) {
        const nameChanged = before['name'] !== after['name'];
        const lifecycleChanged = before['lifecycle'] !== after['lifecycle'];
        if (nameChanged || lifecycleChanged) {
          await refreshProjectMirror(event.params.workspaceId, event.params.projectId, {
            name: after['name'],
            lifecycle: after['lifecycle'],
          });
        }
      }
    } catch (error) {
      logger.error('onProjectWrite: assignedTasks mirror refresh failed', {
        workspaceId: event.params.workspaceId,
        projectId: event.params.projectId,
        err: errorPayload(error),
      });
    }
  },
);

/**
 * Document activity capture (#23): `doc_added` on metadata create and
 * `doc_deleted` on the #14 soft-delete diff. uploaderType 'client' entries
 * emit `client_document_uploaded` with actorType 'client' (#21, D-034).
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
      const resolveActorName = createActorNameResolver(event.params.workspaceId);
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
                    ? // #22: collaborator uploads resolve the real name.
                      await resolveActorName(derived.actorUid, 'collaborator')
                    : 'A team member',
            ...(derived.docId !== undefined ? { docId: derived.docId } : {}),
            ...(derived.docNameDenorm !== undefined
              ? { docNameDenorm: derived.docNameDenorm }
              : {}),
            restrictedToDepartments: derived.restrictedToDepartments,
            visibleToClient: derived.visibleToClient,
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
        err: errorPayload(error),
      });
    }
  },
);

// ── Scheduled functions (#18) ───────────────────────────────────────────────

/**
 * In-app notification inbox fan-out (#134). Two `onDocumentCreated` triggers
 * write per-recipient notification docs under each firm member's
 * `notifications` subcollection. Independent of the outbound WhatsApp
 * pipeline; department need-to-know (D-025) is resolved at write time.
 *
 * Activity feed → assignment / status / blocked / lifecycle / client-doc /
 * collaborator events.
 * Task `updates` → comment mentions + watcher notifications (comments are not
 * mirrored into the activity feed, so this is the single source).
 */
export const onNotifyInboxActivity = onDocumentCreated(
  'workspaces/{workspaceId}/projects/{projectId}/activity/{activityId}',
  notifyInboxOnActivity,
);

export const onNotifyInboxComment = onDocumentCreated(
  'workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}/updates/{updateId}',
  notifyInboxOnComment,
);

/**
 * Daily due-soon sweep at 00:00 UTC = 08:00 MYT (D5) — the moment quiet
 * hours end, so due-soon messages never need holding.
 */
export const onDueSoonSweep = onSchedule('0 0 * * *', async () => {
  const written = await sweepDueSoon(new Date());
  logger.info('onDueSoonSweep: sweep complete', { written });
});

/**
 * Daily trial-expiry sweep (#24, D7) at 00:15 UTC — after dueSoonSweep.
 * Expired trials flip to `billingStatus: 'read_only'` (rules-enforced).
 */
export const onTrialExpirySweep = onSchedule('15 0 * * *', async () => {
  const expired = await sweepTrialExpiry(new Date());
  logger.info('onTrialExpirySweep: sweep complete', { expired });
});

/**
 * WhatsApp usage counting at enqueue time (#24, D4): every non-suppressed
 * `messages` record bumps `whatsappAllowance.used` + the monthly
 * `usageCounters` rollup; crossing 90% enqueues the once-per-period owner
 * DM (D5). See `triggers/messageUsage.ts`.
 *
 * Collection path: `workspaces/{workspaceId}/messages/{messageId}`
 */
export const onMessageCreated = onDocumentCreated(
  'workspaces/{workspaceId}/messages/{messageId}',
  async (event) => {
    const data = event.data?.data();
    if (data === undefined) {
      return;
    }
    try {
      await recordMessageUsage(event.params.workspaceId, data);
    } catch (error) {
      logger.error('onMessageCreated: usage counting failed', {
        workspaceId: event.params.workspaceId,
        messageId: event.params.messageId,
        err: errorPayload(error),
      });
    }
  },
);

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
      await writeAuditLog(
        event.params.workspaceId,
        {
          actorType: 'system',
          actorId: '',
          ...audit,
        },
        `${event.id}-${audit.action}`,
      );
    }
  },
);

/**
 * Fans a user's `displayName`/`photoUrl` out to every workspace member doc
 * they belong to (#104) — see `triggers/syncMemberProfile.ts`. Member docs are
 * the only member-readable source of a teammate's avatar (`users/{uid}` is
 * owner-only readable), so this keeps the denormalised copy fresh whenever a
 * user edits their profile.
 *
 * Collection path: `users/{uid}`
 */
export const onUserProfileWrite = onDocumentWritten('users/{uid}', async (event) => {
  await syncMemberProfile(event);
});

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
      await writeAuditLog(
        event.params.workspaceId,
        {
          actorType: typeof createdBy === 'string' && createdBy !== '' ? 'user' : 'system',
          actorId: typeof createdBy === 'string' ? createdBy : '',
          ...audit,
        },
        `${event.id}-${audit.action}`,
      );
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
      await writeAuditLog(
        event.params.workspaceId,
        {
          actorType: typeof invitedBy === 'string' && invitedBy !== '' ? 'user' : 'system',
          actorId: typeof invitedBy === 'string' ? invitedBy : '',
          ...audit,
        },
        `${event.id}-${audit.action}`,
      );
    }
  },
);
