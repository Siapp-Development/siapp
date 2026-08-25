import { render, screen, waitFor } from '@testing-library/react';
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
      clientName: 'Aisyah Rahman',
      lifecycle: 'published',
      startDate: null,
      targetEndDate: null,
      progressPct: 40,
    },
    phases: [],
  }),
}));

vi.mock('@/surfaces/portal/tasks/usePortalTasks.ts', () => ({
  usePortalTasks: () => ({ status: 'ready', tasks: [], groups: [] }),
}));

vi.mock('@/surfaces/portal/documents/usePortalDocuments.ts', () => ({
  usePortalDocuments: () => ({ status: 'ready', rows: [] }),
  validateClientFile: () => null,
  portalDownloadUrl: vi.fn(),
  uploadPortalDocument: vi.fn(),
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

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Every client knows where their project stands.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('makes the skip link the first focusable element on the marketing page', async () => {
    renderAt('/');

    await userEvent.tab();

    expect(screen.getByRole('link', { name: /skip to main content/i })).toHaveFocus();
  });

  it('lazy-loads the single-screen portal at /p/:token with branded header', async () => {
    renderAt('/p/abc');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Roadside Cafe Fitout' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Studio North')).toBeInTheDocument();
    // The tabbed nav was removed (#126, D-042) — everything is one screen.
    expect(screen.queryByRole('navigation', { name: 'Portal sections' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: /overall progress/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it.each([['/p/abc/documents'], ['/p/abc/updates']])(
    'redirects the old %s deep link to the single screen instead of 404',
    async (path) => {
      renderAt(path);

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Roadside Cafe Fitout' }),
      ).toBeInTheDocument();
    },
  );

  it('applies the firm surface theme once the /p tree mounts', async () => {
    renderAt('/p/abc');

    await screen.findByRole('heading', { level: 1, name: 'Roadside Cafe Fitout' });

    // useSurfaceTheme sets the attribute in an effect — wait for the flush.
    // The client portal adopts the firm cool-neutral surface (#126, D-042).
    await waitFor(() => {
      expect(document.documentElement.dataset.surface).toBe('firm');
    });
  });

  it('lazy-loads the collaborator task page at /t/:token', async () => {
    renderAt('/t/xyz');

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Install signage' }),
    ).toBeInTheDocument();
    // Firm name appears in the header and again in the PDPA footer notice (#26 D5).
    expect(screen.getAllByText(/studio north/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('shows the error fallback instead of a blank screen when a route render throws', async () => {
    // React + reportError both log the caught error — keep test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => {
      throw new Error('apex route exploded');
    };
    // Same route object (incl. its configured errorElement), throwing component.
    const routes = [{ ...apexRoutes[0], Component: Boom }];
    const router = createMemoryRouter(routes, { initialEntries: ['/'] });

    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: /something went wrong/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('keeps portal and collab errors inside their own tree via per-tree errorElement', () => {
    // Config-level guarantee for D-036 UX: the lazy /p and /t roots carry
    // their own errorElement so external users never see apex-level UI.
    expect(apexRoutes[1]?.errorElement).toBeDefined();
    expect(apexRoutes[2]?.errorElement).toBeDefined();
  });

  it('renders the not-found screen for unknown paths via the catch-all route', async () => {
    renderAt('/some-garbage-path');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: /page not found/i })).toBeInTheDocument();
  });

  it.each([
    ['/privacy', 'Siapp Privacy Policy'],
    ['/terms', 'Siapp Terms & Conditions'],
    ['/legal/campaign-privacy', 'Siapp Messaging Campaign Privacy Policy'],
    ['/legal/sms-terms', 'Siapp SMS / Messaging Program Terms & Conditions'],
    ['/legal/messaging-consent', 'Siapp Messaging Consent & Opt-In'],
  ])('lazy-loads the legal page at %s with its h1', async (path, heading) => {
    renderAt(path);

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
  });
});
