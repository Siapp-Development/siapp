/**
 * Pure collaborator task-access helpers (#127) — shared by redeemCollabLink,
 * submitCollabUpdate and the issue/send callables. Kept free of Admin SDK
 * imports so they unit-test without emulators.
 */

/** True when `assignees` contains a collaborator-type entry with this id. */
export function isCollaboratorAssignee(assignees: unknown, collaboratorId: string): boolean {
  if (!Array.isArray(assignees)) {
    return false;
  }
  return assignees.some((entry) => {
    const assignee = entry as { type?: unknown; id?: unknown } | null;
    return assignee?.type === 'collaborator' && assignee.id === collaboratorId;
  });
}

/** True when the visibility list is empty (= all assignees) or contains the id. */
export function passesCollabVisibility(
  visibleToCollaboratorIds: unknown,
  collaboratorId: string,
): boolean {
  if (!Array.isArray(visibleToCollaboratorIds)) {
    // Docs written before the field existed behave like an empty list.
    return true;
  }
  return (
    visibleToCollaboratorIds.length === 0 || visibleToCollaboratorIds.includes(collaboratorId)
  );
}

/** True when the collaborator may act on the task: assigned + visible. */
export function collaboratorCanAccessTask(
  assignees: unknown,
  visibleToCollaboratorIds: unknown,
  collaboratorId: string,
): boolean {
  return (
    isCollaboratorAssignee(assignees, collaboratorId) &&
    passesCollabVisibility(visibleToCollaboratorIds, collaboratorId)
  );
}
