import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback } from 'react';
import { MemoryRouter, useSearchParams } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TASK_NOTIFY_DEFAULTS } from '@siapp/shared';

import type { TTasksState, TPhasesState, ITaskRow, IRestrictedHeaderRow } from './useTasks.ts';

const tasksData = vi.hoisted(() => ({
  tasksState: { status: 'loading' } as TTasksState,
  phasesState: { status: 'loading' } as TPhasesState,
  refreshRestricted: vi.fn(),
  createTask: vi.fn(),
  createPhase: vi.fn(),
  reorderTasks: vi.fn(),
}));
vi.mock('./useTasks.ts', () => ({
  useTasks: () => ({ ...tasksData.tasksState, refreshRestricted: tasksData.refreshRestricted }),
  usePhases: () => tasksData.phasesState,
  createTask: tasksData.createTask,
  createPhase: tasksData.createPhase,
  reorderTasks: tasksData.reorderTasks,
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

function createDragDataTransfer(): DataTransfer {
  const data = new Map<string, string>();
  return {
    dropEffect: 'move',
    effectAllowed: 'all',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    types: [],
    setData: (format: string, value: string) => {
      data.set(format, value);
    },
    getData: (format: string) => data.get(format) ?? '',
    clearData: (format?: string) => {
      if (format === undefined) {
        data.clear();
        return;
      }
      data.delete(format);
    },
    setDragImage: () => undefined,
  } as DataTransfer;
}

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
    collaboratorCanSeeAllAttachments: true,
    order: 1,
    createdBy: 'u1',
    blockedReason: '',
    blockedBy: null,
    tags: [],
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

/**
 * Mirrors the wiring in ProjectDetailPage: the `?task=` URL param feeds
 * `deepLinkedTaskId`, and `onSelectedTaskChange(null)` DELETES that param.
 * Used by the #102 regression test to exercise the REAL round-trip that the
 * no-op-callback unit test (#90) cannot.
 */
function DeepLinkHarness() {
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkedTaskId = searchParams.get('task');
  const handleSelectedTaskChange = useCallback(
    (taskId: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (taskId !== null) {
            next.set('task', taskId);
          } else {
            next.delete('task');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  return (
    <>
      <div data-testid="current-task-param">{deepLinkedTaskId ?? ''}</div>
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
        deepLinkedTaskId={deepLinkedTaskId}
        onSelectedTaskChange={handleSelectedTaskChange}
      />
    </>
  );
}

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

    // The group toggle's accessible name is the phase label plus its count chip.
    expect(screen.getByRole('button', { name: /site prep\s*2/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /no phase\s*1/i })).toBeInTheDocument();
    // Completion is surfaced via the progress ring's accessible name.
    expect(
      screen.getByRole('button', { name: '1 out of 2 tasks completed' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '0 out of 1 tasks completed' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Clear debris')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /site prep/i }));
    expect(screen.queryByText('Clear debris')).not.toBeInTheDocument();
    expect(screen.getByText('Loose task')).toBeInTheDocument();
  });

  it('shows the count chip and reveals the progress tooltip on click', async () => {
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({ id: 't1', phaseId: 'ph1', status: 'done', order: 1 }),
        taskRow({ id: 't2', phaseId: 'ph1', title: 'Clear debris', order: 2 }),
      ],
    };
    renderSection();

    const ring = screen.getByRole('button', { name: '1 out of 2 tasks completed' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await userEvent.click(ring);

    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveTextContent('1 out of 2 tasks completed');
  });

  it('quick-adds a task with order max+1 within the phase', async () => {
    tasksData.tasksState = {
      status: 'ready',
      rows: [taskRow({ id: 't1', phaseId: 'ph1', order: 4 })],
    };
    tasksData.createTask.mockResolvedValue('t-new');
    renderSection();

    const addButtons = screen.getAllByRole('button', { name: /add task/i });
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

  it('reorders tasks within a phase by dragging anywhere on the row', async () => {
    tasksData.reorderTasks.mockResolvedValue(undefined);
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({ id: 't1', phaseId: 'ph1', title: 'First', order: 1 }),
        taskRow({ id: 't2', phaseId: 'ph1', title: 'Second', order: 2 }),
      ],
    };
    renderSection();

    // Drag starts from the row title, not the handle — whole row is draggable.
    const sourceTitle = screen.getByText('Second');
    const targetRow = document.getElementById('task-row-t1');
    expect(targetRow).not.toBeNull();
    const transfer = createDragDataTransfer();

    fireEvent.dragStart(sourceTitle, { dataTransfer: transfer });
    fireEvent.dragOver(targetRow as HTMLElement, { dataTransfer: transfer });
    fireEvent.drop(targetRow as HTMLElement, { dataTransfer: transfer });
    fireEvent.dragEnd(sourceTitle, { dataTransfer: transfer });

    await waitFor(() => {
      expect(tasksData.reorderTasks).toHaveBeenCalledWith('wksA', 'p1', ['t2', 't1'], 'u1');
    });
  });

  it('reorders tasks from list handles via keyboard arrows and keeps handle focus', async () => {
    tasksData.reorderTasks.mockResolvedValue(undefined);
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({ id: 't1', phaseId: 'ph1', title: 'First', order: 1 }),
        taskRow({ id: 't2', phaseId: 'ph1', title: 'Second', order: 2 }),
      ],
    };
    const user = userEvent.setup();
    renderSection();

    const handle = screen.getByRole('button', { name: /drag to reorder second/i });
    handle.focus();
    expect(handle).toHaveFocus();

    await user.keyboard('{ArrowUp}');

    await waitFor(() => {
      expect(tasksData.reorderTasks).toHaveBeenCalledWith('wksA', 'p1', ['t2', 't1'], 'u1');
    });
    expect(handle).toHaveFocus();
  });

  it('does not reorder on invalid list drop targets (same-row or cross-group)', async () => {
    tasksData.reorderTasks.mockResolvedValue(undefined);
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({ id: 't1', phaseId: 'ph1', title: 'First', order: 1 }),
        taskRow({ id: 't2', phaseId: 'ph1', title: 'Second', order: 2 }),
        taskRow({ id: 't3', phaseId: null, title: 'No phase task', order: 1 }),
      ],
    };
    renderSection();

    const sourceHandle = screen.getByRole('button', { name: /drag to reorder second/i });

    const sameRow = document.getElementById('task-row-t2');
    expect(sameRow).not.toBeNull();
    const sameRowTransfer = createDragDataTransfer();
    fireEvent.dragStart(sourceHandle, { dataTransfer: sameRowTransfer });
    fireEvent.drop(sameRow as HTMLElement, { dataTransfer: sameRowTransfer });
    fireEvent.dragEnd(sourceHandle, { dataTransfer: sameRowTransfer });

    const otherGroupRow = document.getElementById('task-row-t3');
    expect(otherGroupRow).not.toBeNull();
    const crossGroupTransfer = createDragDataTransfer();
    fireEvent.dragStart(sourceHandle, { dataTransfer: crossGroupTransfer });
    fireEvent.drop(otherGroupRow as HTMLElement, { dataTransfer: crossGroupTransfer });
    fireEvent.dragEnd(sourceHandle, { dataTransfer: crossGroupTransfer });

    await waitFor(() => {
      expect(tasksData.reorderTasks).not.toHaveBeenCalled();
    });
  });

  it('keeps the selected task modal open after a successful list reorder', async () => {
    tasksData.reorderTasks.mockResolvedValue(undefined);
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({ id: 't1', phaseId: 'ph1', title: 'First', order: 1 }),
        taskRow({ id: 't2', phaseId: 'ph1', title: 'Second', order: 2 }),
      ],
    };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /to do second/i }));
    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 't2');

    const sourceHandle = screen.getByRole('button', { name: /drag to reorder second/i });
    const targetRow = document.getElementById('task-row-t1');
    expect(targetRow).not.toBeNull();
    const transfer = createDragDataTransfer();

    fireEvent.dragStart(sourceHandle, { dataTransfer: transfer });
    fireEvent.dragOver(targetRow as HTMLElement, { dataTransfer: transfer });
    fireEvent.drop(targetRow as HTMLElement, { dataTransfer: transfer });
    fireEvent.dragEnd(sourceHandle, { dataTransfer: transfer });

    await waitFor(() => {
      expect(tasksData.reorderTasks).toHaveBeenCalledWith('wksA', 'p1', ['t2', 't1'], 'u1');
    });
    expect(screen.getByRole('dialog', { name: 'Task: Second' })).toBeInTheDocument();
    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 't2');
  });

  it('does not open the task modal after a drag-and-drop reorder with no prior selection', async () => {
    tasksData.reorderTasks.mockResolvedValue(undefined);
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({ id: 't1', phaseId: 'ph1', title: 'First', order: 1 }),
        taskRow({ id: 't2', phaseId: 'ph1', title: 'Second', order: 2 }),
      ],
    };
    renderSection();

    const sourceHandle = screen.getByRole('button', { name: /drag to reorder second/i });
    const targetRow = document.getElementById('task-row-t1');
    expect(targetRow).not.toBeNull();
    const transfer = createDragDataTransfer();

    fireEvent.dragStart(sourceHandle, { dataTransfer: transfer });
    fireEvent.dragOver(targetRow as HTMLElement, { dataTransfer: transfer });
    fireEvent.drop(targetRow as HTMLElement, { dataTransfer: transfer });
    fireEvent.dragEnd(sourceHandle, { dataTransfer: transfer });

    await waitFor(() => {
      expect(tasksData.reorderTasks).toHaveBeenCalledWith('wksA', 'p1', ['t2', 't1'], 'u1');
    });
    expect(screen.queryByTestId('task-detail-panel')).not.toBeInTheDocument();
  });

  it('excludes restricted rows from list reorder payloads', async () => {
    tasksData.reorderTasks.mockResolvedValue(undefined);
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({ id: 't1', phaseId: 'ph1', title: 'First', order: 1 }),
        restrictedRow({ id: 'tr1', phaseId: 'ph1', order: 2 }),
        taskRow({ id: 't2', phaseId: 'ph1', title: 'Second', order: 3 }),
      ],
    };
    renderSection();

    const sourceHandle = screen.getByRole('button', { name: /drag to reorder second/i });
    const targetRow = document.getElementById('task-row-t1');
    expect(targetRow).not.toBeNull();
    const transfer = createDragDataTransfer();

    fireEvent.dragStart(sourceHandle, { dataTransfer: transfer });
    fireEvent.dragOver(targetRow as HTMLElement, { dataTransfer: transfer });
    fireEvent.drop(targetRow as HTMLElement, { dataTransfer: transfer });
    fireEvent.dragEnd(sourceHandle, { dataTransfer: transfer });

    await waitFor(() => {
      expect(tasksData.reorderTasks).toHaveBeenCalledWith('wksA', 'p1', ['t2', 't1'], 'u1');
    });
  });

  it('reorders tasks within a phase from anywhere on a timeline row', async () => {
    tasksData.reorderTasks.mockResolvedValue(undefined);
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({
          id: 't1',
          phaseId: 'ph1',
          title: 'First',
          startDate: new Date('2026-01-01T00:00:00'),
          dueDate: new Date('2026-01-04T00:00:00'),
          order: 1,
        }),
        taskRow({
          id: 't2',
          phaseId: 'ph1',
          title: 'Second',
          startDate: new Date('2026-01-02T00:00:00'),
          dueDate: new Date('2026-01-05T00:00:00'),
          order: 2,
        }),
      ],
    };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));

    // Drag starts from the row's title label (bubbles to the row container),
    // not the reorder handle — the whole row is draggable.
    const sourceLabel = screen.getByRole('button', { name: /open task details for second/i });
    const sourceRow = document.getElementById('timeline-task-row-t2');
    expect(sourceRow).not.toBeNull();
    expect(sourceRow).toHaveAttribute('draggable', 'true');
    const targetRow = document.getElementById('timeline-task-row-t1');
    expect(targetRow).not.toBeNull();
    const transfer = createDragDataTransfer();

    fireEvent.dragStart(sourceLabel, { dataTransfer: transfer });
    fireEvent.dragOver(targetRow as HTMLElement, { dataTransfer: transfer });
    fireEvent.drop(targetRow as HTMLElement, { dataTransfer: transfer });
    fireEvent.dragEnd(sourceRow as HTMLElement, { dataTransfer: transfer });

    await waitFor(() => {
      expect(tasksData.reorderTasks).toHaveBeenCalledWith('wksA', 'p1', ['t2', 't1'], 'u1');
    });
  });

  it('does not make restricted timeline rows draggable', async () => {
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({
          id: 't1',
          phaseId: 'ph1',
          title: 'First',
          startDate: new Date('2026-01-01T00:00:00'),
          dueDate: new Date('2026-01-04T00:00:00'),
          order: 1,
        }),
        restrictedRow({ id: 'tr1', phaseId: 'ph1', order: 2 }),
      ],
    };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));

    expect(document.getElementById('timeline-task-row-t1')).toHaveAttribute('draggable', 'true');
    expect(document.getElementById('timeline-task-row-tr1')).not.toHaveAttribute(
      'draggable',
      'true',
    );
  });

  it('reorders timeline rows via keyboard arrows and keeps handle focus', async () => {
    tasksData.reorderTasks.mockResolvedValue(undefined);
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({
          id: 't1',
          phaseId: 'ph1',
          title: 'First',
          startDate: new Date('2026-01-01T00:00:00'),
          dueDate: new Date('2026-01-04T00:00:00'),
          order: 1,
        }),
        taskRow({
          id: 't2',
          phaseId: 'ph1',
          title: 'Second',
          startDate: new Date('2026-01-02T00:00:00'),
          dueDate: new Date('2026-01-05T00:00:00'),
          order: 2,
        }),
      ],
    };
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: 'Timeline' }));

    const handle = screen.getByRole('button', { name: /drag to reorder second/i });
    handle.focus();
    expect(handle).toHaveFocus();

    await user.keyboard('{ArrowUp}');

    await waitFor(() => {
      expect(tasksData.reorderTasks).toHaveBeenCalledWith('wksA', 'p1', ['t2', 't1'], 'u1');
    });
    expect(handle).toHaveFocus();
  });

  it('keeps timeline click behavior when no drag occurs', async () => {
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({
          id: 't1',
          phaseId: 'ph1',
          title: 'First',
          startDate: new Date('2026-01-01T00:00:00'),
          dueDate: new Date('2026-01-04T00:00:00'),
          order: 1,
        }),
      ],
    };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    await userEvent.click(screen.getByRole('button', { name: /open task details for first/i }));

    expect(tasksData.reorderTasks).not.toHaveBeenCalled();
    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 't1');
  });

  it('hides all add/edit affordances when canEdit is false', () => {
    tasksData.tasksState = { status: 'ready', rows: [taskRow({ phaseId: 'ph1' })] };
    renderSection({ canEdit: false, role: 'viewer' });

    expect(screen.queryByRole('button', { name: /add task/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Add phase' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /drag to reorder/i })).not.toBeInTheDocument();
  });

  it('locks drag reorder in a group while reorder is pending', async () => {
    tasksData.reorderTasks.mockImplementation(
      () =>
        new Promise<void>(() => {
          // Keep pending to verify drag handles lock within the same group.
        }),
    );
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({ id: 't1', phaseId: 'ph1', title: 'First', order: 1 }),
        taskRow({ id: 't2', phaseId: 'ph1', title: 'Second', order: 2 }),
      ],
    };
    renderSection();

    const transfer = createDragDataTransfer();
    const firstDropTarget = document.getElementById('task-row-t1');
    expect(firstDropTarget).not.toBeNull();

    fireEvent.dragStart(screen.getByRole('button', { name: /drag to reorder second/i }), {
      dataTransfer: transfer,
    });
    fireEvent.dragOver(firstDropTarget as HTMLElement, { dataTransfer: transfer });
    fireEvent.drop(firstDropTarget as HTMLElement, { dataTransfer: transfer });

    await waitFor(() => {
      expect(tasksData.reorderTasks).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByRole('button', { name: /drag to reorder first/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /drag to reorder second/i })).toBeDisabled();

    fireEvent.dragStart(screen.getByRole('button', { name: /drag to reorder first/i }), {
      dataTransfer: createDragDataTransfer(),
    });

    expect(tasksData.reorderTasks).toHaveBeenCalledTimes(1);

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

    await userEvent.click(screen.getByRole('button', { name: /to do pour foundation/i }));
    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 't1');
  });

  it('opens the detail panel in a modal and closes it on Escape', async () => {
    tasksData.tasksState = { status: 'ready', rows: [taskRow({ phaseId: 'ph1' })] };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: /to do pour foundation/i }));
    const dialog = screen.getByRole('dialog', { name: 'Task: Pour foundation' });
    expect(dialog).toContainElement(screen.getByTestId('task-detail-panel'));

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('task-detail-panel')).not.toBeInTheDocument();
  });

  it('opens and highlights a deep-linked task id from URL state (#90)', () => {
    const onSelectedTaskChange = vi.fn();
    tasksData.tasksState = {
      status: 'ready',
      rows: [taskRow({ id: 't2', phaseId: 'ph1', title: 'Deep linked task', order: 2 })],
    };

    renderSection({ deepLinkedTaskId: 't2', onSelectedTaskChange });

    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 't2');
    expect(screen.getByRole('button', { name: /to do deep linked task/i })).toBeInTheDocument();
    expect(onSelectedTaskChange).toHaveBeenCalledWith('t2');
  });

  it('opens the deep-linked task modal even when tasks load after mount (#102 regression)', async () => {
    // Reproduces the Home → task-click bug: on a REAL navigation the project's
    // useTasks/usePhases start in `loading`, and ProjectDetailPage's
    // onSelectedTaskChange DELETES the `?task=` param when called with null.
    // If selectedId inits to null (the old bug), the mount-time sync effect
    // fires onSelectedTaskChange(null) → strips ?task= before tasks resolve, so
    // the deep-link effect early-returns and the modal never opens. The fix
    // seeds selectedId from deepLinkedTaskId. Unlike the #90 unit test, this
    // uses a REAL router param round-trip AND a real loading→ready transition.
    tasksData.tasksState = { status: 'loading' };
    tasksData.phasesState = { status: 'loading' };

    // The MemoryRouter history is created once (from a ref), so it PERSISTS
    // across rerenders even though fresh element instances are passed — any
    // mount-time param strip survives, which is exactly what makes the old bug
    // fail here. (Fresh instances are required: reusing one element reference
    // triggers React's same-element bailout and skips the re-render.)
    const harnessTree = () => (
      <MemoryRouter initialEntries={['/acme/projects/p1?task=t2']}>
        <DeepLinkHarness />
      </MemoryRouter>
    );
    const view = render(harnessTree());

    // Still loading — the mount-time sync effect must NOT have wiped ?task=t2.
    expect(screen.getByText(/loading tasks/i)).toBeInTheDocument();
    expect(screen.getByTestId('current-task-param')).toHaveTextContent('t2');

    // Firestore resolves: phases + the deep-linked task row (t2) arrive.
    tasksData.tasksState = {
      status: 'ready',
      rows: [taskRow({ id: 't2', phaseId: 'ph1', title: 'Deep linked task', order: 2 })],
    };
    tasksData.phasesState = {
      status: 'ready',
      rows: [
        { id: 'ph1', name: 'Site prep', order: 1, startDate: null, endDate: null, status: 'todo' },
      ],
    };
    view.rerender(harnessTree());

    // Modal opens for t2 AND the deep link is still present (not stripped).
    await waitFor(() => {
      expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 't2');
    });
    expect(screen.getByTestId('current-task-param')).toHaveTextContent('t2');
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

  it('marks overdue timeline bars with the accent colour and opens the modal on click', async () => {
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

  it('opens the modal when clicking the timeline left-side task label (#86)', async () => {
    tasksData.tasksState = {
      status: 'ready',
      rows: [
        taskRow({
          id: 't1',
          phaseId: 'ph1',
          startDate: new Date('2026-01-01T00:00:00'),
          dueDate: new Date('2026-01-10T00:00:00'),
        }),
      ],
    };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Timeline' }));
    await userEvent.click(screen.getByRole('button', { name: /open task details for pour foundation/i }));

    expect(screen.getByTestId('task-detail-panel')).toHaveAttribute('data-task-id', 't1');
  });

  it('shows the empty state when there are no tasks or phases', () => {
    tasksData.phasesState = { status: 'ready', rows: [] };
    renderSection();
    expect(screen.getByText(/no tasks yet/i)).toBeInTheDocument();
  });
});
