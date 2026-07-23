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
  TMessageStatus,
  TPhaseStatus,
  TPhoneRefType,
  TProjectLifecycle,
  TProjectStatus,
  TProjectVertical,
  TScanStatus,
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

/** `/workspaces/{wid}/magicLinks/{shortCode}` — collaborator + client tokens (server-only). */
export interface IMagicLinkDoc {
  shortCode: string;
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
}

// ---------------------------------------------------------------------------
// Projects — `/workspaces/{wid}/projects/{pid}`
// ---------------------------------------------------------------------------

export interface IProjectSummary {
  totalTasks: number;
  doneTasks: number;
  overdueTasks: number;
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
  /** Per-task WhatsApp toggle (D-031: copied on Duplicate). */
  sendWhatsapp: boolean;
  /** Task ids this task depends on (D-031 dependency links). */
  dependsOn: string[];
  order: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
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
  deletedAt?: Date;
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

/** `/workspaces/{wid}/messages/{mid}` — outbound WhatsApp/SMS log. */
export interface IMessageDoc {
  id: string;
  channel: TMessageChannel;
  recipientPhone: string;
  recipientType: TPhoneRefType;
  recipientId: string;
  templateName: string;
  variables: Record<string, string>;
  status: TMessageStatus;
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
  action: string;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  ts: Date;
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
