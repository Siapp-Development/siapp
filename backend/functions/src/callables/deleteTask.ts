/**
 * deleteTask (#23, Q5): task hard-delete is callable-only so `task_deleted`
 * activity + audit entries carry the acting uid. firestore.rules denies all
 * client-side task deletes.
 *
 * Auth mirrors the pre-#23 delete rule: owner/admin/pm only, and pm callers
 * must be able to see the task (department need-to-know — empty restriction
 * list or an intersecting claim department). Viewer is denied.
 *
 * Write order: attributed activity entry (deterministic id shared with the
 * onTaskWrite fallback, so the trigger's later create() dedupes) → audit
 * entry → task doc delete. The onTaskWrite trigger then recomputes
 * project.summary as before.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';

import { taskDeletedActivityId, writeProjectActivity } from '../lib/activityLog.js';
import { callableRequestMeta, writeAuditLog } from '../lib/auditLog.js';
import { canSeeRestrictedTask, restrictionsOf, type TMemberRole } from '../lib/restrictedTasks.js';

interface IMemberClaims {
  role: TMemberRole;
  departments: string[];
}

function requireEditorClaims(request: CallableRequest, workspaceId: string): IMemberClaims {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  const workspaces = request.auth.token['workspaces'] as
    | Record<string, { role?: unknown; departments?: unknown }>
    | undefined;
  const entry = workspaces?.[workspaceId];
  const role = entry?.role;
  if (role !== 'owner' && role !== 'admin' && role !== 'pm') {
    throw new HttpsError('permission-denied', 'Your role cannot delete tasks.');
  }
  const departments = Array.isArray(entry?.departments)
    ? entry.departments.filter((dep): dep is string => typeof dep === 'string')
    : [];
  return { role, departments };
}

export const deleteTask = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  const projectId = typeof data['projectId'] === 'string' ? data['projectId'] : '';
  const taskId = typeof data['taskId'] === 'string' ? data['taskId'] : '';
  if (!workspaceId || !projectId || !taskId) {
    throw new HttpsError('invalid-argument', 'workspaceId, projectId and taskId are required.');
  }

  const { role, departments } = requireEditorClaims(request, workspaceId);
  const uid = request.auth!.uid;

  const db = getFirestore();
  const taskRef = db.doc(`workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`);
  const taskSnap = await taskRef.get();
  if (!taskSnap.exists) {
    throw new HttpsError('not-found', 'Task not found.');
  }
  const taskData = taskSnap.data() as Record<string, unknown>;
  const restrictions = restrictionsOf(taskData);
  if (!canSeeRestrictedTask(role, departments, restrictions)) {
    throw new HttpsError('permission-denied', 'You cannot delete a task you cannot see.');
  }

  const actorName =
    (typeof request.auth?.token['name'] === 'string' && request.auth.token['name']) ||
    (typeof request.auth?.token['email'] === 'string' && request.auth.token['email']) ||
    'Unknown member';
  const title = typeof taskData['title'] === 'string' ? taskData['title'] : '';

  // Attributed entries first — the doc delete cannot be un-deleted, and the
  // writers are log-and-continue, so a failed entry never blocks the delete.
  await writeProjectActivity(
    workspaceId,
    projectId,
    {
      action: 'task_deleted',
      actorType: 'user',
      actorId: uid,
      actorNameDenorm: actorName,
      taskId,
      taskTitleDenorm: title,
      restrictedToDepartments: restrictions,
      visibleToClient: false,
      payload: {},
    },
    taskDeletedActivityId(taskId),
  );
  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: uid,
    action: 'task.delete',
    targetType: 'task',
    targetId: taskId,
    before: { projectId, title },
    ...callableRequestMeta(request),
  });

  await taskRef.delete();
  return { ok: true };
});
