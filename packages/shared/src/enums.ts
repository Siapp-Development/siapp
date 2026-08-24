// Project lifecycle states (D-027 publish gate)
export type TProjectLifecycle = 'draft' | 'published' | 'completed' | 'archived' | 'deleted';

// Workflow execution status (independent of lifecycle)
export type TProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'archived';

export type TProjectVertical = 'construction' | 'legal' | 'other';

// Tag registry colour keys (D-041). The two workspace tag registries
// (projectTags + taskTags) share this palette; each key resolves to a
// WCAG-safe (>= 4.5:1) class pair via `tagColorClasses` in @siapp/ui. Keep
// this union in lockstep with `TAG_COLOR_KEYS` in @siapp/ui/lib/tagColor.ts.
export type TTagColor = 'slate' | 'red' | 'amber' | 'green' | 'blue' | 'violet' | 'pink' | 'teal';

// Ordered palette list — used for round-robin colour assignment on inline
// tag create. Mirrors the `TTagColor` union above.
export const TAG_COLORS: readonly TTagColor[] = [
  'slate',
  'red',
  'amber',
  'green',
  'blue',
  'violet',
  'pink',
  'teal',
] as const;

// Which registry a tag belongs to. Project tags and task tags are
// independent pools (D-041); the shared TagSelect/useTags take this scope.
export type TTagScope = 'project' | 'task';

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

// How a WhatsApp/SMS notification consent record was captured (#26, D1).
// 'firm_attested' is the only value at MVP; 'portal_confirmed' is the
// designed upgrade path once portal-side consent lands.
export type TConsentMethod = 'firm_attested';

// Why an enqueued message will never dispatch (#18, D8). Lifecycle reasons
// are the D-027 "preview record" for non-published projects.
// #24 adds 'billing': the workspace is read-only (trial expired / lapsed).
// #26 adds 'no_consent': the client/collaborator recipient has no recorded
// waConsent grant (PDPA; absent field = no consent, D2). Members are exempt
// (contract basis).
export type TSuppressedReason =
  | 'lifecycle:draft'
  | 'lifecycle:completed'
  | 'lifecycle:archived'
  | 'lifecycle:deleted'
  | 'opt_out'
  | 'no_consent'
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
// #26 adds the PDPA trail: consent-only client/collaborator diffs emit
// *.consent_updated, and the deletePersonalData callable writes the
// pdpa.delete_request → pdpa.delete_fulfilled pair.
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
  | 'project.export'
  | 'task.delete'
  | 'settings.notifications_change'
  | 'client.create'
  | 'client.update'
  | 'client.consent_updated'
  | 'collaborator.create'
  | 'collaborator.update'
  | 'collaborator.consent_updated'
  | 'portal_link.issue'
  | 'portal_link.reset'
  | 'collab_link.issue'
  | 'collab_link.reset'
  | 'pdpa.delete_request'
  | 'pdpa.delete_fulfilled'
  | 'admin.workspace_adjust'
  | 'admin.impersonate'
  | 'billing.trial_expired';
