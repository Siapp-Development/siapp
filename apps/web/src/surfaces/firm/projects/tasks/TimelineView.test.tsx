import { describe, expect, it } from 'vitest';

import type { IMilestoneRow } from '../milestones/useMilestones.ts';
import { timelineRange } from './TimelineView.tsx';
import type { TTaskListRow } from './useTasks.ts';

const DAY = 86_400_000;

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

describe('timelineRange', () => {
  const today = day('2026-07-25');

  it('spans a week before the earliest date to two weeks after the latest', () => {
    const rows = [
      {
        restricted: false,
        startDate: day('2026-07-01'),
        dueDate: day('2026-08-01'),
      } as TTaskListRow,
    ];
    const range = timelineRange(rows, [], null, null, today);
    expect(range.start).toBe(day('2026-07-01').getTime() - 7 * DAY);
    expect(range.days).toBe(Math.round((day('2026-08-01').getTime() + 14 * DAY - range.start) / DAY));
  });

  it('falls back to a window around today when nothing is dated', () => {
    const range = timelineRange([], [], null, null, today);
    expect(range.start).toBe(today.getTime() - 7 * DAY);
    expect(range.days).toBe(21);
  });

  it('stretches to include project bounds and milestone dates', () => {
    const milestones: IMilestoneRow[] = [
      { id: 'm1', name: 'Handover', targetDate: day('2026-12-01'), completedAt: null, order: 1 },
    ];
    const range = timelineRange([], milestones, day('2026-06-01'), day('2026-11-01'), today);
    expect(range.start).toBe(day('2026-06-01').getTime() - 7 * DAY);
    // Days are calendar-rounded, so compare in days rather than epoch ms.
    expect(range.days).toBe(
      Math.round((day('2026-12-01').getTime() - day('2026-06-01').getTime()) / DAY) + 21,
    );
  });
});
