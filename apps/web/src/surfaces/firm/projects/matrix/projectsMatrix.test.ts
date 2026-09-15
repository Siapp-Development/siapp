import { describe, expect, it } from 'vitest';

import type { IPhaseRow, IRestrictedHeaderRow, ITaskRow } from '../tasks/useTasks.ts';
import {
  NO_PHASE_KEY,
  buildProjectPhaseColumns,
  groupTasksByPhase,
} from './projectsMatrix.ts';

function phase(overrides: Partial<IPhaseRow> = {}): IPhaseRow {
  return {
    id: 'ph1',
    name: 'Earthworks',
    order: 0,
    startDate: null,
    endDate: null,
    status: 'todo',
    ...overrides,
  };
}

function task(overrides: Partial<ITaskRow> = {}): ITaskRow {
  return {
    restricted: false,
    id: 't1',
    title: 'Clear site',
    description: '',
    phaseId: 'ph1',
    status: 'todo',
    startDate: null,
    dueDate: null,
    completedAt: null,
    assignees: [],
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    notify: {
      statusChange: false,
      dueSoon: false,
      blocked: false,
      toClient: false,
      toInternal: false,
    },
    tags: [],
    collaboratorCanSeeAllAttachments: true,
    order: 0,
    createdBy: 'u1',
    blockedReason: '',
    blockedBy: null,
    ...overrides,
  };
}

function restricted(overrides: Partial<IRestrictedHeaderRow> = {}): IRestrictedHeaderRow {
  return {
    restricted: true,
    id: 'r1',
    title: 'Restricted task',
    status: 'todo',
    phaseId: 'ph1',
    dueDate: null,
    order: 0,
    restrictedToDepartments: ['finance'],
    ...overrides,
  };
}

describe('buildProjectPhaseColumns', () => {
  it("orders a project's phases by phase.order", () => {
    const columns = buildProjectPhaseColumns(
      [
        phase({ id: 'b', name: 'Road', order: 2 }),
        phase({ id: 'a', name: 'Earthworks', order: 1 }),
      ],
      [],
    );
    expect(columns.map((c) => c.name)).toEqual(['Earthworks', 'Road']);
    expect(columns.map((c) => c.phaseId)).toEqual(['a', 'b']);
  });

  it('breaks ties by id', () => {
    const columns = buildProjectPhaseColumns(
      [phase({ id: 'z', order: 0 }), phase({ id: 'a', order: 0 })],
      [],
    );
    expect(columns.map((c) => c.phaseId)).toEqual(['a', 'z']);
  });

  it('appends a "No phase" column only when a null-phase task exists', () => {
    const withNull = buildProjectPhaseColumns([phase({ id: 'a' })], [task({ phaseId: null })]);
    expect(withNull.at(-1)).toEqual({ phaseId: NO_PHASE_KEY, name: 'No phase' });

    const withoutNull = buildProjectPhaseColumns([phase({ id: 'a' })], [task({ phaseId: 'a' })]);
    expect(withoutNull.some((c) => c.phaseId === NO_PHASE_KEY)).toBe(false);
  });

  it('treats an orphan phaseId as a "No phase" task', () => {
    const columns = buildProjectPhaseColumns([phase({ id: 'a' })], [task({ phaseId: 'missing' })]);
    expect(columns.at(-1)).toEqual({ phaseId: NO_PHASE_KEY, name: 'No phase' });
  });

  it('returns no columns for a project with no phases and no tasks', () => {
    expect(buildProjectPhaseColumns([], [])).toEqual([]);
  });

  it('returns only a "No phase" column when there are null-phase tasks but no phases', () => {
    const columns = buildProjectPhaseColumns([], [task({ phaseId: null })]);
    expect(columns).toEqual([{ phaseId: NO_PHASE_KEY, name: 'No phase' }]);
  });
});

describe('groupTasksByPhase', () => {
  it('buckets tasks under their phase id', () => {
    const known = new Set(['a', 'b']);
    const groups = groupTasksByPhase(
      [task({ id: 't1', phaseId: 'a' }), task({ id: 't2', phaseId: 'b' }), task({ id: 't3', phaseId: 'a' })],
      known,
    );
    expect(groups.get('a')?.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(groups.get('b')?.map((t) => t.id)).toEqual(['t2']);
  });

  it('places null and orphan tasks in the null bucket', () => {
    const known = new Set(['a']);
    const groups = groupTasksByPhase(
      [task({ id: 't1', phaseId: null }), task({ id: 't2', phaseId: 'missing' })],
      known,
    );
    expect(groups.get(NO_PHASE_KEY)?.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('keeps restricted-header rows in their phase bucket', () => {
    const known = new Set(['a']);
    const groups = groupTasksByPhase([restricted({ id: 'r1', phaseId: 'a' })], known);
    const bucket = groups.get('a');
    expect(bucket).toHaveLength(1);
    expect(bucket?.[0]?.restricted).toBe(true);
  });

  it('preserves input order within a bucket', () => {
    const known = new Set(['a']);
    const groups = groupTasksByPhase(
      [task({ id: 'x', phaseId: 'a' }), task({ id: 'y', phaseId: 'a' })],
      known,
    );
    expect(groups.get('a')?.map((t) => t.id)).toEqual(['x', 'y']);
  });
});
