/**
 * Project board (#13, wireframe A3): phase-grouped task list plus the
 * Gantt-style timeline view (D-033). Collapsible phase groups with
 * quick-add; department-restricted tasks the member cannot read appear as
 * dimmed header rows (safe projection via getRestrictedTaskHeaders).
 * Selecting a task opens the detail panel in a right-side drawer (A5).
 */

import { Alert, Button, Drawer, Input, cn } from '@siapp/ui';
import type { TMemberRole, TProjectLifecycle } from '@siapp/shared';
import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { useDepartments, useMembers } from '../../settings/useTeamData.ts';
import { useCollaborators } from '../../collaborators/useCollaborators.ts';
import { useMilestones } from '../milestones/useMilestones.ts';
import { TaskDetailPanel } from './TaskDetailPanel.tsx';
import { TASK_STATUS_LABELS } from './taskLabels.ts';
import { TaskStatusBadge } from './TaskStatusBadge.tsx';
import { TimelineView } from './TimelineView.tsx';
import {
  createPhase,
  createTask,
  reorderTasks,
  usePhases,
  useTasks,
  type IPhaseRow,
  type IRestrictedHeaderRow,
  type ITaskRow,
  type TTaskListRow,
} from './useTasks.ts';

const NO_PHASE = '__none__';
const EMPTY_PHASES: readonly IPhaseRow[] = [];
const EMPTY_TASK_ROWS: readonly TTaskListRow[] = [];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((part) => part !== '')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function isOverdue(task: ITaskRow): boolean {
  return task.dueDate !== null && task.status !== 'done' && task.dueDate.getTime() < Date.now();
}

interface ITaskRowItemProps {
  task: ITaskRow;
  departmentNames: Map<string, string>;
  selected: boolean;
  highlighted: boolean;
  onSelect: () => void;
  showDragHandle: boolean;
  dragEnabled: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onDragStart: ((event: DragEvent<HTMLDivElement>) => void) | null;
  onDragEnd: (() => void) | null;
  onHandleKeyDown: ((event: KeyboardEvent<HTMLButtonElement>) => void) | null;
  onDragOver: ((event: DragEvent<HTMLLIElement>) => void) | null;
  onDrop: ((event: DragEvent<HTMLLIElement>) => void) | null;
}

function TaskRowItem({
  task,
  departmentNames,
  selected,
  highlighted,
  onSelect,
  showDragHandle,
  dragEnabled,
  dragging,
  dropTarget,
  onDragStart,
  onDragEnd,
  onHandleKeyDown,
  onDragOver,
  onDrop,
}: ITaskRowItemProps) {
  return (
    <li
      id={`task-row-${task.id}`}
      onDragOver={onDragOver ?? undefined}
      onDrop={onDrop ?? undefined}
      className={cn(
        'border-b border-border/70 last:border-b-0',
        highlighted && 'bg-warning/10 ring-1 ring-warning/40',
        dropTarget && 'bg-primary-tint/60',
      )}
    >
      <div
        draggable={dragEnabled}
        onDragStart={onDragStart ?? undefined}
        onDragEnd={onDragEnd ?? undefined}
        className={cn(
          'group flex items-start gap-2 rounded-md px-3 py-2.5 text-sm transition-colors duration-150 hover:bg-muted',
          selected && 'bg-primary-tint',
          dragEnabled && 'cursor-grab',
          dragging && 'cursor-grabbing opacity-60',
        )}
      >
        {showDragHandle && (
          <button
            type="button"
            disabled={!dragEnabled}
            onKeyDown={onHandleKeyDown ?? undefined}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            aria-label={`Drag to reorder ${task.title}`}
            id={`task-reorder-handle-${task.id}`}
            className={cn(
              'mt-0.5 inline-flex h-7 w-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-opacity hover:text-foreground disabled:cursor-not-allowed',
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
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
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left"
        >
          <span className="min-w-40 flex-1 font-medium">{task.title}</span>
          <TaskStatusBadge status={task.status} />
          {task.assignees.length > 0 && (
            <span className="flex gap-1" aria-label="Assignees">
              {task.assignees.map((assignee) => (
                <span
                  key={`${assignee.type}-${assignee.id}`}
                  title={assignee.name}
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-tint text-xs font-medium text-primary-deep"
                >
                  {initials(assignee.name)}
                </span>
              ))}
            </span>
          )}
          {task.dueDate !== null && (
            <span
              className={cn(
                'text-xs',
                isOverdue(task) ? 'font-medium text-danger' : 'text-muted-foreground',
              )}
            >
              Due {task.dueDate.toLocaleDateString()}
            </span>
          )}
          {task.restrictedToDepartments.length > 0 && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              Restricted ·{' '}
              {task.restrictedToDepartments
                .map((dep) => departmentNames.get(dep) ?? dep)
                .join(', ')}
            </span>
          )}
        </button>
      </div>
    </li>
  );
}

interface IActiveDrag {
  taskId: string;
  groupKey: string;
}

interface IDragStartPayload {
  taskId: string;
  groupKey: string;
  event: DragEvent<HTMLElement>;
}

function isReadableTask(row: TTaskListRow): row is ITaskRow {
  return !row.restricted;
}

function moveTaskWithinRows(
  rows: readonly ITaskRow[],
  fromTaskId: string,
  toTaskId: string,
): readonly ITaskRow[] {
  const sourceIndex = rows.findIndex((row) => row.id === fromTaskId);
  const targetIndex = rows.findIndex((row) => row.id === toTaskId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
    return rows;
  }
  const nextRows = [...rows];
  const [moved] = nextRows.splice(sourceIndex, 1);
  if (moved === undefined) {
    return rows;
  }
  nextRows.splice(targetIndex, 0, moved);
  return nextRows;
}

function moveTaskByOffset(
  rows: readonly ITaskRow[],
  taskId: string,
  offset: number,
): readonly ITaskRow[] {
  const sourceIndex = rows.findIndex((row) => row.id === taskId);
  if (sourceIndex < 0) {
    return rows;
  }
  const targetIndex = sourceIndex + offset;
  if (targetIndex < 0 || targetIndex >= rows.length) {
    return rows;
  }
  const nextRows = [...rows];
  const [moved] = nextRows.splice(sourceIndex, 1);
  if (moved === undefined) {
    return rows;
  }
  nextRows.splice(targetIndex, 0, moved);
  return nextRows;
}

function focusReorderHandle(taskId: string, view: 'list' | 'timeline'): void {
  const handleId =
    view === 'list' ? `task-reorder-handle-${taskId}` : `timeline-reorder-handle-${taskId}`;
  const handle = document.getElementById(handleId);
  if (handle instanceof HTMLButtonElement) {
    handle.focus();
  }
}

interface IRestrictedRowItemProps {
  header: IRestrictedHeaderRow;
  departmentNames: Map<string, string>;
  onSelect: () => void;
}

function RestrictedRowItem({ header, departmentNames, onSelect }: IRestrictedRowItemProps) {
  return (
    <li className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 text-left text-sm opacity-60 hover:bg-muted"
      >
        <span className="min-w-40 flex-1">{header.title}</span>
        <span className="text-muted-foreground">{TASK_STATUS_LABELS[header.status]}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
          Restricted ·{' '}
          {header.restrictedToDepartments.map((dep) => departmentNames.get(dep) ?? dep).join(', ')}
        </span>
      </button>
    </li>
  );
}

interface IQuickAddTaskProps {
  onAdd: (title: string) => Promise<void>;
}

function QuickAddTask({ onAdd }: IQuickAddTaskProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = title.trim();
    if (trimmed === '' || trimmed.length > 200) {
      return;
    }
    setPending(true);
    try {
      await onAdd(trimmed);
      setTitle('');
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        + Add task
      </Button>
    );
  }
  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex gap-2 px-3 py-1">
      <Input
        aria-label="New task title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Task title"
        className="h-8 max-w-80"
        autoFocus
      />
      <Button type="submit" size="sm" disabled={pending}>
        Add
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </form>
  );
}

export interface ITasksSectionProps {
  workspaceId: string;
  projectId: string;
  role: TMemberRole;
  departments: string[];
  uid: string;
  userName: string;
  /** Project-level edit gate (draft/published + role, from the detail page). */
  canEdit: boolean;
  /** Project lifecycle — collab task links need published/completed (#22). */
  lifecycle: TProjectLifecycle;
  /** Project schedule bounds — anchor the timeline view's visible range. */
  projectStartDate: Date | null;
  projectTargetDate: Date | null;
  /** Optional URL-driven task target (`?task=`) for deep-link opening. */
  deepLinkedTaskId?: string | null;
  /** Report drawer/task selection changes back to URL state. */
  onSelectedTaskChange?: (taskId: string | null) => void;
}

export function TasksSection({
  workspaceId,
  projectId,
  role,
  departments,
  uid,
  userName,
  canEdit,
  lifecycle,
  projectStartDate,
  projectTargetDate,
  deepLinkedTaskId = null,
  onSelectedTaskChange,
}: ITasksSectionProps) {
  const tasksState = useTasks(workspaceId, projectId, role, departments);
  const phasesState = usePhases(workspaceId, projectId);
  const membersState = useMembers(workspaceId);
  const departmentsState = useDepartments(workspaceId);
  const collaboratorsState = useCollaborators(workspaceId);
  const milestonesState = useMilestones(workspaceId, projectId);

  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(deepLinkedTaskId);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [reorderPendingByGroup, setReorderPendingByGroup] = useState<ReadonlySet<string>>(new Set());
  const [activeDrag, setActiveDrag] = useState<IActiveDrag | null>(null);
  const [dropTargetByGroup, setDropTargetByGroup] = useState<Readonly<Record<string, string | null>>>({});
  const [addingPhase, setAddingPhase] = useState(false);
  const [phaseName, setPhaseName] = useState('');
  const [phasePending, setPhasePending] = useState(false);

  const departmentRows = departmentsState.status === 'ready' ? departmentsState.rows : [];
  const departmentNames = useMemo(
    () =>
      new Map(
        (departmentsState.status === 'ready' ? departmentsState.rows : []).map((dep) => [
          dep.id,
          dep.name,
        ]),
      ),
    [departmentsState],
  );
  const members = membersState.status === 'ready' ? membersState.rows : [];
  const collaborators = collaboratorsState.status === 'ready' ? collaboratorsState.rows : [];

  const isLoading = tasksState.status === 'loading' || phasesState.status === 'loading';
  const hasError = tasksState.status === 'error' || phasesState.status === 'error';

  const phases = phasesState.status === 'ready' ? phasesState.rows : EMPTY_PHASES;
  const taskRows = tasksState.status === 'ready' ? tasksState.rows : EMPTY_TASK_ROWS;
  const phaseIds = useMemo(() => new Set(phases.map((phase) => phase.id)), [phases]);
  const grouped = useMemo(() => {
    const next = new Map<string, TTaskListRow[]>();
    for (const row of taskRows) {
      const key = row.phaseId !== null && phaseIds.has(row.phaseId) ? row.phaseId : NO_PHASE;
      const list = next.get(key) ?? [];
      list.push(row);
      next.set(key, list);
    }
    return next;
  }, [taskRows, phaseIds]);
  const selectedRow = taskRows.find((row) => row.id === selectedId) ?? null;

  useEffect(() => {
    onSelectedTaskChange?.(selectedId);
  }, [selectedId, onSelectedTaskChange]);

  useEffect(() => {
    if (tasksState.status !== 'ready' || phasesState.status !== 'ready') {
      return;
    }
    if (deepLinkedTaskId === null || deepLinkedTaskId === '') {
      return;
    }
    const target = taskRows.find((row) => row.id === deepLinkedTaskId);
    if (target === undefined) {
      onSelectedTaskChange?.(null);
      return;
    }
    const groupKey = target.phaseId !== null && phaseIds.has(target.phaseId) ? target.phaseId : NO_PHASE;
    setCollapsed((prev) => {
      if (!prev.has(groupKey)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(groupKey);
      return next;
    });
    setSelectedId(deepLinkedTaskId);
    setHighlightId(deepLinkedTaskId);
    const timeoutId = window.setTimeout(() => {
      setHighlightId((current) => (current === deepLinkedTaskId ? null : current));
    }, 2500);
    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rowEl = document.getElementById(`task-row-${deepLinkedTaskId}`);
    if (rowEl !== null && typeof rowEl.scrollIntoView === 'function') {
      rowEl.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center' });
    }

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [deepLinkedTaskId, taskRows, phaseIds, onSelectedTaskChange, tasksState.status, phasesState.status]);

  useEffect(() => {
    if (activeDrag === null) {
      return;
    }
    const groupRows = (grouped.get(activeDrag.groupKey) ?? []).filter(isReadableTask);
    const dragTaskExists = groupRows.some((row) => row.id === activeDrag.taskId);
    if (!dragTaskExists) {
      setActiveDrag(null);
      setDropTargetByGroup({});
    }
  }, [activeDrag, grouped]);

  if (isLoading) {
    return <p className="text-sm">Loading tasks…</p>;
  }
  if (hasError) {
    return <Alert variant="destructive">Tasks could not be loaded.</Alert>;
  }

  function toggleGroup(key: string): void {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleAddTask(phaseId: string | null, title: string): Promise<void> {
    const groupRows = grouped.get(phaseId ?? NO_PHASE) ?? [];
    const order = groupRows.reduce((max, row) => Math.max(max, row.order), 0) + 1;
    const id = await createTask(
      workspaceId,
      projectId,
      {
        title,
        description: '',
        phaseId,
        status: 'todo',
        startDate: null,
        dueDate: null,
        assignees: [],
        visibleToClient: false,
        restrictedToDepartments: [],
        sendWhatsapp: false,
        collaboratorCanSeeAllAttachments: true,
      },
      order,
      uid,
    );
    setSelectedId(id);
  }

  async function handleAddPhase(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = phaseName.trim();
    if (trimmed === '' || trimmed.length > 80) {
      return;
    }
    setPhasePending(true);
    try {
      const order = phases.reduce((max, phase) => Math.max(max, phase.order), 0) + 1;
      await createPhase(workspaceId, projectId, trimmed, order);
      setPhaseName('');
      setAddingPhase(false);
    } finally {
      setPhasePending(false);
    }
  }

  async function persistGroupOrder(groupKey: string, rows: readonly ITaskRow[]): Promise<void> {
    setReorderPendingByGroup((prev) => new Set(prev).add(groupKey));
    try {
      await reorderTasks(
        workspaceId,
        projectId,
        rows.map((row) => row.id),
        uid,
      );
    } finally {
      setReorderPendingByGroup((prev) => {
        const next = new Set(prev);
        next.delete(groupKey);
        return next;
      });
    }
  }

  function clearDragState(): void {
    setActiveDrag(null);
    setDropTargetByGroup({});
  }

  function canDragInGroup(groupKey: string): boolean {
    return canEdit && !reorderPendingByGroup.has(groupKey);
  }

  function handleDragStart({ taskId, groupKey, event }: IDragStartPayload): void {
    if (!canDragInGroup(groupKey)) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', taskId);
    setActiveDrag({ taskId, groupKey });
    setDropTargetByGroup((prev) => ({ ...prev, [groupKey]: null }));
  }

  function handleDragOver(event: DragEvent<HTMLElement>, groupKey: string, targetTaskId: string): void {
    if (activeDrag === null || activeDrag.groupKey !== groupKey || !canDragInGroup(groupKey)) {
      return;
    }
    if (activeDrag.taskId === targetTaskId) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropTargetByGroup((prev) => {
      if (prev[groupKey] === targetTaskId) {
        return prev;
      }
      return { ...prev, [groupKey]: targetTaskId };
    });
  }

  async function handleDrop(groupKey: string, targetTaskId: string): Promise<void> {
    if (activeDrag === null || activeDrag.groupKey !== groupKey || !canDragInGroup(groupKey)) {
      clearDragState();
      return;
    }
    const rows = (grouped.get(groupKey) ?? []).filter(isReadableTask);
    const reordered = moveTaskWithinRows(rows, activeDrag.taskId, targetTaskId);
    clearDragState();
    if (reordered === rows) {
      return;
    }
    await persistGroupOrder(groupKey, reordered);
  }

  async function handleKeyboardReorder(
    event: KeyboardEvent<HTMLButtonElement>,
    groupKey: string,
    taskId: string,
  ): Promise<void> {
    if (!canDragInGroup(groupKey)) {
      return;
    }
    const offset =
      event.key === 'ArrowUp'
        ? -1
        : event.key === 'ArrowDown'
          ? 1
          : null;
    if (offset === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const rows = (grouped.get(groupKey) ?? []).filter(isReadableTask);
    const reordered = moveTaskByOffset(rows, taskId, offset);
    if (reordered === rows) {
      return;
    }
    await persistGroupOrder(groupKey, reordered);
    window.requestAnimationFrame(() => {
      focusReorderHandle(taskId, view);
    });
  }

  function renderGroup(key: string, phase: IPhaseRow | null): ReactNode {
    const rows = grouped.get(key) ?? [];
    const pendingReorder = reorderPendingByGroup.has(key);
    const dragEnabled = canEdit && !pendingReorder;
    const dropTargetTaskId = dropTargetByGroup[key] ?? null;
    if (phase === null && rows.length === 0 && !canEdit) {
      return null;
    }
    const doneCount = rows.filter((row) => !row.restricted && row.status === 'done').length;
    const isCollapsed = collapsed.has(key);
    const label = phase !== null ? phase.name : 'No phase';
    return (
      <section key={key} aria-label={label}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleGroup(key)}
            aria-expanded={!isCollapsed}
            className="flex items-center gap-2 py-1 text-sm font-semibold hover:text-primary"
          >
            <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
            {label}
            <span className="font-normal text-muted-foreground">
              · {rows.length} {rows.length === 1 ? 'task' : 'tasks'} · {doneCount} done
            </span>
          </button>
        </div>
        {!isCollapsed && (
          <>
            {rows.length > 0 && (
              <ul className="flex flex-col">
                {rows.map((row) =>
                  row.restricted ? (
                    <RestrictedRowItem
                      key={row.id}
                      header={row}
                      departmentNames={departmentNames}
                      onSelect={() => setSelectedId(row.id)}
                    />
                  ) : (
                    <TaskRowItem
                      key={row.id}
                      task={row}
                      departmentNames={departmentNames}
                      selected={row.id === selectedId}
                      highlighted={row.id === highlightId}
                      onSelect={() => setSelectedId(row.id)}
                      showDragHandle={canEdit}
                      dragEnabled={dragEnabled}
                      dragging={
                        activeDrag?.groupKey === key && activeDrag.taskId === row.id
                      }
                      dropTarget={
                        activeDrag?.groupKey === key &&
                        activeDrag.taskId !== row.id &&
                        dropTargetTaskId === row.id
                      }
                      onDragStart={
                        dragEnabled
                          ? (event) => handleDragStart({ taskId: row.id, groupKey: key, event })
                          : null
                      }
                      onDragEnd={dragEnabled ? clearDragState : null}
                      onHandleKeyDown={
                        dragEnabled
                          ? (event) => {
                              void handleKeyboardReorder(event, key, row.id);
                            }
                          : null
                      }
                      onDragOver={
                        dragEnabled
                          ? (event) => handleDragOver(event, key, row.id)
                          : null
                      }
                      onDrop={
                        dragEnabled
                          ? (event) => {
                              event.preventDefault();
                              void handleDrop(key, row.id);
                            }
                          : null
                      }
                    />
                  ),
                )}
              </ul>
            )}
            {canEdit && (
              <QuickAddTask onAdd={(title) => handleAddTask(phase?.id ?? null, title)} />
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Board view"
          className="flex rounded-md border border-border p-0.5"
        >
          {(
            [
              { id: 'list', label: 'List' },
              { id: 'timeline', label: 'Timeline' },
            ] as const
          ).map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={view === entry.id}
              onClick={() => setView(entry.id)}
              className={cn(
                'rounded px-3 py-1 text-sm transition-colors duration-150',
                view === entry.id
                  ? 'bg-primary-tint font-medium text-primary-deep'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'timeline' ? (
        <TimelineView
          phases={phases}
          grouped={grouped}
          noPhaseKey={NO_PHASE}
          milestones={milestonesState.status === 'ready' ? milestonesState.rows : []}
          projectStart={projectStartDate}
          projectEnd={projectTargetDate}
          selectedId={selectedId}
          onSelect={setSelectedId}
          canEdit={canEdit}
          reorderPendingByGroup={reorderPendingByGroup}
          activeDrag={activeDrag}
          dropTargetByGroup={dropTargetByGroup}
          onDragStartTask={(event, taskId, groupKey) =>
            handleDragStart({ taskId, groupKey, event })
          }
          onDragOverTask={(event, taskId, groupKey) => handleDragOver(event, groupKey, taskId)}
          onDropTask={(event, taskId, groupKey) => {
            event.preventDefault();
            void handleDrop(groupKey, taskId);
          }}
          onDragEndTask={clearDragState}
          onHandleKeyDownTask={(event, taskId, groupKey) => {
            void handleKeyboardReorder(event, groupKey, taskId);
          }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {phases.map((phase) => renderGroup(phase.id, phase))}
          {renderGroup(NO_PHASE, null)}
          {taskRows.length === 0 && phases.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No tasks yet.{canEdit && ' Add a phase or a task to get started.'}
            </p>
          )}
        </div>
      )}

      {canEdit &&
        view === 'list' &&
        (addingPhase ? (
          <form onSubmit={(event) => void handleAddPhase(event)} className="flex gap-2">
            <Input
              aria-label="New phase name"
              value={phaseName}
              onChange={(event) => setPhaseName(event.target.value)}
              placeholder="Phase name"
              className="h-8 max-w-80"
              autoFocus
            />
            <Button type="submit" size="sm" disabled={phasePending}>
              Add phase
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAddingPhase(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setAddingPhase(true)}
          >
            + Add phase
          </Button>
        ))}

      <Drawer
        open={selectedRow !== null}
        onClose={() => setSelectedId(null)}
        aria-label={selectedRow !== null ? `Task: ${selectedRow.title}` : 'Task detail'}
      >
        {selectedRow !== null &&
          (selectedRow.restricted ? (
            <div className="p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold">Restricted task</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedId(null)}
                >
                  Close
                </Button>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">
                This task contains restricted content visible to:{' '}
                {selectedRow.restrictedToDepartments
                  .map((dep) => departmentNames.get(dep) ?? dep)
                  .join(', ')}
                . Ask an admin for access if you need it.
              </p>
            </div>
          ) : (
            <TaskDetailPanel
              key={selectedRow.id}
              workspaceId={workspaceId}
              projectId={projectId}
              task={selectedRow}
              phases={phases}
              members={members}
              collaborators={collaborators}
              departments={departmentRows}
              role={role}
              memberDepartments={departments}
              lifecycle={lifecycle}
              canEdit={canEdit}
              uid={uid}
              userName={userName}
              onClose={() => setSelectedId(null)}
              onDeleted={() => {
                setSelectedId(null);
                tasksState.refreshRestricted();
              }}
            />
          ))}
      </Drawer>
    </div>
  );
}
