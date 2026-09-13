/**
 * Projects timeline (issue #164, D-042 precedent): a dependency-free, Gantt-style
 * portfolio view — one row per workspace project, drawn from `startDate →
 * targetEndDate` with a progress overlay. Pure presentational: it takes the
 * already-loaded `IProjectRow[]`, excludes `deleted` rows, partitions the rest
 * into a dated group (placed on the axis) and a "No dates set" group, and reuses
 * the shared `@siapp/ui` timeline math (bundle isolation D-036/D-037: this is a
 * fresh firm-surface component, it does NOT import the portal Gantt).
 *
 * Accessibility: each bar is a `role="img"` with a full `aria-label` (name,
 * lifecycle, date range, progress %), so the visual chart is non-essential for
 * AT users. Progress is never conveyed by color alone — it is stated in the
 * label and as a trailing `NN%`. Lifecycle is shown as a text badge, not a hue.
 */

import {
  SegmentedControl,
  TIMELINE_DAY_PX,
  buildTimelineTicks,
  cn,
  paddedTimelineAxis,
  timelineDayStart,
  timelineDiffDays,
} from '@siapp/ui';
import type { ITimelineAxis, TTimelineGranularity } from '@siapp/ui';
import { Link } from 'react-router';
import { useMemo, useState } from 'react';

import { LifecycleBadge } from '../projects/LifecycleBadge.tsx';
import { LIFECYCLE_LABELS } from '../projects/projectLabels.ts';
import type { IProjectRow } from '../projects/useProjects.ts';

const LABEL_COL_PX = 200;
const MIN_BAR_PX = 6;

const GRANULARITY_OPTIONS: ReadonlyArray<{ value: TTimelineGranularity; label: string }> = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
];

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** Projects with at least one endpoint can be placed on the axis. */
function isDated(project: IProjectRow): boolean {
  return project.startDate !== null || project.targetEndDate !== null;
}

/**
 * Day-start timestamps of every non-null start/target date across the given
 * projects (excluding `deleted`). Exported for unit-testable axis math without
 * rendering; undated projects contribute nothing.
 */
export function projectsTimelineDates(projects: readonly IProjectRow[]): number[] {
  const dates: number[] = [];
  for (const project of projects) {
    if (project.lifecycle === 'deleted') {
      continue;
    }
    if (project.startDate !== null) {
      dates.push(timelineDayStart(project.startDate));
    }
    if (project.targetEndDate !== null) {
      dates.push(timelineDayStart(project.targetEndDate));
    }
  }
  return dates;
}

interface IBarGeometry {
  left: number;
  width: number;
}

function barGeometry(project: IProjectRow, axis: ITimelineAxis, dayPx: number): IBarGeometry | null {
  const barStart = project.startDate ?? project.targetEndDate;
  const barEnd = project.targetEndDate ?? project.startDate;
  if (barStart === null || barEnd === null) {
    return null;
  }
  const leftDays = timelineDiffDays(axis.start, timelineDayStart(barStart));
  const spanDays = timelineDiffDays(timelineDayStart(barStart), timelineDayStart(barEnd)) + 1;
  return {
    left: LABEL_COL_PX + leftDays * dayPx,
    width: Math.max(spanDays * dayPx, MIN_BAR_PX),
  };
}

/** SR-equivalent for a bar: name, lifecycle, date range and progress. */
function barAriaLabel(project: IProjectRow): string {
  const parts = [`${project.name} — ${LIFECYCLE_LABELS[project.lifecycle]}`];
  if (project.startDate !== null) {
    parts.push(`from ${DATE_FORMAT.format(project.startDate)}`);
  }
  if (project.targetEndDate !== null) {
    parts.push(`due ${DATE_FORMAT.format(project.targetEndDate)}`);
  }
  parts.push(`${project.progressPct}% complete`);
  return parts.join(', ');
}

interface IProjectsTimelineProps {
  projects: readonly IProjectRow[];
  workspaceSlug: string;
  /** Injectable "today" for deterministic tests. */
  now?: Date;
}

export function ProjectsTimeline({ projects, workspaceSlug, now = new Date() }: IProjectsTimelineProps) {
  const [granularity, setGranularity] = useState<TTimelineGranularity>('month');
  const dayPx = TIMELINE_DAY_PX[granularity];

  const visible = useMemo(
    () => projects.filter((project) => project.lifecycle !== 'deleted'),
    [projects],
  );
  const dated = useMemo(() => visible.filter(isDated), [visible]);
  const undated = useMemo(() => visible.filter((project) => !isDated(project)), [visible]);

  const axis = useMemo(
    () => paddedTimelineAxis(projectsTimelineDates(dated), granularity, now),
    [dated, granularity, now],
  );
  const ticks = useMemo(() => buildTimelineTicks(axis, granularity), [axis, granularity]);

  const trackWidth = axis.days * dayPx;
  const todayOffset = timelineDiffDays(axis.start, timelineDayStart(now)) * dayPx;

  return (
    <div className="flex flex-col gap-4">
      {dated.length > 0 && (
        <>
          <div className="flex items-center justify-end">
            <SegmentedControl
              aria-label="Timeline granularity"
              value={granularity}
              onChange={setGranularity}
              options={GRANULARITY_OPTIONS}
              size="sm"
            />
          </div>
          <div
            className="overflow-x-auto rounded-lg border border-border bg-card"
            role="region"
            aria-label="Projects timeline"
            tabIndex={0}
          >
            <div className="relative" style={{ width: LABEL_COL_PX + trackWidth, minWidth: '100%' }}>
              {/* Axis ticks — decorative; the accessible dates live on each bar's label. */}
              <div className="relative h-7 border-b border-border" aria-hidden="true">
                {ticks.map((tick) => (
                  <span
                    key={String(tick.offsetDays)}
                    className="absolute top-1.5 border-l border-border pl-1.5 text-[11px] text-muted-foreground"
                    style={{ left: LABEL_COL_PX + tick.offsetDays * dayPx }}
                  >
                    {tick.label}
                  </span>
                ))}
                {/* Today marker */}
                <span
                  data-testid="timeline-today"
                  className="absolute top-0 bottom-0 w-px bg-accent/70"
                  style={{ left: LABEL_COL_PX + todayOffset }}
                />
              </div>

              {dated.map((project) => {
                const geometry = barGeometry(project, axis, dayPx);
                return (
                  <div
                    key={project.id}
                    className="relative flex h-11 items-center border-b border-border/60"
                  >
                    <div
                      className="sticky left-0 z-10 flex h-full shrink-0 items-center gap-2 truncate border-r border-border bg-card px-3 text-sm"
                      style={{ width: LABEL_COL_PX }}
                    >
                      <Link
                        to={`/${workspaceSlug}/projects/${project.id}`}
                        className={cn(
                          'max-w-full truncate font-medium text-foreground underline-offset-2 transition-colors hover:text-primary hover:underline',
                          'focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:outline-none',
                        )}
                      >
                        {project.name}
                      </Link>
                      <LifecycleBadge lifecycle={project.lifecycle} />
                    </div>
                    {geometry !== null && (
                      <span
                        role="img"
                        aria-label={barAriaLabel(project)}
                        className="absolute top-1/2 flex h-4 -translate-y-1/2 items-center overflow-hidden rounded-full bg-muted"
                        style={{ left: geometry.left, width: geometry.width }}
                      >
                        {/* Progress overlay — width mirrors progressPct; also stated in the label. */}
                        <span
                          aria-hidden="true"
                          className="h-full rounded-full bg-primary motion-reduce:transition-none"
                          style={{ width: `${Math.min(100, Math.max(0, project.progressPct))}%` }}
                        />
                      </span>
                    )}
                    {/* Trailing percentage so progress never relies on the fill alone. */}
                    {geometry !== null && (
                      <span
                        aria-hidden="true"
                        className="absolute top-1/2 -translate-y-1/2 text-[11px] font-medium text-muted-foreground tabular-nums"
                        style={{ left: geometry.left + geometry.width + 6 }}
                      >
                        {project.progressPct}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {undated.length > 0 && (
        <section aria-labelledby="insights-undated-heading" className="flex flex-col gap-2">
          <h2 id="insights-undated-heading" className="text-sm font-semibold text-foreground">
            No dates set
          </h2>
          <p className="text-sm text-muted-foreground">
            Add a start or target date to place these projects on the timeline.
          </p>
          <ul className="flex flex-col gap-1.5">
            {undated.map((project) => (
              <li
                key={project.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm"
              >
                <Link
                  to={`/${workspaceSlug}/projects/${project.id}`}
                  className={cn(
                    'font-medium text-foreground underline-offset-2 transition-colors hover:text-primary hover:underline',
                    'focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:outline-none',
                  )}
                >
                  {project.name}
                </Link>
                <LifecycleBadge lifecycle={project.lifecycle} />
                <span className="sr-only">
                  {project.name} has no start or target date, so it is not placed on the timeline.
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
