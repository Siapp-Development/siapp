/**
 * Component tests for the #113 owner section on WorkspaceDetailPage. Mocks the
 * Firestore snapshot + admin callables (mirrors TeamSettingsPage.test.tsx).
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IWorkspaceOwner } from '../lib/adminFunctions.ts';

vi.mock('@/lib/firebase.ts', () => ({ db: {} }));

const mockParams = vi.hoisted(() => ({ wid: 'wksA' }));
vi.mock('react-router', () => ({
  useParams: () => mockParams,
}));

const firestore = vi.hoisted(() => ({
  snapshot: null as unknown,
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: (
    _ref: unknown,
    onNext: (snap: unknown) => void,
  ): (() => void) => {
    onNext(firestore.snapshot);
    return () => {};
  },
  // Simple stand-in — the page only uses `instanceof Timestamp` guards.
  Timestamp: class {},
}));

const mockCallables = vi.hoisted(() => ({
  adjustWorkspaceFn: vi.fn(),
  impersonateUserFn: vi.fn(),
  getWorkspaceOwnerFn: vi.fn(),
}));
vi.mock('../lib/adminFunctions.ts', () => mockCallables);

import { WorkspaceDetailPage } from './WorkspaceDetailPage.tsx';

const workspaceData = {
  name: 'Acme Builders',
  slug: 'acme',
  ownerId: 'owner-1',
  plan: 'standard',
  billingStatus: 'active',
  seatLimit: 5,
  seatsUsed: 3,
  whatsappAllowance: { used: 0, includedPerPeriod: 100 },
  planExpiresAt: new Date('2026-12-31'),
  createdAt: new Date('2025-01-01'),
};

function makeSnapshot() {
  return {
    exists: () => true,
    id: 'wksA',
    data: () => workspaceData,
  };
}

const resolvedOwner: IWorkspaceOwner = {
  uid: 'owner-1',
  displayName: 'Aisha Owner',
  email: 'aisha@firm.my',
  source: 'member',
  authUserDeleted: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  firestore.snapshot = makeSnapshot();
  mockCallables.getWorkspaceOwnerFn.mockResolvedValue({ data: resolvedOwner });
});

describe('WorkspaceDetailPage owner section', () => {
  it('renders the owner name, email (mailto) and UID', async () => {
    render(<WorkspaceDetailPage />);

    expect(await screen.findByText('Aisha Owner')).toBeInTheDocument();
    const email = screen.getByRole('link', { name: 'aisha@firm.my' });
    expect(email).toHaveAttribute('href', 'mailto:aisha@firm.my');
    expect(screen.getByText('owner-1')).toBeInTheDocument();
  });

  it('copies the UID via navigator.clipboard and announces success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<WorkspaceDetailPage />);

    await screen.findByText('Aisha Owner');
    await user.click(screen.getByRole('button', { name: /copy owner uid/i }));

    expect(writeText).toHaveBeenCalledWith('owner-1');
    expect(await screen.findByText('UID copied.')).toBeInTheDocument();
  });

  it('shows an error message when clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<WorkspaceDetailPage />);

    await screen.findByText('Aisha Owner');
    await user.click(screen.getByRole('button', { name: /copy owner uid/i }));

    expect(await screen.findByText(/copy failed/i)).toBeInTheDocument();
  });

  it('fills the Target Firebase UID field via "Use in Impersonate"', async () => {
    const user = userEvent.setup();
    render(<WorkspaceDetailPage />);

    await screen.findByText('Aisha Owner');
    await user.click(screen.getByRole('button', { name: /use in impersonate/i }));

    const targetInput = screen.getByLabelText(/target firebase uid/i) as HTMLInputElement;
    expect(targetInput.value).toBe('owner-1');
    expect(targetInput).toHaveFocus();
  });

  it('shows the loading status while the owner fetch is pending', () => {
    mockCallables.getWorkspaceOwnerFn.mockReturnValue(new Promise(() => {}));
    render(<WorkspaceDetailPage />);

    const owner = screen.getByRole('heading', { name: 'Workspace owner' });
    expect(owner).toBeInTheDocument();
    expect(screen.getByText(/loading owner/i)).toBeInTheDocument();
  });

  it('renders the deleted-auth fallback and no email link when unresolved', async () => {
    mockCallables.getWorkspaceOwnerFn.mockResolvedValue({
      data: {
        uid: 'owner-1',
        displayName: null,
        email: null,
        source: 'unresolved',
        authUserDeleted: true,
      } satisfies IWorkspaceOwner,
    });
    render(<WorkspaceDetailPage />);

    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('renders the generic unavailable note (uid present) when unresolved but not deleted', async () => {
    mockCallables.getWorkspaceOwnerFn.mockResolvedValue({
      data: {
        uid: 'owner-1',
        displayName: null,
        email: null,
        source: 'unresolved',
        authUserDeleted: false,
      } satisfies IWorkspaceOwner,
    });
    render(<WorkspaceDetailPage />);

    expect(await screen.findByText(/owner details are unavailable/i)).toBeInTheDocument();
    // A present UID still offers the copy affordance for support.
    expect(screen.getByRole('button', { name: /copy owner uid/i })).toBeInTheDocument();
    expect(screen.getByText('owner-1')).toBeInTheDocument();
  });

  it('omits the UID/copy affordance when the workspace has no owner', async () => {
    mockCallables.getWorkspaceOwnerFn.mockResolvedValue({
      data: {
        uid: '',
        displayName: null,
        email: null,
        source: 'unresolved',
        authUserDeleted: false,
      } satisfies IWorkspaceOwner,
    });
    render(<WorkspaceDetailPage />);

    expect(await screen.findByText(/owner details are unavailable/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy owner uid/i })).not.toBeInTheDocument();
  });

  it('surfaces an owner-fetch error without breaking the page', async () => {
    mockCallables.getWorkspaceOwnerFn.mockRejectedValue(new Error('boom'));
    render(<WorkspaceDetailPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('boom');
    });
    // The rest of the page still renders.
    expect(screen.getByRole('heading', { name: 'Acme Builders' })).toBeInTheDocument();
  });
});
