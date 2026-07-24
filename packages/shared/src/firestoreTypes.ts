/**
 * Firestore document types.
 *
 * All timestamp fields use a plain `Date` here so the types remain
 * framework-agnostic. Consumers using the Firebase Web SDK should cast
 * to `Timestamp` where needed; the Admin SDK uses the same `Timestamp`
 * class via `firebase-admin/firestore`.
 *
 * Collection paths follow the workspace-scoped model from
 * pm_ux/plans/firestore-data-model.md: `/workspaces/{wid}/…`
 */

import type {
  TActorType,
  TAdminAction,
  TAuditAction,
  TCollaboratorStatus,
  TCollaboratorType,
  TDocumentScope,
  TInviteRole,
  TInviteStatus,
  TLocale,
  TMagicLinkKind,
  TMagicLinkScopeType,
  TMemberRole,
  TMessageChannel,
  TMessageRecipientType,
  TMessageStatus,
  TNotificationTrigger,
  TPhaseStatus,
  TPhoneRefType,
  TProjectActivityAction,
  TProjectLifecycle,
  TProjectStatus,
  TProjectVertical,
  TScanStatus,
  TSuppressedReason,
  TTaskStatus,
  TTaskUpdateAction,
  TTaskUpdateAuthorType,
  TTaskUpdateSource,
  TUploaderType,
  TWorkspacePlan,
} from './enums.ts';

// ---------------------------------------------------------------------------
// Auth custom claims
// ---------------------------------------------------------------------------

/** Per-workspace entry inside the Firebase Auth custom-claims payload. */
export interface IWorkspaceClaimEntry {
  role: TMemberRole;
  departments: string[];
}

/**
 * Shape of the Firebase Auth custom claims set by the `setCustomClaim`
 * Cloud Function and read by `firestore.rules`
 * (`request.auth.token.workspaces[wid]`). Shared with the rules test
 * harness so both sides agree on the claim shape.
 */
export interface IWorkspaceClaims {
  workspaces: Record<string, IWorkspaceClaimEntry>;
  /** Present and `true` only on Siapp-admin accounts. Set once via the
   *  `setAdminClaim.ts` bootstrap script; never set by user-initiated flows. */
  isAdmin?: boolean;
}

/**
 * Custom claims minted by `redeemPortalLink` (#21, D1): a portal principal
 * is project-scoped and single-workspace by construction. It carries NO
 * `workspaces` claim, so every firm rule automatically denies it; the
 * portal rules in firestore.rules/storage.rules string-compare `wid`/`pid`
 * against the match path.
 */
export interface IPortalClaims {
  portal: {
    wid: string;
    pid: string;
    cid: string;
    linkId: string;
  };
}

/**
 * Custom claims minted by `redeemCollabLink` (#22, E1): a collaborator
 * principal is pinned to ONE task in ONE project in ONE workspace. Like
 * portal claims it carries NO `workspaces` claim, so every firm rule
 * automatically denies it; the collab rules string-compare `wid`/`pid`/`tid`
 * against the match path.
 */
export interface ICollabClaims {
  collab: {
    wid: string;
    pid: string;
    tid: string;
    colid: string;
    linkId: string;
  };
}

// ---------------------------------------------------------------------------
// Top-level collections
// ---------------------------------------------------------------------------

/** `/users/{uid}` — firm staff Firebase Auth profile. */
export interface IUserDoc {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  phone?: string;
  defaultWorkspaceId?: string;
  locale: TLocale;
  createdAt: Date;
  lastSeenAt: Date;
}

/** Entry inside `/phoneIndex/{phoneE164}.refs[]` */
export interface IPhoneRef {
  workspaceId: string;
  type: TPhoneRefType;
  refId: string;
  addedAt: Date;
}

/** `/phoneIndex/{phoneE164}` — cross-workspace phone lookup. */
export interface IPhoneIndexDoc {
  phone: string;
  refs: IPhoneRef[];
  updatedAt: Date;
}

/**
 * `/adminLog/{alid}` — audit trail written by Siapp admin Cloud Functions.
 * Client writes are denied by Firestore rules; only the Admin SDK writes here.
 */
export interface IAdminLogDoc {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: TAdminAction;
  targetType: 'workspace' | 'user';
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  ts: Date;
}

// ---------------------------------------------------------------------------
// Workspace tree — `/workspaces/{wid}`
// ---------------------------------------------------------------------------

export interface IWorkspaceBranding {
  logoUrl?: string;
  primaryColor?: string;
}

export interface IWorkspaceWhatsappAllowance {
  includedPerPeriod: number;
  periodStart: Date;
  used: number;
}

/**
 * Workspace quiet-hours window (#18, D1/D6). `start`/`end` are 'HH:mm' wall
 * clock in `timezone`; `start > end` means the window wraps midnight.
 * Timezone is a literal at MVP (Malaysia-only, fixed UTC+8).
 */
export interface IQuietHoursSettings {
  enabled: boolean;
  start: string;
  end: string;
  timezone: 'Asia/Kuala_Lumpur';
}

/** `workspaces/{wid}.notifications` — server-written via updateNotificationSettings (#18). */
export interface INotificationSettings {
  quietHours: IQuietHoursSettings;
}

/** `/workspaces/{wid}` */
export interface IWorkspaceDoc {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: TWorkspacePlan;
  planExpiresAt: Date;
  seatLimit: number;
  seatsUsed: number;
  branding: IWorkspaceBranding;
  whatsappAllowance: IWorkspaceWhatsappAllowance;
  defaultLocale: TLocale;
  /** Absent = QUIET_HOURS_DEFAULT (#18, D1). */
  notifications?: INotificationSettings;
  createdAt: Date;
  updatedAt: Date;
}

/** `/workspaces/{wid}/members/{uid}` */
export interface IMemberDoc {
  uid: string;
  email: string;
  displayName: string;
  role: TMemberRole;
  departments: string[];
  seatActive: boolean;
  joinedAt: Date;
  invitedBy: string;
}

/** `/workspaces/{wid}/departments/{depId}` */
export interface IDepartmentDoc {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: Date;
  createdBy: string;
  memberCount: number;
}

/**
 * `/workspaces/{wid}/invites/{inviteId}` — pending team invitations (#11).
 * The raw token is only ever emailed / returned to the inviter; Firestore
 * stores its SHA-256 hash. Client writes are denied — all mutations go
 * through the invite callables so member docs stay server-authored.
 */
export interface IInviteDoc {
  id: string;
  email: string;
  role: TInviteRole;
  status: TInviteStatus;
  tokenHash: string;
  invitedBy: string;
  invitedByNameDenorm: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedBy?: string;
  acceptedAt?: Date;
  revokedAt?: Date;
  revokedBy?: string;
}

/** `/workspaces/{wid}/clients/{cid}` */
export interface IClientDoc {
  id: string;
  name: string;
  phone: string;
  email?: string;
  companyName?: string;
  language: TLocale;
  notes?: string;
  notificationsOptOut?: boolean;
  createdAt: Date;
  createdBy: string;
}

/** `/workspaces/{wid}/collaborators/{colid}` */
export interface ICollaboratorDoc {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  trade?: string;
  type: TCollaboratorType;
  status: TCollaboratorStatus;
  notificationsOptOut?: boolean;
  createdAt: Date;
  invitedBy: string;
  lastTaskAt?: Date;
}

/**
 * `/workspaces/{wid}/magicLinks/{linkId}` — collaborator + client tokens
 * (server-only; rules deny all client access, #21 D2). The doc id is a
 * random linkId, NOT the shortCode: the URL token is `{shortCode}_{secret}`
 * and only the secret's SHA-256 is at rest (`secretHash`); `shortCode` is
 * the indexed lookup key.
 */
export interface IMagicLinkDoc {
  id: string;
  shortCode: string;
  /** SHA-256 hex of the URL secret — raw secrets are never persisted. */
  secretHash: string;
  audience: TMagicLinkKind;
  scopeType: TMagicLinkScopeType;
  scopeId: string;
  subjectId: string;
  issuedAt: Date;
  expiresAt: Date;
  lastUsedAt?: Date;
  useCount: number;
  revoked: boolean;
  revokedAt?: Date;
  revokedBy?: string;
  createdBy: string;
  /**
   * #22: present on task-scoped collaborator links only — redemption needs
   * the project path and `scopeId` carries the task id. Server-written.
   */
  projectId?: string;
}

// ---------------------------------------------------------------------------
// Projects — `/workspaces/{wid}/projects/{pid}`
// ---------------------------------------------------------------------------

export interface IProjectSummary {
  totalTasks: number;
  doneTasks: number;
  overdueTasks: number;
  /** Optional: absent on projects untouched since the #17 trigger deploy. */
  blockedTasks?: number;
  progressPct: number;
  lastActivityAt: Date;
}

export interface IProjectVisibility {
  clientCanSee: boolean;
  collaboratorsCount: number;
}

/** `/workspaces/{wid}/projects/{pid}` */
export interface IProjectDoc {
  id: string;
  name: string;
  code?: string;
  vertical: TProjectVertical;
  lifecycle: TProjectLifecycle;
  publishedAt?: Date;
  completedAt?: Date;
  archivedAt?: Date;
  deletedAt?: Date;
  status: TProjectStatus;
  duplicatedFromProjectId?: string;
  clientId: string;
  clientNameDenorm: string;
  ownerUid: string;
  ownerNameDenorm: string;
  startDate: Date;
  targetEndDate?: Date;
  actualEndDate?: Date;
  summary: IProjectSummary;
  visibility: IProjectVisibility;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/** `/workspaces/{wid}/projects/{pid}/phases/{phid}` */
export interface IPhaseDoc {
  id: string;
  name: string;
  order: number;
  startDate?: Date;
  endDate?: Date;
  status: TPhaseStatus;
}

/** `/workspaces/{wid}/projects/{pid}/milestones/{mid}` — client-facing checkpoints. */
export interface IMilestoneDoc {
  id: string;
  name: string;
  targetDate: Date;
  completedAt?: Date;
  order: number;
  description?: string;
}

/** Firm-staff assignee entry on a task. */
export interface ITaskUserAssignee {
  type: 'user';
  id: string;
  name: string;
}

/** External-collaborator assignee entry on a task. */
export interface ITaskCollaboratorAssignee {
  type: 'collaborator';
  id: string;
  name: string;
  phone: string;
}

export type TTaskAssignee = ITaskUserAssignee | ITaskCollaboratorAssignee;

/**
 * Per-task notification triggers + recipients (#18, D2). `sendWhatsapp: false`
 * short-circuits everything regardless of this map (D8).
 */
export interface ITaskNotifyConfig {
  statusChange: boolean;
  dueSoon: boolean;
  blocked: boolean;
  toClient: boolean;
  toInternal: boolean;
}

/** `/workspaces/{wid}/projects/{pid}/tasks/{tid}` */
export interface ITaskDoc {
  id: string;
  title: string;
  description?: string;
  phaseId?: string;
  status: TTaskStatus;
  startDate?: Date;
  dueDate?: Date;
  completedAt?: Date;
  assignees: TTaskAssignee[];
  visibleToClient: boolean;
  /** Empty = all assigned collaborators see it. */
  visibleToCollaboratorIds: string[];
  /** Empty/missing = unrestricted; see 20-access-control-departments.md. */
  restrictedToDepartments: string[];
  /**
   * Why the task is blocked (#22, D-d) — set by submitCollabUpdate
   * (need-help) or firm edits; cleared when status leaves 'blocked'.
   */
  blockedReason?: string;
  /** Per-task WhatsApp toggle (D-031: copied on Duplicate). */
  sendWhatsapp: boolean;
  /** Trigger/recipient config (#18, D2). Absent = TASK_NOTIFY_DEFAULTS. */
  notify?: ITaskNotifyConfig;
  /** Task ids this task depends on (D-031 dependency links). */
  dependsOn: string[];
  order: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  /** Rules-pinned to the caller on every update (#23, D4 actor attribution). */
  updatedBy?: string;
}

export interface ITaskUpdatePayload {
  from?: unknown;
  to?: unknown;
  text?: string;
  /** Workspace-member uids @mentioned in `text` (#13). */
  mentions?: string[];
  storagePath?: string;
  mimeType?: string;
}

/**
 * `/workspaces/{wid}/projects/{pid}/tasks/{tid}/updates/{updid}`
 * Append-only activity stream; drives the task feed, audit, and notifications.
 */
export interface ITaskUpdateDoc {
  id: string;
  authorType: TTaskUpdateAuthorType;
  authorId: string;
  authorNameDenorm: string;
  source: TTaskUpdateSource;
  action: TTaskUpdateAction;
  payload: ITaskUpdatePayload;
  createdAt: Date;
}

/** `/workspaces/{wid}/projects/{pid}/documents/{did}` */
export interface IProjectDocumentDoc {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  scope: TDocumentScope;
  scopeId: string;
  uploadedBy: string;
  uploaderType: TUploaderType;
  uploadedAt: Date;
  visibleToClient: boolean;
  visibleToCollaboratorIds: string[];
  restrictedToDepartments: string[];
  scanStatus: TScanStatus;
  retentionUntil?: Date;
  /**
   * Written as an explicit `null` at create — Firestore `== null` list
   * filters do not match missing fields, and every documents query
   * filters on `deletedAt == null` (#14).
   */
  deletedAt: Date | null;
  deletedBy?: string;
  deletedByType?: TUploaderType;
}

// ---------------------------------------------------------------------------
// Messaging & audit
// ---------------------------------------------------------------------------

/** Back-pointer from a message to the entity it concerns. */
export interface IMessageRelatedTo {
  type: 'task' | 'project' | 'milestone';
  id: string;
}

/**
 * `/workspaces/{wid}/messages/{mid}` — outbound WhatsApp/SMS log doubling as
 * the queue/outbox (#18, D3). Server-written only. The #19 dispatcher
 * consumes `status == 'queued' && suppressed != true &&
 * (holdUntil absent || holdUntil <= now)` (D9 contract).
 */
export interface IMessageDoc {
  id: string;
  channel: TMessageChannel;
  recipientPhone: string;
  recipientType: TMessageRecipientType;
  recipientId: string;
  templateName: string;
  variables: Record<string, string>;
  status: TMessageStatus;
  /** Event that produced this record (#18). */
  trigger: TNotificationTrigger;
  /** True = audit-only record that must never dispatch (#18, D8). */
  suppressed?: boolean;
  suppressedReason?: TSuppressedReason;
  /** Quiet-hours hold — dispatchable only at/after this instant (#18, D6). */
  holdUntil?: Date;
  /** Mirrors the deterministic doc id for due-soon dedupe (#18, D5). */
  dedupeKey?: string;
  twilioSid?: string;
  conversationId?: string;
  errorCode?: string;
  costEstimateMyr: number;
  relatedTo?: IMessageRelatedTo;
  createdAt: Date;
  sentAt?: Date;
  deliveredAt?: Date;
}

/** `/workspaces/{wid}/auditLog/{alid}` */
export interface IAuditLogDoc {
  id: string;
  actorType: TActorType;
  actorId: string;
  action: TAuditAction;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  ts: Date;
}

/** Payload carried by a project activity entry (#23, D1). */
export interface IProjectActivityPayload {
  from?: unknown;
  to?: unknown;
}

/**
 * `/workspaces/{wid}/projects/{pid}/activity/{aid}` — per-project activity
 * timeline (#23, D1). Server-written only (Admin SDK); read by firm members
 * with department gating on the denormalized `restrictedToDepartments` copy
 * (snapshotted from the source task/doc at event time, D6).
 */
export interface IProjectActivityDoc {
  id: string;
  action: TProjectActivityAction;
  actorType: TActorType;
  actorId: string;
  actorNameDenorm: string;
  taskId?: string;
  taskTitleDenorm?: string;
  docId?: string;
  docNameDenorm?: string;
  /** Copied from the source task/doc at event time; [] = unrestricted. */
  restrictedToDepartments: string[];
  payload: IProjectActivityPayload;
  /** D-027 §5 draft-preview marker — suppressed notification would have fired. */
  wouldHaveNotified?: boolean;
  /**
   * #21 (D4): denormalized at write time — true only for the client-safe
   * action subset, so portal list queries are rules-provable. Absent on
   * pre-#21 entries (never surfaced to clients; no backfill).
   */
  visibleToClient?: boolean;
  at: Date;
}

/** `/workspaces/{wid}/usageCounters/{period}` e.g. period = "2026-07" */
export interface IUsageCounterDoc {
  period: string;
  whatsappConv: number;
  smsSegments: number;
  storageBytes: number;
  activeProjects: number;
  membersBilled: number;
  computedAt: Date;
}
