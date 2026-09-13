import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IProjectRow, TProjectsState } from '../projects/useProjects.ts';

const projectsData = vi.hoisted(() => ({
  state: { status: 'ready', rows: [] } as TProjectsState,
}));
vi.mock('../projects/useProjects.ts', () => ({
  useProjects: () => projectsData.state,
}));

import { InsightsPage } from './InsightsPage.tsx';

function projectRow(overrides: Partial<IProjectRow> = {}): IProjectRow {
  const base = {
    id: 'p1',
    name: 'Bungalow build',
    description: '',
    code: 'BB-1',
    vertical: 'construction' as const,
    lifecycle: 'published' as const,
    status: 'active' as const,
    clientId: '',
    clientNameDenorm: '',
    ownerNameDenorm: 'Alice Tan',
    startDate: new Date('2026-07-01T00:00:00'),
    targetEndDate: new Date('2026-09-01T00:00:00'),
    progressPct: 40,
    totalTasks: 0,
    doneTasks: 0,
    overdueTasks: 0,
    blockedTasks: 0,
    clientCanSee: true,
    collaboratorsCount: 0,
    updatedAt: null,
    tags: [] as string[],
    ...overrides,
  };
  return { ...base, clientIds: [], clients: [] };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <InsightsPage
        workspaceId="wksA"
        workspaceSlug="acme"
        workspaceName="Acme Builders"
        role="owner"
        uid="u1"
      />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  projectsData.state = { status: 'ready', rows: [] };
});

describe('InsightsPage', () => {
  it('renders the loading state', () => {
    projectsData.state = { status: 'loading' };
    renderPage();

    expect(screen.getByText(/loading insights/i)).toBeInTheDocument();
  });

  it('renders the error state', () => {
    projectsData.state = { status: 'error' };
    renderPage();

    expect(screen.getByText(/insights could not be loaded/i)).toBeInTheDocument();
  });

  it('renders an empty CTA linking to Projects when there are no projects', () => {
    projectsData.state = { status: 'ready', rows: [] };
    renderPage();

    expect(screen.getByRole('link', { name: /create a project/i })).toHaveAttribute(
      'href',
      '/acme/projects',
    );
    expect(screen.queryByRole('region', { name: 'Projects timeline' })).not.toBeInTheDocument();
  });

  it('treats an all-deleted workspace as empty', () => {
    projectsData.state = { status: 'ready', rows: [projectRow({ lifecycle: 'deleted' })] };
    renderPage();

    expect(screen.getByRole('link', { name: /create a project/i })).toBeInTheDocument();
  });

  it('renders the Insights heading and the timeline when projects exist', () => {
    projectsData.state = { status: 'ready', rows: [projectRow()] };
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Insights' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Projects timeline' })).toBeInTheDocument();
  });

  it('shows the workspace name as an eyebrow above the heading', () => {
    projectsData.state = { status: 'ready', rows: [projectRow()] };
    renderPage();

    expect(screen.getByText('Acme Builders')).toBeInTheDocument();
  });

  it('shows the "No dates set" group (and no chart, no empty CTA) when every project is undated', () => {
    projectsData.state = {
      status: 'ready',
      rows: [projectRow({ startDate: null, targetEndDate: null })],
    };
    renderPage();

    expect(screen.getByRole('region', { name: /no dates set/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Projects timeline' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /create a project/i })).not.toBeInTheDocument();
  });

  it('has no axe violations in the ready state', async () => {
    projectsData.state = { status: 'ready', rows: [projectRow()] };
    const { container } = renderPage();

    const results = await axe.run(container, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it('has no axe violations in a mixed dated/undated ready state', async () => {
    projectsData.state = {
      status: 'ready',
      rows: [
        projectRow(),
        projectRow({ id: 'undated', name: 'Undated project', startDate: null, targetEndDate: null }),
      ],
    };
    const { container } = renderPage();

    const results = await axe.run(container, {
      rules: { region: { enabled: false }, 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
