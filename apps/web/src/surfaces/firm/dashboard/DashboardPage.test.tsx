import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TASK_NOTIFY_DEFAULTS } from '@siapp/shared';

import type { IProjectRow, TProjectsState } from '../projects/useProjects.ts';
import type { IDashboardTaskRow, TDashboardTasksState } from './useDashboardTasks.ts';

const projectsData = vi.hoisted(() => ({
  state: { status: 'ready', rows: [] } as TProjectsState,
}));
vi.mock('../projects/useProjects.ts', () => ({
  useProjects: () => projectsData.state,
}));

const tasksData = vi.hoisted(() => ({
  state: { status: 'ready', rows: [] } as TDashboardTasksState,
  useDashboardTasks: vi.fn(),
}));
vi.mock('./useDashboardTasks.ts', () => ({
  useDashboardTasks: tasksData.useDashboardTasks.mockImplementation(() => tasksData.state),
}));

import { DashboardPage } from './DashboardPage.tsx';

const UID = 'u1';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  return {
    id: 'p1',
    name: 'Bungalow build',
    code: '',
    vertical: 'construction',
    lifecycle: 'published',
    status: 'active',
    clientId: '',
    clientNameDenorm: '',
    ownerNameDenorm: 'Alice Tan',
    startDate: null,
    targetEndDate: null,
    progressPct: 40,
    totalTasks: 5,
    doneTasks: 2,
    overdueTasks: 0,
    blockedTasks: 0,
    clientCanSee: false,
    collaboratorsCount: 0,
    ...overrides,
  };
}

function taskRow(overrides: Partial<IDashboardTaskRow> = {}): IDashboardTaskRow {
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
    assignees: [{ type: 'user', id: UID, name: 'Alice Tan' }],
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    notify: { ...TASK_NOTIFY_DEFAULTS },
    dependsOn: [],
    order: 0,
    createdBy: UID,
    projectId: 'p1',
    projectName: 'Bungalow build',
    ...overrides,
  };
}

function renderPage(role: 'owner' | 'pm' | 'viewer' = 'owner') {
  return render(
    <MemoryRouter>
      <DashboardPage
        workspaceId="wksA"
        workspaceSlug="acme"
        workspaceName="Acme Builders"
        role={role}
        departments={[]}
        uid={UID}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  projectsData.state = { status: 'ready', rows: [] };
  tasksData.state = { status: 'ready', rows: [] };
});

describe('DashboardPage', () => {
  it('shows KPI counts derived from the task buckets', () => {
    tasksData.state = {
      status: 'ready',
      rows: [
        taskRow({ id: 'over', dueDate: new Date(Date.now() - DAY_MS) }),
        taskRow({ id: 'soon-1', dueDate: new Date(Date.now() + DAY_MS) }),
        taskRow({ id: 'soon-2', dueDate: new Date(Date.now() + 2 * DAY_MS) }),
        taskRow({ id: 'later', dueDate: new Date(Date.now() + 30 * DAY_MS) }),
        taskRow({ id: 'undated' }),
        taskRow({ id: 'done', status: 'done' }),
        taskRow({ id: 'not-mine', assignees: [{ type: 'user', id: 'u2', name: 'Bob' }] }),
      ],
    };
    renderPage();

    expect(screen.getByRole('tab', { name: /2 My tasks/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /1 Overdue/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /2 Due this week/i })).toBeInTheDocument();
  });

  it('switches the visible bucket when a KPI tab is clicked', async () => {
    tasksData.state = {
      status: 'ready',
      rows: [
        taskRow({ id: 'over', title: 'Late task', dueDate: new Date(Date.now() - DAY_MS) }),
        taskRow({ id: 'undated', title: 'Undated task' }),
      ],
    };
    renderPage();

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('Undated task')).toBeInTheDocument();
    expect(within(panel).queryByText('Late task')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /Overdue/i }));

    expect(within(panel).getByText('Late task')).toBeInTheDocument();
    expect(within(panel).queryByText('Undated task')).not.toBeInTheDocument();
  });

  it('links each task row to its project', () => {
    tasksData.state = {
      status: 'ready',
      rows: [taskRow({ projectId: 'p9', projectName: 'Office fit-out' })],
    };
    renderPage();

    expect(screen.getByRole('link', { name: 'Office fit-out' })).toHaveAttribute(
      'href',
      '/acme/projects/p9',
    );
  });

  it('never renders tasks the fan-out could not fetch (D7 contract)', () => {
    // The hook mock is fed only rules-provable rows — a restricted task from
    // another department is structurally absent, exactly as in production.
    tasksData.state = { status: 'ready', rows: [taskRow({ title: 'Visible task' })] };
    renderPage('pm');

    expect(screen.getByText('Visible task')).toBeInTheDocument();
    expect(screen.queryByText(/restricted/i)).not.toBeInTheDocument();
  });

  it('lists attention projects worst-first with health and lifecycle badges', () => {
    projectsData.state = {
      status: 'ready',
      rows: [
        projectRow({ id: 'ok', name: 'Healthy project' }),
        projectRow({ id: 'draft', name: 'Draft with tasks', lifecycle: 'draft', totalTasks: 3 }),
        projectRow({ id: 'blocked', name: 'Blocked project', blockedTasks: 2 }),
        projectRow({ id: 'over', name: 'Overdue project', overdueTasks: 4 }),
        projectRow({ id: 'arch', name: 'Archived project', lifecycle: 'archived', overdueTasks: 9 }),
      ],
    };
    renderPage();

    const section = screen.getByRole('heading', { name: 'Needs your attention' })
      .closest('section') as HTMLElement;
    const items = within(section).getAllByRole('listitem');
    expect(items.map((li) => within(li).getByRole('link').textContent)).toEqual([
      'Overdue project',
      'Blocked project',
      'Draft with tasks',
    ]);
    expect(within(items[0] as HTMLElement).getByText('4 overdue')).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).getByText('2 blocked')).toBeInTheDocument();
    expect(screen.queryByText('Healthy project')).not.toBeInTheDocument();
    expect(screen.queryByText('Archived project')).not.toBeInTheDocument();
  });

  it('shows positive empty states', () => {
    renderPage();

    expect(screen.getByText('No other open tasks assigned to you.')).toBeInTheDocument();
    expect(screen.getByText('All projects are on track.')).toBeInTheDocument();
  });

  it('offers New project to owner but not viewer', () => {
    const { unmount } = renderPage('owner');
    expect(screen.getByRole('link', { name: 'New project' })).toHaveAttribute(
      'href',
      '/acme/projects?new=1',
    );
    unmount();

    renderPage('viewer');
    expect(screen.queryByRole('link', { name: 'New project' })).not.toBeInTheDocument();
  });

  it('shows loading and error states', () => {
    tasksData.state = { status: 'loading' };
    const { unmount } = renderPage();
    expect(screen.getByText('Loading your dashboard…')).toBeInTheDocument();
    unmount();

    tasksData.state = { status: 'error' };
    renderPage();
    expect(screen.getByText('Your dashboard could not be loaded.')).toBeInTheDocument();
  });
});
