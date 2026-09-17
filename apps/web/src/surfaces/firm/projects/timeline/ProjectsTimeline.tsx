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
  Button,
  SegmentedControl,
  TIMELINE_DAY_PX,
  buildTimelineTicks,
  cn,
  paddedTimelineAxis,
  timelineDayStart,
  timelineDiffDays,
} from '@siapp/ui';
import type { ITimelineAxis, TTimelineGranularity } from '@siapp/ui';
import { Printer } from 'lucide-react';
import { Link } from 'react-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import { LifecycleBadge } from '../LifecycleBadge.tsx';
import { LIFECYCLE_LABELS } from '../projectLabels.ts';
import type { IProjectRow } from '../useProjects.ts';

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
  const first = project.startDate ?? project.targetEndDate;
  const second = project.targetEndDate ?? project.startDate;
  if (first === null || second === null) {
    return null;
  }
  // Normalize the endpoints: input/rules allow a target date earlier than the
  // start, and without this the span would go negative and clamp to a sliver at
  // the later date. Ordering by day-start renders the full stored range instead.
  const firstDay = timelineDayStart(first);
  const secondDay = timelineDayStart(second);
  const barStartDay = Math.min(firstDay, secondDay);
  const barEndDay = Math.max(firstDay, secondDay);
  const leftDays = timelineDiffDays(axis.start, barStartDay);
  const spanDays = timelineDiffDays(barStartDay, barEndDay) + 1;
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
  /**
   * When `true` (default) the component renders its own Print button and the
   * `<style media="print">` isolation block targeting `#insights-timeline-print`
   * — used by the dormant Insights page. When embedded in the Projects page
   * (which owns a single shared Print control) pass `false` to suppress both.
   */
  showInternalPrint?: boolean;
}

export function ProjectsTimeline({
  projects,
  workspaceSlug,
  now = new Date(),
  showInternalPrint = true,
}: IProjectsTimelineProps) {
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

  const scrollRef = useRef<HTMLDivElement>(null);

  /** Scroll the timeline so today's marker is centered horizontally when possible. */
  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({
      left: Math.max(0, LABEL_COL_PX + todayOffset - el.clientWidth / 2),
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [todayOffset]);

  /**
   * Print handler: measure the timeline's full content width and set the
   * `--insights-print-scale` custom property so the whole date range fits one
   * landscape page width (see the <style media="print"> block below). Never
   * upscales (`Math.min(1, …)`). The `scrollWidth > 0` guard keeps jsdom/tests
   * from computing a degenerate scale when layout is unavailable.
   */
  const printTimeline = useCallback(() => {
    const el = scrollRef.current;
    if (el !== null && el.scrollWidth > 0) {
      // Safe landscape content width (A4/Letter, ~8mm margins) at 96dpi.
      const PRINT_TARGET_PX = 980;
      const scale = Math.min(1, PRINT_TARGET_PX / el.scrollWidth);
      el.style.setProperty('--insights-print-scale', String(scale));
    }
    window.print();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      {dated.length > 0 && (
        <>
          {/*
           * Print: this feature prints ONLY the timeline as a clean, LANDSCAPE
           * rendering that is scaled to fit one page width so nothing is cropped.
           *
           * Isolation: `body * { visibility: hidden }` hides the whole app, then
           * the `#insights-timeline-print` subtree is revealed — so the header,
           * snapshot cards, status donut, sidebar, toolbar and the "No dates set"
           * list (all outside this subtree) never appear on paper.
           *
           * Scale-to-fit: `printTimeline` measures the timeline's full content
           * width (`scrollWidth`) and sets `--insights-print-scale` so the entire
           * date range fits the safe landscape content width (PRINT_TARGET_PX ≈
           * 980px at 96dpi for A4/Letter with ~8mm margins). It never upscales.
           *
           * Tailwind has no `@page` utility, so a dependency-free static
           * <style media="print"> is used. v1 does not paginate a very tall
           * timeline horizontally — a tall list may flow onto extra sheets
           * vertically, but the full width is always visible (never cropped).
           */}
          {showInternalPrint && (
            <style media="print">
              {
                '@page { size: landscape; margin: 8mm; }\n' +
                  '@media print {\n' +
                  '  body * { visibility: hidden !important; }\n' +
                  '  #insights-timeline-print, #insights-timeline-print * { visibility: visible !important; }\n' +
                  '  #insights-timeline-print {\n' +
                  '    position: absolute !important; left: 0; top: 0;\n' +
                  '    width: auto !important; max-width: none !important; overflow: visible !important;\n' +
                  '    border: none !important; border-radius: 0 !important;\n' +
                  '    transform: scale(var(--insights-print-scale, 1)); transform-origin: top left;\n' +
                  '  }\n' +
                  '  #insights-timeline-print .timeline-track { min-width: 0 !important; }\n' +
                  '  #insights-timeline-print .timeline-label-col { position: static !important; }\n' +
                  '  #insights-timeline-print * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }\n' +
                  '}'
              }
            </style>
          )}
          <div className="flex items-center justify-between gap-2 print:hidden">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={scrollToToday}>
                Today
              </Button>
              <SegmentedControl
                aria-label="Timeline granularity"
                value={granularity}
                onChange={setGranularity}
                options={GRANULARITY_OPTIONS}
                size="sm"
              />
            </div>
            {showInternalPrint && (
              <Button variant="outline" size="sm" onClick={printTimeline}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                Print
              </Button>
            )}
          </div>
          <div
            ref={scrollRef}
            id="insights-timeline-print"
            className="overflow-x-auto rounded-lg border border-border bg-card print:overflow-visible"
            role="region"
            aria-label="Projects timeline"
            tabIndex={0}
          >
            <div
              className="timeline-track relative print:w-auto print:min-w-0"
              style={{ width: LABEL_COL_PX + trackWidth, minWidth: '100%' }}
            >
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
                    className="relative flex h-11 items-center border-b border-border/60 print:break-inside-avoid"
                  >
                    <div
                      className="timeline-label-col sticky left-0 z-10 flex h-full shrink-0 items-center gap-2 truncate border-r border-border bg-card px-3 text-sm"
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
