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
  TBillingStatus,
  TCollaboratorStatus,
  TCollaboratorType,
  TConsentMethod,
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
  TTagColor,
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
 * Custom claims minted by `redeemCollabLink` (#127): a collaborator principal
 * is scoped to ONE collaborator record in ONE workspace and sees every task
 * assigned to them (assignee-membership gate). Like portal claims it carries
 * NO `workspaces` claim, so every firm rule automatically denies it; the
 * collab rules string-compare `wid`/`colid` against the resource + match path.
 */
export interface ICollabClaims {
  collab: {
    wid: string;
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
  /**
   * Billing state (#24, D2). Absent = 'active' (no backfill). 'read_only'
   * is set by the trial-expiry sweep or the founder via adminAdjustWorkspace;
   * every firm/portal/collab write path is denied while set.
   */
  billingStatus?: TBillingStatus;
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
  /**
   * Member-readable denormalised copy of the user's `users/{uid}.photoUrl`
   * (#104). `users/{uid}` is owner-only readable, so this is the only source
   * a teammate can read for another member's avatar. Server-written only
   * (Admin SDK): seeded at member creation and kept fresh by the
   * `syncMemberProfile` trigger. Absent = the member has no profile photo.
   */
  photoUrl?: string;
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
 * A tag registry doc — the SAME shape backs BOTH `/workspaces/{wid}/projectTags/{tagId}`
 * and `/workspaces/{wid}/taskTags/{tagId}` (D-041). The two registries are
 * independent option pools; only the collection path differs. Project/task
 * docs store arrays of these ids in their `tags` field and resolve
 * name + colour on read (orphaned ids are filtered out).
 */
export interface ITagDoc {
  id: string;
  /** Display string, <= 40 chars. */
  name: string;
  /** Lower-cased/trimmed `name`; client-side duplicate-prevention only. */
  normalizedName: string;
  color: TTagColor;
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
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

/**
 * WhatsApp/SMS notification consent record (#26, D1/D8) on client and
 * collaborator docs. One consent covers both phone channels. Written by the
 * firm CRUD forms (rules-validated); a `granted: false` record is a dated
 * refusal — itself compliance evidence — so the field is never deleted by
 * the firm. Absent field = no consent (D2: no grandfathering).
 */
export interface IWaConsent {
  granted: boolean;
  method: TConsentMethod;
  /** uid of the firm member attesting the consent. */
  recordedBy: string;
  recordedAt: Date;
  /** Language the consent was given in (Meta opt-in log requirement). */
  language: TLocale;
  /** Version id of the attestation copy, e.g. 'consent_v1'. */
  textVersion: string;
}

/**
 * PDPA erasure marker (#26, D3) — server-only (deletePersonalData callable).
 * Presence means the doc was anonymized in place and is frozen: rules deny
 * every further firm update.
 */
export interface IPdpaErased {
  /** uid of the owner/admin who ran the deletion. */
  requestedBy: string;
  at: Date;
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
  /** WA/SMS consent record (#26). Absent = no consent (D2). */
  waConsent?: IWaConsent;
  /** Server-only erasure marker (#26, D3). */
  pdpaErased?: IPdpaErased;
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
  /** WA/SMS consent record (#26). Absent = no consent (D2). */
  waConsent?: IWaConsent;
  /** Server-only erasure marker (#26, D3). */
  pdpaErased?: IPdpaErased;
  createdAt: Date;
  invitedBy: string;
  lastTaskAt?: Date;
}

/**
 * `/workspaces/{wid}/collaborators/{colid}/assignedTasks/{pid}_{tid}` (#127)
 * — server-maintained per-collaborator mirror of the tasks assigned to them
 * across every project, fanned out by `onTaskWrite` and refreshed by
 * `onProjectWrite`. Powers the collaborator's "My Assigned Tasks" switcher;
 * reads are rules-gated (own colid only), writes are server-only.
 */
export interface IAssignedTaskMirrorDoc {
  projectId: string;
  taskId: string;
  title: string;
  status: TTaskStatus;
  /** Absent when the task has no due date. */
  dueDate?: Date;
  projectName: string;
  lifecycle: TProjectLifecycle;
  /** Mirrors the task's per-collaborator visibility for THIS collaborator. */
  visibleToThisCollaborator: boolean;
  updatedAt: Date;
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
  /** projectTags ids (D-041). Optional; absent/legacy → no tags. */
  tags?: string[];
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

/** Actor metadata for who blocked a task (#93). */
export interface ITaskBlockedBy {
  kind: 'collaborator' | 'member';
  id: string;
  name: string;
}

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
  /** Missing means true for legacy tasks (#92). */
  collaboratorCanSeeAllAttachments?: boolean;
  /** Empty = all assigned collaborators see it. */
  visibleToCollaboratorIds: string[];
  /**
   * #127: queryable string projection of collaborator-type `assignees` ids —
   * powers the cross-project "my tasks" mirror + the rules assignee-membership
   * gate (Firestore/rules cannot iterate the `assignees` object array).
   * Maintained on task create/edit; always present on new writes.
   */
  assigneeCollaboratorIds: string[];
  /** Empty/missing = unrestricted; see 20-access-control-departments.md. */
  restrictedToDepartments: string[];
  /**
   * Why the task is blocked (#22, D-d) — set by submitCollabUpdate
   * (need-help) or firm edits; cleared when status leaves 'blocked'.
   */
  blockedReason?: string;
  /** Who set the current blocked state (#93). */
  blockedBy?: ITaskBlockedBy;
  /** Per-task WhatsApp toggle (D-031: copied on Duplicate). */
  sendWhatsapp: boolean;
  /** Trigger/recipient config (#18, D2). Absent = TASK_NOTIFY_DEFAULTS. */
  notify?: ITaskNotifyConfig;
  /** taskTags ids (D-041). Optional; absent/legacy → no tags. */
  tags?: string[];
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
  type: 'task' | 'project' | 'milestone' | 'collaborator';
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
