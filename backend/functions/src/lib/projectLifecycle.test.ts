import { describe, expect, it } from 'vitest';

import {
  LIFECYCLE_TIMESTAMP_FIELD,
  checkTransition,
  isLifecycleAction,
  type TMemberRole,
  type TProjectLifecycle,
  type TProjectLifecycleAction,
} from './projectLifecycle.js';

describe('isLifecycleAction', () => {
  it('accepts every documented action', () => {
    for (const action of ['publish', 'complete', 'archive', 'reopen', 'delete']) {
      expect(isLifecycleAction(action)).toBe(true);
    }
  });

  it('rejects unknown values', () => {
    expect(isLifecycleAction('restore')).toBe(false);
    expect(isLifecycleAction('')).toBe(false);
    expect(isLifecycleAction(42)).toBe(false);
    expect(isLifecycleAction(undefined)).toBe(false);
  });
});

describe('checkTransition — allowed matrix (D-027)', () => {
  const allow: Array<[TProjectLifecycle, TProjectLifecycleAction, TMemberRole, TProjectLifecycle]> =
    [
      ['draft', 'publish', 'owner', 'published'],
      ['draft', 'publish', 'admin', 'published'],
      ['draft', 'publish', 'pm', 'published'],
      ['published', 'complete', 'pm', 'completed'],
      ['published', 'archive', 'owner', 'archived'],
      ['published', 'archive', 'admin', 'archived'],
      ['completed', 'archive', 'pm', 'archived'],
      ['completed', 'reopen', 'owner', 'published'],
      ['completed', 'reopen', 'admin', 'published'],
      ['draft', 'delete', 'owner', 'deleted'],
      ['published', 'delete', 'owner', 'deleted'],
      ['completed', 'delete', 'owner', 'deleted'],
      ['archived', 'delete', 'owner', 'deleted'],
    ];

  it.each(allow)('%s --%s--> as %s lands on %s', (from, action, role, to) => {
    expect(checkTransition(from, action, role)).toEqual({ ok: true, to });
  });
});

describe('checkTransition — forbidden roles', () => {
  const forbidden: Array<[TProjectLifecycle, TProjectLifecycleAction, TMemberRole]> = [
    ['draft', 'publish', 'viewer'],
    ['published', 'complete', 'viewer'],
    ['published', 'archive', 'pm'], // PMs cannot archive a live project
    ['completed', 'archive', 'viewer'],
    ['completed', 'reopen', 'pm'],
    ['draft', 'delete', 'admin'],
    ['published', 'delete', 'pm'],
  ];

  it.each(forbidden)('%s --%s--> as %s is forbidden', (from, action, role) => {
    expect(checkTransition(from, action, role)).toEqual({
      ok: false,
      code: 'project/forbidden-transition',
    });
  });
});

describe('checkTransition — invalid transitions', () => {
  const invalid: Array<[TProjectLifecycle, TProjectLifecycleAction]> = [
    ['published', 'publish'],
    ['completed', 'publish'],
    ['draft', 'complete'],
    ['archived', 'complete'],
    ['draft', 'archive'],
    ['archived', 'archive'],
    ['draft', 'reopen'],
    ['published', 'reopen'],
    ['archived', 'reopen'],
    ['deleted', 'publish'],
    ['deleted', 'delete'], // deleted is terminal
  ];

  it.each(invalid)('%s --%s--> is invalid regardless of role', (from, action) => {
    expect(checkTransition(from, action, 'owner')).toEqual({
      ok: false,
      code: 'project/invalid-transition',
    });
  });

  it('reports invalid-transition before forbidden-transition', () => {
    // Viewer asking for an impossible transition must not leak role info.
    expect(checkTransition('published', 'publish', 'viewer')).toEqual({
      ok: false,
      code: 'project/invalid-transition',
    });
  });
});

describe('LIFECYCLE_TIMESTAMP_FIELD', () => {
  it('maps every non-draft state to its timestamp field', () => {
    expect(LIFECYCLE_TIMESTAMP_FIELD).toEqual({
      published: 'publishedAt',
      completed: 'completedAt',
      archived: 'archivedAt',
      deleted: 'deletedAt',
    });
  });
});
