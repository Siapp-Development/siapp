import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase.ts', () => ({ db: {} }));

const whereMock = vi.fn((field: string, op: string, value: unknown) => ({ field, op, value }));

// Captures the onSnapshot success/error callbacks so tests can drive the
// subscription without a live Firestore — mirrors the boundary-mock style of
// usePortalDocuments.test.ts / usePortalUpdates.test.ts.
const snapshotHandlers = vi.hoisted(() => ({
  onNext: undefined as ((snap: unknown) => void) | undefined,
  onError: undefined as ((err: unknown) => void) | undefined,
}));

vi.mock('firebase/firestore', () => ({
  // Minimal Timestamp stand-in: asDate() uses `instanceof Timestamp`, so tests
  // must build dates with this same (mocked) class.
  Timestamp: class MockTimestamp {
    constructor(private readonly date: Date) {}
    toDate(): Date {
      return this.date;
    }
  },
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  onSnapshot: vi.fn(
    (_query: unknown, onNext: (snap: unknown) => void, onError: (err: unknown) => void) => {
      snapshotHandlers.onNext = onNext;
      snapshotHandlers.onError = onError;
      return () => {};
    },
  ),
  query: vi.fn((...parts: unknown[]) => ({ parts })),
  where: (field: string, op: string, value: unknown) => whereMock(field, op, value),
}));

import { Timestamp } from 'firebase/firestore';

import type { IPortalPhase } from '../usePortalProject.ts';
import {
  UNPHASED_GROUP_LABEL,
  groupPortalTasks,
  usePortalTasks,
  type IPortalTask,
} from './usePortalTasks.ts';

// At runtime `Timestamp` is the mocked class (single Date arg); the imported
// type is the real 2-arg signature, so cast the constructor for tests.
const MockTimestamp = Timestamp as unknown as new (date: Date) => Timestamp;

function ts(iso: string): Timestamp {
  return new MockTimestamp(new Date(iso));
}

/** Fake Firestore query snapshot from raw doc data. */
function snapshot(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })) };
}

function task(overrides: Partial<IPortalTask>): IPortalTask {
  return {
    id: 'id',
    title: 'Task',
    status: 'todo',
    phaseId: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    order: 0,
    ...overrides,
  };
}

const PHASES: IPortalPhase[] = [
  { id: 'p2', name: 'Design', order: 1, status: 'todo' },
  { id: 'p1', name: 'Discovery', order: 0, status: 'done' },
];

afterEach(() => {
  vi.clearAllMocks();
  snapshotHandlers.onNext = undefined;
  snapshotHandlers.onError = undefined;
});

describe('groupPortalTasks', () => {
  it('orders groups by phase order and sorts tasks by order within each', () => {
    const tasks = [
      task({ id: 'b', phaseId: 'p2', order: 1 }),
      task({ id: 'a', phaseId: 'p1', order: 1 }),
      task({ id: 'c', phaseId: 'p1', order: 0 }),
    ];

    const groups = groupPortalTasks(tasks, PHASES);

    expect(groups.map((g) => g.name)).toEqual(['Discovery', 'Design']);
    expect(groups[0]?.tasks.map((t) => t.id)).toEqual(['c', 'a']);
  });

  it('puts unphased tasks in a trailing bucket', () => {
    const tasks = [task({ id: 'x', phaseId: 'p1' }), task({ id: 'y', phaseId: null })];

    const groups = groupPortalTasks(tasks, PHASES);

    expect(groups.at(-1)).toMatchObject({ phaseId: null, name: UNPHASED_GROUP_LABEL });
    expect(groups.at(-1)?.tasks.map((t) => t.id)).toEqual(['y']);
  });

  it('drops phases with no client-visible tasks', () => {
    const groups = groupPortalTasks([task({ id: 'x', phaseId: 'p1' })], PHASES);

    expect(groups.map((g) => g.phaseId)).toEqual(['p1']);
  });
});

describe('usePortalTasks query shape', () => {
  it('constrains both visibleToClient and restrictedToDepartments', () => {
    renderHook(() => usePortalTasks('w1', 'proj1', []));

    expect(whereMock).toHaveBeenCalledWith('visibleToClient', '==', true);
    expect(whereMock).toHaveBeenCalledWith('restrictedToDepartments', '==', []);
  });
});

describe('usePortalTasks lifecycle', () => {
  it('starts in the loading state', () => {
    const { result } = renderHook(() => usePortalTasks('w1', 'proj1', PHASES));

    expect(result.current).toEqual({ status: 'loading' });
  });

  it('maps ONLY client-safe fields — internal task fields never leak', () => {
    const { result } = renderHook(() => usePortalTasks('w1', 'proj1', PHASES));

    act(() => {
      snapshotHandlers.onNext?.(
        snapshot([
          {
            id: 't1',
            data: {
              title: 'Client-visible task',
              status: 'in_progress',
              phaseId: 'p1',
              startDate: ts('2026-08-10T00:00:00Z'),
              dueDate: ts('2026-08-20T00:00:00Z'),
              completedAt: null,
              order: 2,
              // Internal fields that MUST NOT be projected to the client.
              description: 'Secret internal notes',
              assignees: ['user-1'],
              restrictedToDepartments: [],
              blockedReason: 'Waiting on supplier',
              tags: ['internal'],
              createdBy: 'user-1',
              updatedBy: 'user-2',
              visibleToClient: true,
            },
          },
        ]),
      );
    });

    expect(result.current.status).toBe('ready');
    if (result.current.status !== 'ready') throw new Error('expected ready');
    const [mapped] = result.current.tasks;

    // Whitelisted client-safe projection is present…
    expect(mapped).toEqual({
      id: 't1',
      title: 'Client-visible task',
      status: 'in_progress',
      phaseId: 'p1',
      startDate: new Date('2026-08-10T00:00:00Z'),
      dueDate: new Date('2026-08-20T00:00:00Z'),
      completedAt: null,
      order: 2,
    });
    // …and every internal field is absent from the mapped object.
    for (const leaked of [
      'description',
      'assignees',
      'restrictedToDepartments',
      'blockedReason',
      'tags',
      'createdBy',
      'updatedBy',
      'visibleToClient',
    ]) {
      expect(mapped).not.toHaveProperty(leaked);
    }
  });

  it('groups mapped tasks by phase with a trailing unphased bucket', () => {
    const { result } = renderHook(() => usePortalTasks('w1', 'proj1', PHASES));

    act(() => {
      snapshotHandlers.onNext?.(
        snapshot([
          { id: 'a', data: { title: 'A', phaseId: 'p1', order: 1 } },
          { id: 'b', data: { title: 'B', phaseId: 'p1', order: 0 } },
          { id: 'c', data: { title: 'C', phaseId: null, order: 0 } },
        ]),
      );
    });

    if (result.current.status !== 'ready') throw new Error('expected ready');
    expect(result.current.groups.map((g) => g.name)).toEqual(['Discovery', UNPHASED_GROUP_LABEL]);
    // sorted by order within the phase.
    expect(result.current.groups[0]?.tasks.map((t) => t.id)).toEqual(['b', 'a']);
  });

  it('falls back to defaults for malformed docs', () => {
    const { result } = renderHook(() => usePortalTasks('w1', 'proj1', PHASES));

    act(() => {
      snapshotHandlers.onNext?.(
        snapshot([{ id: 'junk', data: { status: 'nonsense', order: 'oops', phaseId: '' } }]),
      );
    });

    if (result.current.status !== 'ready') throw new Error('expected ready');
    expect(result.current.tasks[0]).toEqual({
      id: 'junk',
      title: '',
      status: 'todo',
      phaseId: null,
      startDate: null,
      dueDate: null,
      completedAt: null,
      order: 0,
    });
  });

  it('surfaces the error state when the subscription fails', () => {
    const { result } = renderHook(() => usePortalTasks('w1', 'proj1', PHASES));

    act(() => {
      snapshotHandlers.onError?.(new Error('permission-denied'));
    });

    expect(result.current).toEqual({ status: 'error' });
  });
});
