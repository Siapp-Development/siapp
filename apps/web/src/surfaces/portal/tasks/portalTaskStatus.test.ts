import { describe, expect, it } from 'vitest';

import { PORTAL_STATUS_LABELS, derivePortalStatus, isPortalOverdue } from './portalTaskStatus.ts';

const NOW = new Date('2026-08-25T00:00:00Z');
const PAST = new Date('2026-08-20T00:00:00Z');
const FUTURE = new Date('2026-09-01T00:00:00Z');

describe('derivePortalStatus', () => {
  it('maps done first, even when past due', () => {
    expect(derivePortalStatus({ status: 'done', dueDate: PAST }, NOW)).toBe('done');
  });

  it('marks a not-done task past its due date as overdue (precedence)', () => {
    expect(derivePortalStatus({ status: 'todo', dueDate: PAST }, NOW)).toBe('overdue');
    expect(derivePortalStatus({ status: 'in_progress', dueDate: PAST }, NOW)).toBe('overdue');
    expect(derivePortalStatus({ status: 'blocked', dueDate: PAST }, NOW)).toBe('overdue');
  });

  it('maps blocked when not past due', () => {
    expect(derivePortalStatus({ status: 'blocked', dueDate: FUTURE }, NOW)).toBe('blocked');
    expect(derivePortalStatus({ status: 'blocked', dueDate: null }, NOW)).toBe('blocked');
  });

  it('maps in_progress and todo when not past due', () => {
    expect(derivePortalStatus({ status: 'in_progress', dueDate: FUTURE }, NOW)).toBe('in_progress');
    expect(derivePortalStatus({ status: 'todo', dueDate: null }, NOW)).toBe('todo');
  });

  it('treats a due date exactly at now as not overdue', () => {
    expect(derivePortalStatus({ status: 'todo', dueDate: NOW }, NOW)).toBe('todo');
  });
});

describe('isPortalOverdue', () => {
  it('is false for done tasks', () => {
    expect(isPortalOverdue({ status: 'done', dueDate: PAST }, NOW)).toBe(false);
  });

  it('is false without a due date', () => {
    expect(isPortalOverdue({ status: 'todo', dueDate: null }, NOW)).toBe(false);
  });

  it('is true for a not-done task past due', () => {
    expect(isPortalOverdue({ status: 'in_progress', dueDate: PAST }, NOW)).toBe(true);
  });
});

describe('PORTAL_STATUS_LABELS', () => {
  it('provides the five client labels', () => {
    expect(PORTAL_STATUS_LABELS).toEqual({
      done: 'Done',
      overdue: 'Overdue',
      blocked: 'Blocked',
      in_progress: 'In Progress',
      todo: 'To do',
    });
  });
});
