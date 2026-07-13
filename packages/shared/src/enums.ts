// Project lifecycle states (D-027 publish gate)
export type ProjectLifecycle = 'draft' | 'published' | 'completed' | 'archived' | 'deleted';

// Workflow execution status (independent of lifecycle)
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

export type ProjectVertical = 'construction' | 'legal' | 'other';

// Task status values
export type TaskStatus = 'not_started' | 'in_progress' | 'done' | 'blocked';

// Workspace member roles
export type MemberRole = 'owner' | 'admin' | 'pm' | 'viewer';

// Billing plan tiers
export type WorkspacePlan = 'trial' | 'standard' | 'business';

// Actor locale
export type Locale = 'en' | 'ms';

// Phone-index record type
export type PhoneRefType = 'collaborator' | 'client';

// Collaborator type
export type CollaboratorType = 'individual' | 'company';

// Collaborator status
export type CollaboratorStatus = 'active' | 'archived';

// Magic-link JWT subject kind (used by Cloud Run endpoint auth)
export type MagicLinkKind = 'client' | 'collaborator';

// Outbound notification trigger events
export type NotificationTrigger =
  | 'project_welcome'
  | 'task_assigned'
  | 'task_status_change'
  | 'task_due_soon'
  | 'need_help'
  | 'inbound_auto_reply';
