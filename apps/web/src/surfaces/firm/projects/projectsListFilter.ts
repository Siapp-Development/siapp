/**
 * Pure, unit-testable filter + sort for the projects list (#111). All logic
 * is client-side over the in-memory `useProjects` rows; state is mirrored to
 * the URL via the (de)serialization helpers so a filtered view is shareable.
 *
 * Search is TITLE-ONLY (project name); the Tags pill covers tags, the Filters
 * pill covers status/vertical/client/lifecycle/overdue, and the Date pill
 * covers sort. Deleted projects are never shown.
 */

import type { TProjectLifecycle, TProjectStatus, TProjectVertical, TTagColor } from '@siapp/shared';

import type { IProjectRow } from './useProjects.ts';

export type TProjectSortKey = 'updated' | 'start' | 'targetEnd' | 'name' | 'progress';
export type TSortDir = 'asc' | 'desc';

/** Lifecycles a user can filter on (deleted is always hidden). */
export const FILTERABLE_LIFECYCLES: readonly TProjectLifecycle[] = [
  'draft',
  'published',
  'completed',
  'archived',
];

export interface IProjectsListParams {
  /** Title substring search (case-insensitive). */
  q: string;
  /** Selected projectTags ids — OR match. */
  tags: string[];
  /** Selected lifecycles; empty = default (show all except archived + deleted). */
  lifecycles: TProjectLifecycle[];
  statuses: TProjectStatus[];
  verticals: TProjectVertical[];
  clientIds: string[];
  /** Only projects with overdue tasks. */
  overdueOnly: boolean;
  sort: TProjectSortKey;
  dir: TSortDir;
}

export const DEFAULT_PROJECTS_LIST_PARAMS: IProjectsListParams = {
  q: '',
  tags: [],
  lifecycles: [],
  statuses: [],
  verticals: [],
  clientIds: [],
  overdueOnly: false,
  sort: 'updated',
  dir: 'desc',
};

const SORT_KEYS: readonly TProjectSortKey[] = ['updated', 'start', 'targetEnd', 'name', 'progress'];

function isSortKey(value: string): value is TProjectSortKey {
  return (SORT_KEYS as readonly string[]).includes(value);
}

function timeOrNull(date: Date | null): number | null {
  return date === null ? null : date.getTime();
}

/**
 * Compares two nullable numbers for the given direction, always sorting
 * `null` (missing date) last regardless of direction.
 */
function compareNullable(a: number | null, b: number | null, dir: TSortDir): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return dir === 'asc' ? a - b : b - a;
}

/**
 * Filters + sorts the rows. `projectTagMap` scopes the tag filter to ids that
 * still exist in the live registry, so a stale/deleted tag id left in the URL
 * can never silently empty the list.
 */
export function filterAndSortProjects(
  rows: readonly IProjectRow[],
  params: IProjectsListParams,
  projectTagMap: ReadonlyMap<string, { name: string; color: TTagColor }>,
): IProjectRow[] {
  const query = params.q.trim().toLowerCase();
  const activeTags = params.tags.filter((id) => projectTagMap.has(id));

  const filtered = rows.filter((row) => {
    // Deleted projects are never listed.
    if (row.lifecycle === 'deleted') {
      return false;
    }
    // Lifecycle: explicit selection wins; default hides archived.
    if (params.lifecycles.length > 0) {
      if (!params.lifecycles.includes(row.lifecycle)) {
        return false;
      }
    } else if (row.lifecycle === 'archived') {
      return false;
    }
    if (params.statuses.length > 0 && !params.statuses.includes(row.status)) {
      return false;
    }
    if (params.verticals.length > 0 && !params.verticals.includes(row.vertical)) {
      return false;
    }
    if (params.clientIds.length > 0 && !params.clientIds.includes(row.clientId)) {
      return false;
    }
    if (params.overdueOnly && row.overdueTasks <= 0) {
      return false;
    }
    // Tags: OR match over ids that still exist.
    if (activeTags.length > 0 && !activeTags.some((id) => row.tags.includes(id))) {
      return false;
    }
    // Title-only search.
    if (query !== '' && !row.name.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let primary = 0;
    switch (params.sort) {
      case 'name':
        primary = params.dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        break;
      case 'progress':
        primary = params.dir === 'asc' ? a.progressPct - b.progressPct : b.progressPct - a.progressPct;
        break;
      case 'start':
        primary = compareNullable(timeOrNull(a.startDate), timeOrNull(b.startDate), params.dir);
        break;
      case 'targetEnd':
        primary = compareNullable(timeOrNull(a.targetEndDate), timeOrNull(b.targetEndDate), params.dir);
        break;
      case 'updated':
      default:
        primary = compareNullable(timeOrNull(a.updatedAt), timeOrNull(b.updatedAt), params.dir);
        break;
    }
    // Stable secondary tiebreak: name A–Z (then id for determinism).
    return primary !== 0 ? primary : a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });

  return sorted;
}

// ---------------------------------------------------------------------------
// URL (de)serialization
// ---------------------------------------------------------------------------

function isLifecycle(value: string): value is TProjectLifecycle {
  return (['draft', 'published', 'completed', 'archived', 'deleted'] as string[]).includes(value);
}

function isStatus(value: string): value is TProjectStatus {
  return (['planning', 'active', 'on_hold', 'completed', 'archived'] as string[]).includes(value);
}

function isVertical(value: string): value is TProjectVertical {
  return (['construction', 'legal', 'other'] as string[]).includes(value);
}

/** Reads the list params from a URLSearchParams, applying defaults. */
export function parseProjectsListParams(sp: URLSearchParams): IProjectsListParams {
  const sortRaw = sp.get('sort') ?? '';
  const dirRaw = sp.get('dir');
  return {
    q: sp.get('q') ?? '',
    tags: sp.getAll('tag'),
    lifecycles: sp.getAll('lifecycle').filter(isLifecycle),
    statuses: sp.getAll('status').filter(isStatus),
    verticals: sp.getAll('vertical').filter(isVertical),
    clientIds: sp.getAll('client'),
    overdueOnly: sp.get('overdue') === '1',
    sort: isSortKey(sortRaw) ? sortRaw : DEFAULT_PROJECTS_LIST_PARAMS.sort,
    dir: dirRaw === 'asc' || dirRaw === 'desc' ? dirRaw : DEFAULT_PROJECTS_LIST_PARAMS.dir,
  };
}

/**
 * Serializes the list params into a URLSearchParams, omitting defaults so the
 * URL stays clean when nothing is filtered. `preserve` keeps unrelated params
 * (e.g. `new`) intact.
 */
export function writeProjectsListParams(
  params: IProjectsListParams,
  preserve?: URLSearchParams,
): URLSearchParams {
  const sp = new URLSearchParams();
  // Carry over unrelated params first.
  if (preserve !== undefined) {
    const owned = new Set(['q', 'tag', 'lifecycle', 'status', 'vertical', 'client', 'overdue', 'sort', 'dir']);
    for (const [key, value] of preserve.entries()) {
      if (!owned.has(key)) {
        sp.append(key, value);
      }
    }
  }
  if (params.q.trim() !== '') {
    sp.set('q', params.q);
  }
  for (const tag of params.tags) {
    sp.append('tag', tag);
  }
  for (const lifecycle of params.lifecycles) {
    sp.append('lifecycle', lifecycle);
  }
  for (const status of params.statuses) {
    sp.append('status', status);
  }
  for (const vertical of params.verticals) {
    sp.append('vertical', vertical);
  }
  for (const clientId of params.clientIds) {
    sp.append('client', clientId);
  }
  if (params.overdueOnly) {
    sp.set('overdue', '1');
  }
  if (params.sort !== DEFAULT_PROJECTS_LIST_PARAMS.sort) {
    sp.set('sort', params.sort);
  }
  if (params.dir !== DEFAULT_PROJECTS_LIST_PARAMS.dir) {
    sp.set('dir', params.dir);
  }
  return sp;
}

/** Count of active (non-default) filters, for the Filters pill badge. */
export function activeFilterCount(params: IProjectsListParams): number {
  return (
    params.lifecycles.length +
    params.statuses.length +
    params.verticals.length +
    params.clientIds.length +
    (params.overdueOnly ? 1 : 0)
  );
}
