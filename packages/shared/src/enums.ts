// Project lifecycle states (D-027 publish gate)
export type TProjectLifecycle = 'draft' | 'published' | 'completed' | 'archived' | 'deleted';

// Workflow execution status (independent of lifecycle)
export type TProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

export type TProjectVertical = 'construction' | 'legal' | 'other';

// Task status values
export type TTaskStatus = 'not_started' | 'in_progress' | 'done' | 'blocked';

// Workspace member roles
export type TMemberRole = 'owner' | 'admin' | 'pm' | 'viewer';

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

// Outbound notification trigger events
export type TNotificationTrigger =
  | 'project_welcome'
  | 'task_assigned'
  | 'task_status_change'
  | 'task_due_soon'
  | 'need_help'
  | 'inbound_auto_reply';
