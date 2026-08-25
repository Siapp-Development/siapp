/**
 * Typed wrappers around the #11 Cloud Functions callables. Thin by design so
 * hooks/components mock this module instead of the Functions SDK.
 */

import { httpsCallable } from 'firebase/functions';
import type {
  IAcceptInviteRequest,
  IAcceptInviteResponse,
  ICreateInviteRequest,
  ICreateInviteResponse,
  IDeletePersonalDataRequest,
  IDeletePersonalDataResponse,
  IDeleteTaskRequest,
  IDeleteTaskResponse,
  IExportProjectRequest,
  IExportProjectResponse,
  IGetRestrictedTaskHeadersRequest,
  IGetRestrictedTaskHeadersResponse,
  IIssueCollaboratorLinkRequest,
  IIssueCollaboratorLinkResponse,
  IIssuePortalLinkRequest,
  IIssuePortalLinkResponse,
  IResendInviteRequest,
  IRevokeInviteRequest,
  ISetMemberDepartmentsRequest,
  ISetMemberDepartmentsResponse,
  ISendCollaboratorLinkRequest,
  ISetProjectLifecycleRequest,
  ISetProjectLifecycleResponse,
  ISubmitCollabUpdateRequest,
  ISubmitCollabUpdateResponse,
  IUpdateNotificationSettingsRequest,
  IUpdateNotificationSettingsResponse,
  TResendInviteResponse,
  TSendCollaboratorLinkResponse,
} from '@siapp/shared';

import { functions } from './firebase.ts';

export async function createInvite(data: ICreateInviteRequest): Promise<ICreateInviteResponse> {
  const call = httpsCallable<ICreateInviteRequest, ICreateInviteResponse>(
    functions,
    'createInvite',
  );
  return (await call(data)).data;
}

export async function acceptInvite(data: IAcceptInviteRequest): Promise<IAcceptInviteResponse> {
  const call = httpsCallable<IAcceptInviteRequest, IAcceptInviteResponse>(
    functions,
    'acceptInvite',
  );
  return (await call(data)).data;
}

export async function revokeInvite(data: IRevokeInviteRequest): Promise<void> {
  const call = httpsCallable<IRevokeInviteRequest, { ok: boolean }>(functions, 'revokeInvite');
  await call(data);
}

export async function resendInvite(data: IResendInviteRequest): Promise<TResendInviteResponse> {
  const call = httpsCallable<IResendInviteRequest, TResendInviteResponse>(
    functions,
    'resendInvite',
  );
  return (await call(data)).data;
}

export async function setMemberDepartments(data: ISetMemberDepartmentsRequest): Promise<void> {
  const call = httpsCallable<ISetMemberDepartmentsRequest, ISetMemberDepartmentsResponse>(
    functions,
    'setMemberDepartments',
  );
  await call(data);
}

/** Stable invite error code from an HttpsError's details, or null. */
export function inviteErrorCode(error: unknown): string | null {
  return errorCodeWithPrefix(error, 'invite/');
}

export async function setProjectLifecycle(
  data: ISetProjectLifecycleRequest,
): Promise<ISetProjectLifecycleResponse> {
  const call = httpsCallable<ISetProjectLifecycleRequest, ISetProjectLifecycleResponse>(
    functions,
    'setProjectLifecycle',
  );
  return (await call(data)).data;
}

/** Stable project error code from an HttpsError's details, or null. */
export function projectErrorCode(error: unknown): string | null {
  return errorCodeWithPrefix(error, 'project/');
}

/** Header rows for department-restricted tasks the caller cannot read (#13). */
export async function getRestrictedTaskHeaders(
  data: IGetRestrictedTaskHeadersRequest,
): Promise<IGetRestrictedTaskHeadersResponse> {
  const call = httpsCallable<IGetRestrictedTaskHeadersRequest, IGetRestrictedTaskHeadersResponse>(
    functions,
    'getRestrictedTaskHeaders',
  );
  return (await call(data)).data;
}

/** Attributed task hard-delete (#23 Q5) — rules deny client task deletes. */
export async function deleteTask(data: IDeleteTaskRequest): Promise<IDeleteTaskResponse> {
  const call = httpsCallable<IDeleteTaskRequest, IDeleteTaskResponse>(functions, 'deleteTask');
  return (await call(data)).data;
}

/**
 * Mints (or resets) the client portal link for a project (#21, D2). Every
 * call rotates — only the secret's hash is at rest, so earlier links stop
 * working as soon as a new one is issued.
 */
export async function issuePortalLink(
  data: IIssuePortalLinkRequest,
): Promise<IIssuePortalLinkResponse> {
  const call = httpsCallable<IIssuePortalLinkRequest, IIssuePortalLinkResponse>(
    functions,
    'issuePortalLink',
  );
  return (await call(data)).data;
}

/**
 * Mints (or resets) a collaborator's one durable access link (#127). One active
 * link per collaborator — every call rotates, so earlier links stop working.
 * The single link exposes every task assigned to that collaborator.
 */
export async function issueCollaboratorLink(
  data: IIssueCollaboratorLinkRequest,
): Promise<IIssueCollaboratorLinkResponse> {
  const call = httpsCallable<IIssueCollaboratorLinkRequest, IIssueCollaboratorLinkResponse>(
    functions,
    'issueCollaboratorLink',
  );
  return (await call(data)).data;
}

/**
 * Enqueues the collaborator's access link over WhatsApp (#127, Q-WA). Honours
 * opt-out / consent; delivery depends on the #19 dispatcher (enqueue-only).
 */
export async function sendCollaboratorLink(
  data: ISendCollaboratorLinkRequest,
): Promise<TSendCollaboratorLinkResponse> {
  const call = httpsCallable<ISendCollaboratorLinkRequest, TSendCollaboratorLinkResponse>(
    functions,
    'sendCollaboratorLink',
  );
  return (await call(data)).data;
}

/** Collaborator status/need-help/note submission from the /t page (#127, D-b). */
export async function submitCollabUpdate(data: ISubmitCollabUpdateRequest): Promise<void> {
  const call = httpsCallable<ISubmitCollabUpdateRequest, ISubmitCollabUpdateResponse>(
    functions,
    'submitCollabUpdate',
  );
  await call(data);
}

/** Workspace quiet-hours edits (#18) — owner/admin only, validated server-side. */
export async function updateNotificationSettings(
  data: IUpdateNotificationSettingsRequest,
): Promise<IUpdateNotificationSettingsResponse> {
  const call = httpsCallable<
    IUpdateNotificationSettingsRequest,
    IUpdateNotificationSettingsResponse
  >(functions, 'updateNotificationSettings');
  return (await call(data)).data;
}

/**
 * Per-project data export (#25) — owner/admin only. Returns the full
 * versioned JSON snapshot; CSVs are derived client-side from this payload.
 */
export async function exportProject(
  data: IExportProjectRequest,
): Promise<IExportProjectResponse> {
  const call = httpsCallable<IExportProjectRequest, IExportProjectResponse>(
    functions,
    'exportProject',
  );
  return (await call(data)).data;
}

/**
 * PDPA erasure (#26) — owner/admin only. Anonymizes + freezes the client or
 * collaborator, revokes their links, scrubs denorms and redacts queue PII.
 * Idempotent: safe to re-run after a partial failure.
 */
export async function deletePersonalData(
  data: IDeletePersonalDataRequest,
): Promise<IDeletePersonalDataResponse> {
  const call = httpsCallable<IDeletePersonalDataRequest, IDeletePersonalDataResponse>(
    functions,
    'deletePersonalData',
  );
  return (await call(data)).data;
}

function errorCodeWithPrefix(error: unknown, prefix: string): string | null {
  if (typeof error === 'object' && error !== null && 'details' in error) {
    const details = (error as { details?: unknown }).details;
    if (typeof details === 'object' && details !== null && 'code' in details) {
      const code = (details as { code?: unknown }).code;
      if (typeof code === 'string' && code.startsWith(prefix)) {
        return code;
      }
    }
  }
  return null;
}
