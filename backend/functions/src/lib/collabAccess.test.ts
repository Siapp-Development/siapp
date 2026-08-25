/**
 * Pure collaborator task-access helpers (#127) — the assignee-membership and
 * visibility re-checks submitCollabUpdate / redeemCollabLink perform server-side
 * (mirroring the Firestore rules gate). Kept emulator-free.
 */

import { describe, expect, it } from 'vitest';

import {
  collaboratorCanAccessTask,
  isCollaboratorAssignee,
  passesCollabVisibility,
} from './collabAccess.js';

describe('isCollaboratorAssignee', () => {
  it('true only for a collaborator-type assignee with the matching id', () => {
    const assignees = [
      { type: 'user', id: 'u1' },
      { type: 'collaborator', id: 'col1' },
      { type: 'collaborator', id: 'col2' },
    ];
    expect(isCollaboratorAssignee(assignees, 'col1')).toBe(true);
    expect(isCollaboratorAssignee(assignees, 'col2')).toBe(true);
  });

  it('false when the id matches a user assignee, an absent id, or a bad array', () => {
    expect(isCollaboratorAssignee([{ type: 'user', id: 'col1' }], 'col1')).toBe(false);
    expect(isCollaboratorAssignee([{ type: 'collaborator', id: 'col9' }], 'col1')).toBe(false);
    expect(isCollaboratorAssignee(undefined, 'col1')).toBe(false);
    expect(isCollaboratorAssignee('nope', 'col1')).toBe(false);
    expect(isCollaboratorAssignee([null, 42, { id: 'col1' }], 'col1')).toBe(false);
  });
});

describe('passesCollabVisibility', () => {
  it('empty / missing / non-array visibility list = visible to all assignees', () => {
    expect(passesCollabVisibility([], 'col1')).toBe(true);
    expect(passesCollabVisibility(undefined, 'col1')).toBe(true);
    expect(passesCollabVisibility('legacy', 'col1')).toBe(true);
  });

  it('a populated list gates on membership', () => {
    expect(passesCollabVisibility(['col1'], 'col1')).toBe(true);
    expect(passesCollabVisibility(['col2'], 'col1')).toBe(false);
  });
});

describe('collaboratorCanAccessTask (assignee AND visible)', () => {
  it('requires BOTH assignee-membership and visibility', () => {
    const assignees = [{ type: 'collaborator', id: 'col1' }];
    // assigned + visible-to-all
    expect(collaboratorCanAccessTask(assignees, [], 'col1')).toBe(true);
    // assigned but hidden (visibility excludes col1)
    expect(collaboratorCanAccessTask(assignees, ['col2'], 'col1')).toBe(false);
    // visible but not an assignee
    expect(collaboratorCanAccessTask([{ type: 'collaborator', id: 'col2' }], [], 'col1')).toBe(
      false,
    );
  });
});
