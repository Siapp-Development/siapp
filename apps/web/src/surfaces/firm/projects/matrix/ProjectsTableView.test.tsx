import { render, screen, within } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  IPhaseRow,
  IRestrictedHeaderRow,
  ITaskRow,
  TPhasesState,
  TTasksState,
} from '../tasks/useTasks.ts';
import type { IProjectRow } from '../useProjects.ts';

const tableData = vi.hoisted(() => ({
  phasesByProject: {} as Record<string, TPhasesState>,
  tasksByProject: {} as Record<string, TTasksState>,
}));

vi.mock('../tasks/useTasks.ts', () => ({
  usePhases: (_workspaceId: string, projectId: string): TPhasesState =>
    tableData.phasesByProject[projectId] ?? { status: 'loading' },
  useTasks: (_workspaceId: string, projectId: string) => ({
    ...(tableData.tasksByProject[projectId] ?? { status: 'loading' }),
    refreshRestricted: vi.fn(),
  }),
}));

import { PROJECT_TABLE_CAP, ProjectsTableView } from './ProjectsTableView.tsx';

const BLOCK_ERROR = "This project’s phases/tasks could not be loaded.";

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

function phasesReady(rows: IPhaseRow[]): TPhasesState {
  return { status: 'ready', rows };
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
  tableData.phasesByProject = {};
  tableData.tasksByProject = {};
});

describe('ProjectsTableView', () => {
  it('shows a per-row loading state (with caption) while this row\u2019s phases load', () => {
    tableData.phasesByProject = { p1: { status: 'loading' } };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([project({ id: 'p1', name: 'Lot 12' })]);

    expect(screen.getByText('Loading…')).toBeInTheDocument();
    // The block's identity (caption + name link) still renders while loading.
    expect(screen.getByRole('link', { name: 'Lot 12' })).toBeInTheDocument();
  });

  it('shows a per-row error (with caption/name) when this row\u2019s phases fail', () => {
    tableData.phasesByProject = { p1: { status: 'error' } };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([project({ id: 'p1', name: 'Lot 12' })]);

    expect(screen.getByText(BLOCK_ERROR)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lot 12' })).toBeInTheDocument();
  });

  it('keeps rows independent: one failed row does not block a ready row (Finding 3)', () => {
    // Project A's phases fail; Project B's phases (and tasks) are ready.
    tableData.phasesByProject = {
      p1: { status: 'error' },
      p2: phasesReady([phase({ id: 'b', name: 'Excavation', order: 0 })]),
    };
    tableData.tasksByProject = {
      p1: { status: 'ready', rows: [] },
      p2: { status: 'ready', rows: [task({ id: 't2', phaseId: 'b', title: 'Dig' })] },
    };
    renderView([project({ id: 'p1', name: 'Lot 12' }), project({ id: 'p2', name: 'Lot 7' })]);

    // A shows its own scoped error but still renders its caption/name.
    expect(screen.getByText(BLOCK_ERROR)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lot 12' })).toBeInTheDocument();

    // B renders its full table/columns/tasks regardless of A's failure.
    const regionB = screen.getByRole('region', { name: 'Lot 7 phases' });
    expect(within(regionB).getByRole('columnheader', { name: 'Excavation' })).toBeInTheDocument();
    expect(within(regionB).getByText('Dig')).toBeInTheDocument();
  });

  it('renders two projects with different phase sets independently', () => {
    tableData.phasesByProject = {
      p1: phasesReady([phase({ id: 'a', name: 'Earthworks', order: 0 })]),
      p2: phasesReady([phase({ id: 'b', name: 'Excavation', order: 0 })]),
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
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
    tableData.tasksByProject = {
      p1: { status: 'ready', rows: [task({ id: 't1', phaseId: 'a', status: 'done' })] },
    };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders an empty tasks band with sr-only "No tasks"', () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('shows "No phases yet." for a project with no phases and no tasks', () => {
    tableData.phasesByProject = { p1: phasesReady([]) };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByText('No phases yet.')).toBeInTheDocument();
  });

  it('appends a "No phase" column only for null-phase tasks', () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
    tableData.tasksByProject = {
      p1: { status: 'ready', rows: [task({ id: 't1', phaseId: null, title: 'Site photos' })] },
    };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByRole('columnheader', { name: 'No phase' })).toBeInTheDocument();
    expect(screen.getByText('Site photos')).toBeInTheDocument();
  });

  it('omits the "No phase" column when every task has a resolvable phase', () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
    tableData.tasksByProject = {
      p1: { status: 'ready', rows: [task({ id: 't1', phaseId: 'a', title: 'Clear site' })] },
    };
    renderView([project({ id: 'p1' })]);
    expect(screen.queryByRole('columnheader', { name: 'No phase' })).not.toBeInTheDocument();
    // Only the real phase column exists.
    expect(screen.getAllByRole('columnheader')).toHaveLength(1);
  });

  it('renders restricted-header rows as a dimmed "Restricted (N hidden)" entry', () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
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
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a' })]) };
    tableData.tasksByProject = { p1: { status: 'loading' } };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows a per-block error state when tasks fail', () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a' })]) };
    tableData.tasksByProject = { p1: { status: 'error' } };
    renderView([project({ id: 'p1' })]);
    expect(screen.getByText(BLOCK_ERROR)).toBeInTheDocument();
  });

  it('caps the table and shows an over-cap notice', () => {
    const projects = Array.from({ length: PROJECT_TABLE_CAP + 3 }, (_, index) =>
      project({ id: `p${index}`, name: `Project ${index}` }),
    );
    tableData.phasesByProject = Object.fromEntries(
      projects.map((p) => [p.id, phasesReady([phase({ id: `${p.id}-a` })])]),
    );
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
    tableData.phasesByProject = Object.fromEntries(
      projects.map((p) => [p.id, phasesReady([phase({ id: `${p.id}-a` })])]),
    );
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
    tableData.phasesByProject = Object.fromEntries(
      projects.map((p) => [p.id, phasesReady([phase({ id: `${p.id}-a` })])]),
    );
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
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([project({ id: 'p1', name: 'Lot 12' })]);

    const region = screen.getByRole('region', { name: 'Lot 12 phases' });
    expect(region).toBeInTheDocument();
    expect(within(region).getByRole('link', { name: 'Lot 12' })).toHaveAttribute(
      'href',
      '/acme/projects/p1',
    );
  });

  it('shows the client name and formatted start → target-end range in the header', () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([
      project({
        id: 'p1',
        name: 'Lot 12',
        clients: [{ id: 'c1', name: 'Acme' }],
        startDate: new Date('2026-07-01T00:00:00Z'),
        targetEndDate: new Date('2026-09-01T00:00:00Z'),
      }),
    ]);

    const region = screen.getByRole('region', { name: 'Lot 12 phases' });
    expect(within(region).getByText('Acme')).toBeInTheDocument();
    expect(within(region).getByText(/2026.*→.*2026/)).toBeInTheDocument();
    expect(within(region).queryByText('No client')).not.toBeInTheDocument();
  });

  it('summarises multiple clients with a "＋N" overflow marker in the header', () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([
      project({
        id: 'p1',
        name: 'Lot 12',
        clients: [
          { id: 'c1', name: 'Acme' },
          { id: 'c2', name: 'Globex' },
          { id: 'c3', name: 'Initech' },
        ],
      }),
    ]);

    expect(screen.getByText('Acme ＋2')).toBeInTheDocument();
  });

  it('renders "No client" when the project has no linked clients', () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([project({ id: 'p1', name: 'Lot 12', clients: [] })]);

    expect(screen.getByText('No client')).toBeInTheDocument();
  });

  it('shows a "From …" range when only the start date is set', () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([
      project({ id: 'p1', name: 'Lot 12', startDate: new Date('2026-07-01T00:00:00Z') }),
    ]);

    expect(screen.getByText(/^From /)).toBeInTheDocument();
  });

  it('shows a "Due …" range when only the target end date is set', () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([
      project({ id: 'p1', name: 'Lot 12', targetEndDate: new Date('2026-09-01T00:00:00Z') }),
    ]);

    expect(screen.getByText(/^Due /)).toBeInTheDocument();
  });

  it('shows "No dates set" when neither start nor target end date is set', () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
    tableData.tasksByProject = { p1: { status: 'ready', rows: [] } };
    renderView([project({ id: 'p1', name: 'Lot 12', startDate: null, targetEndDate: null })]);

    expect(screen.getByText('No dates set')).toBeInTheDocument();
  });

  it('has no axe violations in a ready table', async () => {
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
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
    tableData.phasesByProject = { p1: phasesReady([phase({ id: 'a', name: 'Earthworks' })]) };
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
