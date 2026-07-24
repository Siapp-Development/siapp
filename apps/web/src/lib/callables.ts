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
  IDeleteTaskRequest,
  IDeleteTaskResponse,
  IGetRestrictedTaskHeadersRequest,
  IGetRestrictedTaskHeadersResponse,
  IResendInviteRequest,
  IRevokeInviteRequest,
  ISetMemberDepartmentsRequest,
  ISetMemberDepartmentsResponse,
  ISetProjectLifecycleRequest,
  ISetProjectLifecycleResponse,
  IUpdateNotificationSettingsRequest,
  IUpdateNotificationSettingsResponse,
  TResendInviteResponse,
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
