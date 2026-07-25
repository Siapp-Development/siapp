/**
 * Project board (#13, wireframe A3): phase-grouped task list plus the
 * Gantt-style timeline view (D-033). Collapsible phase groups with
 * quick-add; department-restricted tasks the member cannot read appear as
 * dimmed header rows (safe projection via getRestrictedTaskHeaders).
 * Selecting a task opens the detail panel in a right-side drawer (A5).
 */

import { Alert, Button, Drawer, Input, cn } from '@siapp/ui';
import type { TMemberRole, TProjectLifecycle } from '@siapp/shared';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';

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
  usePhases,
  useTasks,
  type IPhaseRow,
  type IRestrictedHeaderRow,
  type ITaskRow,
  type TTaskListRow,
} from './useTasks.ts';

const NO_PHASE = '__none__';

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
  onSelect: () => void;
}

function TaskRowItem({ task, departmentNames, selected, onSelect }: ITaskRowItemProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-muted',
          selected && 'bg-primary-tint',
        )}
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
    </li>
  );
}

interface IRestrictedRowItemProps {
  header: IRestrictedHeaderRow;
  departmentNames: Map<string, string>;
  onSelect: () => void;
}

function RestrictedRowItem({ header, departmentNames, onSelect }: IRestrictedRowItemProps) {
  return (
    <li>
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
}: ITasksSectionProps) {
  const tasksState = useTasks(workspaceId, projectId, role, departments);
  const phasesState = usePhases(workspaceId, projectId);
  const membersState = useMembers(workspaceId);
  const departmentsState = useDepartments(workspaceId);
  const collaboratorsState = useCollaborators(workspaceId);
  const milestonesState = useMilestones(workspaceId, projectId);

  const [view, setView] = useState<'list' | 'timeline'>('list');
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  if (tasksState.status === 'loading' || phasesState.status === 'loading') {
    return <p className="text-sm">Loading tasks…</p>;
  }
  if (tasksState.status === 'error' || phasesState.status === 'error') {
    return <Alert variant="destructive">Tasks could not be loaded.</Alert>;
  }

  const phases = phasesState.rows;
  const phaseIds = new Set(phases.map((phase) => phase.id));
  const grouped = new Map<string, TTaskListRow[]>();
  for (const row of tasksState.rows) {
    const key = row.phaseId !== null && phaseIds.has(row.phaseId) ? row.phaseId : NO_PHASE;
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const selectedRow = tasksState.rows.find((row) => row.id === selectedId) ?? null;
  const visibleTasks = tasksState.rows.filter((row): row is ITaskRow => !row.restricted);

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
        dependsOn: [],
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

  function renderGroup(key: string, phase: IPhaseRow | null): ReactNode {
    const rows = grouped.get(key) ?? [];
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
                      onSelect={() => setSelectedId(row.id)}
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
        />
      ) : (
        <div className="flex flex-col gap-3">
          {phases.map((phase) => renderGroup(phase.id, phase))}
          {renderGroup(NO_PHASE, null)}
          {tasksState.rows.length === 0 && phases.length === 0 && (
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
              allTasks={visibleTasks}
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
