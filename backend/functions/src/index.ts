/**
 * Cloud Functions 2nd gen — Firestore triggers + callables.
 *
 * Implemented:
 *   - onWorkspaceMemberWrite → syncMemberClaims (#9) + recountSeats (#11)
 *   - Invite lifecycle callables + setMemberDepartments (#11)
 *
 * Remaining stubs arrive in later tickets:
 *   - Project summary pre-aggregation (#17)
 *   - Activity / audit log capture (#23)
 *   - Phone index maintenance (#16)
 *
 * Each export is discovered by the Functions runtime.
 * Deploy: `pnpm --filter @siapp/functions deploy`
 *         or `firebase deploy --only functions` from repo root.
 */

import { initializeApp } from 'firebase-admin/app';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

import { recountSeats } from './triggers/recountSeats.js';
import { syncMemberClaims } from './triggers/syncMemberClaims.js';

// Co-locate compute with the Firestore database (asia-southeast1, D-002).
setGlobalOptions({ region: 'asia-southeast1' });

initializeApp();

// Team invites & departments (#11).
export { acceptInvite, createInvite, resendInvite, revokeInvite } from './callables/invites.js';
export { setMemberDepartments } from './callables/setMemberDepartments.js';

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
