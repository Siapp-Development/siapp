/**
 * setProjectLifecycle (#12): D-027 lifecycle transitions are callable-only.
 *
 * Project docs allow client-side field edits (rules-validated), but
 * `lifecycle` + its timestamps are client-immutable: the transition/role
 * matrix, timestamp stamping, and the future publish side effects (#19 welcome
 * WAs, #23 audit) must run server-side ("defense in depth" per the data model).
 *
 * `dryRun: true` on a publish request returns the WA count + cost preview for
 * the confirm dialog without transitioning. Computed with the Admin SDK so
 * restricted tasks a pm cannot read are still counted.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';

import {
  LIFECYCLE_TIMESTAMP_FIELD,
  PROJECT_LIFECYCLES,
  checkTransition,
  isLifecycleAction,
  type TMemberRole,
  type TProjectErrorCode,
  type TProjectLifecycle,
} from '../lib/projectLifecycle.js';
import { countWaRecipients } from '../lib/optOut.js';
import { writeProjectActivity } from '../lib/activityLog.js';
import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';
import { lifecycleVisibleToClient, type TProjectActivityAction } from '../lib/activityDiff.js';

// Mirrors WA_UTILITY_COST_MYR in @siapp/shared (source-only package this
// NodeNext build cannot consume) — pm_ux/plans/21-cost-estimation.md §2.8.
const WA_UTILITY_COST_MYR = 0.1;

/** #23 D2: requested lifecycle action → project activity action. */
const LIFECYCLE_ACTIVITY_ACTION: Record<string, TProjectActivityAction> = {
  publish: 'project_published',
  complete: 'project_completed',
  archive: 'project_archived',
  delete: 'project_deleted',
  reopen: 'project_reopened',
};

function projectError(code: TProjectErrorCode, message: string): HttpsError {
  return new HttpsError('failed-precondition', message, { code });
}

function requireMemberRole(request: CallableRequest, workspaceId: string): TMemberRole {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  const workspaces = request.auth.token['workspaces'] as
    | Record<string, { role?: unknown }>
    | undefined;
  const role = workspaces?.[workspaceId]?.role;
  if (role !== 'owner' && role !== 'admin' && role !== 'pm' && role !== 'viewer') {
    throw new HttpsError('permission-denied', 'You are not a member of this workspace.');
  }
  return role;
}

interface IPublishPreview {
  waCount: number;
  estimatedCostMyr: number;
}

/**
 * Messages the publish transition would fire: one welcome WA to the client
 * (when a client is linked) plus one assignment WA per collaborator
 * pre-assigned to a task with `sendWhatsapp: true` (deduplicated per
 * collaborator, matching one assignment message each). #16 (D-035):
 * recipients with a server-set `notificationsOptOut` are excluded.
 */
async function computePublishPreview(
  workspaceId: string,
  projectId: string,
  clientId: string,
): Promise<IPublishPreview> {
  const db = getFirestore();
  const tasks = await db
    .collection(`workspaces/${workspaceId}/projects/${projectId}/tasks`)
    .where('sendWhatsapp', '==', true)
    .get();

  const collaboratorIds = new Set<string>();
  for (const snap of tasks.docs) {
    const assignees = snap.get('assignees');
    if (!Array.isArray(assignees)) {
      continue;
    }
    for (const assignee of assignees as Array<{ type?: unknown; id?: unknown }>) {
      if (assignee?.type === 'collaborator' && typeof assignee.id === 'string') {
        collaboratorIds.add(assignee.id);
      }
    }
  }

  const clientSnap =
    clientId !== ''
      ? await db.doc(`workspaces/${workspaceId}/clients/${clientId}`).get()
      : null;
  const collaboratorSnaps = await Promise.all(
    [...collaboratorIds].map((id) =>
      db.doc(`workspaces/${workspaceId}/collaborators/${id}`).get(),
    ),
  );

  const waCount = countWaRecipients({
    clientLinked: clientId !== '',
    clientData: clientSnap?.data(),
    collaboratorDocs: collaboratorSnaps.map((snap) => snap.data()),
  });
  return {
    waCount,
    estimatedCostMyr: Math.round(waCount * WA_UTILITY_COST_MYR * 100) / 100,
  };
}

export const setProjectLifecycle = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  const projectId = typeof data['projectId'] === 'string' ? data['projectId'] : '';
  const action = data['action'];
  const dryRun = data['dryRun'] === true;
  if (!workspaceId || !projectId || !isLifecycleAction(action)) {
    throw new HttpsError('invalid-argument', 'workspaceId, projectId and action are required.');
  }
  if (dryRun && action !== 'publish') {
    throw new HttpsError('invalid-argument', 'dryRun is only supported for the publish action.');
  }

  const role = requireMemberRole(request, workspaceId);

  const db = getFirestore();
  const projectRef = db.doc(`workspaces/${workspaceId}/projects/${projectId}`);

  const { lifecycle, clientId, from } = await db.runTransaction(async (txn) => {
    const snap = await txn.get(projectRef);
    const current = snap.get('lifecycle') as unknown;
    if (
      !snap.exists ||
      typeof current !== 'string' ||
      !(PROJECT_LIFECYCLES as readonly string[]).includes(current)
    ) {
      throw projectError('project/not-found', 'Project not found.');
    }

    const result = checkTransition(current as TProjectLifecycle, action, role);
    if (!result.ok) {
      throw projectError(
        result.code,
        result.code === 'project/invalid-transition'
          ? `Cannot ${action} a ${current} project.`
          : `Your role cannot ${action} this project.`,
      );
    }

    if (dryRun) {
      return {
        lifecycle: current as TProjectLifecycle,
        clientId: (snap.get('clientId') as string | undefined) ?? '',
        from: null,
      };
    }

    txn.update(projectRef, {
      lifecycle: result.to,
      [LIFECYCLE_TIMESTAMP_FIELD[result.to as Exclude<TProjectLifecycle, 'draft'>]]:
        FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      lifecycle: result.to,
      clientId: (snap.get('clientId') as string | undefined) ?? '',
      from: current as TProjectLifecycle,
    };
  });

  // #23 (D3/D5): the callable knows actor + before/after — write the
  // lifecycle activity entry + audit entry inline after the commit.
  if (from !== null) {
    const uid = request.auth?.uid ?? '';
    const actorName =
      (typeof request.auth?.token['name'] === 'string' && request.auth.token['name']) ||
      (typeof request.auth?.token['email'] === 'string' && request.auth.token['email']) ||
      'Unknown member';
    await writeProjectActivity(workspaceId, projectId, {
      action: LIFECYCLE_ACTIVITY_ACTION[action] ?? 'project_published',
      actorType: 'user',
      actorId: uid,
      actorNameDenorm: actorName,
      restrictedToDepartments: [],
      // #21 (D4): publish/complete are client-facing; archive/delete/reopen
      // stay internal.
      visibleToClient: lifecycleVisibleToClient(
        LIFECYCLE_ACTIVITY_ACTION[action] ?? 'project_published',
      ),
      payload: { from, to: lifecycle },
    });
    await writeAuditLog(workspaceId, {
      actorType: 'user',
      actorId: uid,
      action: 'project.lifecycle_change',
      targetType: 'project',
      targetId: projectId,
      before: { lifecycle: from },
      after: { lifecycle },
      ...callableRequestMeta(request),
    });
  }

  if (action === 'publish') {
    const publishPreview = await computePublishPreview(workspaceId, projectId, clientId);
    return { lifecycle, publishPreview };
  }
  return { lifecycle };
});
