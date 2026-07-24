/**
 * Pure derivation tests for the #23 activity/audit diff helpers (D2/D5).
 */

import { describe, expect, it } from 'vitest';

import {
  deriveDocumentActivity,
  deriveMemberAudit,
  derivePersonAudit,
  deriveProjectActivity,
  deriveTaskActivity,
} from './activityDiff.js';

function fakeTimestamp(iso: string): { toDate: () => Date } {
  return { toDate: () => new Date(iso) };
}

const TASK_BASE = {
  title: 'Piling works',
  status: 'todo',
  assignees: [],
  restrictedToDepartments: [],
  createdBy: 'u-creator',
};

describe('deriveTaskActivity', () => {
  it('derives task_created attributed to createdBy', () => {
    const events = deriveTaskActivity('t1', undefined, { ...TASK_BASE });
    expect(events).toEqual([
      {
        action: 'task_created',
        actorUid: 'u-creator',
        actorType: 'user',
        taskId: 't1',
        taskTitleDenorm: 'Piling works',
        restrictedToDepartments: [],
        payload: {},
      },
    ]);
  });

  it('falls back to a system actor when createdBy is missing', () => {
    const events = deriveTaskActivity('t1', undefined, { title: 'X', status: 'todo' });
    expect(events[0]).toMatchObject({ actorUid: null, actorType: 'system' });
  });

  it('derives task_status_changed attributed to updatedBy with from/to payload', () => {
    const events = deriveTaskActivity(
      't1',
      { ...TASK_BASE },
      { ...TASK_BASE, status: 'in_progress', updatedBy: 'u-editor' },
    );
    expect(events).toEqual([
      {
        action: 'task_status_changed',
        actorUid: 'u-editor',
        actorType: 'user',
        taskId: 't1',
        taskTitleDenorm: 'Piling works',
        restrictedToDepartments: [],
        payload: { from: 'todo', to: 'in_progress' },
      },
    ]);
  });

  it('derives assignment and unassignment diffs by assignee key', () => {
    const before = {
      ...TASK_BASE,
      assignees: [{ type: 'user', id: 'u2', name: 'Sam' }],
    };
    const after = {
      ...TASK_BASE,
      assignees: [{ type: 'collaborator', id: 'col1', name: 'Lim Electrical' }],
      updatedBy: 'u-editor',
    };
    const events = deriveTaskActivity('t1', before, after);
    expect(events.map((e) => e.action)).toEqual(['task_assigned', 'task_unassigned']);
    expect(events[0].payload).toEqual({ to: ['Lim Electrical'] });
    expect(events[1].payload).toEqual({ from: ['Sam'] });
  });

  it('derives task_due_date_changed with ISO from/to', () => {
    const events = deriveTaskActivity(
      't1',
      { ...TASK_BASE, dueDate: fakeTimestamp('2026-07-01T00:00:00Z') },
      { ...TASK_BASE, dueDate: fakeTimestamp('2026-08-01T00:00:00Z'), updatedBy: 'u-editor' },
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: 'task_due_date_changed',
      payload: { from: '2026-07-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
    });
  });

  it('copies restrictions through so restricted tasks stay restricted (D6)', () => {
    const events = deriveTaskActivity(
      't1',
      { ...TASK_BASE, restrictedToDepartments: ['structural'] },
      { ...TASK_BASE, restrictedToDepartments: ['structural'], status: 'done', updatedBy: 'u1' },
    );
    expect(events[0].restrictedToDepartments).toEqual(['structural']);
  });

  it('produces no events for a no-op write', () => {
    expect(deriveTaskActivity('t1', { ...TASK_BASE }, { ...TASK_BASE })).toEqual([]);
  });

  it('does not derive task_deleted — deletes flow through the callable (Q5)', () => {
    expect(deriveTaskActivity('t1', { ...TASK_BASE }, undefined)).toEqual([]);
  });
});

describe('deriveDocumentActivity', () => {
  const DOC_BASE = {
    name: 'floorplan.pdf',
    uploadedBy: 'u1',
    uploaderType: 'user',
    restrictedToDepartments: [],
    deletedAt: null,
  };

  it('derives doc_added attributed to the uploader', () => {
    const events = deriveDocumentActivity('d1', undefined, { ...DOC_BASE });
    expect(events).toEqual([
      {
        action: 'doc_added',
        actorUid: 'u1',
        actorType: 'user',
        docId: 'd1',
        docNameDenorm: 'floorplan.pdf',
        restrictedToDepartments: [],
        payload: {},
      },
    ]);
  });

  it('attributes client uploads with actorType client and no uid (D-034)', () => {
    const events = deriveDocumentActivity('d1', undefined, {
      ...DOC_BASE,
      uploaderType: 'client',
      uploadedBy: 'client-1',
    });
    expect(events[0]).toMatchObject({ actorType: 'client', actorUid: null });
  });

  it('derives doc_deleted on the #14 soft-delete diff only', () => {
    const deleted = {
      ...DOC_BASE,
      deletedAt: fakeTimestamp('2026-07-01T00:00:00Z'),
      deletedBy: 'u2',
    };
    const events = deriveDocumentActivity('d1', { ...DOC_BASE }, deleted);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'doc_deleted', actorUid: 'u2', actorType: 'user' });
    // Already-deleted → no new event.
    expect(deriveDocumentActivity('d1', deleted, deleted)).toEqual([]);
  });

  it('produces no events for unrelated metadata updates', () => {
    expect(
      deriveDocumentActivity('d1', { ...DOC_BASE }, { ...DOC_BASE, sizeBytes: 42 }),
    ).toEqual([]);
  });
});

describe('deriveProjectActivity', () => {
  const PROJECT_BASE = {
    name: 'Bungalow',
    clientId: '',
    clientNameDenorm: '',
    createdBy: 'u-owner',
    lifecycle: 'draft',
  };

  it('derives project_created attributed to createdBy', () => {
    const events = deriveProjectActivity(undefined, { ...PROJECT_BASE });
    expect(events).toEqual([
      {
        action: 'project_created',
        actorUid: 'u-owner',
        actorType: 'user',
        restrictedToDepartments: [],
        payload: {},
      },
    ]);
  });

  it('derives client_link_changed with denormalised names on link and unlink', () => {
    const linked = { ...PROJECT_BASE, clientId: 'c1', clientNameDenorm: 'Ahmad Corp' };
    const linkEvents = deriveProjectActivity({ ...PROJECT_BASE }, linked);
    expect(linkEvents).toEqual([
      {
        action: 'client_link_changed',
        actorUid: null,
        actorType: 'system',
        restrictedToDepartments: [],
        payload: { from: null, to: 'Ahmad Corp' },
      },
    ]);
    const unlinkEvents = deriveProjectActivity(linked, { ...PROJECT_BASE });
    expect(unlinkEvents[0].payload).toEqual({ from: 'Ahmad Corp', to: null });
  });

  it('ignores lifecycle and summary-only writes (D3 — callable writes those)', () => {
    expect(
      deriveProjectActivity({ ...PROJECT_BASE }, { ...PROJECT_BASE, lifecycle: 'published' }),
    ).toEqual([]);
    expect(deriveProjectActivity({ ...PROJECT_BASE }, undefined)).toEqual([]);
  });
});

describe('deriveMemberAudit', () => {
  it('derives member.added / member.removed / member.role_change', () => {
    const member = { role: 'pm', email: 'sam@firm.my' };
    expect(deriveMemberAudit('u2', undefined, member)).toEqual([
      {
        action: 'member.added',
        targetType: 'member',
        targetId: 'u2',
        after: { role: 'pm', email: 'sam@firm.my' },
      },
    ]);
    expect(deriveMemberAudit('u2', member, undefined)).toEqual([
      {
        action: 'member.removed',
        targetType: 'member',
        targetId: 'u2',
        before: { role: 'pm', email: 'sam@firm.my' },
      },
    ]);
    expect(deriveMemberAudit('u2', member, { ...member, role: 'admin' })).toEqual([
      {
        action: 'member.role_change',
        targetType: 'member',
        targetId: 'u2',
        before: { role: 'pm' },
        after: { role: 'admin' },
      },
    ]);
  });

  it('produces no entry for non-role updates (departments change is callable-logged)', () => {
    const member = { role: 'pm', departments: ['a'] };
    expect(deriveMemberAudit('u2', member, { ...member, departments: ['a', 'b'] })).toEqual([]);
  });
});

describe('derivePersonAudit', () => {
  const client = { name: 'Ahmad', phone: '+60123456789', notes: 'VIP' };

  it('derives create with a PII snapshot (no non-PII fields)', () => {
    const events = derivePersonAudit('client', 'c1', undefined, client);
    expect(events).toEqual([
      {
        action: 'client.create',
        targetType: 'client',
        targetId: 'c1',
        after: { name: 'Ahmad', phone: '+60123456789' },
      },
    ]);
  });

  it('derives update with before/after PII when PII changed', () => {
    const events = derivePersonAudit('collaborator', 'col1', client, {
      ...client,
      phone: '+60199999999',
    });
    expect(events).toEqual([
      {
        action: 'collaborator.update',
        targetType: 'collaborator',
        targetId: 'col1',
        before: { name: 'Ahmad', phone: '+60123456789' },
        after: { name: 'Ahmad', phone: '+60199999999' },
      },
    ]);
  });

  it('produces no entry when only non-PII fields changed', () => {
    expect(derivePersonAudit('client', 'c1', client, { ...client, notes: 'changed' })).toEqual([]);
    expect(derivePersonAudit('client', 'c1', client, undefined)).toEqual([]);
  });
});
