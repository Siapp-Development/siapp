/**
 * getRestrictedTaskHeaders (#13): safe projection of department-restricted
 * tasks the caller cannot read.
 *
 * Firestore rules deny restricted-task reads outright, but the wireframes
 * (A3/A5d) still show a dimmed "Restricted · Dept" row so members know a
 * task exists. This callable runs with the Admin SDK, filters to tasks the
 * caller CANNOT see per the same claims the rules use, and returns only the
 * header projection (title/status/phase/due/order — never description,
 * assignees, or activity).
 *
 * Reads the full task collection — fine at MVP volume (starter seeds ~60).
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';

import {
  canSeeRestrictedTask,
  restrictionsOf,
  toRestrictedHeader,
  type IRestrictedTaskHeader,
  type TMemberRole,
} from '../lib/restrictedTasks.js';

interface IMemberClaims {
  role: TMemberRole;
  departments: string[];
}

function requireMemberClaims(request: CallableRequest, workspaceId: string): IMemberClaims {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to continue.');
  }
  const workspaces = request.auth.token['workspaces'] as
    | Record<string, { role?: unknown; departments?: unknown }>
    | undefined;
  const entry = workspaces?.[workspaceId];
  const role = entry?.role;
  if (role !== 'owner' && role !== 'admin' && role !== 'pm' && role !== 'viewer') {
    throw new HttpsError('permission-denied', 'You are not a member of this workspace.');
  }
  const departments = Array.isArray(entry?.departments)
    ? entry.departments.filter((dep): dep is string => typeof dep === 'string')
    : [];
  return { role, departments };
}

export const getRestrictedTaskHeaders = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  const projectId = typeof data['projectId'] === 'string' ? data['projectId'] : '';
  if (!workspaceId || !projectId) {
    throw new HttpsError('invalid-argument', 'workspaceId and projectId are required.');
  }

  const { role, departments } = requireMemberClaims(request, workspaceId);

  // Owner/admin can read every task directly — nothing is hidden from them.
  if (role === 'owner' || role === 'admin') {
    return { headers: [] };
  }

  const db = getFirestore();
  const tasks = await db
    .collection(`workspaces/${workspaceId}/projects/${projectId}/tasks`)
    .get();

  const headers: IRestrictedTaskHeader[] = [];
  for (const snap of tasks.docs) {
    const taskData = snap.data();
    if (!canSeeRestrictedTask(role, departments, restrictionsOf(taskData))) {
      headers.push(toRestrictedHeader(snap.id, taskData));
    }
  }
  return { headers };
});
