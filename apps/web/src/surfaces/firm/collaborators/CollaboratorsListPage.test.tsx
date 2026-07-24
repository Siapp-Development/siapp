import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TCollectionState } from '../settings/useTeamData.ts';
import type { ICollaboratorRow } from './useCollaborators.ts';

const collaboratorsData = vi.hoisted(() => ({
  state: { status: 'loading' } as TCollectionState<ICollaboratorRow>,
  createCollaborator: vi.fn(),
  updateCollaborator: vi.fn(),
  setCollaboratorStatus: vi.fn(),
}));
vi.mock('./useCollaborators.ts', () => ({
  useCollaborators: () => collaboratorsData.state,
  createCollaborator: collaboratorsData.createCollaborator,
  updateCollaborator: collaboratorsData.updateCollaborator,
  setCollaboratorStatus: collaboratorsData.setCollaboratorStatus,
}));

import { CollaboratorsListPage } from './CollaboratorsListPage.tsx';

function collaboratorRow(overrides: Partial<ICollaboratorRow> = {}): ICollaboratorRow {
  return {
    id: 'col1',
    name: 'Lim Electrical',
    phone: '+60198765432',
    email: '',
    company: '',
    trade: 'Electrical',
    type: 'company',
    status: 'active',
    notificationsOptOut: false,
    lastTaskAt: null,
    ...overrides,
  };
}

function renderPage(role: 'owner' | 'pm' | 'viewer' = 'owner') {
  return render(<CollaboratorsListPage workspaceId="wksA" role={role} uid="u1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  collaboratorsData.state = { status: 'ready', rows: [] };
  collaboratorsData.createCollaborator.mockResolvedValue('col-new');
  collaboratorsData.updateCollaborator.mockResolvedValue(undefined);
  collaboratorsData.setCollaboratorStatus.mockResolvedValue(undefined);
});

describe('CollaboratorsListPage', () => {
  it('shows loading and error states', () => {
    collaboratorsData.state = { status: 'loading' };
    const { unmount } = renderPage();
    expect(screen.getByText('Loading collaborators…')).toBeInTheDocument();
    unmount();

    collaboratorsData.state = { status: 'error' };
    renderPage();
    expect(screen.getByText('Collaborators could not be loaded.')).toBeInTheDocument();
  });

  it('lists collaborators with trade, phone actions and an Idle chip when never assigned', () => {
    collaboratorsData.state = { status: 'ready', rows: [collaboratorRow()] };
    renderPage();

    expect(screen.getByText('Lim Electrical')).toBeInTheDocument();
    expect(screen.getByText('Electrical')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call Lim Electrical' })).toHaveAttribute(
      'href',
      'tel:+60198765432',
    );
    expect(screen.getByRole('link', { name: 'WhatsApp Lim Electrical' })).toHaveAttribute(
      'href',
      'https://wa.me/60198765432',
    );
  });

  it('shows Active for a recent lastTaskAt and Idle for an old one', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    collaboratorsData.state = {
      status: 'ready',
      rows: [
        collaboratorRow({ id: 'col1', name: 'Recent Sub', lastTaskAt: new Date(Date.now() - dayMs) }),
        collaboratorRow({
          id: 'col2',
          name: 'Stale Sub',
          lastTaskAt: new Date(Date.now() - 90 * dayMs),
        }),
      ],
    };
    renderPage();

    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Idle')).toBeInTheDocument();
  });

  it('shows the read-only notifications-off badge', () => {
    collaboratorsData.state = {
      status: 'ready',
      rows: [collaboratorRow({ notificationsOptOut: true })],
    };
    renderPage();
    expect(screen.getByText('Notifications off')).toBeInTheDocument();
  });

  it('hides management controls from viewers', () => {
    collaboratorsData.state = { status: 'ready', rows: [collaboratorRow()] };
    renderPage('viewer');
    expect(screen.queryByRole('button', { name: 'New collaborator' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Archive/ })).not.toBeInTheDocument();
  });

  it('creates a collaborator with a normalized phone number', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'New collaborator' }));
    await user.type(screen.getByLabelText('Name'), 'Tan Plumbing');
    await user.type(screen.getByLabelText('Phone'), '019-876 5432');
    await user.selectOptions(screen.getByLabelText('Type'), 'company');
    await user.type(screen.getByLabelText('Trade (optional)'), 'Plumbing');
    await user.click(screen.getByRole('button', { name: 'Add collaborator' }));

    expect(collaboratorsData.createCollaborator).toHaveBeenCalledWith(
      'wksA',
      {
        name: 'Tan Plumbing',
        phone: '+60198765432',
        email: '',
        company: '',
        trade: 'Plumbing',
        type: 'company',
      },
      'u1',
    );
  });

  it('archives a collaborator and hides it behind the archived toggle', async () => {
    const user = userEvent.setup();
    collaboratorsData.state = {
      status: 'ready',
      rows: [
        collaboratorRow(),
        collaboratorRow({ id: 'col2', name: 'Old Sub', status: 'archived' }),
      ],
    };
    renderPage();

    expect(screen.queryByText('Old Sub')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Archive Lim Electrical' }));
    expect(collaboratorsData.setCollaboratorStatus).toHaveBeenCalledWith(
      'wksA',
      'col1',
      'archived',
    );

    await user.click(screen.getByRole('button', { name: 'Show archived (1)' }));
    expect(screen.getByText('Old Sub')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unarchive Old Sub' })).toBeInTheDocument();
  });

  it('edits an existing collaborator', async () => {
    const user = userEvent.setup();
    collaboratorsData.state = { status: 'ready', rows: [collaboratorRow()] };
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit Lim Electrical' }));
    const nameInput = screen.getByLabelText('Name');
    expect(nameInput).toHaveValue('Lim Electrical');
    await user.clear(nameInput);
    await user.type(nameInput, 'Lim Electrical Works');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(collaboratorsData.updateCollaborator).toHaveBeenCalledWith('wksA', 'col1', {
      name: 'Lim Electrical Works',
      phone: '+60198765432',
      email: '',
      company: '',
      trade: 'Electrical',
      type: 'company',
    });
  });
});
