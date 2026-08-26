/**
 * Pure-logic tests for the #127 assigneeCollaboratorIds backfill — the
 * derivation from mixed assignee arrays and the up-to-date short-circuit.
 */
import { describe, expect, it } from 'vitest';

import {
  collaboratorIdsFromAssignees,
  isUpToDate,
} from './backfill-assignee-collaborator-ids.mjs';

describe('collaboratorIdsFromAssignees', () => {
  it('projects only collaborator-type ids, de-duped, order preserved', () => {
    const assignees = [
      { type: 'user', id: 'u1', name: 'Ana' },
      { type: 'collaborator', id: 'c1', name: 'KF', phone: '+60' },
      { type: 'collaborator', id: 'c2', name: 'Wong', phone: '+60' },
      { type: 'collaborator', id: 'c1', name: 'KF dup', phone: '+60' },
    ];
    expect(collaboratorIdsFromAssignees(assignees)).toEqual(['c1', 'c2']);
  });

  it('returns [] for missing / non-array / malformed entries', () => {
    expect(collaboratorIdsFromAssignees(undefined)).toEqual([]);
    expect(collaboratorIdsFromAssignees(null)).toEqual([]);
    expect(collaboratorIdsFromAssignees('nope')).toEqual([]);
    expect(collaboratorIdsFromAssignees([{ type: 'collaborator' }, { id: 'x' }, null])).toEqual([]);
  });
});

describe('isUpToDate', () => {
  it('true only when the stored list matches the derived set', () => {
    expect(isUpToDate(['c1', 'c2'], ['c2', 'c1'])).toBe(true);
    expect(isUpToDate([], [])).toBe(true);
    expect(isUpToDate(undefined, [])).toBe(false);
    expect(isUpToDate(['c1'], ['c1', 'c2'])).toBe(false);
    expect(isUpToDate(['c1', 'c2'], ['c1'])).toBe(false);
  });
});
