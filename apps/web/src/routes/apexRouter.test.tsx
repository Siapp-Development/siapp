import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

// The portal shell redeems the token against Firebase — mock the session
// hook module wholesale so no firebase code loads in this router test.
const portalSession = vi.hoisted(() => ({
  workspaceId: 'wks-1',
  projectId: 'proj-1',
  clientId: 'client-1',
  branding: { firmName: 'Studio North' },
  tier: 'standard',
}));

vi.mock('@/surfaces/portal/usePortalSession.ts', async () => {
  const { createContext, useContext } = await import('react');
  const SessionContext = createContext<unknown>(null);
  return {
    usePortalSession: () => ({
      state: { status: 'ready', session: portalSession },
      retry: () => {},
    }),
    PortalSessionProvider: SessionContext.Provider,
    usePortalSessionContext: () => useContext(SessionContext),
    portalErrorCode: () => null,
  };
});

vi.mock('@/surfaces/portal/usePortalProject.ts', () => ({
  usePortalProject: () => ({
    status: 'ready',
    project: {
      name: 'Roadside Cafe Fitout',
      lifecycle: 'published',
      startDate: null,
      targetEndDate: null,
      progressPct: 40,
    },
    phases: [],
    milestones: [],
  }),
  currentPhase: () => null,
  nextMilestone: () => null,
}));

vi.mock('@/surfaces/portal/updates/usePortalUpdates.ts', () => ({
  usePortalUpdates: () => ({
    state: { status: 'ready', rows: [], hasMore: false },
    loadMore: () => {},
  }),
  updateLabel: () => 'Project updated',
  UPDATES_PAGE_SIZE: 30,
}));

// The collaborator page (#22) redeems its token the same way — mock the
// session + task hook modules so no firebase code loads here either.
const collabSession = vi.hoisted(() => ({
  workspaceId: 'wks-1',
  projectId: 'proj-1',
  taskId: 'task-1',
  collaboratorId: 'col-1',
  branding: { firmName: 'Studio North' },
  task: {
    title: 'Install signage',
    description: '',
    status: 'todo',
    dueDate: null,
    projectName: 'Roadside Cafe Fitout',
  },
}));

vi.mock('@/surfaces/collab/useCollabSession.ts', async () => {
  const { createContext, useContext } = await import('react');
  const SessionContext = createContext<unknown>(null);
  return {
    useCollabSession: () => ({
      state: { status: 'ready', session: collabSession },
      retry: () => {},
    }),
    CollabSessionProvider: SessionContext.Provider,
    useCollabSessionContext: () => useContext(SessionContext),
  };
});

vi.mock('@/surfaces/collab/useCollabTask.ts', () => ({
  useCollabTask: () => ({
    status: 'ready',
    task: {
      title: 'Install signage',
      description: 'Mount the fascia sign.',
      status: 'todo',
      dueDate: null,
      blockedReason: '',
      visibleToClient: false,
      restrictedToDepartments: [],
    },
  }),
  useCollabUpdates: () => ({ status: 'ready', rows: [] }),
  useCollabDocuments: () => ({ status: 'ready', rows: [] }),
  validateCollabFile: () => null,
  collabDownloadUrl: vi.fn(),
  uploadCollabDocument: vi.fn(),
}));

vi.mock('@/lib/callables.ts', () => ({
  submitCollabUpdate: vi.fn(),
}));

import { apexRoutes } from '@/routes/apexRouter.tsx';

function renderAt(path: string) {
  const router = createMemoryRouter(apexRoutes, { initialEntries: [path] });

  return render(<RouterProvider router={router} />);
}

describe('apexRouter', () => {
  it('serves the marketing page at / with heading and landmarks', () => {
    renderAt('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Siapp' })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('makes the skip link the first focusable element on the marketing page', async () => {
    renderAt('/');

    await userEvent.tab();

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });

  it('lazy-loads the portal shell at /p/:token with branded header and nav', async () => {
    renderAt('/p/abc');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Roadside Cafe Fitout' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Studio North')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Portal sections' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('applies the portal surface theme once the /p tree mounts', async () => {
    renderAt('/p/abc');

    await screen.findByRole('heading', { level: 1, name: 'Roadside Cafe Fitout' });

    expect(document.documentElement.dataset.surface).toBe('portal');
  });

  it('lazy-loads the collaborator task page at /t/:token', async () => {
    renderAt('/t/xyz');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Install signage' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/studio north/i)).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
