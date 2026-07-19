/**
 * Request/response contracts for the invite + department callables (#11).
 * Consumed by `backend/functions` (handlers) and `apps/web` (httpsCallable
 * generics) so both sides agree on the wire shape.
 */

import type { TInviteRole, TMemberRole } from './enums.ts';

export interface ICreateInviteRequest {
  workspaceId: string;
  email: string;
  role: TInviteRole;
}

export interface ICreateInviteResponse {
  inviteId: string;
  /** Raw invite link — only surfaced at create/resend time (hash stored). */
  inviteUrl: string;
  emailSent: boolean;
}

export interface IAcceptInviteRequest {
  workspaceId: string;
  inviteId: string;
  token: string;
}

export interface IAcceptInviteResponse {
  workspaceId: string;
  workspaceSlug: string;
  role: TMemberRole;
}

export interface IRevokeInviteRequest {
  workspaceId: string;
  inviteId: string;
}

export interface IResendInviteRequest {
  workspaceId: string;
  inviteId: string;
}

export type TResendInviteResponse = ICreateInviteResponse;

export interface ISetMemberDepartmentsRequest {
  workspaceId: string;
  memberUid: string;
  departments: string[];
}

export interface ISetMemberDepartmentsResponse {
  /** Deduplicated department ids now assigned to the member. */
  departments: string[];
}

/** Stable error codes rendered by the accept page. */
export type TInviteErrorCode =
  | 'invite/not-found'
  | 'invite/expired'
  | 'invite/revoked'
  | 'invite/already-used'
  | 'invite/email-mismatch'
  | 'invite/email-unverified'
  | 'invite/already-member'
  | 'invite/already-in-workspace';
