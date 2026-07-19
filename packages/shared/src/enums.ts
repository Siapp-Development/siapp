// Project lifecycle states (D-027 publish gate)
export type TProjectLifecycle = 'draft' | 'published' | 'completed' | 'archived' | 'deleted';

// Workflow execution status (independent of lifecycle)
export type TProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

export type TProjectVertical = 'construction' | 'legal' | 'other';

// Task status values
export type TTaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

// Phase status values
export type TPhaseStatus = 'todo' | 'in_progress' | 'done';

// Workspace member roles
export type TMemberRole = 'owner' | 'admin' | 'pm' | 'viewer';

// Roles assignable via invite — Owner is never invited (one Owner per
// workspace; ownership transfer is a separate flow).
export type TInviteRole = 'admin' | 'pm' | 'viewer';

// Invite lifecycle. 'expired' is stamped lazily at accept time.
export type TInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

// Billing plan tiers
export type TWorkspacePlan = 'trial' | 'standard' | 'business';

// Actor locale
export type TLocale = 'en' | 'ms';

// Phone-index record type
export type TPhoneRefType = 'collaborator' | 'client';

// Collaborator type
export type TCollaboratorType = 'individual' | 'company';

// Collaborator status
export type TCollaboratorStatus = 'active' | 'archived';

// Magic-link JWT subject kind (used by Cloud Run endpoint auth)
export type TMagicLinkKind = 'client' | 'collaborator';

// Magic-link scope
export type TMagicLinkScopeType = 'task' | 'project';

// Task activity-stream author kind
export type TTaskUpdateAuthorType = 'user' | 'collaborator' | 'client' | 'system';

// Task activity-stream origin ('whatsapp' reserved post-MVP per D-035)
export type TTaskUpdateSource = 'web' | 'system';

// Task activity-stream action kinds (append-only feed)
export type TTaskUpdateAction =
  | 'status_change'
  | 'eta_change'
  | 'comment'
  | 'photo_added'
  | 'doc_added'
  | 'doc_deleted'
  | 'assigned'
  | 'approved'
  | 'rejected';

// Project document scope
export type TDocumentScope = 'project' | 'task';

// Who uploaded / deleted a project document
export type TUploaderType = 'firm_member' | 'collaborator' | 'client';

// Virus-scan pipeline state for uploaded documents
export type TScanStatus = 'pending' | 'clean' | 'infected';

// Outbound message channel
export type TMessageChannel = 'whatsapp' | 'sms';

// Outbound message delivery status
export type TMessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

// Audit-log actor kind
export type TActorType = 'user' | 'collaborator' | 'client' | 'system' | 'admin';

// Outbound notification trigger events
export type TNotificationTrigger =
  | 'project_welcome'
  | 'task_assigned'
  | 'task_status_change'
  | 'task_due_soon'
  | 'need_help'
  | 'inbound_auto_reply';
