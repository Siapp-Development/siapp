import { describe, expect, it } from 'vitest';

import { relativeDueDate } from './relativeDueDate.ts';

// Fixed reference "now": mid-day so time-of-day is irrelevant to calendar-day
// diffs (the helper measures whole local calendar days).
const NOW = new Date(2026, 0, 15, 12, 0, 0);

describe('relativeDueDate', () => {
  it('labels a null due date as muted with no overdue flag', () => {
    expect(relativeDueDate(null, NOW)).toEqual({
      label: 'No due date',
      tone: 'muted',
      overdue: false,
    });
  });

  it('labels the same calendar day as "Due today" (warning), regardless of time-of-day', () => {
    // Earlier in the day than `now` but still the same calendar day.
    const due = new Date(2026, 0, 15, 9, 0, 0);
    expect(relativeDueDate(due, NOW)).toEqual({
      label: 'Due today',
      tone: 'warning',
      overdue: false,
    });
  });

  it('labels the next calendar day as "Due tomorrow" (warning)', () => {
    const due = new Date(2026, 0, 16, 8, 0, 0);
    expect(relativeDueDate(due, NOW)).toEqual({
      label: 'Due tomorrow',
      tone: 'warning',
      overdue: false,
    });
  });

  it('keeps the warning tone at the 2-day boundary', () => {
    const due = new Date(2026, 0, 17, 8, 0, 0); // +2 days
    expect(relativeDueDate(due, NOW)).toEqual({
      label: 'Due in 2 days',
      tone: 'warning',
      overdue: false,
    });
  });

  it('crosses to muted tone just past the boundary (+3 days)', () => {
    const due = new Date(2026, 0, 18, 8, 0, 0); // +3 days
    expect(relativeDueDate(due, NOW)).toEqual({
      label: 'Due in 3 days',
      tone: 'muted',
      overdue: false,
    });
  });

  it('singularizes a single overdue day', () => {
    const due = new Date(2026, 0, 14, 8, 0, 0); // -1 day
    expect(relativeDueDate(due, NOW)).toEqual({
      label: '1 day overdue',
      tone: 'danger',
      overdue: true,
    });
  });

  it('pluralizes multiple overdue days', () => {
    const due = new Date(2026, 0, 12, 8, 0, 0); // -3 days
    expect(relativeDueDate(due, NOW)).toEqual({
      label: '3 days overdue',
      tone: 'danger',
      overdue: true,
    });
  });
});
