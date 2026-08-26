/**
 * #127 assigned-tasks fan-out. Pure diff tests (collaboratorAssigneeIds,
 * taskVisibleToCollaborator, diffTaskMirror snapshot fields) plus the
 * applier / project-refresh paths exercised against a tiny in-memory Firestore
 * fake so no emulator is needed.
 */

import { describe, expect, it, vi } from 'vitest';

import {
  applyMirrorOps,
  collaboratorAssigneeIds,
  diffTaskMirror,
  refreshProjectMirror,
  taskVisibleToCollaborator,
  type TMirrorOp,
} from './assignedTasksMirror.js';

// FieldValue.serverTimestamp() is stamped by the applier — stub it so the fake
// db can record a sentinel without pulling in the Admin SDK runtime.
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => '<serverTimestamp>' },
  getFirestore: () => {
    throw new Error('getFirestore should not be called — pass a fake db');
  },
}));

describe('collaboratorAssigneeIds', () => {
  it('projects collaborator-type ids only, de-duped, order preserved', () => {
    const assignees = [
      { type: 'user', id: 'u1' },
      { type: 'collaborator', id: 'c1' },
      { type: 'collaborator', id: 'c2' },
      { type: 'collaborator', id: 'c1' },
    ];
    expect(collaboratorAssigneeIds(assignees)).toEqual(['c1', 'c2']);
  });

  it('returns [] for non-arrays and malformed entries', () => {
    expect(collaboratorAssigneeIds(undefined)).toEqual([]);
    expect(collaboratorAssigneeIds('x')).toEqual([]);
    expect(collaboratorAssigneeIds([{ type: 'collaborator' }, null, { id: 'c1' }])).toEqual([]);
  });
});

describe('taskVisibleToCollaborator', () => {
  it('empty/missing = visible; populated = membership', () => {
    expect(taskVisibleToCollaborator([], 'c1')).toBe(true);
    expect(taskVisibleToCollaborator(undefined, 'c1')).toBe(true);
    expect(taskVisibleToCollaborator(['c1'], 'c1')).toBe(true);
    expect(taskVisibleToCollaborator(['c2'], 'c1')).toBe(false);
  });
});

const project = { name: 'Tower A', lifecycle: 'published' };

describe('diffTaskMirror', () => {
  it('sets a snapshot for each collaborator assignee on create', () => {
    const ops = diffTaskMirror({
      projectId: 'p1',
      taskId: 't1',
      before: undefined,
      after: { assignees: [{ type: 'collaborator', id: 'c1' }], title: 'Rebar', status: 'todo' },
      project,
    });
    expect(ops).toEqual<TMirrorOp[]>([
      {
        kind: 'set',
        colid: 'c1',
        data: {
          projectId: 'p1',
          taskId: 't1',
          title: 'Rebar',
          status: 'todo',
          projectName: 'Tower A',
          lifecycle: 'published',
          visibleToThisCollaborator: true,
        },
      },
    ]);
  });

  it('carries dueDate through only when present and reflects visibility', () => {
    const dueDate = { seconds: 1 };
    const ops = diffTaskMirror({
      projectId: 'p1',
      taskId: 't1',
      before: undefined,
      after: {
        assignees: [{ type: 'collaborator', id: 'c1' }],
        title: 'Rebar',
        status: 'in_progress',
        dueDate,
        visibleToCollaboratorIds: ['c2'],
      },
      project,
    });
    expect(ops[0]).toMatchObject({
      kind: 'set',
      colid: 'c1',
      data: { dueDate, status: 'in_progress', visibleToThisCollaborator: false },
    });
  });

  it('deletes the mirror doc for a collaborator dropped from the assignee list', () => {
    const ops = diffTaskMirror({
      projectId: 'p1',
      taskId: 't1',
      before: { assignees: [{ type: 'collaborator', id: 'c1' }, { type: 'collaborator', id: 'c2' }] },
      after: { assignees: [{ type: 'collaborator', id: 'c1' }], title: 'Rebar', status: 'todo' },
      project,
    });
    expect(ops).toContainEqual({ kind: 'delete', colid: 'c2' });
    expect(ops).toContainEqual(
      expect.objectContaining({ kind: 'set', colid: 'c1' }),
    );
  });

  it('removes every prior collaborator doc when the task is deleted', () => {
    const ops = diffTaskMirror({
      projectId: 'p1',
      taskId: 't1',
      before: { assignees: [{ type: 'collaborator', id: 'c1' }, { type: 'collaborator', id: 'c2' }] },
      after: undefined,
      project,
    });
    expect(ops).toEqual<TMirrorOp[]>([
      { kind: 'delete', colid: 'c1' },
      { kind: 'delete', colid: 'c2' },
    ]);
  });
});

// ---- tiny in-memory Firestore fake for the applier / refresh paths ----

interface IFakeDoc {
  path: string;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

function makeFakeDb(tasks: Record<string, unknown>[] = []) {
  const writes: { op: 'set' | 'delete'; path: string; data?: unknown }[] = [];
  const docRef = (path: string): IFakeDoc => ({
    path,
    set: vi.fn((data: unknown) => {
      writes.push({ op: 'set', path, data });
      return Promise.resolve();
    }),
    delete: vi.fn(() => {
      writes.push({ op: 'delete', path });
      return Promise.resolve();
    }),
  });
  const db = {
    doc: (path: string) => docRef(path),
    collection: () => ({
      get: () =>
        Promise.resolve({
          docs: tasks.map((t) => ({ id: String(t['id']), data: () => t })),
        }),
    }),
  };
  return { db: db as never, writes };
}

describe('applyMirrorOps (fake db)', () => {
  it('writes a set with a server timestamp and a delete for each op', async () => {
    const { db, writes } = makeFakeDb();
    await applyMirrorOps(
      'w1',
      'p1',
      't1',
      [
        {
          kind: 'set',
          colid: 'c1',
          data: {
            projectId: 'p1',
            taskId: 't1',
            title: 'Rebar',
            status: 'todo',
            projectName: 'Tower A',
            lifecycle: 'published',
            visibleToThisCollaborator: true,
          },
        },
        { kind: 'delete', colid: 'c2' },
      ],
      db,
    );
    expect(writes).toEqual([
      {
        op: 'set',
        path: 'workspaces/w1/collaborators/c1/assignedTasks/p1_t1',
        data: expect.objectContaining({ taskId: 't1', updatedAt: '<serverTimestamp>' }),
      },
      { op: 'delete', path: 'workspaces/w1/collaborators/c2/assignedTasks/p1_t1' },
    ]);
  });
});

describe('refreshProjectMirror (fake db)', () => {
  it('re-sets every task mirror with the new project name / lifecycle', async () => {
    const { db, writes } = makeFakeDb([
      { id: 't1', assignees: [{ type: 'collaborator', id: 'c1' }], title: 'A', status: 'todo' },
      { id: 't2', assignees: [{ type: 'collaborator', id: 'c2' }], title: 'B', status: 'done' },
    ]);
    await refreshProjectMirror('w1', 'p1', { name: 'Renamed', lifecycle: 'completed' }, db);
    expect(writes).toHaveLength(2);
    expect(writes).toContainEqual(
      expect.objectContaining({
        op: 'set',
        path: 'workspaces/w1/collaborators/c1/assignedTasks/p1_t1',
        data: expect.objectContaining({ projectName: 'Renamed', lifecycle: 'completed' }),
      }),
    );
    expect(writes).toContainEqual(
      expect.objectContaining({
        op: 'set',
        path: 'workspaces/w1/collaborators/c2/assignedTasks/p1_t2',
        data: expect.objectContaining({ projectName: 'Renamed', lifecycle: 'completed' }),
      }),
    );
  });
});
