import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IProjectRow } from '../projects/useProjects.ts';

vi.mock('@/lib/firebase.ts', () => ({ db: {} }));
vi.mock('@/lib/callables.ts', () => ({ getRestrictedTaskHeaders: vi.fn() }));

/**
 * Descriptor-object mock: taskQueriesFor (real implementation) builds its
 * queries through these fakes, so the test can assert exactly which
 * subscriptions the fan-out opens — pinning the D1/D7 contract that every
 * dashboard read is a rules-provable per-project query.
 */
interface IFakeQuery {
  path: string;
  clauses: Array<{ field: string; op: string; value: unknown }>;
}

interface IFakeSubscription {
  query: IFakeQuery;
  next: (snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => void;
  error: (err: Error) => void;
}

const firestoreMock = vi.hoisted(() => {
  const subscriptions: IFakeSubscription[] = [];
  return { subscriptions };
});

vi.mock('firebase/firestore', () => ({
  Timestamp: class Timestamp {
    private readonly date: Date;

    constructor(date: Date) {
      this.date = date;
    }

    toDate(): Date {
      return this.date;
    }
  },
  collection: (_db: unknown, path: string) => ({ path }),
  query: (col: { path: string }, ...clauses: IFakeQuery['clauses']) => ({
    path: col.path,
    clauses,
  }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  onSnapshot: (
    q: IFakeQuery,
    next: IFakeSubscription['next'],
    error: IFakeSubscription['error'],
  ) => {
    firestoreMock.subscriptions.push({ query: q, next, error });
    return () => {};
  },
  // Unused by the hook, but imported by the useTasks module.
  deleteDoc: vi.fn(),
  deleteField: vi.fn(),
  doc: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

import { useDashboardTasks } from './useDashboardTasks.ts';

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  return {
    id: 'p1',
    name: 'Bungalow build',
    code: '',
    vertical: 'construction',
    lifecycle: 'published',
    status: 'active',
    clientId: '',
    clientNameDenorm: '',
    ownerNameDenorm: 'Alice Tan',
    startDate: null,
    targetEndDate: null,
    progressPct: 0,
    totalTasks: 0,
    doneTasks: 0,
    overdueTasks: 0,
    blockedTasks: 0,
    clientCanSee: false,
    collaboratorsCount: 0,
    ...overrides,
  };
}

function taskDoc(id: string, title = 'Pour foundation') {
  return {
    id,
    data: () => ({
      title,
      status: 'todo',
      assignees: [],
      restrictedToDepartments: [],
      order: 1,
      createdBy: 'u1',
    }),
  };
}

beforeEach(() => {
  firestoreMock.subscriptions.length = 0;
});

describe('useDashboardTasks', () => {
  it('spawns one whole-collection query per actionable project for an owner', () => {
    renderHook(() =>
      useDashboardTasks('wksA', 'owner', [], [
        projectRow({ id: 'p1' }),
        projectRow({ id: 'p2', lifecycle: 'draft' }),
        projectRow({ id: 'p-archived', lifecycle: 'archived' }),
        projectRow({ id: 'p-deleted', lifecycle: 'deleted' }),
        projectRow({ id: 'p-status-archived', status: 'archived' }),
      ]),
    );

    expect(firestoreMock.subscriptions.map((s) => s.query.path).sort()).toEqual([
      'workspaces/wksA/projects/p1/tasks',
      'workspaces/wksA/projects/p2/tasks',
    ]);
    // Owner queries are clause-free whole-collection reads.
    expect(firestoreMock.subscriptions.every((s) => s.query.clauses.length === 0)).toBe(true);
  });

  it('spawns 1 + n department queries per project for a pm', () => {
    renderHook(() =>
      useDashboardTasks('wksA', 'pm', ['dep-site', 'dep-finance'], [projectRow({ id: 'p1' })]),
    );

    const clauses = firestoreMock.subscriptions.map((s) => s.query.clauses.flat());
    expect(firestoreMock.subscriptions).toHaveLength(3);
    expect(clauses[0]).toEqual([{ field: 'restrictedToDepartments', op: '==', value: [] }]);
    expect(clauses[1]).toEqual([
      { field: 'restrictedToDepartments', op: 'array-contains', value: 'dep-site' },
    ]);
    expect(clauses[2]).toEqual([
      { field: 'restrictedToDepartments', op: 'array-contains', value: 'dep-finance' },
    ]);
  });

  it('stays loading until every query answers, then merges and dedupes', async () => {
    const { result } = renderHook(() =>
      useDashboardTasks('wksA', 'pm', ['dep-site'], [
        projectRow({ id: 'p1', name: 'Bungalow build' }),
        projectRow({ id: 'p2', name: 'Office fit-out' }),
      ]),
    );

    expect(result.current.status).toBe('loading');
    expect(firestoreMock.subscriptions).toHaveLength(4);

    act(() => {
      for (const sub of firestoreMock.subscriptions) {
        // The same task answered by both of p1's queries must dedupe.
        sub.next({
          docs: sub.query.path.includes('/p1/') ? [taskDoc('t1', 'Shared task')] : [],
        });
      }
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]).toMatchObject({
      id: 't1',
      title: 'Shared task',
      projectId: 'p1',
      projectName: 'Bungalow build',
    });
  });

  it('reports ready with no rows when there are no actionable projects', () => {
    const { result } = renderHook(() =>
      useDashboardTasks('wksA', 'owner', [], [projectRow({ lifecycle: 'archived' })]),
    );

    expect(firestoreMock.subscriptions).toHaveLength(0);
    expect(result.current).toEqual({ status: 'ready', rows: [] });
  });

  it('propagates any query failure as error', async () => {
    const { result } = renderHook(() =>
      useDashboardTasks('wksA', 'owner', [], [projectRow({ id: 'p1' })]),
    );

    act(() => {
      firestoreMock.subscriptions[0]?.error(new Error('permission-denied'));
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
  });
});
