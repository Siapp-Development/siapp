/**
 * Bulk task writers (#156): bulkUpdateTaskStatus / bulkAddAssignee /
 * bulkDeleteTasks. Firestore + the deleteTask callable are mocked at the SDK
 * boundary; we assert the batched write shape (fields, side-effects, chunking,
 * assignee dedupe/cap) and the delete fan-out's partial-failure handling.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TTaskAssignee } from '@siapp/shared';

const fs = vi.hoisted(() => ({
  batchUpdate: vi.fn(),
  batchCommit: vi.fn(),
  batchCount: 0,
}));

vi.mock('@/lib/firebase.ts', () => ({ db: {} }));
vi.mock('@/lib/callables.ts', () => ({
  deleteTask: vi.fn(),
  getRestrictedTaskHeaders: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  Timestamp: class {},
  collection: (_db: unknown, path: string) => ({ path }),
  doc: (_db: unknown, path: string) => ({ path }),
  onSnapshot: () => () => {},
  orderBy: (field: string) => ({ field }),
  query: (...args: unknown[]) => ({ args }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  serverTimestamp: () => '__serverTimestamp__',
  deleteField: () => '__deleteField__',
  writeBatch: () => {
    fs.batchCount += 1;
    return { update: fs.batchUpdate, commit: fs.batchCommit };
  },
}));

import { deleteTask as deleteTaskCallable } from '@/lib/callables.ts';

import {
  bulkAddAssignee,
  bulkDeleteTasks,
  bulkUpdateTaskStatus,
  type ITaskRow,
} from './useTasks.ts';

function taskRow(overrides: Partial<ITaskRow> = {}): ITaskRow {
  return {
    restricted: false,
    id: 't1',
    title: 'Task',
    description: '',
    phaseId: null,
    status: 'todo',
    startDate: null,
    dueDate: null,
    completedAt: null,
    assignees: [],
    visibleToClient: true,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    notify: {
      statusChange: true,
      dueSoon: true,
      blocked: true,
      toClient: true,
      toInternal: true,
    },
    tags: [],
    collaboratorCanSeeAllAttachments: true,
    order: 1,
    createdBy: 'u1',
    blockedReason: '',
    blockedBy: null,
    ...overrides,
  };
}

const deleteMock = vi.mocked(deleteTaskCallable);

beforeEach(() => {
  vi.clearAllMocks();
  fs.batchCount = 0;
});

describe('bulkUpdateTaskStatus', () => {
  it('stamps status/updatedAt/updatedBy on every task', async () => {
    await bulkUpdateTaskStatus('w', 'p', [taskRow({ id: 'a' }), taskRow({ id: 'b' })], 'in_progress', 'u9');

    expect(fs.batchUpdate).toHaveBeenCalledTimes(2);
    const [, data] = fs.batchUpdate.mock.calls[0];
    expect(data).toMatchObject({
      status: 'in_progress',
      updatedAt: '__serverTimestamp__',
      updatedBy: 'u9',
    });
    expect(fs.batchCommit).toHaveBeenCalledTimes(1);
  });

  it('sets completedAt when a not-yet-done task moves to done', async () => {
    await bulkUpdateTaskStatus('w', 'p', [taskRow({ id: 'a', status: 'todo' })], 'done', 'u9');

    const [, data] = fs.batchUpdate.mock.calls[0];
    expect(data.completedAt).toBe('__serverTimestamp__');
  });

  it('does not re-stamp completedAt for a task already done', async () => {
    await bulkUpdateTaskStatus('w', 'p', [taskRow({ id: 'a', status: 'done' })], 'done', 'u9');

    const [, data] = fs.batchUpdate.mock.calls[0];
    expect(data.completedAt).toBeUndefined();
  });

  it('deletes completedAt when moving to a non-done status', async () => {
    await bulkUpdateTaskStatus('w', 'p', [taskRow({ id: 'a', status: 'done' })], 'todo', 'u9');

    const [, data] = fs.batchUpdate.mock.calls[0];
    expect(data.completedAt).toBe('__deleteField__');
  });

  it('clears blockedReason/blockedBy when leaving blocked', async () => {
    await bulkUpdateTaskStatus('w', 'p', [taskRow({ id: 'a', status: 'blocked' })], 'todo', 'u9');

    const [, data] = fs.batchUpdate.mock.calls[0];
    expect(data.blockedReason).toBe('__deleteField__');
    expect(data.blockedBy).toBe('__deleteField__');
  });

  it('leaves blockedBy untouched when moving to blocked', async () => {
    await bulkUpdateTaskStatus('w', 'p', [taskRow({ id: 'a', status: 'todo' })], 'blocked', 'u9');

    const [, data] = fs.batchUpdate.mock.calls[0];
    expect('blockedBy' in data).toBe(false);
    expect(data.completedAt).toBe('__deleteField__');
  });

  it('chunks writes into batches of 500', async () => {
    const tasks = Array.from({ length: 501 }, (_, i) => taskRow({ id: `t${i}` }));

    await bulkUpdateTaskStatus('w', 'p', tasks, 'in_progress', 'u9');

    expect(fs.batchCount).toBe(2);
    expect(fs.batchCommit).toHaveBeenCalledTimes(2);
    expect(fs.batchUpdate).toHaveBeenCalledTimes(501);
  });
});

describe('bulkAddAssignee', () => {
  const collaborator: TTaskAssignee = {
    type: 'collaborator',
    id: 'c1',
    name: 'Acme Co',
    phone: '+100',
  };
  const user: TTaskAssignee = { type: 'user', id: 'u2', name: 'Bob' };

  it('appends the assignee and rebuilds assigneeCollaboratorIds for collaborators', async () => {
    await bulkAddAssignee('w', 'p', [taskRow({ id: 'a' })], collaborator, 'u9');

    const [, data] = fs.batchUpdate.mock.calls[0];
    expect(data.assignees).toEqual([collaborator]);
    expect(data.assigneeCollaboratorIds).toEqual(['c1']);
    expect(data.updatedBy).toBe('u9');
  });

  it('leaves the collaborator projection empty for a user assignee', async () => {
    await bulkAddAssignee('w', 'p', [taskRow({ id: 'a' })], user, 'u9');

    const [, data] = fs.batchUpdate.mock.calls[0];
    expect(data.assignees).toEqual([user]);
    expect(data.assigneeCollaboratorIds).toEqual([]);
  });

  it('skips tasks that already have the assignee', async () => {
    const result = await bulkAddAssignee(
      'w',
      'p',
      [taskRow({ id: 'a', assignees: [user] }), taskRow({ id: 'b' })],
      user,
      'u9',
    );

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(fs.batchUpdate).toHaveBeenCalledTimes(1);
  });

  it('skips tasks already at the 20-assignee cap', async () => {
    const full = Array.from({ length: 20 }, (_, i): TTaskAssignee => ({
      type: 'user',
      id: `x${i}`,
      name: `X${i}`,
    }));
    const result = await bulkAddAssignee('w', 'p', [taskRow({ id: 'a', assignees: full })], user, 'u9');

    expect(result).toEqual({ added: 0, skipped: 1 });
    expect(fs.batchUpdate).not.toHaveBeenCalled();
  });

  it('does not commit a batch when nothing changes', async () => {
    await bulkAddAssignee('w', 'p', [taskRow({ id: 'a', assignees: [user] })], user, 'u9');

    expect(fs.batchCommit).not.toHaveBeenCalled();
  });

  it('treats same-id assignees of different types as distinct (no false dedupe)', async () => {
    // A user 'x' already assigned must not suppress adding a collaborator 'x'.
    const collab: TTaskAssignee = { type: 'collaborator', id: 'x', name: 'X Co', phone: '+1' };
    const result = await bulkAddAssignee(
      'w',
      'p',
      [taskRow({ id: 'a', assignees: [{ type: 'user', id: 'x', name: 'X User' }] })],
      collab,
      'u9',
    );

    expect(result).toEqual({ added: 1, skipped: 0 });
    const [, data] = fs.batchUpdate.mock.calls[0];
    expect(data.assignees).toEqual([{ type: 'user', id: 'x', name: 'X User' }, collab]);
    // Only the collaborator id lands in the queryable projection.
    expect(data.assigneeCollaboratorIds).toEqual(['x']);
  });

  it('chunks assignee writes into batches of 500', async () => {
    const tasks = Array.from({ length: 501 }, (_, i) => taskRow({ id: `t${i}` }));

    await bulkAddAssignee('w', 'p', tasks, user, 'u9');

    expect(fs.batchCount).toBe(2);
    expect(fs.batchCommit).toHaveBeenCalledTimes(2);
    expect(fs.batchUpdate).toHaveBeenCalledTimes(501);
  });
});

describe('bulkDeleteTasks', () => {
  it('calls the delete callable once per id and reports successes', async () => {
    deleteMock.mockResolvedValue({ ok: true } as never);

    const result = await bulkDeleteTasks('w', 'p', ['a', 'b', 'c']);

    expect(deleteMock).toHaveBeenCalledTimes(3);
    expect(result.deletedIds).toEqual(['a', 'b', 'c']);
    expect(result.failedIds).toEqual([]);
  });

  it('does not abort the rest when one delete rejects', async () => {
    deleteMock.mockImplementation((data) =>
      data.taskId === 'b'
        ? Promise.reject(new Error('nope'))
        : (Promise.resolve({ ok: true }) as never),
    );

    const result = await bulkDeleteTasks('w', 'p', ['a', 'b', 'c']);

    expect(result.deletedIds).toEqual(['a', 'c']);
    expect(result.failedIds).toEqual(['b']);
  });
});
