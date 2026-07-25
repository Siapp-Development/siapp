import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TASK_NOTIFY_DEFAULTS } from '@siapp/shared';

import type { TTasksState, TPhasesState, ITaskRow, IRestrictedHeaderRow } from './useTasks.ts';

const tasksData = vi.hoisted(() => ({
  tasksState: { status: 'loading' } as TTasksState,
  phasesState: { status: 'loading' } as TPhasesState,
  refreshRestricted: vi.fn(),
  createTask: vi.fn(),
  createPhase: vi.fn(),
}));
vi.mock('./useTasks.ts', () => ({
  useTasks: () => ({ ...tasksData.tasksState, refreshRestricted: tasksData.refreshRestricted }),
  usePhases: () => tasksData.phasesState,
  createTask: tasksData.createTask,
  createPhase: tasksData.createPhase,
}));

vi.mock('../../settings/useTeamData.ts', () => ({
  useMembers: () => ({ status: 'ready', rows: [] }),
  useDepartments: () => ({
    status: 'ready',
    rows: [{ id: 'dep-fin', name: 'Finance', memberCount: 1 }],
  }),
}));

vi.mock('../../collaborators/useCollaborators.ts', () => ({
  useCollaborators: () => ({ status: 'ready', rows: [] }),
}));

const milestonesData = vi.hoisted(() => ({
  state: { status: 'ready', rows: [] } as unknown,
}));
vi.mock('../milestones/useMilestones.ts', () => ({
  useMilestones: () => milestonesData.state,
}));

vi.mock('./TaskDetailPanel.tsx', () => ({
  TaskDetailPanel: (props: { task: { id: string } }) => (
    <div data-testid="task-detail-panel" data-task-id={props.task.id} />
  ),
}));

import { TasksSection } from './TasksSection.tsx';

function taskRow(overrides: Partial<ITaskRow> = {}): ITaskRow {
  return {
    restricted: false,
    id: 't1',
    title: 'Pour foundation',
    description: '',
    phaseId: null,
    status: 'todo',
    startDate: null,
    dueDate: null,
    completedAt: null,
    assignees: [],
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    notify: { ...TASK_NOTIFY_DEFAULTS },
    dependsOn: [],
    order: 1,
    createdBy: 'u1',
    blockedReason: '',
    ...overrides,
  };
}

function restrictedRow(overrides: Partial<IRestrictedHeaderRow> = {}): IRestrictedHeaderRow {
  return {
    restricted: true,
    id: 'tr1',
    title: 'Payment schedule',
    status: 'todo',
    phaseId: null,
    dueDate: null,
    order: 9,
    restrictedToDepartments: ['dep-fin'],
    ...overrides,
  };
}

function renderSection(overrides: Partial<Parameters<typeof TasksSection>[0]> = {}) {
  return render(
    <TasksSection
      workspaceId="wksA"
      projectId="p1"
      role="pm"
      departments={[]}
      uid="u1"
      userName="Alice Tan"
      canEdit
      lifecycle="published"
      projectStartDate={null}
      projectTargetDate={null}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  milestonesData.state = { status: 'ready', rows: [] };
  tasksData.phasesState = {
    status: 'ready',
    rows: [
      { id: 'ph1', name: 'Site prep', order: 1, startDate: null, endDate: null, status: 'todo' },
    ],
  };
  tasksData.tasksState = { status: 'ready', rows: [] };
});

describe('TasksSection', () => {
  it('groups tasks by phase with counts and supports collapsing', async () => {
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({ id: 't1', phaseId: 'ph1', status: 'done', order: 1 }),
        taskRow({ id: 't2', phaseId: 'ph1', title: 'Clear debris', order: 2 }),
        taskRow({ id: 't3', title: 'Loose task', order: 1 }),
      ],
    };
    renderSection();

    expect(
      screen.getByRole('button', { name: /site prep · 2 tasks · 1 done/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no phase · 1 task · 0 done/i })).toBeInTheDocument();
    expect(screen.getByText('Clear debris')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /site prep/i }));
    expect(screen.queryByText('Clear debris')).not.toBeInTheDocument();
    expect(screen.getByText('Loose task')).toBeInTheDocument();
  });

  it('quick-adds a task with order max+1 within the phase', async () => {
    tasksData.tasksState = {
      status: 'ready',
      rows: [taskRow({ id: 't1', phaseId: 'ph1', order: 4 })],
    };
    tasksData.createTask.mockResolvedValue('t-new');
    renderSection();

    const addButtons = screen.getAllByRole('button', { name: '+ Add task' });
    await userEvent.click(addButtons[0]!);
    await userEvent.type(screen.getByLabelText('New task title'), 'Order rebar');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));

    expect(tasksData.createTask).toHaveBeenCalledWith(
      'wksA',
      'p1',
      expect.objectContaining({ title: 'Order rebar', phaseId: 'ph1', status: 'todo' }),
      5,
      'u1',
    );
  });

  it('adds a phase with order max+1', async () => {
    tasksData.createPhase.mockResolvedValue('ph-new');
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: '+ Add phase' }));
    await userEvent.type(screen.getByLabelText('New phase name'), 'Finishing');
    await userEvent.click(screen.getByRole('button', { name: 'Add phase' }));

    expect(tasksData.createPhase).toHaveBeenCalledWith('wksA', 'p1', 'Finishing', 2);
  });

  it('hides all add/edit affordances when canEdit is false', () => {
    tasksData.tasksState = { status: 'ready', rows: [taskRow({ phaseId: 'ph1' })] };
    renderSection({ canEdit: false, role: 'viewer' });

    expect(screen.queryByRole('button', { name: '+ Add task' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add phase' })).not.toBeInTheDocument();
  });

  it('marks overdue tasks with destructive colouring', () => {
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({ id: 't1', phaseId: 'ph1', dueDate: new Date('2020-01-01T00:00:00') }),
        taskRow({
          id: 't2',
          phaseId: 'ph1',
          title: 'Done long ago',
          status: 'done',
          dueDate: new Date('2020-01-01T00:00:00'),
          order: 2,
        }),
      ],
    };
    renderSection();

    const labels = screen.getAllByText(/due 1\/1\/2020/i);
    expect(labels[0]).toHaveClass('text-danger');
    expect(labels[1]).not.toHaveClass('text-danger');
  });

  it('shows restricted rows dimmed and an access explainer when selected', async () => {
    tasksData.tasksState = { status: 'ready', rows: [restrictedRow()] };
    renderSection();

    const row = screen.getByRole('button', { name: /payment schedule/i });
    expect(row.className).toContain('opacity-60');
    expect(screen.getByText(/restricted · finance/i)).toBeInTheDocument();

    await userEvent.click(row);
    expect(
      screen.getByText(/restricted content visible to: finance/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('task-detail-panel')).not.toBeInTheDocument();
  });

  it('opens the detail panel for readable tasks', async () => {
    tasksData.tasksState = { status: 'ready', rows: [taskRow({ phaseId: 'ph1' })] };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /pour foundation/i }));
    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 't1');
  });

  it('opens the detail panel in a modal drawer and closes it on Escape', async () => {
    tasksData.tasksState = { status: 'ready', rows: [taskRow({ phaseId: 'ph1' })] };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /pour foundation/i }));
    const dialog = screen.getByRole('dialog', { name: 'Task: Pour foundation' });
    expect(dialog).toContainElement(screen.getByTestId('task-detail-panel'));

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('task-detail-panel')).not.toBeInTheDocument();
  });

  it('switches to the timeline view with bars, milestones and a today line', async () => {
    const due = new Date();
    due.setDate(due.getDate() + 10);
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({
          id: 't1',
          phaseId: 'ph1',
          startDate: new Date(),
          dueDate: due,
          status: 'in_progress',
        }),
      ],
    };
    milestonesData.state = {
      status: 'ready',
      rows: [{ id: 'm1', name: 'Handover', targetDate: due, completedAt: null, order: 1 }],
    };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));

    expect(screen.getByRole('region', { name: 'Project timeline' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /pour foundation — in progress/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /milestone: handover/i })).toBeInTheDocument();
    expect(screen.getByTestId('timeline-today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '→ Today' })).toBeInTheDocument();
    // Editing affordances live in the list view only.
    expect(screen.queryByRole('button', { name: '+ Add phase' })).not.toBeInTheDocument();
  });

  it('marks overdue timeline bars with the accent colour and opens the drawer on click', async () => {
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({
          id: 't1',
          phaseId: 'ph1',
          startDate: new Date('2020-01-01T00:00:00'),
          dueDate: new Date('2020-01-10T00:00:00'),
        }),
      ],
    };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    const bar = screen.getByRole('button', { name: /pour foundation — to do, overdue/i });
    expect(bar).toHaveClass('bg-accent');

    await userEvent.click(bar);
    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 't1');
  });

  it('shows the empty state when there are no tasks or phases', () => {
    tasksData.phasesState = { status: 'ready', rows: [] };
    renderSection();
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
  });
});
