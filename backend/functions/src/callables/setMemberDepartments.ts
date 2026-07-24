/**
 * setMemberDepartments (#11): owner/admin assign a member's departments.
 *
 * Member docs are client-write-denied (they feed the claims-sync trigger),
 * so department membership changes flow through this callable. The trigger
 * then mirrors `departments` into the member's custom claims, which is what
 * firestore.rules' canSeeRestricted() reads.
 */

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';

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

export const setMemberDepartments = onCall(async (request) => {
  const data = (request.data ?? {}) as Record<string, unknown>;
  const workspaceId = typeof data['workspaceId'] === 'string' ? data['workspaceId'] : '';
  const memberUid = typeof data['memberUid'] === 'string' ? data['memberUid'] : '';
  if (!workspaceId || !memberUid) {
    throw new HttpsError('invalid-argument', 'workspaceId and memberUid are required.');
  }
  const actorUid = requireWorkspaceAdmin(request, workspaceId);
  await assertWorkspaceActive(workspaceId); // #24 D2: read-only gate

  const departmentsRaw = data['departments'];
  if (
    !Array.isArray(departmentsRaw) ||
    departmentsRaw.some((d) => typeof d !== 'string' || d.length === 0)
  ) {
    throw new HttpsError('invalid-argument', 'departments must be an array of department ids.');
  }
  const departments = [...new Set(departmentsRaw as string[])];

  const db = getFirestore();
  const workspaceRef = db.doc(`workspaces/${workspaceId}`);
  const memberRef = workspaceRef.collection('members').doc(memberUid);

  const previous = await db.runTransaction(async (txn) => {
    const memberSnap = await txn.get(memberRef);
    if (!memberSnap.exists) {
      throw new HttpsError('not-found', 'Member not found.');
    }
    const departmentSnaps = await Promise.all(
      departments.map((depId) => txn.get(workspaceRef.collection('departments').doc(depId))),
    );
    const missing = departments.filter((_, i) => !departmentSnaps[i].exists);
    if (missing.length > 0) {
      throw new HttpsError('not-found', `Unknown departments: ${missing.join(', ')}`);
    }

    const before = memberSnap.get('departments');
    txn.update(memberRef, { departments });
    return Array.isArray(before) ? (before as string[]) : [];
  });

  // #23 (D5): access-control change → attributed audit entry.
  await writeAuditLog(workspaceId, {
    actorType: 'user',
    actorId: actorUid,
    action: 'member.departments_change',
    targetType: 'member',
    targetId: memberUid,
    before: { departments: previous },
    after: { departments },
    ...callableRequestMeta(request),
  });

  // memberCount is display-only, so an eventually-consistent recount outside
  // the transaction is fine (aggregate queries cannot run inside one).
  const affected = [...new Set([...previous, ...departments])];
  await Promise.all(
    affected.map(async (depId) => {
      const count = await workspaceRef
        .collection('members')
        .where('departments', 'array-contains', depId)
        .count()
        .get();
      await workspaceRef
        .collection('departments')
        .doc(depId)
        .update({ memberCount: count.data().count })
        .catch(() => undefined); // department may have been deleted meanwhile
    }),
  );

  return { departments };
});
