/**
 * Gantt-style timeline for the project board (wireframe A3, D-033): task
 * bars grouped by phase, a vertical "today" line, milestone diamonds, and
 * overdue bars in the warm accent color. Bars are buttons that open the
 * task-detail drawer; a "→ Today" control scrolls the viewport to now.
 */

import { Button, cn } from '@siapp/ui';
import type { TTaskStatus } from '@siapp/shared';
import { useMemo, useRef } from 'react';

import type { IMilestoneRow } from '../milestones/useMilestones.ts';
import { TASK_STATUS_LABELS } from './taskLabels.ts';
import type { IPhaseRow, TTaskListRow } from './useTasks.ts';

const DAY_PX = 6;
const LABEL_COL_PX = 224;
const MS_PER_DAY = 86_400_000;

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function diffDays(from: number, to: number): number {
  return Math.round((to - from) / MS_PER_DAY);
}

export interface ITimelineRange {
  /** Midnight timestamp of the first visible day. */
  start: number;
  /** Total days rendered. */
  days: number;
}

/**
 * Visible range: everything dated (project bounds, task bars, milestones)
 * plus a week of lead-in and two weeks of run-out, always including today.
 */
export function timelineRange(
  rows: readonly TTaskListRow[],
  milestones: readonly IMilestoneRow[],
  projectStart: Date | null,
  projectEnd: Date | null,
  today: Date = new Date(),
): ITimelineRange {
  const dates: number[] = [dayStart(today)];
  if (projectStart !== null) {
    dates.push(dayStart(projectStart));
  }
  if (projectEnd !== null) {
    dates.push(dayStart(projectEnd));
  }
  for (const row of rows) {
    if (!row.restricted && row.startDate !== null) {
      dates.push(dayStart(row.startDate));
    }
    if (row.dueDate !== null) {
      dates.push(dayStart(row.dueDate));
    }
  }
  for (const milestone of milestones) {
    if (milestone.targetDate !== null) {
      dates.push(dayStart(milestone.targetDate));
    }
  }
  const start = Math.min(...dates) - 7 * MS_PER_DAY;
  const end = Math.max(...dates) + 14 * MS_PER_DAY;
  return { start, days: diffDays(start, end) };
}

interface IMonthTick {
  label: string;
  offsetDays: number;
}

function monthTicks(range: ITimelineRange): IMonthTick[] {
  const ticks: IMonthTick[] = [];
  const cursor = new Date(range.start);
  cursor.setDate(1);
  if (dayStart(cursor) < range.start) {
    cursor.setMonth(cursor.getMonth() + 1);
  }
  while (dayStart(cursor) <= range.start + range.days * MS_PER_DAY) {
    ticks.push({
      label: cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
      offsetDays: diffDays(range.start, dayStart(cursor)),
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

function isOverdue(status: TTaskStatus, dueDate: Date | null): boolean {
  return dueDate !== null && status !== 'done' && dueDate.getTime() < Date.now();
}

const BAR_STATUS_CLASSES: Record<TTaskStatus, string> = {
  todo: 'bg-slate-300',
  in_progress: 'bg-primary',
  blocked: 'bg-warning',
  done: 'bg-success',
};

interface ITimelineTaskRowProps {
  row: TTaskListRow;
  range: ITimelineRange;
  selected: boolean;
  onSelect: () => void;
}

function TimelineTaskRow({ row, range, selected, onSelect }: ITimelineTaskRowProps) {
  const startDate = row.restricted ? row.dueDate : (row.startDate ?? row.dueDate);
  const endDate = row.dueDate ?? startDate;
  const hasBar = startDate !== null && endDate !== null;
  const left = hasBar ? diffDays(range.start, dayStart(startDate)) * DAY_PX : 0;
  const width = hasBar
    ? Math.max((diffDays(dayStart(startDate), dayStart(endDate)) + 1) * DAY_PX, 12)
    : 0;
  const overdue = isOverdue(row.status, row.dueDate);
  const dueLabel =
    row.dueDate !== null ? ` — due ${row.dueDate.toLocaleDateString()}` : '';

  return (
    <div className="group/row relative flex h-9 items-center border-b border-border/60">
      <div
        className={cn(
          'sticky left-0 z-10 flex h-full shrink-0 items-center gap-1.5 truncate border-r border-border bg-card pr-3 pl-6 text-sm',
          row.restricted && 'opacity-60',
          selected && 'font-medium',
        )}
        style={{ width: LABEL_COL_PX }}
      >
        <span className="truncate">{row.title}</span>
        {row.restricted && (
          <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
            Restricted
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${row.title} — ${TASK_STATUS_LABELS[row.status]}${overdue ? ', overdue' : ''}${dueLabel}`}
        className={cn(
          'absolute top-1/2 h-4 -translate-y-1/2 rounded-full transition-shadow',
          'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:outline-none',
          hasBar
            ? (overdue ? 'bg-accent' : BAR_STATUS_CLASSES[row.status])
            : 'border border-dashed border-border bg-transparent',
          row.restricted && 'opacity-50',
          selected && 'ring-2 ring-primary ring-offset-1',
        )}
        style={
          hasBar
            ? { left: LABEL_COL_PX + left, width }
            : { left: LABEL_COL_PX + 8, width: 48 }
        }
        title={hasBar ? undefined : `${row.title} (no dates)`}
      />
    </div>
  );
}

export interface ITimelineViewProps {
  phases: readonly IPhaseRow[];
  /** Phase id (or null-phase key) → rows, same grouping as the list view. */
  grouped: ReadonlyMap<string, TTaskListRow[]>;
  noPhaseKey: string;
  milestones: readonly IMilestoneRow[];
  projectStart: Date | null;
  projectEnd: Date | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function TimelineView({
  phases,
  grouped,
  noPhaseKey,
  milestones,
  projectStart,
  projectEnd,
  selectedId,
  onSelect,
}: ITimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const allRows = useMemo(() => [...grouped.values()].flat(), [grouped]);
  const range = useMemo(
    () => timelineRange(allRows, milestones, projectStart, projectEnd),
    [allRows, milestones, projectStart, projectEnd],
  );
  const chartWidth = LABEL_COL_PX + range.days * DAY_PX;
  const todayOffset = diffDays(range.start, dayStart(new Date())) * DAY_PX;
  const ticks = useMemo(() => monthTicks(range), [range]);
  const datedMilestones = milestones.filter((m) => m.targetDate !== null);

  function scrollToToday(): void {
    const container = scrollRef.current;
    if (container !== null) {
      container.scrollTo({
        left: Math.max(0, LABEL_COL_PX + todayOffset - container.clientWidth / 2),
        behavior: 'smooth',
      });
    }
  }

  const groups: Array<{ key: string; label: string; rows: TTaskListRow[] }> = [
    ...phases.map((phase) => ({
      key: phase.id,
      label: phase.name,
      rows: grouped.get(phase.id) ?? [],
    })),
    { key: noPhaseKey, label: 'No phase', rows: grouped.get(noPhaseKey) ?? [] },
  ].filter((group) => group.rows.length > 0);

  if (groups.length === 0) {
    return <p className="text-sm text-muted-foreground">No tasks to place on the timeline yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end">
        <Button type="button" variant="outline" size="sm" onClick={scrollToToday}>
          → Today
        </Button>
      </div>
      <div
        ref={scrollRef}
        className="overflow-x-auto rounded-lg border border-border bg-card"
        role="region"
        aria-label="Project timeline"
        tabIndex={0}
      >
        <div className="relative" style={{ width: chartWidth, minWidth: '100%' }}>
          {/* Month ticks */}
          <div className="relative h-7 border-b border-border" aria-hidden="true">
            {ticks.map((tick) => (
              <span
                key={tick.label + String(tick.offsetDays)}
                className="absolute top-1.5 border-l border-border pl-1.5 text-[11px] text-muted-foreground"
                style={{ left: LABEL_COL_PX + tick.offsetDays * DAY_PX }}
              >
                {tick.label}
              </span>
            ))}
          </div>

          {/* Milestone lane */}
          {datedMilestones.length > 0 && (
            <div className="relative h-8 border-b border-border">
              <span
                className="sticky left-0 z-10 inline-flex h-full items-center border-r border-border bg-card pr-3 pl-6 text-xs font-medium text-muted-foreground"
                style={{ width: LABEL_COL_PX }}
              >
                Milestones
              </span>
              {datedMilestones.map((milestone) => (
                <span
                  key={milestone.id}
                  role="img"
                  aria-label={`Milestone: ${milestone.name}, ${milestone.targetDate?.toLocaleDateString() ?? ''}`}
                  title={milestone.name}
                  data-testid="timeline-milestone"
                  className={cn(
                    'absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45',
                    milestone.completedAt !== null ? 'bg-success' : 'bg-accent',
                  )}
                  style={{
                    left:
                      LABEL_COL_PX +
                      diffDays(range.start, dayStart(milestone.targetDate as Date)) * DAY_PX,
                  }}
                />
              ))}
            </div>
          )}

          {/* Phase groups */}
          {groups.map((group) => (
            <section key={group.key} aria-label={`${group.label} timeline`}>
              <div className="flex h-8 items-center border-b border-border bg-muted/50">
                <span
                  className="sticky left-0 z-10 flex h-full items-center border-r border-border bg-muted pr-3 pl-3 text-xs font-semibold"
                  style={{ width: LABEL_COL_PX }}
                >
                  {group.label}
                </span>
              </div>
              {group.rows.map((row) => (
                <TimelineTaskRow
                  key={row.id}
                  row={row}
                  range={range}
                  selected={row.id === selectedId}
                  onSelect={() => onSelect(row.id)}
                />
              ))}
            </section>
          ))}

          {/* Today line */}
          <div
            aria-hidden="true"
            data-testid="timeline-today"
            className="pointer-events-none absolute top-7 bottom-0 w-px bg-accent"
            style={{ left: LABEL_COL_PX + todayOffset }}
          >
            <span className="absolute -top-0.5 left-1 text-[10px] font-medium text-accent">
              Today
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
