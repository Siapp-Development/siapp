import { describe, expect, it } from 'vitest';

import {
  TIMELINE_DAY_PX,
  TIMELINE_PAD_DAYS,
  buildTimelineTicks,
  paddedTimelineAxis,
  timelineDayStart,
  timelineDiffDays,
  type TTimelineGranularity,
} from './timeline.ts';

const MS_PER_DAY = 86_400_000;

function day(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

describe('TIMELINE_DAY_PX', () => {
  it('is monotonic (day > week > month)', () => {
    expect(TIMELINE_DAY_PX.day).toBeGreaterThan(TIMELINE_DAY_PX.week);
    expect(TIMELINE_DAY_PX.week).toBeGreaterThan(TIMELINE_DAY_PX.month);
  });
});

describe('paddedTimelineAxis', () => {
  const today = day('2026-08-15');

  const cases: readonly TTimelineGranularity[] = ['day', 'week', 'month'];

  for (const granularity of cases) {
    it(`spans today ± padding for granularity=${granularity} (today-only input)`, () => {
      const axis = paddedTimelineAxis([], granularity, today);
      const pad = TIMELINE_PAD_DAYS[granularity];
      const end = axis.start + axis.days * MS_PER_DAY;

      // Range brackets the padded window around today.
      expect(axis.start).toBeLessThanOrEqual(timelineDayStart(today) - pad * MS_PER_DAY);
      expect(end).toBeGreaterThanOrEqual(timelineDayStart(today) + pad * MS_PER_DAY);
      // Today falls inside the axis.
      expect(timelineDayStart(today)).toBeGreaterThanOrEqual(axis.start);
      expect(timelineDayStart(today)).toBeLessThanOrEqual(end);
      expect(axis.days).toBeGreaterThan(0);
    });
  }

  it('snaps the start down to the 1st for month granularity', () => {
    const axis = paddedTimelineAxis([], 'month', today);
    expect(new Date(axis.start).getDate()).toBe(1);
  });

  it('snaps the start down to a Monday for week granularity', () => {
    const axis = paddedTimelineAxis([], 'week', today);
    expect(new Date(axis.start).getDay()).toBe(1);
  });

  it('snaps the start down to local midnight for day granularity', () => {
    const axis = paddedTimelineAxis([], 'day', today);
    const start = new Date(axis.start);

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it('keeps today well inside the window (not pinned to an extreme edge)', () => {
    const axis = paddedTimelineAxis([], 'month', today);
    const offsetFromStart = timelineDiffDays(axis.start, timelineDayStart(today));

    // Today sits after the leading pad and before the trailing pad, i.e. it is
    // scrollable toward the centre rather than clamped to either edge.
    expect(offsetFromStart).toBeGreaterThan(0);
    expect(offsetFromStart).toBeLessThan(axis.days);
  });

  it('widens the range to include dated inputs and still pads around them', () => {
    const early = timelineDayStart(day('2026-01-01'));
    const late = timelineDayStart(day('2026-12-01'));
    const axis = paddedTimelineAxis([early, late], 'month', today);
    const pad = TIMELINE_PAD_DAYS.month;
    const end = axis.start + axis.days * MS_PER_DAY;

    expect(axis.start).toBeLessThanOrEqual(early - pad * MS_PER_DAY);
    expect(end).toBeGreaterThanOrEqual(late + pad * MS_PER_DAY);
  });

  it('pads by calendar days across a DST boundary (no fixed-ms drift)', () => {
    // today + 30 days crosses the US "fall back" (2026-11-01, a 25h day). Fixed
    // millisecond padding would land at 23:00 the day before and snap back to
    // 2026-11-18; calendar-day padding must reach exactly 2026-11-19 midnight.
    const nearFallBack = day('2026-10-20');
    const axis = paddedTimelineAxis([], 'day', nearFallBack);

    const endDate = new Date(axis.start);
    endDate.setDate(endDate.getDate() + axis.days);
    expect(endDate.getFullYear()).toBe(2026);
    expect(endDate.getMonth()).toBe(10); // November (0-based)
    expect(endDate.getDate()).toBe(19);
    expect(endDate.getHours()).toBe(0);
  });
});

describe('buildTimelineTicks', () => {
  const today = day('2026-08-15');

  it('month → one tick per month, on the 1st, offsets within range', () => {
    const axis = paddedTimelineAxis([], 'month', today);
    const ticks = buildTimelineTicks(axis, 'month');

    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      const tickDate = new Date(axis.start);
      tickDate.setDate(tickDate.getDate() + tick.offsetDays);
      expect(tickDate.getDate()).toBe(1);
      expect(tick.offsetDays).toBeGreaterThanOrEqual(0);
      expect(tick.offsetDays).toBeLessThanOrEqual(axis.days);
    }
    // Labels look like "Aug 26".
    expect(ticks[0]?.label).toMatch(/^[A-Za-z]{3} \d{2}$/);
  });

  it('week → one tick per Monday', () => {
    const axis = paddedTimelineAxis([], 'week', today);
    const ticks = buildTimelineTicks(axis, 'week');

    expect(ticks.length).toBeGreaterThan(0);
    for (const tick of ticks) {
      const tickDate = new Date(axis.start);
      tickDate.setDate(tickDate.getDate() + tick.offsetDays);
      expect(tickDate.getDay()).toBe(1);
      expect(tick.offsetDays).toBeGreaterThanOrEqual(0);
      expect(tick.offsetDays).toBeLessThanOrEqual(axis.days);
    }
  });

  it('day → one tick per day for the whole span', () => {
    const axis = paddedTimelineAxis([], 'day', today);
    const ticks = buildTimelineTicks(axis, 'day');

    // Roughly one tick per day (inclusive of both ends).
    expect(ticks.length).toBe(axis.days + 1);
    expect(ticks[0]?.offsetDays).toBe(0);
    expect(ticks.at(-1)?.offsetDays).toBe(axis.days);
  });

  it('day → produces a strictly consecutive offset sequence across a DST boundary', () => {
    // A "spring forward" week: raw millisecond stepping (23h days) would drop or
    // duplicate a day. Calendar (setDate) stepping keeps offsets consecutive.
    const springForward = day('2026-03-08');
    const axis = paddedTimelineAxis([], 'day', springForward);
    const ticks = buildTimelineTicks(axis, 'day');

    const offsets = ticks.map((tick) => tick.offsetDays);
    const expected = Array.from({ length: axis.days + 1 }, (_, index) => index);
    expect(offsets).toEqual(expected);
  });

  it('day → every tick reconstructs to local midnight (no DST time drift)', () => {
    const springForward = day('2026-03-08');
    const axis = paddedTimelineAxis([], 'day', springForward);
    const ticks = buildTimelineTicks(axis, 'day');

    for (const tick of ticks) {
      const tickDate = new Date(axis.start);
      tickDate.setDate(tickDate.getDate() + tick.offsetDays);
      expect(tickDate.getHours()).toBe(0);
    }
  });
});

describe('timelineDiffDays', () => {
  it('counts whole calendar days between midnights', () => {
    expect(timelineDiffDays(day('2026-08-01').getTime(), day('2026-08-11').getTime())).toBe(10);
  });
});
