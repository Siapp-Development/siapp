import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IPortalTaskGroup } from '../tasks/usePortalTasks.ts';
import type { IPortalProject } from '../usePortalProject.ts';
import { PortalPrintLayout } from './PortalPrintLayout.tsx';

const usePortalUpdatesMock = vi.fn(() => ({
  state: { status: 'ready', rows: [], hasMore: false },
  loadMore: vi.fn(),
}));
const usePortalDocumentsMock = vi.fn(() => ({ status: 'ready', rows: [] }));

vi.mock('../updates/usePortalUpdates.ts', async () => {
  const actual = await vi.importActual<typeof import('../updates/usePortalUpdates.ts')>(
    '../updates/usePortalUpdates.ts',
  );
  return { ...actual, usePortalUpdates: () => usePortalUpdatesMock() };
});

vi.mock('../documents/usePortalDocuments.ts', async () => {
  const actual = await vi.importActual<typeof import('../documents/usePortalDocuments.ts')>(
    '../documents/usePortalDocuments.ts',
  );
  return { ...actual, usePortalDocuments: () => usePortalDocumentsMock() };
});

const PROJECT: IPortalProject = {
  name: 'Cafe Fitout',
  clientName: 'Acme Retail',
  lifecycle: 'published',
  startDate: new Date('2026-08-01T00:00:00Z'),
  targetEndDate: new Date('2026-12-01T00:00:00Z'),
  progressPct: 45,
};

const GROUPS: IPortalTaskGroup[] = [
  {
    phaseId: 'p1',
    name: 'Discovery',
    tasks: [
      {
        id: 't1',
        title: 'Kickoff',
        status: 'in_progress',
        phaseId: 'p1',
        startDate: new Date('2026-08-10T00:00:00Z'),
        dueDate: new Date('2026-08-20T00:00:00Z'),
        completedAt: null,
        order: 0,
      },
    ],
  },
];

afterEach(() => {
  vi.clearAllMocks();
});

function renderLayout() {
  return render(
    <PortalPrintLayout
      project={PROJECT}
      groups={GROUPS}
      workspaceId="w1"
      projectId="p1"
      clientId="c1"
    />,
  );
}

describe('PortalPrintLayout', () => {
  it('renders the project header with the progress ring', () => {
    renderLayout();

    // The print DOM is aria-hidden; query with { hidden: true }.
    expect(screen.getByRole('heading', { name: 'Cafe Fitout', hidden: true })).toBeInTheDocument();
    expect(screen.getByText(/Prepared for Acme Retail/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '45% complete', hidden: true })).toBeInTheDocument();
  });

  it('renders all four sections', () => {
    renderLayout();

    // The print DOM is aria-hidden; query the four section headings with
    // { hidden: true }. (The wrapper <section aria-label> and the inner section
    // heading intentionally share a name, so assert on the headings.)
    expect(screen.getByRole('heading', { name: 'Project tasks', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Timeline', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent updates', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Documents', hidden: true })).toBeInTheDocument();
  });

  it('renders BOTH task views — the list and the fit-to-width timeline', () => {
    renderLayout();

    // List view row.
    const listRegion = screen.getByRole('region', { name: 'Project tasks list', hidden: true });
    expect(listRegion).toHaveTextContent('Kickoff');
    // Timeline view exposes the same task as a labelled bar.
    const timelineRegion = screen.getByRole('region', { name: 'Project timeline', hidden: true });
    expect(timelineRegion).toHaveTextContent('Kickoff');
    // PortalTaskTimeline uses the real clock here (no `now` prop), so assert
    // the bar exists and names the task without pinning a time-dependent status.
    expect(screen.getByRole('img', { name: /Kickoff —/, hidden: true })).toBeInTheDocument();
  });
});
