/**
 * Pure diffing tests for collab link revocation on unassignment (#22,
 * step 7). The Firestore revoke path runs in the emulator walkthrough.
 */

import { describe, expect, it } from 'vitest';

import { removedCollaboratorIds } from './collabLinks.js';

function task(assignees: unknown): Record<string, unknown> {
  return { title: 'T', assignees };
}

describe('removedCollaboratorIds', () => {
  it('returns collaborators dropped from the assignee list', () => {
    const before = task([
      { type: 'collaborator', id: 'col1' },
      { type: 'collaborator', id: 'col2' },
      { type: 'user', id: 'u1' },
    ]);
    const after = task([
      { type: 'collaborator', id: 'col2' },
      { type: 'user', id: 'u1' },
    ]);
    expect(removedCollaboratorIds(before, after)).toEqual(['col1']);
  });

  it('ignores removed user-type assignees', () => {
    const before = task([
      { type: 'user', id: 'u1' },
      { type: 'collaborator', id: 'col1' },
    ]);
    const after = task([{ type: 'collaborator', id: 'col1' }]);
    expect(removedCollaboratorIds(before, after)).toEqual([]);
  });

  it('revokes every collaborator on task deletion', () => {
    const before = task([
      { type: 'collaborator', id: 'col1' },
      { type: 'collaborator', id: 'col2' },
    ]);
    expect(removedCollaboratorIds(before, undefined).sort()).toEqual(['col1', 'col2']);
  });

  it('is empty for creations, no-op writes and malformed fields', () => {
    expect(removedCollaboratorIds(undefined, task([{ type: 'collaborator', id: 'col1' }]))).toEqual(
      [],
    );
    const same = task([{ type: 'collaborator', id: 'col1' }]);
    expect(removedCollaboratorIds(same, same)).toEqual([]);
    expect(removedCollaboratorIds(task('nope'), task(undefined))).toEqual([]);
    expect(removedCollaboratorIds(task([null, 42]), task([]))).toEqual([]);
  });
});
