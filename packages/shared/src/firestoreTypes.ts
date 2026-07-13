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
  CollaboratorStatus,
  CollaboratorType,
  Locale,
  MemberRole,
  PhoneRefType,
  ProjectLifecycle,
  ProjectStatus,
  ProjectVertical,
  TaskStatus,
  WorkspacePlan,
} from './enums.ts';

// ---------------------------------------------------------------------------
// Top-level collections
// ---------------------------------------------------------------------------

/** `/users/{uid}` — firm staff Firebase Auth profile. */
export interface UserDoc {
  uid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  phone?: string;
  defaultWorkspaceId?: string;
  locale: Locale;
  createdAt: Date;
  lastSeenAt: Date;
}

/** Entry inside `/phoneIndex/{phoneE164}.refs[]` */
export interface PhoneRef {
  workspaceId: string;
  type: PhoneRefType;
  refId: string;
  addedAt: Date;
}

/** `/phoneIndex/{phoneE164}` — cross-workspace phone lookup. */
export interface PhoneIndexDoc {
  phone: string;
  refs: PhoneRef[];
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Workspace tree — `/workspaces/{wid}`
// ---------------------------------------------------------------------------

export interface WorkspaceBranding {
  logoUrl?: string;
  primaryColor?: string;
}

export interface WorkspaceWhatsappAllowance {
  includedPerPeriod: number;
  periodStart: Date;
  used: number;
}

/** `/workspaces/{wid}` */
export interface WorkspaceDoc {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  plan: WorkspacePlan;
  planExpiresAt: Date;
  seatLimit: number;
  seatsUsed: number;
  branding: WorkspaceBranding;
  whatsappAllowance: WorkspaceWhatsappAllowance;
  defaultLocale: Locale;
  createdAt: Date;
  updatedAt: Date;
}

/** `/workspaces/{wid}/members/{uid}` */
export interface MemberDoc {
  uid: string;
  email: string;
  displayName: string;
  role: MemberRole;
  departments: string[];
  seatActive: boolean;
  joinedAt: Date;
  invitedBy: string;
}

/** `/workspaces/{wid}/departments/{depId}` */
export interface DepartmentDoc {
  id: string;
  name: string;
  description?: string;
  color?: string;
  createdAt: Date;
  createdBy: string;
  memberCount: number;
}

/** `/workspaces/{wid}/clients/{cid}` */
export interface ClientDoc {
  id: string;
  name: string;
  phone: string;
  email?: string;
  companyName?: string;
  language: Locale;
  notes?: string;
  notificationsOptOut?: boolean;
  createdAt: Date;
  createdBy: string;
}

/** `/workspaces/{wid}/collaborators/{colid}` */
export interface CollaboratorDoc {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  trade?: string;
  type: CollaboratorType;
  status: CollaboratorStatus;
  notificationsOptOut?: boolean;
  createdAt: Date;
  invitedBy: string;
  lastTaskAt?: Date;
}

// ---------------------------------------------------------------------------
// Projects — `/workspaces/{wid}/projects/{pid}`
// ---------------------------------------------------------------------------

export interface ProjectSummary {
  totalTasks: number;
  doneTasks: number;
  overdueTasks: number;
  progressPct: number;
  lastActivityAt: Date;
}

export interface ProjectVisibility {
  clientCanSee: boolean;
  clientId?: string;
}

/** `/workspaces/{wid}/projects/{pid}` */
export interface ProjectDoc {
  id: string;
  name: string;
  code?: string;
  vertical: ProjectVertical;
  lifecycle: ProjectLifecycle;
  publishedAt?: Date;
  completedAt?: Date;
  archivedAt?: Date;
  deletedAt?: Date;
  status: ProjectStatus;
  duplicatedFromProjectId?: string;
  clientId: string;
  clientNameDenorm: string;
  ownerUid: string;
  ownerNameDenorm: string;
  startDate: Date;
  targetEndDate?: Date;
  actualEndDate?: Date;
  summary: ProjectSummary;
  visibility: ProjectVisibility;
  createdAt: Date;
  updatedAt: Date;
}

/** `/workspaces/{wid}/projects/{pid}/phases/{phid}` */
export interface PhaseDoc {
  id: string;
  name: string;
  order: number;
  createdAt: Date;
}

/** `/workspaces/{wid}/projects/{pid}/milestones/{mid}` */
export interface MilestoneDoc {
  id: string;
  name: string;
  dueDate: Date;
  phaseId?: string;
  createdAt: Date;
}

/** `/workspaces/{wid}/projects/{pid}/tasks/{tid}` */
export interface TaskDoc {
  id: string;
  title: string;
  phaseId?: string;
  order: number;
  status: TaskStatus;
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
export interface TaskUpdateDoc {
  id: string;
  authorId: string;
  authorNameDenorm: string;
  body: string;
  attachments: string[];
  createdAt: Date;
}

/** `/workspaces/{wid}/projects/{pid}/documents/{did}` */
export interface ProjectDocumentDoc {
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
export interface MessageDoc {
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
export interface AuditLogDoc {
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
export interface UsageCounterDoc {
  period: string;
  waConversations: number;
  waMessages: number;
  smsSent: number;
  updatedAt: Date;
}
