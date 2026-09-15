import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IPhaseRow, IRestrictedHeaderRow, ITaskRow, TTasksState } from '../tasks/useTasks.ts';
import type { IProjectRow } from '../useProjects.ts';
import type { TAllPhasesState } from './useAllProjectsPhases.ts';

const tableData = vi.hoisted(() => ({
  phasesState: { status: 'loading' } as TAllPhasesState,
  tasksByProject: {} as Record<string, TTasksState>,
}));

vi.mock('./useAllProjectsPhases.ts', () => ({
  useAllProjectsPhases: () => tableData.phasesState,
}));

vi.mock('../tasks/useTasks.ts', () => ({
  useTasks: (_workspaceId: string, projectId: string) => ({
    ...(tableData.tasksByProject[projectId] ?? { status: 'loading' }),
    refreshRestricted: vi.fn(),
  }),
}));

import { PROJECT_TABLE_CAP, ProjectsTableView } from './ProjectsTableView.tsx';

function project(overrides: Partial<IProjectRow> = {}): IProjectRow {
  return {
    id: 'p1',
    name: 'Lot 12',
    description: '',
    code: '',
    vertical: 'construction',
    lifecycle: 'published',
    status: 'active',
    clientIds: [],
    clients: [],
    clientId: '',
    clientNameDenorm: '',
    ownerNameDenorm: '',
    startDate: null,
    targetEndDate: null,
    updatedAt: null,
    progressPct: 0,
    totalTasks: 0,
    doneTasks: 0,
    overdueTasks: 0,
    blockedTasks: 0,
    clientCanSee: false,
    collaboratorsCount: 0,
    tags: [],
    ...overrides,
  };
}

function phase(overrides: Partial<IPhaseRow> = {}): IPhaseRow {
  return {
    id: 'ph1',
    name: 'Earthworks',
    order: 0,
    startDate: null,
    endDate: null,
    status: 'todo',
    ...overrides,
  };
}

function task(overrides: Partial<ITaskRow> = {}): ITaskRow {
  return {
    restricted: false,
    id: 't1',
    title: 'Clear site',
    description: '',
    phaseId: 'ph1',
    status: 'todo',
    startDate: null,
    dueDate: null,
    completedAt: null,
    assignees: [],
    visibleToClient: false,
    visibleToCollaboratorIds: [],
    restrictedToDepartments: [],
    sendWhatsapp: false,
    notify: { statusChange: false, dueSoon: false, blocked: false, toClient: false, toInternal: false },
    tags: [],
    collaboratorCanSeeAllAttachments: true,
    order: 0,
    createdBy: 'u1',
    blockedReason: '',
    blockedBy: null,
    ...overrides,
  };
}

function restricted(overrides: Partial<IRestrictedHeaderRow> = {}): IRestrictedHeaderRow {
  return {
    restricted: true,
    id: 'r1',
    title: 'Hidden',
    status: 'todo',
    phaseId: 'ph1',
    dueDate: null,
    order: 0,
    restrictedToDepartments: ['finance'],
    ...overrides,
  };
}

function renderView(projects: IProjectRow[]) {
  return render(
    <MemoryRouter>
      <ProjectsTableView
        workspaceId="w1"
        workspaceSlug="acme"
        projects={projects}
        role="owner"
        departments={[]}
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  tableData.phasesState = { status: 'loading' };
  tableData.tasksByProject = {};
});

describe('ProjectsTableView', () => {
  it('shows a phases skeleton while phases load', () => {
    tableData.phasesState = { status: 'loading' };
    renderView([project()]);
    expect(screen.getByText('Loading phases…')).toBeInTheDocument();
  });

  it('shows an error when phases fail', () => {
    tableData.phasesState = { status: 'error' };
    renderView([project()]);
    expect(screen.getByText('Phases could not be loaded.')).toBeInTheDocument();
  });

  it('renders two projects with different phase sets independently', () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([
        ['p1', [phase({ id: 'a', name: 'Earthworks', order: 0 })]],
        ['p2', [phase({ id: 'b', name: 'Excavation', order: 0 })]],
      ]),
    };
    tableData.tasksByProject = {
      p1: { status: 'ready', rows: [task({ id: 't1', phaseId: 'a', title: 'Clear site' })] },
      p2: { status: 'ready', rows: [task({ id: 't2', phaseId: 'b', title: 'Dig' })] },
    };
    renderView([project({ id: 'p1', name: 'Lot 12' }), project({ id: 'p2', name: 'Lot 7' })]);

    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(2);
    // Each block has its own column header — no shared/aligned columns.
    expect(screen.getByRole('columnheader', { name: 'Earthworks' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Excavation' })).toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: 'Excavation' })).not.toBe(
      screen.getByRole('columnheader', { name: 'Earthworks' }),
    );
    expect(screen.getByText('Clear site')).toBeInTheDocument();
    expect(screen.getByText('Dig')).toBeInTheDocument();
  });

  it('renders a task status ring per task (sr-only label)', () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([['p1', [phase({ id: 'a', name: 'Earthworks' })]]]),
    };
    tableData.tasksByProject = {
      p1: { status: 'ready', rows: [task({ id: 't1', phaseId: 'a', status: 'done' })] },
    };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders an empty tasks band with sr-only "No tasks"', () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([['p1', [phase({ id: 'a', name: 'Earthworks' })]]]),
    };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('shows "No phases yet." for a project with no phases and no tasks', () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([['p1', []]]),
    };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByText('No phases yet.')).toBeInTheDocument();
  });

  it('appends a "No phase" column only for null-phase tasks', () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([['p1', [phase({ id: 'a', name: 'Earthworks' })]]]),
    };
    tableData.tasksByProject = {
      p1: { status: 'ready', rows: [task({ id: 't1', phaseId: null, title: 'Site photos' })] },
    };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByRole('columnheader', { name: 'No phase' })).toBeInTheDocument();
    expect(screen.getByText('Site photos')).toBeInTheDocument();
  });

  it('omits the "No phase" column when every task has a resolvable phase', () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([['p1', [phase({ id: 'a', name: 'Earthworks' })]]]),
    };
    tableData.tasksByProject = {
      p1: { status: 'ready', rows: [task({ id: 't1', phaseId: 'a', title: 'Clear site' })] },
    };
    renderView([project({ id: 'p1' })]);
    expect(screen.queryByRole('columnheader', { name: 'No phase' })).not.toBeInTheDocument();
    // Only the real phase column exists.
    expect(screen.getAllByRole('columnheader')).toHaveLength(1);
  });

  it('renders restricted-header rows as a dimmed "Restricted (N hidden)" entry', () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([['p1', [phase({ id: 'a', name: 'Earthworks' })]]]),
    };
    tableData.tasksByProject = {
      p1: {
        status: 'ready',
        rows: [
          task({ id: 't1', phaseId: 'a', title: 'Clear site' }),
          restricted({ id: 'r1', phaseId: 'a' }),
          restricted({ id: 'r2', phaseId: 'a' }),
        ],
      },
    };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByText('Restricted (2 hidden)')).toBeInTheDocument();
    // Never renders restricted task content.
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('shows a per-block loading state while tasks load', () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([['p1', [phase({ id: 'a' })]]]),
    };
    tableData.tasksByProject = { p1: { status: 'loading' } };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByText('Loading tasks…')).toBeInTheDocument();
  });

  it('shows a per-block error state when tasks fail', () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([['p1', [phase({ id: 'a' })]]]),
    };
    tableData.tasksByProject = { p1: { status: 'error' } };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByText('Tasks could not be loaded.')).toBeInTheDocument();
  });

  it('caps the table and shows an over-cap notice', () => {
    const projects = Array.from({ length: PROJECT_TABLE_CAP + 3 }, (_, index) =>
      project({ id: `p${index}`, name: `Project ${index}` }),
    );
    const phasesByProject = new Map(projects.map((p) => [p.id, [phase({ id: `${p.id}-a` })]]));
    tableData.phasesState = { status: 'ready', phasesByProject };
    tableData.tasksByProject = Object.fromEntries(
      projects.map((p) => [p.id, { status: 'ready', rows: [] }]),
    );
    renderView(projects);

    expect(screen.getByRole('status')).toHaveTextContent(
      `Showing the first ${PROJECT_TABLE_CAP} of ${PROJECT_TABLE_CAP + 3} projects`,
    );
    expect(screen.getAllByRole('table')).toHaveLength(PROJECT_TABLE_CAP);
  });

  it('renders exactly the cap with no over-cap notice at the boundary', () => {
    const projects = Array.from({ length: PROJECT_TABLE_CAP }, (_, index) =>
      project({ id: `p${index}`, name: `Project ${index}` }),
    );
    const phasesByProject = new Map(projects.map((p) => [p.id, [phase({ id: `${p.id}-a` })]]));
    tableData.phasesState = { status: 'ready', phasesByProject };
    tableData.tasksByProject = Object.fromEntries(
      projects.map((p) => [p.id, { status: 'ready', rows: [] }]),
    );
    renderView(projects);

    // Boundary: exactly the cap → all mount, no notice (guards a cap off-by-one).
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(PROJECT_TABLE_CAP);
  });

  it('mounts no 26th block when one project is over the cap', () => {
    const projects = Array.from({ length: PROJECT_TABLE_CAP + 1 }, (_, index) =>
      project({ id: `p${index}`, name: `Project ${index}` }),
    );
    const phasesByProject = new Map(projects.map((p) => [p.id, [phase({ id: `${p.id}-a` })]]));
    tableData.phasesState = { status: 'ready', phasesByProject };
    tableData.tasksByProject = Object.fromEntries(
      projects.map((p) => [p.id, { status: 'ready', rows: [] }]),
    );
    renderView(projects);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(PROJECT_TABLE_CAP);
    // The 26th project's block (its caption/region) never mounts.
    expect(
      screen.queryByRole('region', { name: `Project ${PROJECT_TABLE_CAP} phases` }),
    ).not.toBeInTheDocument();
  });

  it('wraps each block in a labelled scroll region with a caption', () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([['p1', [phase({ id: 'a', name: 'Earthworks' })]]]),
    };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([project({ id: 'p1', name: 'Lot 12' })]);

    const region = screen.getByRole('region', { name: 'Lot 12 phases' });
    expect(region).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Lot 12' })).toHaveAttribute(
      'href',
      '/acme/projects/p1',
    );
  });

  it('has no axe violations in a ready table', async () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([['p1', [phase({ id: 'a', name: 'Earthworks' })]]]),
    };
    tableData.tasksByProject = {
      p1: { status: 'ready', rows: [task({ id: 't1', phaseId: 'a' })] },
    };
    const { container } = renderView([project({ id: 'p1' })]);
    const results = await axe.run(container, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations for a table that includes a "No phase" column', async () => {
    tableData.phasesState = {
      status: 'ready',
      phasesByProject: new Map([['p1', [phase({ id: 'a', name: 'Earthworks' })]]]),
    };
    tableData.tasksByProject = {
      p1: {
        status: 'ready',
        rows: [
          task({ id: 't1', phaseId: 'a', title: 'Clear site' }),
          task({ id: 't2', phaseId: null, title: 'Loose task' }),
        ],
      },
    };
    const { container } = renderView([project({ id: 'p1' })]);
    const results = await axe.run(container, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
