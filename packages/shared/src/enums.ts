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

// Workspace billing state (#24, D2). Absent on the doc = 'active' — no
// backfill; rules and clients must treat a missing field as active.
export type TBillingStatus = 'active' | 'read_only';

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
// #24 adds 'wa_quota_90': once-per-period owner DM when WA usage crosses 90%.
export type TNotificationTrigger =
  | 'project_welcome'
  | 'task_assigned'
  | 'task_status_change'
  | 'task_due_soon'
  | 'task_blocked'
  | 'need_help'
  | 'inbound_auto_reply'
  | 'wa_quota_90';

// Message queue recipient kind (#18, D7): widens the client/collaborator
// phone-ref pair with firm members ('internal' recipients).
export type TMessageRecipientType = 'client' | 'collaborator' | 'member';

// Why an enqueued message will never dispatch (#18, D8). Lifecycle reasons
// are the D-027 "preview record" for non-published projects.
// #24 adds 'billing': the workspace is read-only (trial expired / lapsed).
export type TSuppressedReason =
  | 'lifecycle:draft'
  | 'lifecycle:completed'
  | 'lifecycle:archived'
  | 'lifecycle:deleted'
  | 'opt_out'
  | 'no_recipient'
  | 'no_phone'
  | 'billing';

// Admin audit-log action kinds (#10 admin panel; #24 adds status_change)
export type TAdminAction =
  | 'workspace.provision'
  | 'workspace.plan_change'
  | 'workspace.seat_adjust'
  | 'workspace.renewal_adjust'
  | 'workspace.status_change'
  | 'user.impersonate';

// Project activity timeline event kinds (#23, D2). Server-written only.
// #21 adds 'client_document_uploaded' (portal client uploads, D-034).
// #22 adds the collaborator_* mirrors (Q2): notes and need-help submitted
// from /t surface into the project Activity tab.
export type TProjectActivityAction =
  | 'task_created'
  | 'task_status_changed'
  | 'task_assigned'
  | 'task_unassigned'
  | 'task_due_date_changed'
  | 'task_deleted'
  | 'doc_added'
  | 'doc_deleted'
  | 'project_created'
  | 'project_published'
  | 'project_completed'
  | 'project_archived'
  | 'project_deleted'
  | 'project_reopened'
  | 'client_link_changed'
  | 'client_document_uploaded'
  | 'collaborator_note_added'
  | 'collaborator_need_help';

// Workspace audit-log action kinds (#23, D5). Dot-namespaced; written only
// by Cloud Functions via lib/auditLog.ts.
export type TAuditAction =
  | 'invite.create'
  | 'invite.accept'
  | 'invite.revoke'
  | 'invite.resend'
  | 'member.departments_change'
  | 'member.role_change'
  | 'member.added'
  | 'member.removed'
  | 'project.lifecycle_change'
  | 'task.delete'
  | 'settings.notifications_change'
  | 'client.create'
  | 'client.update'
  | 'collaborator.create'
  | 'collaborator.update'
  | 'portal_link.issue'
  | 'portal_link.reset'
  | 'collab_link.issue'
  | 'collab_link.reset'
  | 'admin.workspace_adjust'
  | 'admin.impersonate'
  | 'billing.trial_expired';
