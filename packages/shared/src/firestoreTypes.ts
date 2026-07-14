/**
 * Firestore document types.
 *
 * All timestamp fields use a plain `Date` here so the types remain
 * framework-agnostic. Consumers using the Firebase Web SDK should cast
 * to `Timestamp` where needed; the Admin SDK uses the same `Timestamp`
 * class via `firebase-admin/firestore`.
 *
 * Collection paths follow the workspace-scoped model from the data model
 * design: `/workspaces/{wid}/…`
 */

import type {
  TCollaboratorStatus,
  TCollaboratorType,
  TLocale,
  TMemberRole,
  TPhoneRefType,
  TProjectLifecycle,
  TProjectStatus,
  TProjectVertical,
  TTaskStatus,
  TWorkspacePlan,
} from './enums.ts';

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
  clientId?: string;
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
}

/** `/workspaces/{wid}/projects/{pid}/phases/{phid}` */
export interface IPhaseDoc {
  id: string;
  name: string;
  order: number;
  createdAt: Date;
}

/** `/workspaces/{wid}/projects/{pid}/milestones/{mid}` */
export interface IMilestoneDoc {
  id: string;
  name: string;
  dueDate: Date;
  phaseId?: string;
  createdAt: Date;
}

/** `/workspaces/{wid}/projects/{pid}/tasks/{tid}` */
export interface ITaskDoc {
  id: string;
  title: string;
  phaseId?: string;
  order: number;
  status: TTaskStatus;
  assigneeUid?: string;
  assigneeNameDenorm?: string;
  collaboratorId?: string;
  collaboratorNameDenorm?: string;
  departmentId?: string;
  startDate?: Date;
  dueDate?: Date;
  visibleToClient: boolean;
  sendWhatsapp: boolean;
  notes?: string;
  dependsOn: string[];
  createdAt: Date;
  updatedAt: Date;
}

/** `/workspaces/{wid}/projects/{pid}/tasks/{tid}/updates/{updid}` */
export interface ITaskUpdateDoc {
  id: string;
  authorId: string;
  authorNameDenorm: string;
  body: string;
  attachments: string[];
  createdAt: Date;
}

/** `/workspaces/{wid}/projects/{pid}/documents/{did}` */
export interface IProjectDocumentDoc {
  id: string;
  name: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByKind: 'member' | 'client';
  visibleToClient: boolean;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Messaging & audit
// ---------------------------------------------------------------------------

/** `/workspaces/{wid}/messages/{mid}` */
export interface IMessageDoc {
  id: string;
  projectId: string;
  taskId?: string;
  recipientPhone: string;
  recipientKind: 'client' | 'collaborator';
  channel: 'whatsapp' | 'sms';
  templateName: string;
  variables: Record<string, string>;
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
  twilioSid?: string;
  scheduledAt?: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  createdAt: Date;
}

/** `/workspaces/{wid}/auditLog/{alid}` */
export interface IAuditLogDoc {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: string;
  resourceKind: string;
  resourceId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  createdAt: Date;
}

/** `/workspaces/{wid}/usageCounters/{period}` e.g. period = "2026-07" */
export interface IUsageCounterDoc {
  period: string;
  waConversations: number;
  waMessages: number;
  smsSent: number;
  updatedAt: Date;
}
