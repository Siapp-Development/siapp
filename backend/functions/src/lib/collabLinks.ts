/**
 * Collaborator link hygiene (#22, step 7). When a collaborator assignee is
 * removed from a task, their active task-scoped magic links are soft-revoked
 * (Q1: blocks re-redemption; live sessions are bounded by the redemption-time
 * and rules-side assignment/visibility re-checks).
 *
 * The diffing is pure so it unit-tests without emulators.
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';

function collaboratorIdsOf(data: Record<string, unknown> | undefined): Set<string> {
  const ids = new Set<string>();
  const assignees = data?.['assignees'];
  if (!Array.isArray(assignees)) {
    return ids;
  }
  for (const entry of assignees) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      (entry as Record<string, unknown>)['type'] === 'collaborator' &&
      typeof (entry as Record<string, unknown>)['id'] === 'string'
    ) {
      ids.add((entry as Record<string, unknown>)['id'] as string);
    }
  }
  return ids;
}

/**
 * Collaborator ids present in `before.assignees` but absent from
 * `after.assignees` — the set whose task links must be revoked. Task
 * deletion (after === undefined) revokes every collaborator's link.
 */
export function removedCollaboratorIds(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): string[] {
  const beforeIds = collaboratorIdsOf(before);
  const afterIds = collaboratorIdsOf(after);
  return [...beforeIds].filter((id) => !afterIds.has(id));
}

/** Soft-revokes every active collaborator link for (task, collaborator). */
export async function revokeCollabLinksForTask(
  workspaceId: string,
  taskId: string,
  collaboratorIds: readonly string[],
): Promise<void> {
  const db = getFirestore();
  for (const collaboratorId of collaboratorIds) {
    const active = await db
      .collection(`workspaces/${workspaceId}/magicLinks`)
      .where('audience', '==', 'collaborator')
      .where('scopeType', '==', 'task')
      .where('scopeId', '==', taskId)
      .where('subjectId', '==', collaboratorId)
      .where('revoked', '==', false)
      .get();
    for (const snap of active.docs) {
      await snap.ref.update({
        revoked: true,
        revokedAt: FieldValue.serverTimestamp(),
        revokedBy: '',
      });
    }
  }
}
