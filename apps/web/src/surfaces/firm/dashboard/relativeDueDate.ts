/**
 * Day-granular relative due-date labels for the #102 Home redesign. Diffs are
 * measured in whole calendar days in the viewer's local timezone so a task due
 * "today" reads that way regardless of the time-of-day components — a plain
 * millisecond diff would mislabel a task due at 9am when viewed at 5pm.
 */

export type TDueTone = 'danger' | 'warning' | 'muted';

export interface IRelativeDueDate {
  label: string;
  tone: TDueTone;
  overdue: boolean;
}

/** Calendar-day difference (due − now), local time; negative means overdue. */
function calendarDayDiff(due: Date, now: Date): number {
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Round to absorb DST offset shifts that leave the diff a fraction off a day.
  return Math.round((dueMidnight.getTime() - nowMidnight.getTime()) / DAY_MS);
}

export function relativeDueDate(due: Date | null, now: Date): IRelativeDueDate {
  if (due === null) {
    return { label: 'No due date', tone: 'muted', overdue: false };
  }

  const days = calendarDayDiff(due, now);

  if (days < 0) {
    const overdueBy = Math.abs(days);
    return {
      label: overdueBy === 1 ? '1 day overdue' : `${overdueBy} days overdue`,
      tone: 'danger',
      overdue: true,
    };
  }

  if (days === 0) {
    return { label: 'Due today', tone: 'warning', overdue: false };
  }

  if (days === 1) {
    return { label: 'Due tomorrow', tone: 'warning', overdue: false };
  }

  // Within the next couple of days is still worth flagging (warning); further
  // out is routine (muted).
  return {
    label: `Due in ${days} days`,
    tone: days <= 2 ? 'warning' : 'muted',
    overdue: false,
  };
}
