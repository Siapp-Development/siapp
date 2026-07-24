import { describe, expect, it } from 'vitest';

import { TASK_NOTIFY_DEFAULTS, resolveNotify, triggersFor } from './notifyConfig.js';

describe('resolveNotify', () => {
  it('returns D2 defaults when the map is absent (all pre-#18 tasks)', () => {
    expect(resolveNotify(undefined)).toEqual(TASK_NOTIFY_DEFAULTS);
    expect(resolveNotify({})).toEqual(TASK_NOTIFY_DEFAULTS);
    expect(resolveNotify({ notify: null })).toEqual(TASK_NOTIFY_DEFAULTS);
  });

  it('reads a stored map', () => {
    const notify = {
      statusChange: false,
      dueSoon: true,
      blocked: false,
      toClient: false,
      toInternal: true,
    };
    expect(resolveNotify({ notify })).toEqual(notify);
  });

  it('falls back key by key for malformed values', () => {
    expect(resolveNotify({ notify: { statusChange: false, toInternal: 'yes' } })).toEqual({
      ...TASK_NOTIFY_DEFAULTS,
      statusChange: false,
    });
  });
});

describe('triggersFor (D4 status diff)', () => {
  it('fires statusChange on a non-blocked transition', () => {
    expect(triggersFor({ status: 'todo' }, { status: 'in_progress' })).toBe('statusChange');
    expect(triggersFor({ status: 'in_progress' }, { status: 'done' })).toBe('statusChange');
  });

  it('fires blocked on a transition into blocked', () => {
    expect(triggersFor({ status: 'in_progress' }, { status: 'blocked' })).toBe('blocked');
  });

  it('fires statusChange when leaving blocked', () => {
    expect(triggersFor({ status: 'blocked' }, { status: 'done' })).toBe('statusChange');
  });

  it('fires nothing when the status is unchanged', () => {
    expect(triggersFor({ status: 'todo' }, { status: 'todo', title: 'renamed' })).toBeNull();
  });

  it('fires nothing on create or delete', () => {
    expect(triggersFor(undefined, { status: 'todo' })).toBeNull();
    expect(triggersFor({ status: 'todo' }, undefined)).toBeNull();
  });

  it('fires nothing for non-string statuses', () => {
    expect(triggersFor({ status: 1 }, { status: 'todo' })).toBeNull();
  });
});
