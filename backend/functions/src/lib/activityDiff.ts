/**
 * Pure before/after → activity/audit event derivation (#23, D2/D5).
 * No Admin SDK imports so everything unit-tests without emulators (same
 * convention as projectLifecycle.ts / notifyConfig.ts).
 *
 * Mirrors TProjectActivityAction / TAuditAction / TActorType in
 * @siapp/shared (source-only package this NodeNext build cannot consume).
 */

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
  | 'client_document_uploaded';

export type TActorType = 'user' | 'collaborator' | 'client' | 'system' | 'admin';

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
  | 'admin.workspace_adjust'
  | 'admin.impersonate';

type TDocData = Record<string, unknown> | undefined;

/** A derived activity event before actor-name resolution / id assignment. */
export interface IDerivedActivityEvent {
  action: TProjectActivityAction;
  /** uid of the acting firm member, or null when unattributable (system). */
  actorUid: string | null;
  actorType: TActorType;
  taskId?: string;
  taskTitleDenorm?: string;
  docId?: string;
  docNameDenorm?: string;
  restrictedToDepartments: string[];
  /** #21 (D4): true only for the client-safe subset — see visibleToClientFor. */
  visibleToClient: boolean;
  payload: { from?: unknown; to?: unknown };
}

/** A derived audit-log diff entry for member/client/collaborator triggers. */
export interface IDerivedAuditEvent {
  action: TAuditAction;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

function str(data: TDocData, field: string): string {
  const value = data?.[field];
  return typeof value === 'string' ? value : '';
}

function restrictionsOf(data: TDocData): string[] {
  const value = data?.['restrictedToDepartments'];
  return Array.isArray(value) ? value.filter((d): d is string => typeof d === 'string') : [];
}

interface IAssigneeLike {
  type?: unknown;
  id?: unknown;
  name?: unknown;
}

function assigneesOf(data: TDocData): Array<{ key: string; name: string }> {
  const value = data?.['assignees'];
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: Array<{ key: string; name: string }> = [];
  for (const raw of value) {
    const entry = raw as IAssigneeLike | null;
    if (typeof entry?.id === 'string' && typeof entry.type === 'string') {
      entries.push({
        key: `${entry.type}:${entry.id}`,
        name: typeof entry.name === 'string' ? entry.name : 'Unknown',
      });
    }
  }
  return entries;
}

function timestampIso(value: unknown): string | null {
  const ts = value as { toDate?: () => Date } | undefined;
  return typeof ts?.toDate === 'function' ? ts.toDate().toISOString() : null;
}

/**
 * #21 (D4): portal visibility of a lifecycle activity entry written inline
 * by the setProjectLifecycle callable — publish/complete are client-facing;
 * archive/delete/reopen stay internal.
 */
export function lifecycleVisibleToClient(action: TProjectActivityAction): boolean {
  return action === 'project_published' || action === 'project_completed';
}

/**
 * Activity events for a task write (#23 D2): create, status / assignee /
 * due-date diffs. `task_deleted` is deliberately NOT derived here — the
 * deleteTask callable writes it attributed (Q5); the trigger writes a
 * system-actor fallback with the same deterministic id (see index.ts).
 * No-op writes produce no events.
 */
export function deriveTaskActivity(
  taskId: string,
  before: TDocData,
  after: TDocData,
): IDerivedActivityEvent[] {
  if (after === undefined) {
    return [];
  }
  const restrictions = restrictionsOf(after);
  // #21 (D4): task events surface to the portal only when the source task is
  // client-visible AND unrestricted; assignment diffs stay internal always.
  const taskVisibleToClient = after['visibleToClient'] === true && restrictions.length === 0;
  const base = {
    taskId,
    taskTitleDenorm: str(after, 'title'),
    restrictedToDepartments: restrictions,
  };

  if (before === undefined) {
    const createdBy = str(after, 'createdBy');
    return [
      {
        ...base,
        action: 'task_created',
        actorUid: createdBy !== '' ? createdBy : null,
        actorType: createdBy !== '' ? 'user' : 'system',
        visibleToClient: taskVisibleToClient,
        payload: {},
      },
    ];
  }

  const updatedBy = str(after, 'updatedBy');
  const actor: Pick<IDerivedActivityEvent, 'actorUid' | 'actorType'> = {
    actorUid: updatedBy !== '' ? updatedBy : null,
    actorType: updatedBy !== '' ? 'user' : 'system',
  };
  const events: IDerivedActivityEvent[] = [];

  const fromStatus = str(before, 'status');
  const toStatus = str(after, 'status');
  if (fromStatus !== toStatus) {
    events.push({
      ...base,
      ...actor,
      action: 'task_status_changed',
      visibleToClient: taskVisibleToClient,
      payload: { from: fromStatus, to: toStatus },
    });
  }

  const beforeAssignees = assigneesOf(before);
  const afterAssignees = assigneesOf(after);
  const beforeKeys = new Set(beforeAssignees.map((a) => a.key));
  const afterKeys = new Set(afterAssignees.map((a) => a.key));
  const added = afterAssignees.filter((a) => !beforeKeys.has(a.key)).map((a) => a.name);
  const removed = beforeAssignees.filter((a) => !afterKeys.has(a.key)).map((a) => a.name);
  if (added.length > 0) {
    events.push({
      ...base,
      ...actor,
      action: 'task_assigned',
      visibleToClient: false,
      payload: { to: added },
    });
  }
  if (removed.length > 0) {
    events.push({
      ...base,
      ...actor,
      action: 'task_unassigned',
      visibleToClient: false,
      payload: { from: removed },
    });
  }

  const fromDue = timestampIso(before['dueDate']);
  const toDue = timestampIso(after['dueDate']);
  if (fromDue !== toDue) {
    events.push({
      ...base,
      ...actor,
      action: 'task_due_date_changed',
      visibleToClient: taskVisibleToClient,
      payload: { from: fromDue, to: toDue },
    });
  }

  return events;
}

function uploaderActorType(value: unknown): TActorType {
  return value === 'client' ? 'client' : value === 'collaborator' ? 'collaborator' : 'user';
}

/**
 * Activity events for a project-document write (#23 D2): metadata create →
 * `doc_added` — or `client_document_uploaded` when `uploaderType == 'client'`
 * (#21, D-034; always portal-visible); `deletedAt` null→set soft-delete diff
 * → `doc_deleted` (never portal-visible). Firm `doc_added` entries surface
 * to the portal only when the doc itself is client-visible (D4).
 */
export function deriveDocumentActivity(
  docId: string,
  before: TDocData,
  after: TDocData,
): IDerivedActivityEvent[] {
  if (after === undefined) {
    return [];
  }
  const base = {
    docId,
    docNameDenorm: str(after, 'name'),
    restrictedToDepartments: restrictionsOf(after),
  };

  if (before === undefined) {
    const uploadedBy = str(after, 'uploadedBy');
    const actorType = uploaderActorType(after['uploaderType']);
    if (actorType === 'client') {
      return [
        {
          ...base,
          action: 'client_document_uploaded',
          actorUid: null,
          actorType: uploadedBy !== '' ? 'client' : 'system',
          visibleToClient: true,
          payload: {},
        },
      ];
    }
    return [
      {
        ...base,
        action: 'doc_added',
        actorUid: actorType === 'user' && uploadedBy !== '' ? uploadedBy : null,
        actorType: uploadedBy !== '' ? actorType : 'system',
        visibleToClient: after['visibleToClient'] === true,
        payload: {},
      },
    ];
  }

  const wasDeleted = before['deletedAt'] !== null && before['deletedAt'] !== undefined;
  const isDeleted = after['deletedAt'] !== null && after['deletedAt'] !== undefined;
  if (!wasDeleted && isDeleted) {
    const deletedBy = str(after, 'deletedBy');
    const actorType = uploaderActorType(after['deletedByType']);
    return [
      {
        ...base,
        action: 'doc_deleted',
        actorUid: actorType === 'user' && deletedBy !== '' ? deletedBy : null,
        actorType: deletedBy !== '' ? actorType : 'system',
        visibleToClient: false,
        payload: {},
      },
    ];
  }

  return [];
}

/**
 * Activity events for a project write (#23 D2): `project_created` and
 * `clientId` link/unlink diffs. Lifecycle transitions are written inline by
 * the setProjectLifecycle callable (D3) — not derived here.
 */
export function deriveProjectActivity(before: TDocData, after: TDocData): IDerivedActivityEvent[] {
  if (after === undefined) {
    return [];
  }

  if (before === undefined) {
    const createdBy = str(after, 'createdBy');
    return [
      {
        action: 'project_created',
        actorUid: createdBy !== '' ? createdBy : null,
        actorType: createdBy !== '' ? 'user' : 'system',
        restrictedToDepartments: [],
        visibleToClient: false,
        payload: {},
      },
    ];
  }

  if (str(before, 'clientId') !== str(after, 'clientId')) {
    return [
      {
        action: 'client_link_changed',
        // Projects carry no updatedBy at MVP (D4 scope note) — system actor.
        actorUid: null,
        actorType: 'system',
        restrictedToDepartments: [],
        visibleToClient: false,
        payload: {
          from: str(before, 'clientNameDenorm') || null,
          to: str(after, 'clientNameDenorm') || null,
        },
      },
    ];
  }

  return [];
}

/**
 * Audit entries for a member-doc write (#23 D5): add / remove / role change.
 * Member docs are server-written only, so trigger capture is complete;
 * actor is 'system' (the originating callable also logs, attributed).
 */
export function deriveMemberAudit(
  memberUid: string,
  before: TDocData,
  after: TDocData,
): IDerivedAuditEvent[] {
  if (before === undefined && after === undefined) {
    return [];
  }
  if (before === undefined) {
    return [
      {
        action: 'member.added',
        targetType: 'member',
        targetId: memberUid,
        after: { role: str(after, 'role'), email: str(after, 'email') },
      },
    ];
  }
  if (after === undefined) {
    return [
      {
        action: 'member.removed',
        targetType: 'member',
        targetId: memberUid,
        before: { role: str(before, 'role'), email: str(before, 'email') },
      },
    ];
  }
  const fromRole = str(before, 'role');
  const toRole = str(after, 'role');
  if (fromRole !== toRole) {
    return [
      {
        action: 'member.role_change',
        targetType: 'member',
        targetId: memberUid,
        before: { role: fromRole },
        after: { role: toRole },
      },
    ];
  }
  return [];
}

/** PII fields tracked in the client/collaborator audit trail (D5, PDPA). */
const PII_FIELDS = ['name', 'phone', 'email', 'companyName', 'company', 'trade'] as const;

function piiSnapshot(data: TDocData): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of PII_FIELDS) {
    if (data?.[field] !== undefined) {
      snapshot[field] = data[field];
    }
  }
  return snapshot;
}

/**
 * Audit entries for client/collaborator writes (#23 D5): PII create/update
 * trail for the PDPA data-subject-rights flow. Deletes are impossible under
 * rules; unchanged-PII updates produce no entry.
 */
export function derivePersonAudit(
  kind: 'client' | 'collaborator',
  refId: string,
  before: TDocData,
  after: TDocData,
): IDerivedAuditEvent[] {
  if (after === undefined) {
    return [];
  }
  if (before === undefined) {
    return [
      {
        action: `${kind}.create`,
        targetType: kind,
        targetId: refId,
        after: piiSnapshot(after),
      },
    ];
  }
  const beforePii = piiSnapshot(before);
  const afterPii = piiSnapshot(after);
  if (JSON.stringify(beforePii) === JSON.stringify(afterPii)) {
    return [];
  }
  return [
    {
      action: `${kind}.update`,
      targetType: kind,
      targetId: refId,
      before: beforePii,
      after: afterPii,
    },
  ];
}
