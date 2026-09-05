/**
 * Read-only portal Gantt (#126, D-042). A deliberately slimmed rebuild of the
 * firm timeline math — NO drag / keyboard-reorder / task-detail surface
 * (bundle isolation D-036/D-037: the portal imports nothing from the firm
 * tree). The axis is the dynamic min/max of task start/due dates ± padding
 * (NOT project bounds). `fitToWidth` renders proportionally to the container
 * (print, one landscape page); otherwise bars use a fixed day scale and the
 * track scrolls horizontally.
 */

import { SegmentedControl, TIMELINE_DAY_PX, buildTimelineTicks, cn } from '@siapp/ui';
import type { TTimelineGranularity } from '@siapp/ui';
import { useMemo, useState } from 'react';

import type { IPortalTaskGroup, IPortalTask } from './usePortalTasks.ts';
import { PORTAL_STATUS_LABELS, derivePortalStatus, type TPortalTaskStatus } from './portalTaskStatus.ts';

const MS_PER_DAY = 86_400_000;
const LABEL_COL_PX = 180;
const LEAD_DAYS = 3;
const RUN_OUT_DAYS = 7;
const MIN_BAR_PX = 6;

const GRANULARITY_OPTIONS: ReadonlyArray<{ value: TTimelineGranularity; label: string }> = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
];

const DATE_FORMAT = new Intl.DateTimeFormat('en-MY', { day: 'numeric', month: 'short' });

const BAR_STATUS_CLASSES: Record<TPortalTaskStatus, string> = {
  done: 'bg-success',
  overdue: 'bg-accent',
  blocked: 'bg-warning',
  in_progress: 'bg-primary',
  todo: 'bg-slate-300',
};

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function diffDays(from: number, to: number): number {
  return Math.round((to - from) / MS_PER_DAY);
}

interface ITimelineRange {
  start: number;
  days: number;
}

/** Axis = min/max of task start/due dates ± padding (never project bounds). */
export function portalTimelineRange(tasks: readonly IPortalTask[]): ITimelineRange | null {
  const dates: number[] = [];
  for (const task of tasks) {
    if (task.startDate !== null) {
      dates.push(dayStart(task.startDate));
    }
    if (task.dueDate !== null) {
      dates.push(dayStart(task.dueDate));
    }
  }
  if (dates.length === 0) {
    return null;
  }
  const start = Math.min(...dates) - LEAD_DAYS * MS_PER_DAY;
  const end = Math.max(...dates) + RUN_OUT_DAYS * MS_PER_DAY;
  return { start, days: Math.max(diffDays(start, end), 1) };
}

interface IBarGeometry {
  /** Fraction 0–1 from the range start. */
  leftFraction: number;
  /** Fraction 0–1 of the total range span. */
  widthFraction: number;
}

function barGeometry(task: IPortalTask, range: ITimelineRange): IBarGeometry | null {
  const startDate = task.startDate ?? task.dueDate;
  const endDate = task.dueDate ?? task.startDate;
  if (startDate === null || endDate === null) {
    return null;
  }
  const leftDays = diffDays(range.start, dayStart(startDate));
  const spanDays = diffDays(dayStart(startDate), dayStart(endDate)) + 1;
  return {
    leftFraction: leftDays / range.days,
    widthFraction: spanDays / range.days,
  };
}

function barAriaLabel(task: IPortalTask, status: TPortalTaskStatus): string {
  const parts = [`${task.title} — ${PORTAL_STATUS_LABELS[status]}`];
  if (task.startDate !== null) {
    parts.push(`from ${DATE_FORMAT.format(task.startDate)}`);
  }
  if (task.dueDate !== null) {
    parts.push(`due ${DATE_FORMAT.format(task.dueDate)}`);
  }
  return parts.join(', ');
}

export interface IPortalTaskTimelineProps {
  groups: readonly IPortalTaskGroup[];
  /** Fit the chart to the container width (print) instead of scrolling. */
  fitToWidth?: boolean;
  now?: Date;
}

export function PortalTaskTimeline({ groups, fitToWidth = false, now = new Date() }: IPortalTaskTimelineProps) {
  const [granularity, setGranularity] = useState<TTimelineGranularity>('month');
  // Print (fitToWidth) is fraction-based / fit-to-page and shows no switcher.
  const effectiveGranularity: TTimelineGranularity = fitToWidth ? 'month' : granularity;

  const allTasks = useMemo(() => groups.flatMap((group) => group.tasks), [groups]);
  const range = useMemo(() => portalTimelineRange(allTasks), [allTasks]);
  const ticks = useMemo(
    () => (range === null ? [] : buildTimelineTicks(range, effectiveGranularity)),
    [range, effectiveGranularity],
  );

  if (groups.length === 0 || range === null) {
    return (
      <p className="text-sm text-muted-foreground">No dated tasks to place on the timeline yet.</p>
    );
  }

  // Screen: fixed day scale, horizontal scroll. Print: fit the page width.
  const trackWidth = fitToWidth ? undefined : range.days * TIMELINE_DAY_PX[effectiveGranularity];

  return (
    <div className="flex flex-col gap-2">
      {!fitToWidth && (
        <div className="flex items-center justify-end">
          <SegmentedControl
            aria-label="Timeline granularity"
            value={granularity}
            onChange={setGranularity}
            options={GRANULARITY_OPTIONS}
            size="sm"
          />
        </div>
      )}
      <div className={cn('rounded-lg border border-border bg-card', fitToWidth ? '' : 'overflow-x-auto')}>
        <div style={fitToWidth ? undefined : { minWidth: LABEL_COL_PX + (trackWidth ?? 0) }}>
          {/* Axis ticks */}
          <div className="relative flex h-6 border-b border-border" aria-hidden="true">
            <div className="shrink-0 border-r border-border" style={{ width: LABEL_COL_PX }} />
            <div className="relative flex-1">
              {ticks.map((tick) => (
                <span
                  key={tick.label + String(tick.offsetDays)}
                  className="absolute top-1 border-l border-border pl-1 text-[10px] text-muted-foreground"
                  style={{ left: `${(tick.offsetDays / range.days) * 100}%` }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </div>

          {groups.map((group) => (
            <section key={group.phaseId ?? '__unphased__'} aria-label={`${group.name} timeline`}>
              <div
                className="flex h-7 items-center border-b border-border bg-muted/60 px-3 text-xs font-semibold"
              >
                {group.name}
              </div>
              {group.tasks.map((task) => {
                const status = derivePortalStatus(task, now);
                const geometry = barGeometry(task, range);
                return (
                  <div key={task.id} className="flex h-8 items-center border-b border-border/60">
                    <div
                      className="flex h-full shrink-0 items-center truncate border-r border-border px-3 text-sm"
                      style={{ width: LABEL_COL_PX }}
                    >
                      <span className="truncate">{task.title}</span>
                    </div>
                    <div className="relative h-full flex-1">
                      {geometry !== null ? (
                        <span
                          role="img"
                          aria-label={barAriaLabel(task, status)}
                          className={cn(
                            'absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full',
                            BAR_STATUS_CLASSES[status],
                          )}
                          style={{
                            left: `${geometry.leftFraction * 100}%`,
                            width: `${geometry.widthFraction * 100}%`,
                            minWidth: MIN_BAR_PX,
                          }}
                        />
                      ) : (
                        <span className="sr-only">{barAriaLabel(task, status)} (no dates)</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
