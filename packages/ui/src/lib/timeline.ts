/**
 * Pure, DOM-free granularity + tick math shared by the firm board timeline
 * (`dashboard.siapp.app`) and the read-only client-portal Gantt (`siapp.app/p/*`).
 * Lives in `@siapp/ui` so both surfaces can consume it without the portal ever
 * importing from the firm tree (bundle isolation D-036/D-037). No React, no DOM.
 */

export type TTimelineGranularity = 'day' | 'week' | 'month';

/** A visible timeline window: `start` is a local-midnight timestamp. */
export interface ITimelineAxis {
  /** Midnight timestamp of the first visible day. */
  start: number;
  /** Total days rendered. */
  days: number;
}

/** A single axis label; `offsetDays` is relative to `axis.start`. */
export interface ITimelineTick {
  label: string;
  offsetDays: number;
}

const MS_PER_DAY = 86_400_000;

export const TIMELINE_GRANULARITIES: readonly TTimelineGranularity[] = ['day', 'week', 'month'];

/** Pixels per day per zoom level (UI token). Monotonic: day > week > month. */
export const TIMELINE_DAY_PX: Record<TTimelineGranularity, number> = {
  day: 28,
  week: 12,
  month: 5,
};

/** Past/future padding (in days) added around the whole dated range, per level. */
export const TIMELINE_PAD_DAYS: Record<TTimelineGranularity, number> = {
  day: 30,
  week: 84,
  month: 210,
};

/** Local-midnight timestamp for the calendar day containing `date`. */
export function timelineDayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Whole calendar days between two timestamps (calendar-rounded). */
export function timelineDiffDays(fromMs: number, toMs: number): number {
  return Math.round((toMs - fromMs) / MS_PER_DAY);
}

/**
 * Add `days` calendar days to a timestamp, returning the local-midnight of the
 * result. DST-safe: uses `Date` component math (which normalises 23h/25h days)
 * instead of fixed-millisecond stepping, so the calendar date never drifts
 * across a spring-forward/fall-back boundary.
 */
export function timelineAddDays(ms: number, days: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

/** Snap a timestamp down to the start of its granularity bucket. */
function snapDown(ms: number, granularity: TTimelineGranularity): number {
  const date = new Date(ms);
  if (granularity === 'month') {
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  }
  if (granularity === 'week') {
    // Monday-start weeks. getDay(): 0=Sun..6=Sat → days since Monday.
    const sinceMonday = (date.getDay() + 6) % 7;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - sinceMonday).getTime();
  }
  return timelineDayStart(date);
}

/** Snap a timestamp up to the next granularity boundary (no-op if already on one). */
function snapUp(ms: number, granularity: TTimelineGranularity): number {
  const down = snapDown(ms, granularity);
  if (down === ms) {
    return down;
  }
  const date = new Date(down);
  if (granularity === 'month') {
    return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
  }
  if (granularity === 'week') {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7).getTime();
  }
  return down;
}

/**
 * Firm axis: union of all dated timestamps + today, padded by
 * `TIMELINE_PAD_DAYS`, so today is scrollable-to-center and empty past/future
 * exists to scroll into. Snaps start down / end up to the granularity boundary
 * (month → 1st, week → Monday, day → midnight).
 */
export function paddedTimelineAxis(
  datedMsDayStarts: readonly number[],
  granularity: TTimelineGranularity,
  today: Date,
): ITimelineAxis {
  const pad = TIMELINE_PAD_DAYS[granularity];
  const dates = [...datedMsDayStarts, timelineDayStart(today)];
  const rawStart = timelineAddDays(Math.min(...dates), -pad);
  const rawEnd = timelineAddDays(Math.max(...dates), pad);
  const start = snapDown(rawStart, granularity);
  const end = snapUp(rawEnd, granularity);
  return { start, days: Math.max(timelineDiffDays(start, end), 1) };
}

/**
 * Ticks for the axis at the given granularity:
 *  - month → first of each month, label e.g. "Aug 26"
 *  - week  → each Monday, label e.g. "18 Aug"
 *  - day   → each day, label e.g. "18"
 * `offsetDays` is relative to `axis.start` (callers convert to px OR a % fraction).
 */
export function buildTimelineTicks(
  axis: ITimelineAxis,
  granularity: TTimelineGranularity,
): ITimelineTick[] {
  const ticks: ITimelineTick[] = [];
  // Calendar-based end boundary (DST-safe): the local midnight `axis.days`
  // calendar days after `axis.start`, matching how the axis span was measured.
  const end = timelineAddDays(axis.start, axis.days);
  const cursor = new Date(axis.start);

  if (granularity === 'month') {
    cursor.setDate(1);
    if (timelineDayStart(cursor) < axis.start) {
      cursor.setMonth(cursor.getMonth() + 1);
    }
    while (timelineDayStart(cursor) <= end) {
      ticks.push({
        label: cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        offsetDays: timelineDiffDays(axis.start, timelineDayStart(cursor)),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return ticks;
  }

  if (granularity === 'week') {
    const sinceMonday = (cursor.getDay() + 6) % 7;
    cursor.setDate(cursor.getDate() - sinceMonday);
    if (timelineDayStart(cursor) < axis.start) {
      cursor.setDate(cursor.getDate() + 7);
    }
    while (timelineDayStart(cursor) <= end) {
      ticks.push({
        label: cursor.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
        offsetDays: timelineDiffDays(axis.start, timelineDayStart(cursor)),
      });
      cursor.setDate(cursor.getDate() + 7);
    }
    return ticks;
  }

  while (timelineDayStart(cursor) <= end) {
    ticks.push({
      label: String(cursor.getDate()),
      offsetDays: timelineDiffDays(axis.start, timelineDayStart(cursor)),
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return ticks;
}
