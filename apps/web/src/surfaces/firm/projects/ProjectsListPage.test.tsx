import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IProjectRow, TProjectsState } from './useProjects.ts';

const projectsData = vi.hoisted(() => ({
  state: { status: 'ready', rows: [] } as TProjectsState,
  createProject: vi.fn(),
}));
vi.mock('./useProjects.ts', () => ({
  useProjects: () => projectsData.state,
  createProject: projectsData.createProject,
}));

import { ProjectsListPage } from './ProjectsListPage.tsx';

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  return {
    id: 'p1',
    name: 'Bungalow build',
    code: 'BB-1',
    vertical: 'construction',
    lifecycle: 'draft',
    status: 'planning',
    clientNameDenorm: '',
    ownerNameDenorm: 'Alice Tan',
    startDate: new Date('2026-07-01T00:00:00'),
    targetEndDate: null,
    progressPct: 0,
    totalTasks: 0,
    doneTasks: 0,
    overdueTasks: 0,
    clientCanSee: true,
    collaboratorsCount: 0,
    ...overrides,
  };
}

function renderPage(role: 'owner' | 'pm' | 'viewer' = 'owner') {
  return render(
    <MemoryRouter>
      <ProjectsListPage
        workspaceId="wksA"
        workspaceSlug="acme"
        workspaceName="Acme Builders"
        role={role}
        uid="u1"
        userName="Alice Tan"
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  projectsData.state = { status: 'ready', rows: [] };
});

describe('ProjectsListPage', () => {
  it('lists projects with lifecycle badge, status and progress', () => {
    projectsData.state = {
      status: 'ready',
      rows: [
        projectRow(),
        projectRow({
          id: 'p2',
          name: 'Office fit-out',
          lifecycle: 'published',
          status: 'active',
          progressPct: 40,
          overdueTasks: 2,
          clientNameDenorm: 'Ahmad Corp',
        }),
      ],
    };
    renderPage();

    expect(screen.getByRole('link', { name: 'Bungalow build' })).toHaveAttribute(
      'href',
      '/acme/projects/p1',
    );
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText(/40% complete/)).toBeInTheDocument();
    expect(screen.getByText(/2 overdue/)).toBeInTheDocument();
    expect(screen.getByText(/Ahmad Corp/)).toBeInTheDocument();
  });

  it('hides deleted projects and tucks archived behind a toggle', async () => {
    projectsData.state = {
      status: 'ready',
      rows: [
        projectRow(),
        projectRow({ id: 'p2', name: 'Old kitchen job', lifecycle: 'archived' }),
        projectRow({ id: 'p3', name: 'Ghost project', lifecycle: 'deleted' }),
      ],
    };
    renderPage();

    expect(screen.queryByText('Old kitchen job')).not.toBeInTheDocument();
    expect(screen.queryByText('Ghost project')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /show archived \(1\)/i }));
    expect(screen.getByText('Old kitchen job')).toBeInTheDocument();
    expect(screen.queryByText('Ghost project')).not.toBeInTheDocument();
  });

  it('hides the New project button from viewers', () => {
    renderPage('viewer');
    expect(screen.queryByRole('button', { name: /new project/i })).not.toBeInTheDocument();
  });

  it('creates a draft project from the form', async () => {
    projectsData.createProject.mockResolvedValue('p-new');
    renderPage('pm');

    await userEvent.click(screen.getByRole('button', { name: /new project/i }));
    await userEvent.type(screen.getByLabelText('Name'), 'Renovation Phase 2');
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }));

    expect(projectsData.createProject).toHaveBeenCalledWith(
      'wksA',
      expect.objectContaining({
        name: 'Renovation Phase 2',
        vertical: 'construction',
        status: 'planning',
        clientCanSee: true,
      }),
      'u1',
      'Alice Tan',
    );
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('rejects an empty project name client-side', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /new project/i }));
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }));

    expect(screen.getByText(/must be 1–120 characters/i)).toBeInTheDocument();
    expect(projectsData.createProject).not.toHaveBeenCalled();
  });
});
