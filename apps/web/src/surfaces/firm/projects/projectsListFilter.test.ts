import type { TTagColor } from '@siapp/shared';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROJECTS_LIST_PARAMS,
  activeFilterCount,
  filterAndSortProjects,
  parseProjectsListParams,
  writeProjectsListParams,
  type IProjectsListParams,
} from './projectsListFilter.ts';
import type { IProjectRow } from './useProjects.ts';

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  return {
    id: 'p1',
    name: 'Bungalow build',
    description: '',
    code: 'BB-1',
    vertical: 'construction',
    lifecycle: 'draft',
    status: 'planning',
    clientId: '',
    clientNameDenorm: '',
    ownerNameDenorm: 'Alice Tan',
    startDate: null,
    targetEndDate: null,
    updatedAt: null,
    progressPct: 0,
    totalTasks: 0,
    doneTasks: 0,
    overdueTasks: 0,
    blockedTasks: 0,
    clientCanSee: true,
    collaboratorsCount: 0,
    tags: [],
    ...overrides,
  };
}

function tagMap(
  entries: Array<[string, { name: string; color: TTagColor }]>,
): ReadonlyMap<string, { name: string; color: TTagColor }> {
  return new Map(entries);
}

const EMPTY_TAGS = tagMap([]);

function params(overrides: Partial<IProjectsListParams> = {}): IProjectsListParams {
  return { ...DEFAULT_PROJECTS_LIST_PARAMS, ...overrides };
}

function ids(rows: IProjectRow[]): string[] {
  return rows.map((row) => row.id);
}

describe('filterAndSortProjects — lifecycle defaults', () => {
  it('always hides deleted projects even with no filters', () => {
    const rows = [projectRow({ id: 'live' }), projectRow({ id: 'gone', lifecycle: 'deleted' })];

    const result = filterAndSortProjects(rows, params(), EMPTY_TAGS);

    expect(ids(result)).toEqual(['live']);
  });

  it('hides archived projects by default', () => {
    const rows = [projectRow({ id: 'live' }), projectRow({ id: 'old', lifecycle: 'archived' })];

    const result = filterAndSortProjects(rows, params(), EMPTY_TAGS);

    expect(ids(result)).toEqual(['live']);
  });

  it('shows archived projects when archived is explicitly selected', () => {
    const rows = [projectRow({ id: 'live' }), projectRow({ id: 'old', lifecycle: 'archived' })];

    const result = filterAndSortProjects(rows, params({ lifecycles: ['archived'] }), EMPTY_TAGS);

    expect(ids(result)).toEqual(['old']);
  });

  it('never surfaces deleted projects even if deleted is somehow selected', () => {
    const rows = [projectRow({ id: 'gone', lifecycle: 'deleted' })];

    const result = filterAndSortProjects(rows, params({ lifecycles: ['deleted'] }), EMPTY_TAGS);

    expect(result).toHaveLength(0);
  });
});

describe('filterAndSortProjects — title-only search', () => {
  it('matches on the project name, case-insensitively', () => {
    const rows = [
      projectRow({ id: 'match', name: 'Riverside Villa' }),
      projectRow({ id: 'miss', name: 'City Office' }),
    ];

    const result = filterAndSortProjects(rows, params({ q: 'villa' }), EMPTY_TAGS);

    expect(ids(result)).toEqual(['match']);
  });

  it('does NOT match on code, client name, or tag id', () => {
    const rows = [
      projectRow({ id: 'byCode', name: 'Alpha', code: 'ZEBRA-9' }),
      projectRow({ id: 'byClient', name: 'Beta', clientNameDenorm: 'Zebra Corp' }),
      projectRow({ id: 'byTag', name: 'Gamma', tags: ['zebra-tag'] }),
    ];

    const result = filterAndSortProjects(rows, params({ q: 'zebra' }), EMPTY_TAGS);

    expect(result).toHaveLength(0);
  });

  it('treats a whitespace-only query as no filter', () => {
    const rows = [projectRow({ id: 'a' }), projectRow({ id: 'b', name: 'Other' })];

    const result = filterAndSortProjects(rows, params({ q: '   ' }), EMPTY_TAGS);

    expect(result).toHaveLength(2);
  });
});

describe('filterAndSortProjects — tag OR filter', () => {
  const registry = tagMap([
    ['t1', { name: 'Urgent', color: 'red' }],
    ['t2', { name: 'VIP', color: 'blue' }],
  ]);

  it('keeps projects that carry ANY of the selected tags (OR)', () => {
    const rows = [
      projectRow({ id: 'has-t1', tags: ['t1'] }),
      projectRow({ id: 'has-t2', tags: ['t2'] }),
      projectRow({ id: 'has-none', tags: [] }),
    ];

    const result = filterAndSortProjects(rows, params({ tags: ['t1', 't2'] }), registry);

    expect(ids(result).sort()).toEqual(['has-t1', 'has-t2']);
  });

  it('ignores selected tag ids that are absent from the live registry (orphan-safe)', () => {
    const rows = [projectRow({ id: 'a', tags: ['t1'] }), projectRow({ id: 'b', tags: [] })];

    // Only an orphaned id is selected → filter is a no-op, list is not emptied.
    const result = filterAndSortProjects(rows, params({ tags: ['orphan'] }), registry);

    expect(ids(result).sort()).toEqual(['a', 'b']);
  });

  it('applies only the still-existing ids when the selection mixes live + orphan ids', () => {
    const rows = [
      projectRow({ id: 'a', tags: ['t1'] }),
      projectRow({ id: 'b', tags: ['t2'] }),
    ];

    const result = filterAndSortProjects(rows, params({ tags: ['t1', 'orphan'] }), registry);

    expect(ids(result)).toEqual(['a']);
  });
});

describe('filterAndSortProjects — attribute filters', () => {
  it('filters by status', () => {
    const rows = [
      projectRow({ id: 'a', status: 'active' }),
      projectRow({ id: 'b', status: 'planning' }),
    ];

    const result = filterAndSortProjects(rows, params({ statuses: ['active'] }), EMPTY_TAGS);

    expect(ids(result)).toEqual(['a']);
  });

  it('filters by vertical', () => {
    const rows = [
      projectRow({ id: 'a', vertical: 'legal' }),
      projectRow({ id: 'b', vertical: 'construction' }),
    ];

    const result = filterAndSortProjects(rows, params({ verticals: ['legal'] }), EMPTY_TAGS);

    expect(ids(result)).toEqual(['a']);
  });

  it('filters by client id', () => {
    const rows = [
      projectRow({ id: 'a', clientId: 'c1' }),
      projectRow({ id: 'b', clientId: 'c2' }),
    ];

    const result = filterAndSortProjects(rows, params({ clientIds: ['c1'] }), EMPTY_TAGS);

    expect(ids(result)).toEqual(['a']);
  });

  it('filters to only projects with overdue tasks when overdueOnly is set', () => {
    const rows = [
      projectRow({ id: 'late', overdueTasks: 3 }),
      projectRow({ id: 'ontime', overdueTasks: 0 }),
    ];

    const result = filterAndSortProjects(rows, params({ overdueOnly: true }), EMPTY_TAGS);

    expect(ids(result)).toEqual(['late']);
  });

  it('combines multiple filters with AND semantics', () => {
    const rows = [
      projectRow({ id: 'match', status: 'active', vertical: 'legal' }),
      projectRow({ id: 'wrongVertical', status: 'active', vertical: 'construction' }),
      projectRow({ id: 'wrongStatus', status: 'planning', vertical: 'legal' }),
    ];

    const result = filterAndSortProjects(
      rows,
      params({ statuses: ['active'], verticals: ['legal'] }),
      EMPTY_TAGS,
    );

    expect(ids(result)).toEqual(['match']);
  });
});

describe('filterAndSortProjects — sorting', () => {
  it('sorts by name A→Z', () => {
    const rows = [
      projectRow({ id: 'c', name: 'Charlie' }),
      projectRow({ id: 'a', name: 'Alpha' }),
      projectRow({ id: 'b', name: 'Bravo' }),
    ];

    const result = filterAndSortProjects(rows, params({ sort: 'name', dir: 'asc' }), EMPTY_TAGS);

    expect(ids(result)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by name Z→A', () => {
    const rows = [
      projectRow({ id: 'a', name: 'Alpha' }),
      projectRow({ id: 'c', name: 'Charlie' }),
      projectRow({ id: 'b', name: 'Bravo' }),
    ];

    const result = filterAndSortProjects(rows, params({ sort: 'name', dir: 'desc' }), EMPTY_TAGS);

    expect(ids(result)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by % complete ascending and descending', () => {
    const rows = [
      projectRow({ id: 'mid', name: 'M', progressPct: 50 }),
      projectRow({ id: 'low', name: 'L', progressPct: 10 }),
      projectRow({ id: 'high', name: 'H', progressPct: 90 }),
    ];

    expect(ids(filterAndSortProjects(rows, params({ sort: 'progress', dir: 'asc' }), EMPTY_TAGS))).toEqual([
      'low',
      'mid',
      'high',
    ]);
    expect(
      ids(filterAndSortProjects(rows, params({ sort: 'progress', dir: 'desc' }), EMPTY_TAGS)),
    ).toEqual(['high', 'mid', 'low']);
  });

  it('sorts by start date', () => {
    const rows = [
      projectRow({ id: 'jun', name: 'J', startDate: new Date('2026-06-01') }),
      projectRow({ id: 'jan', name: 'A', startDate: new Date('2026-01-01') }),
      projectRow({ id: 'mar', name: 'M', startDate: new Date('2026-03-01') }),
    ];

    const result = filterAndSortProjects(rows, params({ sort: 'start', dir: 'asc' }), EMPTY_TAGS);

    expect(ids(result)).toEqual(['jan', 'mar', 'jun']);
  });

  it('sorts by target end date', () => {
    const rows = [
      projectRow({ id: 'late', name: 'L', targetEndDate: new Date('2026-12-01') }),
      projectRow({ id: 'soon', name: 'S', targetEndDate: new Date('2026-02-01') }),
    ];

    const result = filterAndSortProjects(rows, params({ sort: 'targetEnd', dir: 'asc' }), EMPTY_TAGS);

    expect(ids(result)).toEqual(['soon', 'late']);
  });

  it('sorts by last-updated descending (the default)', () => {
    const rows = [
      projectRow({ id: 'old', name: 'O', updatedAt: new Date('2026-01-01') }),
      projectRow({ id: 'new', name: 'N', updatedAt: new Date('2026-05-01') }),
      projectRow({ id: 'mid', name: 'M', updatedAt: new Date('2026-03-01') }),
    ];

    const result = filterAndSortProjects(rows, params(), EMPTY_TAGS);

    expect(ids(result)).toEqual(['new', 'mid', 'old']);
  });

  it('always sorts rows with a null date last, regardless of direction', () => {
    const rows = [
      projectRow({ id: 'null1', name: 'A', startDate: null }),
      projectRow({ id: 'dated', name: 'B', startDate: new Date('2026-03-01') }),
    ];

    const asc = filterAndSortProjects(rows, params({ sort: 'start', dir: 'asc' }), EMPTY_TAGS);
    const desc = filterAndSortProjects(rows, params({ sort: 'start', dir: 'desc' }), EMPTY_TAGS);

    expect(ids(asc)).toEqual(['dated', 'null1']);
    expect(ids(desc)).toEqual(['dated', 'null1']);
  });

  it('breaks ties by name A→Z then id for determinism', () => {
    const rows = [
      projectRow({ id: 'z', name: 'Same', progressPct: 50 }),
      projectRow({ id: 'a', name: 'Same', progressPct: 50 }),
      projectRow({ id: 'm', name: 'Same', progressPct: 50 }),
    ];

    const result = filterAndSortProjects(rows, params({ sort: 'progress', dir: 'desc' }), EMPTY_TAGS);

    expect(ids(result)).toEqual(['a', 'm', 'z']);
  });
});

describe('parseProjectsListParams / writeProjectsListParams', () => {
  it('returns defaults for an empty query string', () => {
    expect(parseProjectsListParams(new URLSearchParams())).toEqual(DEFAULT_PROJECTS_LIST_PARAMS);
  });

  it('writes an empty query string for the default params', () => {
    expect(writeProjectsListParams(DEFAULT_PROJECTS_LIST_PARAMS).toString()).toBe('');
  });

  it('round-trips a fully-populated param set (parse ∘ write)', () => {
    const original: IProjectsListParams = {
      q: 'villa',
      tags: ['t1', 't2'],
      lifecycles: ['draft', 'published'],
      statuses: ['active'],
      verticals: ['legal'],
      clientIds: ['c1'],
      overdueOnly: true,
      sort: 'name',
      dir: 'asc',
    };

    const roundTripped = parseProjectsListParams(writeProjectsListParams(original));

    expect(roundTripped).toEqual(original);
  });

  it('drops unknown/invalid enum values on parse', () => {
    const sp = new URLSearchParams();
    sp.append('lifecycle', 'draft');
    sp.append('lifecycle', 'bogus');
    sp.append('status', 'nope');
    sp.append('vertical', 'crypto');
    sp.set('sort', 'unknown');
    sp.set('dir', 'sideways');

    const parsed = parseProjectsListParams(sp);

    expect(parsed.lifecycles).toEqual(['draft']);
    expect(parsed.statuses).toEqual([]);
    expect(parsed.verticals).toEqual([]);
    expect(parsed.sort).toBe(DEFAULT_PROJECTS_LIST_PARAMS.sort);
    expect(parsed.dir).toBe(DEFAULT_PROJECTS_LIST_PARAMS.dir);
  });

  it('preserves unrelated params (e.g. ?new=1) when writing', () => {
    const preserve = new URLSearchParams('new=1&q=stale');

    const written = writeProjectsListParams(params({ q: 'fresh' }), preserve);

    expect(written.get('new')).toBe('1');
    // The owned `q` from preserve is dropped and replaced by the new value.
    expect(written.getAll('q')).toEqual(['fresh']);
  });
});

describe('activeFilterCount', () => {
  it('is zero for default params', () => {
    expect(activeFilterCount(DEFAULT_PROJECTS_LIST_PARAMS)).toBe(0);
  });

  it('counts lifecycles, statuses, verticals, clients and overdue but NOT tags or search', () => {
    const count = activeFilterCount(
      params({
        q: 'ignored',
        tags: ['ignored'],
        lifecycles: ['draft', 'published'],
        statuses: ['active'],
        verticals: ['legal'],
        clientIds: ['c1'],
        overdueOnly: true,
      }),
    );

    // 2 lifecycles + 1 status + 1 vertical + 1 client + 1 overdue = 6.
    expect(count).toBe(6);
  });
});
