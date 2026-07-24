import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IClientRow } from '../clients/useClients.ts';
import type { IProjectRow, TProjectsState } from './useProjects.ts';

const projectsData = vi.hoisted(() => ({
  state: { status: 'ready', rows: [] } as TProjectsState,
  createProject: vi.fn(),
}));
vi.mock('./useProjects.ts', () => ({
  useProjects: () => projectsData.state,
  createProject: projectsData.createProject,
}));

const duplicateData = vi.hoisted(() => {
  class DuplicateBlockedError extends Error {
    readonly hiddenCount: number;

    constructor(hiddenCount: number) {
      super('blocked');
      this.name = 'DuplicateBlockedError';
      this.hiddenCount = hiddenCount;
    }
  }
  class DuplicateTooLargeError extends Error {}
  return { duplicateProject: vi.fn(), DuplicateBlockedError, DuplicateTooLargeError };
});
vi.mock('./duplicateProject.ts', () => ({
  duplicateProject: duplicateData.duplicateProject,
  DuplicateBlockedError: duplicateData.DuplicateBlockedError,
  DuplicateTooLargeError: duplicateData.DuplicateTooLargeError,
}));

const clientsData = vi.hoisted(() => ({
  state: { status: 'ready', rows: [] } as { status: 'ready'; rows: IClientRow[] },
}));
vi.mock('../clients/useClients.ts', () => ({
  useClients: () => clientsData.state,
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
    clientId: '',
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
        departments={[]}
        uid="u1"
        userName="Alice Tan"
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  projectsData.state = { status: 'ready', rows: [] };
  clientsData.state = { status: 'ready', rows: [] };
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
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
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

  it('links a client on create, pairing clientId with the denorm name (#16)', async () => {
    projectsData.createProject.mockResolvedValue('p-new');
    clientsData.state = {
      status: 'ready',
      rows: [
        {
          id: 'c1',
          name: 'Ahmad bin Ismail',
          phone: '+60123456789',
          email: '',
          companyName: '',
          language: 'en',
          notes: '',
          notificationsOptOut: true,
        },
      ],
    };
    renderPage('pm');

    await userEvent.click(screen.getByRole('button', { name: /new project/i }));
    await userEvent.type(screen.getByLabelText('Name'), 'Renovation Phase 2');
    // Opted-out clients stay selectable — the option label carries the hint.
    expect(
      screen.getByRole('option', { name: 'Ahmad bin Ismail (notifications off)' }),
    ).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Client (optional)'), 'c1');
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }));

    expect(projectsData.createProject).toHaveBeenCalledWith(
      'wksA',
      expect.objectContaining({ clientId: 'c1', clientName: 'Ahmad bin Ismail' }),
      'u1',
      'Alice Tan',
    );
  });

  it('rejects an empty project name client-side', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /new project/i }));
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }));

    expect(screen.getByText(/must be 1–120 characters/i)).toBeInTheDocument();
    expect(projectsData.createProject).not.toHaveBeenCalled();
  });

  it('shows the Blank | Duplicate mode chooser to a pm, defaulting to Blank', async () => {
    renderPage('pm');

    await userEvent.click(screen.getByRole('button', { name: /new project/i }));

    expect(screen.getByRole('radio', { name: /blank/i })).toBeChecked();
    expect(screen.getByRole('radio', { name: /duplicate from existing/i })).not.toBeChecked();
  });

  it('duplicates from a selected source with a prefilled, vertical-locked form', async () => {
    projectsData.state = {
      status: 'ready',
      rows: [
        projectRow({ vertical: 'legal', clientCanSee: false }),
        projectRow({ id: 'p-del', name: 'Gone', lifecycle: 'deleted' }),
      ],
    };
    duplicateData.duplicateProject.mockResolvedValue('p-copy');
    renderPage('pm');

    await userEvent.click(screen.getByRole('button', { name: /new project/i }));
    await userEvent.click(screen.getByRole('radio', { name: /duplicate from existing/i }));

    const sourceSelect = screen.getByLabelText('Source project');
    expect(within(sourceSelect).queryByRole('option', { name: /gone/i })).not.toBeInTheDocument();
    await userEvent.selectOptions(sourceSelect, 'p1');

    expect(screen.getByLabelText('Name')).toHaveValue('Copy of Bungalow build');
    expect(screen.getByLabelText('Vertical')).toBeDisabled();
    expect(screen.getByLabelText('Vertical')).toHaveValue('legal');

    await userEvent.click(screen.getByRole('button', { name: /create draft/i }));

    expect(duplicateData.duplicateProject).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      sourceProjectId: 'p1',
      values: expect.objectContaining({
        name: 'Copy of Bungalow build',
        code: '',
        vertical: 'legal',
        status: 'planning',
        targetEndDate: null,
        clientCanSee: false,
      }),
      uid: 'u1',
      ownerName: 'Alice Tan',
      role: 'pm',
      departments: [],
    });
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('shows the restricted-tasks block message when duplication is denied', async () => {
    projectsData.state = { status: 'ready', rows: [projectRow()] };
    duplicateData.duplicateProject.mockRejectedValue(
      new duplicateData.DuplicateBlockedError(3),
    );
    renderPage('pm');

    await userEvent.click(screen.getByRole('button', { name: /new project/i }));
    await userEvent.click(screen.getByRole('radio', { name: /duplicate from existing/i }));
    await userEvent.selectOptions(screen.getByLabelText('Source project'), 'p1');
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }));

    expect(
      screen.getByText(
        /has 3 restricted task\(s\) you can't access — ask an owner or admin/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
  });
});
