/**
 * Request/response contracts for the invite + department callables (#11).
 * Consumed by `backend/functions` (handlers) and `apps/web` (httpsCallable
 * generics) so both sides agree on the wire shape.
 */

import type {
  TInviteRole,
  TMemberRole,
  TProjectLifecycle,
  TTaskStatus,
  TWorkspacePlan,
} from './enums.ts';

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

/** Lifecycle transitions a firm user can request (D-027). */
export type TProjectLifecycleAction = 'publish' | 'complete' | 'archive' | 'reopen' | 'delete';

export interface ISetProjectLifecycleRequest {
  workspaceId: string;
  projectId: string;
  action: TProjectLifecycleAction;
  /** Publish only: validate + return the WA preview without transitioning. */
  dryRun?: boolean;
}

export interface IPublishPreview {
  /** Outbound WhatsApp messages the publish transition would trigger. */
  waCount: number;
  /** Rough utility-conversation cost estimate (WA_UTILITY_COST_MYR each). */
  estimatedCostMyr: number;
}

export interface ISetProjectLifecycleResponse {
  /** Resulting lifecycle (current lifecycle when dryRun). */
  lifecycle: TProjectLifecycle;
  /** Present for publish requests (dry-run or real). */
  publishPreview?: IPublishPreview;
}

export interface IGetRestrictedTaskHeadersRequest {
  workspaceId: string;
  projectId: string;
}

/**
 * deleteTask (#23, Q5): task hard-delete is callable-only so `task_deleted`
 * activity/audit entries are attributed to the acting uid. Client-side
 * Firestore deletes are denied by rules.
 */
export interface IDeleteTaskRequest {
  workspaceId: string;
  projectId: string;
  taskId: string;
}

export interface IDeleteTaskResponse {
  ok: boolean;
}

/**
 * Safe projection of a department-restricted task the caller cannot read
 * (#13): enough to render the list row + "Restricted" badge, nothing more.
 */
export interface IRestrictedTaskHeader {
  id: string;
  title: string;
  status: TTaskStatus;
  phaseId: string | null;
  /** ISO string (callable responses cannot carry Timestamps). */
  dueDate: string | null;
  order: number;
  restrictedToDepartments: string[];
}

export interface IGetRestrictedTaskHeadersResponse {
  headers: IRestrictedTaskHeader[];
}

/**
 * updateNotificationSettings (#18, D1): owner/admin write the workspace
 * quiet-hours window. The workspace doc stays client-write-denied; timezone
 * is fixed server-side (D6) so the wire shape carries only the editables.
 */
export interface IUpdateNotificationSettingsRequest {
  workspaceId: string;
  quietHours: {
    enabled: boolean;
    /** 'HH:mm' 24-hour wall clock in Malaysia time. */
    start: string;
    end: string;
  };
}

export interface IUpdateNotificationSettingsResponse {
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: 'Asia/Kuala_Lumpur';
  };
}

/**
 * issuePortalLink (#21, D2): firm owner/admin/pm mints a client portal magic
 * link for a published/completed project with a linked client. One active
 * link per (project, client): every issue revokes any previous active link
 * and returns a fresh URL (raw secrets are never at rest, so an existing
 * link's URL cannot be re-surfaced). `reset: true` marks the rotation as an
 * explicit reset in the audit log.
 */
export interface IIssuePortalLinkRequest {
  workspaceId: string;
  projectId: string;
  /** Explicit firm-side "Reset link" \u2014 audit-logged as portal_link.reset. */
  reset?: boolean;
}

export interface IIssuePortalLinkResponse {
  /** Full portal URL: `https://siapp.app/p/{shortCode}_{secret}`. */
  url: string;
  /** ISO instant the link stops redeeming (PORTAL_LINK_TTL_DAYS from issue). */
  expiresAt: string;
}

/** redeemPortalLink (#21, D1): unauthenticated; the URL token is the credential. */
export interface IRedeemPortalLinkRequest {
  token: string;
}

/** Firm branding snapshot delivered in the redeem response (#21, D6). */
export interface IPortalBranding {
  firmName: string;
  logoUrl?: string;
  primaryColor?: string;
}

/**
 * Redeem outcomes. Every failure path (unknown code, bad secret, revoked,
 * expired, archived/deleted project) surfaces the single uniform
 * `portal/invalid_or_expired` error code \u2014 no enumeration signal.
 */
export type TRedeemPortalLinkResponse =
  | {
      status: 'ok';
      customToken: string;
      workspaceId: string;
      projectId: string;
      branding: IPortalBranding;
      /** Workspace `plan` \u2014 drives the tier-dependent portal footer. */
      tier: TWorkspacePlan;
    }
  | { status: 'not_started'; firmName: string };

/** Stable error code for every portal-link redemption failure (#21). */
export type TPortalErrorCode = 'portal/invalid_or_expired';

/**
 * issueCollabLink (#22, E1): firm owner/admin/pm mints a task-scoped
 * collaborator magic link for a collaborator-type assignee of a task on a
 * published/completed project. One active link per (task, collaborator):
 * every issue revokes any previous active link and returns a fresh URL.
 */
export interface IIssueCollabLinkRequest {
  workspaceId: string;
  projectId: string;
  taskId: string;
  collaboratorId: string;
  /** Explicit firm-side "Reset link" — audit-logged as collab_link.reset. */
  reset?: boolean;
}

export interface IIssueCollabLinkResponse {
  /** Full task URL: `https://siapp.app/t/{shortCode}_{secret}`. */
  url: string;
  /** ISO instant the link stops redeeming (COLLAB_LINK_TTL_DAYS from issue). */
  expiresAt: string;
}

/** redeemCollabLink (#22): unauthenticated; the URL token is the credential. */
export interface IRedeemCollabLinkRequest {
  token: string;
}

/** Task snapshot delivered in the collab redeem response (first paint). */
export interface ICollabTaskSnapshot {
  title: string;
  description: string;
  status: TTaskStatus;
  /** ISO date, or null when the task has no due date. */
  dueDate: string | null;
  projectName: string;
}

/**
 * Collab redeem outcomes. Every failure path (unknown code, bad secret,
 * revoked, expired, unassigned, archived/deleted project) surfaces the single
 * uniform `collab/invalid_or_expired` error code — no enumeration signal.
 */
export type TRedeemCollabLinkResponse =
  | {
      status: 'ok';
      customToken: string;
      workspaceId: string;
      projectId: string;
      taskId: string;
      collaboratorId: string;
      branding: IPortalBranding;
      task: ICollabTaskSnapshot;
    }
  | { status: 'not_started'; firmName: string };

/** Stable error code for every collab-link redemption failure (#22). */
export type TCollabErrorCode = 'collab/invalid_or_expired';

/**
 * submitCollabUpdate (#22, D-b): the only collaborator write path for
 * status / need-help / notes. Uploads stay direct (rules-gated Storage +
 * pinned metadata create). Discriminated union — validation server-side.
 */
export type TSubmitCollabUpdateKind = 'status' | 'need_help' | 'note';

export interface ICollabStatusUpdate {
  kind: 'status';
  to: 'in_progress' | 'done';
}

export interface ICollabNeedHelpUpdate {
  kind: 'need_help';
  /** Required, 1–1000 chars (D-d) — lands on task.blockedReason. */
  reason: string;
}

export interface ICollabNoteUpdate {
  kind: 'note';
  /** 1–5000 chars — appended to the task updates stream. */
  text: string;
}

export type TCollabUpdatePayload =
  | ICollabStatusUpdate
  | ICollabNeedHelpUpdate
  | ICollabNoteUpdate;

export interface ISubmitCollabUpdateRequest {
  update: TCollabUpdatePayload;
}

export interface ISubmitCollabUpdateResponse {
  ok: boolean;
}

/** Stable error codes for the project lifecycle callable. */
export type TProjectErrorCode =
  | 'project/not-found'
  | 'project/invalid-transition'
  | 'project/forbidden-transition';

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
