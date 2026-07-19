import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { TCollectionState } from './useTeamData.ts';
import type { IDepartmentRow, IInviteRow, IMemberRow } from './useTeamData.ts';

const mockCallables = vi.hoisted(() => ({
  createInvite: vi.fn(),
  resendInvite: vi.fn(),
  revokeInvite: vi.fn(),
  setMemberDepartments: vi.fn(),
}));
vi.mock('@/lib/callables.ts', () => mockCallables);

const teamData = vi.hoisted(() => ({
  members: { status: 'ready', rows: [] } as TCollectionState<IMemberRow>,
  invites: { status: 'ready', rows: [] } as TCollectionState<IInviteRow>,
  departments: { status: 'ready', rows: [] } as TCollectionState<IDepartmentRow>,
}));
vi.mock('./useTeamData.ts', () => ({
  useMembers: () => teamData.members,
  usePendingInvites: () => teamData.invites,
  useDepartments: () => teamData.departments,
  createDepartment: vi.fn(),
  renameDepartment: vi.fn(),
  deleteDepartment: vi.fn(),
}));

import { TeamSettingsPage } from './TeamSettingsPage.tsx';

const owner: IMemberRow = {
  uid: 'u1',
  email: 'alice@firm.test',
  displayName: 'Alice Tan',
  role: 'owner',
  departments: [],
  seatActive: true,
};
const pm: IMemberRow = {
  uid: 'u2',
  email: 'bob@firm.test',
  displayName: 'Bob Lee',
  role: 'pm',
  departments: ['dep1'],
  seatActive: true,
};

function renderPage(role: 'owner' | 'viewer' = 'owner') {
  return render(
    <TeamSettingsPage workspaceId="wksA" workspaceName="Acme Builders" role={role} uid="u1" />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  teamData.members = { status: 'ready', rows: [owner, pm] };
  teamData.invites = { status: 'ready', rows: [] };
  teamData.departments = { status: 'ready', rows: [] };
});

describe('TeamSettingsPage', () => {
  it('lists members with their roles', () => {
    renderPage();

    expect(screen.getByText('Alice Tan')).toBeInTheDocument();
    expect(screen.getByText('Bob Lee')).toBeInTheDocument();
    // Appears in Bob's row and in the invite role <select>.
    expect(screen.getAllByText(/project manager/i).length).toBeGreaterThan(0);
  });

  it('hides the invite panel and management controls from viewers', () => {
    renderPage('viewer');

    expect(screen.queryByRole('heading', { name: /invite teammates/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create department/i })).not.toBeInTheDocument();
  });

  it('sends an invite and surfaces a copyable link', async () => {
    mockCallables.createInvite.mockResolvedValue({
      inviteId: 'inv1',
      inviteUrl: 'https://dashboard.siapp.app/invite/wksA/inv1/tok',
      emailSent: true,
    });
    renderPage();

    await userEvent.type(screen.getByLabelText('Email'), 'new.hire@example.com');
    await userEvent.selectOptions(screen.getByLabelText('Role'), 'pm');
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }));

    expect(mockCallables.createInvite).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      email: 'new.hire@example.com',
      role: 'pm',
    });
    expect(await screen.findByLabelText('Invite link')).toHaveValue(
      'https://dashboard.siapp.app/invite/wksA/inv1/tok',
    );
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
  });

  it('shows the share-manually notice when the invite email could not be sent', async () => {
    mockCallables.createInvite.mockResolvedValue({
      inviteId: 'inv1',
      inviteUrl: 'https://dashboard.siapp.app/invite/wksA/inv1/tok',
      emailSent: false,
    });
    renderPage();

    await userEvent.type(screen.getByLabelText('Email'), 'new.hire@example.com');
    await userEvent.click(screen.getByRole('button', { name: /send invite/i }));

    expect(await screen.findByText(/email could not be sent/i)).toBeInTheDocument();
  });

  it('resends and revokes pending invites', async () => {
    teamData.invites = {
      status: 'ready',
      rows: [{ id: 'inv1', email: 'new.hire@example.com', role: 'pm', expiresAt: null }],
    };
    mockCallables.resendInvite.mockResolvedValue({
      inviteId: 'inv1',
      inviteUrl: 'https://dashboard.siapp.app/invite/wksA/inv1/tok2',
      emailSent: true,
    });
    mockCallables.revokeInvite.mockResolvedValue(undefined);
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /resend/i }));
    expect(mockCallables.resendInvite).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      inviteId: 'inv1',
    });

    await userEvent.click(screen.getByRole('button', { name: /revoke/i }));
    expect(mockCallables.revokeInvite).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      inviteId: 'inv1',
    });
  });

  it('hides department chips and assignment until the first department exists (D-004)', () => {
    renderPage();

    expect(screen.queryByText('dep1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit departments/i })).not.toBeInTheDocument();
    expect(screen.getByText(/no departments yet/i)).toBeInTheDocument();
  });

  it('shows department chips and assignment once departments exist', async () => {
    teamData.departments = {
      status: 'ready',
      rows: [{ id: 'dep1', name: 'Structural', memberCount: 1 }],
    };
    renderPage();

    // Chip on Bob's row + the departments panel row.
    expect(screen.getAllByText('Structural').length).toBeGreaterThan(1);
    expect(screen.getAllByRole('button', { name: /edit departments/i })).toHaveLength(2);

    mockCallables.setMemberDepartments.mockResolvedValue(undefined);
    const [editOwner] = screen.getAllByRole('button', { name: /edit departments/i });
    await userEvent.click(editOwner!);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Structural' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockCallables.setMemberDepartments).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      memberUid: 'u1',
      departments: ['dep1'],
    });
  });

  it('disables delete for departments that still have members', () => {
    teamData.departments = {
      status: 'ready',
      rows: [
        { id: 'dep1', name: 'Structural', memberCount: 1 },
        { id: 'dep2', name: 'Interiors', memberCount: 0 },
      ],
    };
    renderPage();

    const deleteButtons = screen.getAllByRole('button', { name: /delete/i });
    expect(deleteButtons[0]).toBeDisabled();
    expect(deleteButtons[1]).toBeEnabled();
  });
});
