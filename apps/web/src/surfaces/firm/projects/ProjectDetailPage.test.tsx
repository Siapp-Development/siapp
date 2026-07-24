import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IProjectRow, TProjectState } from './useProjects.ts';

const mockCallables = vi.hoisted(() => ({
  setProjectLifecycle: vi.fn(),
  projectErrorCode: vi.fn(() => null as string | null),
}));
vi.mock('@/lib/callables.ts', () => mockCallables);

const projectData = vi.hoisted(() => ({
  state: { status: 'loading' } as TProjectState,
  updateProject: vi.fn(),
}));
vi.mock('./useProjects.ts', () => ({
  useProject: () => projectData.state,
  updateProject: projectData.updateProject,
}));

vi.mock('../clients/useClients.ts', () => ({
  useClients: () => ({ status: 'ready', rows: [] }),
}));

vi.mock('./tasks/TasksSection.tsx', () => ({
  TasksSection: (props: { canEdit: boolean }) => (
    <div data-testid="tasks-section" data-can-edit={props.canEdit} />
  ),
}));

vi.mock('./documents/DocumentsSection.tsx', () => ({
  DocumentsSection: (props: { canEdit: boolean }) => (
    <div data-testid="documents-section" data-can-edit={props.canEdit} />
  ),
}));

vi.mock('./activity/ActivitySection.tsx', () => ({
  ActivitySection: (props: { role: string }) => (
    <div data-testid="activity-section" data-role={props.role} />
  ),
}));

vi.mock('./export/ExportSection.tsx', () => ({
  ExportSection: (props: { role: string }) => (
    <div data-testid="export-section" data-role={props.role} />
  ),
}));

import { ProjectDetailPage } from './ProjectDetailPage.tsx';

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
    blockedTasks: 0,
    clientCanSee: true,
    collaboratorsCount: 0,
    ...overrides,
  };
}

function renderPage(role: 'owner' | 'admin' | 'pm' | 'viewer' = 'owner') {
  return render(
    <MemoryRouter initialEntries={['/acme/projects/p1']}>
      <Routes>
        <Route
          path="/:workspaceSlug/projects/:projectId"
          element={
            <ProjectDetailPage
              workspaceId="wksA"
              workspaceSlug="acme"
              role={role}
              departments={[]}
              uid="u1"
              userName="Alice Tan"
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function openDetailsTab(): Promise<void> {
  await userEvent.click(screen.getByRole('tab', { name: 'Details' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCallables.projectErrorCode.mockReturnValue(null);
  projectData.state = { status: 'ready', project: projectRow() };
});

describe('ProjectDetailPage', () => {
  it('renders the Activity tab between Documents and Details (#23)', async () => {
    renderPage('pm');

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Tasks', 'Documents', 'Activity', 'Details']);

    await userEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByTestId('activity-section')).toHaveAttribute('data-role', 'pm');
    expect(screen.queryByTestId('tasks-section')).not.toBeInTheDocument();
  });

  it('shows the Tasks tab by default and renders project details under Details', async () => {
    projectData.state = {
      status: 'ready',
      project: projectRow({
        lifecycle: 'published',
        status: 'active',
        progressPct: 50,
        totalTasks: 10,
        doneTasks: 5,
        overdueTasks: 1,
        clientNameDenorm: 'Ahmad Corp',
      }),
    };
    renderPage();

    expect(screen.getByRole('heading', { name: 'Bungalow build' })).toBeInTheDocument();
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByTestId('tasks-section')).toBeInTheDocument();

    await openDetailsTab();
    expect(screen.queryByTestId('tasks-section')).not.toBeInTheDocument();
    expect(screen.getByText('Ahmad Corp')).toBeInTheDocument();
    expect(screen.getByText(/50% \(5\/10 tasks, 1 overdue\)/)).toBeInTheDocument();
  });

  it('renders the Documents tab with the section receiving canEdit', async () => {
    renderPage('pm');

    await userEvent.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(screen.getByTestId('documents-section')).toBeInTheDocument();
    expect(screen.getByTestId('documents-section')).toHaveAttribute('data-can-edit', 'true');
    expect(screen.queryByTestId('tasks-section')).not.toBeInTheDocument();
  });

  it('shows a fallback for missing projects', () => {
    projectData.state = { status: 'missing' };
    renderPage();

    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to projects/i })).toHaveAttribute(
      'href',
      '/acme/projects',
    );
  });

  it('shows the ExportSection in Details for owner and admin only (#25)', async () => {
    const ownerRender = renderPage('owner');
    await openDetailsTab();
    expect(screen.getByTestId('export-section')).toHaveAttribute('data-role', 'owner');
    ownerRender.unmount();

    const adminRender = renderPage('admin');
    await openDetailsTab();
    expect(screen.getByTestId('export-section')).toHaveAttribute('data-role', 'admin');
    adminRender.unmount();

    renderPage('pm');
    await openDetailsTab();
    expect(screen.queryByTestId('export-section')).not.toBeInTheDocument();
  });

  it('hides editing from viewers and on completed projects', async () => {
    const viewerRender = renderPage('viewer');
    await openDetailsTab();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    viewerRender.unmount();

    projectData.state = { status: 'ready', project: projectRow({ lifecycle: 'completed' }) };
    renderPage('owner');
    await openDetailsTab();
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.getByText(/read-only — reopen to make changes/i)).toBeInTheDocument();
  });

  it('saves field edits through updateProject', async () => {
    projectData.updateProject.mockResolvedValue(undefined);
    renderPage('pm');
    await openDetailsTab();

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const nameInput = screen.getByLabelText('Name');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Bungalow build v2');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(projectData.updateProject).toHaveBeenCalledWith(
      'wksA',
      'p1',
      expect.objectContaining({ name: 'Bungalow build v2' }),
      0,
    );
  });

  it('publishes via dryRun preview then confirm', async () => {
    mockCallables.setProjectLifecycle
      .mockResolvedValueOnce({
        lifecycle: 'draft',
        publishPreview: { waCount: 3, estimatedCostMyr: 0.3 },
      })
      .mockResolvedValueOnce({
        lifecycle: 'published',
        publishPreview: { waCount: 3, estimatedCostMyr: 0.3 },
      });
    renderPage('pm');
    await openDetailsTab();

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(mockCallables.setProjectLifecycle).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      projectId: 'p1',
      action: 'publish',
      dryRun: true,
    });
    expect(
      await screen.findByText(/3 WhatsApp messages will be sent — est\. RM 0\.30\./),
    ).toBeInTheDocument();

    const confirmButtons = screen.getAllByRole('button', { name: 'Publish' });
    await userEvent.click(confirmButtons[confirmButtons.length - 1]!);
    expect(mockCallables.setProjectLifecycle).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      projectId: 'p1',
      action: 'publish',
    });
  });

  it('gates lifecycle actions by role (D-027)', async () => {
    projectData.state = { status: 'ready', project: projectRow({ lifecycle: 'published' }) };
    renderPage('pm');
    await openDetailsTab();

    expect(screen.getByRole('button', { name: /mark completed/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('requires a confirm step before deleting (owner only)', async () => {
    mockCallables.setProjectLifecycle.mockResolvedValue({ lifecycle: 'deleted' });
    renderPage('owner');
    await openDetailsTab();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(mockCallables.setProjectLifecycle).not.toHaveBeenCalled();
    expect(screen.getByText(/delete this project\?/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /delete project/i }));
    expect(mockCallables.setProjectLifecycle).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      projectId: 'p1',
      action: 'delete',
    });
  });

  it('maps stable project error codes to friendly messages', async () => {
    const err = new Error('boom');
    mockCallables.setProjectLifecycle.mockRejectedValue(err);
    mockCallables.projectErrorCode.mockReturnValue('project/forbidden-transition');
    renderPage('pm');
    await openDetailsTab();

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText(/your role cannot perform this action/i)).toBeInTheDocument();
  });
});
