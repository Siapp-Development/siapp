/**
 * Gantt-style timeline for the project board (wireframe A3, D-033): task
 * bars grouped by phase, a vertical "today" line, and overdue bars in the
 * warm accent color. A Day/Week/Month granularity switcher rescales the axis
 * (default Months) and the view auto-centers on today. Bars are buttons that
 * open the task-detail drawer and carry an overlapping assignee avatar stack;
 * a "→ Today" control scrolls the viewport to now.
 */

import {
  Avatar,
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
import type { TTaskStatus } from '@siapp/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';

import { TASK_STATUS_LABELS } from './taskLabels.ts';
import type { IPhaseRow, TTaskListRow } from './useTasks.ts';

const LABEL_COL_PX = 224;
const MAX_TIMELINE_AVATARS = 3;

const GRANULARITY_OPTIONS: ReadonlyArray<{ value: TTimelineGranularity; label: string }> = [
  { value: 'day', label: 'Days' },
  { value: 'week', label: 'Weeks' },
  { value: 'month', label: 'Months' },
];

/**
 * Visible range delegated to the shared padded axis: union of everything dated
 * (project bounds + task bars) and today, padded generously per granularity so
 * today is scrollable-to-center with empty past/future to scroll into.
 */
export function timelineRange(
  rows: readonly TTaskListRow[],
  projectStart: Date | null,
  projectEnd: Date | null,
  granularity: TTimelineGranularity,
  today: Date = new Date(),
): ITimelineAxis {
  const dates: number[] = [];
  if (projectStart !== null) {
    dates.push(timelineDayStart(projectStart));
  }
  if (projectEnd !== null) {
    dates.push(timelineDayStart(projectEnd));
  }
  for (const row of rows) {
    if (!row.restricted && row.startDate !== null) {
      dates.push(timelineDayStart(row.startDate));
    }
    if (row.dueDate !== null) {
      dates.push(timelineDayStart(row.dueDate));
    }
  }
  return paddedTimelineAxis(dates, granularity, today);
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
  groupKey: string;
  row: TTaskListRow;
  range: ITimelineAxis;
  dayPx: number;
  memberPhotos: ReadonlyMap<string, string>;
  selected: boolean;
  showDragHandle: boolean;
  dragEnabled: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: ((event: DragEvent<HTMLDivElement>, taskId: string, groupKey: string) => void) | null;
  onHandleKeyDown:
    | ((event: KeyboardEvent<HTMLButtonElement>, taskId: string, groupKey: string) => void)
    | null;
  onDragOver: ((event: DragEvent<HTMLDivElement>, taskId: string, groupKey: string) => void) | null;
  onDrop: ((event: DragEvent<HTMLDivElement>, taskId: string, groupKey: string) => void) | null;
  onDragEnd: (() => void) | null;
  onSelect: () => void;
}

function TimelineTaskRow({
  groupKey,
  row,
  range,
  dayPx,
  memberPhotos,
  selected,
  showDragHandle,
  dragEnabled,
  dragging,
  dropTarget,
  onDragStart,
  onHandleKeyDown,
  onDragOver,
  onDrop,
  onDragEnd,
  onSelect,
}: ITimelineTaskRowProps) {
  const startDate = row.restricted ? row.dueDate : (row.startDate ?? row.dueDate);
  const endDate = row.dueDate ?? startDate;
  const hasBar = startDate !== null && endDate !== null;
  const left = hasBar ? timelineDiffDays(range.start, timelineDayStart(startDate)) * dayPx : 0;
  const width = hasBar
    ? Math.max((timelineDiffDays(timelineDayStart(startDate), timelineDayStart(endDate)) + 1) * dayPx, 12)
    : 0;
  const overdue = isOverdue(row.status, row.dueDate);
  const dueLabel =
    row.dueDate !== null ? ` — due ${row.dueDate.toLocaleDateString()}` : '';

  // Restricted header rows carry no assignees; only real task rows do.
  const assignees = row.restricted ? [] : row.assignees;
  const visibleAssignees = assignees.slice(0, MAX_TIMELINE_AVATARS);
  const overflow = assignees.length - visibleAssignees.length;
  const assigneeLabel =
    assignees.length > 0
      ? `, assigned to ${visibleAssignees.map((assignee) => assignee.name).join(', ')}${
          overflow > 0 ? ` +${overflow}` : ''
        }`
      : '';

  return (
    <div
      id={`timeline-task-row-${row.id}`}
      draggable={dragEnabled}
      onDragStart={
        dragEnabled && onDragStart !== null
          ? (event) => onDragStart(event, row.id, groupKey)
          : undefined
      }
      onDragEnd={dragEnabled ? (onDragEnd ?? undefined) : undefined}
      className={cn(
        'group/row relative flex h-9 items-center border-b border-border/60',
        dropTarget && 'bg-primary-tint/40',
        dragEnabled && 'cursor-grab',
        dragging && 'cursor-grabbing',
      )}
      onDragOver={
        dragEnabled && onDragOver !== null
          ? (event) => onDragOver(event, row.id, groupKey)
          : undefined
      }
      onDrop={
        dragEnabled && onDrop !== null
          ? (event) => onDrop(event, row.id, groupKey)
          : undefined
      }
    >
      <div
        className={cn(
          'sticky left-0 z-10 flex h-full shrink-0 items-center gap-1.5 truncate border-r border-border bg-card pr-3 pl-6 text-sm',
          row.restricted && 'opacity-60',
          selected && 'font-medium',
          dragging && 'opacity-70',
        )}
        style={{ width: LABEL_COL_PX }}
      >
        {showDragHandle && (
          <button
            type="button"
            disabled={!dragEnabled}
            onKeyDown={
              onHandleKeyDown !== null
                ? (event) => onHandleKeyDown(event, row.id, groupKey)
                : undefined
            }
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            aria-label={`Drag to reorder ${row.title}`}
            id={`timeline-reorder-handle-${row.id}`}
            className={cn(
              'inline-flex h-6 w-5 shrink-0 items-center justify-center rounded-sm text-xs text-muted-foreground transition-opacity hover:text-foreground disabled:cursor-not-allowed',
              'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100',
              'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:outline-none',
              dragEnabled && 'cursor-grab',
              dragging && 'cursor-grabbing',
            )}
          >
            <span aria-hidden="true" className="leading-none">
              ⋮⋮
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={onSelect}
          className={cn(
            'max-w-full truncate text-left underline-offset-2 transition-colors hover:text-primary hover:underline',
            'focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:outline-none',
          )}
          aria-label={`Open task details for ${row.title}`}
        >
          {row.title}
        </button>
        {row.restricted && (
          <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
            Restricted
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${row.title} — ${TASK_STATUS_LABELS[row.status]}${overdue ? ', overdue' : ''}${dueLabel}${assigneeLabel}`}
        className={cn(
          'absolute top-1/2 h-4 -translate-y-1/2 cursor-pointer rounded-full transition duration-150 hover:brightness-95 hover:shadow-sm',
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
      {hasBar && assignees.length > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center -space-x-1.5"
          style={{ left: LABEL_COL_PX + left + width + 4 }}
        >
          {visibleAssignees.map((assignee) => (
            <Avatar
              key={`${assignee.type}-${assignee.id}`}
              size="xs"
              name={assignee.name}
              seed={assignee.id}
              photoUrl={assignee.type === 'user' ? memberPhotos.get(assignee.id) : undefined}
              aria-hidden="true"
              className="ring-2 ring-card"
            />
          ))}
          {overflow > 0 && (
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[0.625rem] font-semibold text-muted-foreground ring-2 ring-card">
              +{overflow}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export interface ITimelineViewProps {
  phases: readonly IPhaseRow[];
  /** Phase id (or null-phase key) → rows, same grouping as the list view. */
  grouped: ReadonlyMap<string, TTaskListRow[]>;
  noPhaseKey: string;
  memberPhotos: ReadonlyMap<string, string>;
  projectStart: Date | null;
  projectEnd: Date | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  canEdit: boolean;
  reorderPendingByGroup: ReadonlySet<string>;
  activeDrag: { taskId: string; groupKey: string } | null;
  dropTargetByGroup: Readonly<Record<string, string | null>>;
  onDragStartTask: (event: DragEvent<HTMLDivElement>, taskId: string, groupKey: string) => void;
  onHandleKeyDownTask: (
    event: KeyboardEvent<HTMLButtonElement>,
    taskId: string,
    groupKey: string,
  ) => void;
  onDragOverTask: (event: DragEvent<HTMLDivElement>, taskId: string, groupKey: string) => void;
  onDropTask: (event: DragEvent<HTMLDivElement>, taskId: string, groupKey: string) => void;
  onDragEndTask: () => void;
}

export function TimelineView({
  phases,
  grouped,
  noPhaseKey,
  memberPhotos,
  projectStart,
  projectEnd,
  selectedId,
  onSelect,
  canEdit,
  reorderPendingByGroup,
  activeDrag,
  dropTargetByGroup,
  onDragStartTask,
  onHandleKeyDownTask,
  onDragOverTask,
  onDropTask,
  onDragEndTask,
}: ITimelineViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [granularity, setGranularity] = useState<TTimelineGranularity>('month');
  const dayPx = TIMELINE_DAY_PX[granularity];

  const allRows = useMemo(() => [...grouped.values()].flat(), [grouped]);
  const range = useMemo(
    () => timelineRange(allRows, projectStart, projectEnd, granularity),
    [allRows, projectStart, projectEnd, granularity],
  );
  const chartWidth = LABEL_COL_PX + range.days * dayPx;
  const todayOffset = timelineDiffDays(range.start, timelineDayStart(new Date())) * dayPx;
  const ticks = useMemo(() => buildTimelineTicks(range, granularity), [range, granularity]);

  const centerToday = useCallback(
    (instant: boolean): void => {
      const container = scrollRef.current;
      if (container !== null) {
        container.scrollTo({
          left: Math.max(0, LABEL_COL_PX + todayOffset - container.clientWidth / 2),
          behavior: instant ? 'auto' : 'smooth',
        });
      }
    },
    [todayOffset],
  );

  // Center on today on mount and whenever the granularity (and thus axis) changes.
  useEffect(() => {
    centerToday(true);
  }, [centerToday]);

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
      <div className="flex items-center justify-between gap-3">
        <SegmentedControl
          aria-label="Timeline granularity"
          value={granularity}
          onChange={setGranularity}
          options={GRANULARITY_OPTIONS}
          size="sm"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => centerToday(false)}>
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
          {/* Axis ticks */}
          <div className="relative h-7 border-b border-border" aria-hidden="true">
            {ticks.map((tick) => (
              <span
                key={tick.label + String(tick.offsetDays)}
                className="absolute top-1.5 border-l border-border pl-1.5 text-[11px] text-muted-foreground"
                style={{ left: LABEL_COL_PX + tick.offsetDays * dayPx }}
              >
                {tick.label}
              </span>
            ))}
          </div>

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
                  groupKey={group.key}
                  row={row}
                  range={range}
                  dayPx={dayPx}
                  memberPhotos={memberPhotos}
                  selected={row.id === selectedId}
                  showDragHandle={canEdit && !row.restricted}
                  dragEnabled={canEdit && !row.restricted && !reorderPendingByGroup.has(group.key)}
                  dragging={activeDrag?.groupKey === group.key && activeDrag.taskId === row.id}
                  dropTarget={
                    activeDrag?.groupKey === group.key &&
                    activeDrag.taskId !== row.id &&
                    dropTargetByGroup[group.key] === row.id
                  }
                  onDragStart={onDragStartTask}
                  onHandleKeyDown={onHandleKeyDownTask}
                  onDragOver={onDragOverTask}
                  onDrop={onDropTask}
                  onDragEnd={onDragEndTask}
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
