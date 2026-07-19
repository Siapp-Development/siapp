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
  IResendInviteRequest,
  IRevokeInviteRequest,
  ISetMemberDepartmentsRequest,
  ISetMemberDepartmentsResponse,
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
  if (typeof error === 'object' && error !== null && 'details' in error) {
    const details = (error as { details?: unknown }).details;
    if (typeof details === 'object' && details !== null && 'code' in details) {
      const code = (details as { code?: unknown }).code;
      if (typeof code === 'string' && code.startsWith('invite/')) {
        return code;
      }
    }
  }
  return null;
}
