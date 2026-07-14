/**
 * Cloud Functions 2nd gen — Firestore trigger stubs.
 *
 * Full implementations arrive in later tickets:
 *   - Project summary pre-aggregation (#17)
 *   - Activity / audit log capture (#23)
 *   - Phone index maintenance (#16)
 *
 * Each stub is exported so the Functions runtime discovers them.
 * Deploy: `pnpm --filter @siapp/functions deploy`
 *         or `firebase deploy --only functions` from repo root.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';

/**
 * Maintains pre-aggregated `project.summary` counters whenever a task
 * document is created, updated, or deleted.
 *
 * Collection path: `workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}`
 */
export const onTaskWrite = onDocumentWritten(
  'workspaces/{workspaceId}/projects/{projectId}/tasks/{taskId}',
  async (_event) => {
    // TODO (#13/#17): recompute summary.totalTasks / doneTasks / overdueTasks /
    // progressPct on the parent project document using the Admin SDK.
  },
);

/**
 * Keeps `workspace.seatsUsed` consistent whenever a member document changes
 * (member added, removed, or `seatActive` toggled).
 *
 * Collection path: `workspaces/{workspaceId}/members/{memberId}`
 */
export const onWorkspaceMemberWrite = onDocumentWritten(
  'workspaces/{workspaceId}/members/{memberId}',
  async (_event) => {
    // TODO (#11): recount seatActive members and update workspace.seatsUsed.
  },
);

/**
 * Updates the cross-workspace phone index whenever a client or collaborator
 * is added, updated, or deleted.
 *
 * Collection path: `workspaces/{workspaceId}/clients/{clientId}`
 */
export const onClientWrite = onDocumentWritten(
  'workspaces/{workspaceId}/clients/{clientId}',
  async (_event) => {
    // TODO (#16): update /phoneIndex/{phone} to reflect the client ref.
  },
);

/**
 * Updates the cross-workspace phone index for collaborator changes.
 *
 * Collection path: `workspaces/{workspaceId}/collaborators/{collaboratorId}`
 */
export const onCollaboratorWrite = onDocumentWritten(
  'workspaces/{workspaceId}/collaborators/{collaboratorId}',
  async (_event) => {
    // TODO (#16): update /phoneIndex/{phone} to reflect the collaborator ref.
  },
);
