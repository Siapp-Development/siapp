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
 * issueCollaboratorLink (#127): firm owner/admin/pm surfaces the one durable,
 * collaborator-scoped access link. Durable, reset-only (locked): the default
 * path is GET-OR-CREATE — while an active, unexpired link exists it returns the
 * SAME URL (no rotation), so earlier links keep working. Only `reset: true`
 * revokes-and-mints a fresh URL. The single link exposes every task assigned to
 * that collaborator (subject to per-task visibility + project-lifecycle gates).
 */
export interface IIssueCollaboratorLinkRequest {
  workspaceId: string;
  collaboratorId: string;
  /**
   * Explicit firm-side "Reset link" — revoke the active link and mint a fresh
   * one (audited collab_link.reset). Omit/false = idempotent get-or-create.
   */
  reset?: boolean;
}

export interface IIssueCollaboratorLinkResponse {
  /** Full access URL: `https://siapp.app/t/{shortCode}_{secret}`. */
  url: string;
  /** ISO instant the link stops redeeming (sliding COLLAB_LINK_TTL_DAYS). */
  expiresAt: string;
}

/**
 * sendCollaboratorLink (#127, Q-WA): enqueue-only — get-or-creates the
 * collaborator's ONE durable access link (never rotates a still-valid one) and
 * writes a `messages` doc for WhatsApp delivery via the `collab_access_link_v1`
 * template. Delivery is handled by the scheduled dispatch sweep (#133) when
 * Twilio config is present (absent creds → NoopProvider, no send).
 */
export interface ISendCollaboratorLinkRequest {
  workspaceId: string;
  collaboratorId: string;
}

export type TSendCollaboratorLinkResponse =
  | { status: 'queued'; expiresAt: string }
  | { status: 'opted_out' }
  | { status: 'no_consent' }
  | { status: 'no_phone' };

/**
 * sendPortalLink (#137, Part C): firm owner/admin/pm sends a CLIENT their
 * project portal link over WhatsApp on demand. Mints a fresh client portal link
 * (rotate-on-issue, per-action) and enqueues a `project_welcome` `messages` doc
 * — the client analog of `sendCollaboratorLink`. Enqueue-only; honours
 * opt-out / consent. Delivery is handled by the scheduled dispatch sweep (#133)
 * when Twilio config is present (absent creds → NoopProvider, no send).
 */
export interface ISendPortalLinkRequest {
  workspaceId: string;
  projectId: string;
}

export type TSendPortalLinkResponse =
  | { status: 'queued'; expiresAt: string }
  | { status: 'opted_out' }
  | { status: 'no_consent' }
  | { status: 'no_phone' };

/** redeemCollabLink (#22): unauthenticated; the URL token is the credential. */
export interface IRedeemCollabLinkRequest {
  token: string;
}

/** Collaborator identity delivered in the collab redeem response. */
export interface ICollabCollaboratorSnapshot {
  name: string;
}

/**
 * Collab redeem outcomes (#127). Success returns the workspace/collaborator
 * ids + branding — NOT a single pinned task; the surface then live-queries the
 * collaborator's assigned-tasks mirror. Every failure path (unknown code, bad
 * secret, revoked, expired, archived collaborator) surfaces the single uniform
 * `collab/invalid_or_expired` error code — no enumeration signal.
 */
export type TRedeemCollabLinkResponse =
  | {
      status: 'ok';
      customToken: string;
      workspaceId: string;
      collaboratorId: string;
      firmName: string;
      branding: IPortalBranding;
      collaborator: ICollabCollaboratorSnapshot;
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
  /** #127: the update is task-parameterized — membership re-checked server-side. */
  projectId: string;
  taskId: string;
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

/**
 * exportProject (#25): owner/admin-only per-project data export. The
 * callable assembles the full JSON snapshot server-side (D1: direct
 * response, ~9 MB guard); the web app derives per-entity CSVs from the same
 * payload client-side (D2). Documents are metadata + `storagePath` only —
 * the browser resolves fresh download URLs via the client SDK (D3).
 */
export interface IExportProjectRequest {
  workspaceId: string;
  projectId: string;
}

/** A Firestore doc flattened for export: `id` + fields, Timestamps → ISO strings. */
export type TExportRecord = { id: string } & Record<string, unknown>;

/** Task record with its `updates` stream nested (natural CSV split). */
export interface IExportTaskRecord {
  id: string;
  updates: TExportRecord[];
  [key: string]: unknown;
}

/** Document metadata record; soft-deleted docs are included, flagged (D6). */
export interface IExportDocumentRecord {
  id: string;
  /** True when the doc carries a `deletedAt` (soft delete — D6). */
  deleted: boolean;
  [key: string]: unknown;
}

/** Versioned export envelope (`exportVersion: 1`). */
export interface IExportProjectResponse {
  exportVersion: 1;
  /** ISO instant the export was assembled. */
  exportedAt: string;
  workspaceId: string;
  projectId: string;
  project: TExportRecord;
  phases: TExportRecord[];
  milestones: TExportRecord[];
  tasks: IExportTaskRecord[];
  activity: TExportRecord[];
  documents: IExportDocumentRecord[];
}

/** PDPA erasure subject kind (#26). */
export type TPdpaSubjectType = 'client' | 'collaborator';

/**
 * deletePersonalData (#26, D3/D4): owner/admin-only PDPA erasure. Anonymizes
 * the client/collaborator doc in place (sets the server-only `pdpaErased`
 * freeze marker), revokes their magic links, scrubs name denorms and redacts
 * message-queue PII (D6). Idempotent — re-running on an erased subject
 * re-scrubs and succeeds. Writes `pdpa.delete_request` +
 * `pdpa.delete_fulfilled` audit entries.
 */
export interface IDeletePersonalDataRequest {
  workspaceId: string;
  subjectType: TPdpaSubjectType;
  subjectId: string;
}

/** Per-collection scrub counts surfaced in the confirmation dialog. */
export interface IPdpaScrubCounts {
  /** Projects whose clientNameDenorm was anonymized (client subjects). */
  projects: number;
  /** Tasks whose assignee entries were anonymized (collaborator subjects). */
  tasks: number;
  /** Task updates whose authorNameDenorm was anonymized (collaborators). */
  taskUpdates: number;
  /** Activity entries whose actorNameDenorm was anonymized. */
  activity: number;
  /** Message-queue docs redacted (recipientPhone + PII variables, D6). */
  messages: number;
  /** Magic links revoked. */
  magicLinks: number;
}

export interface IDeletePersonalDataResponse {
  scrubbed: IPdpaScrubCounts;
}
