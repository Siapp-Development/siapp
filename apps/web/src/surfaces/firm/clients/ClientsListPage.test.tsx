import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TCollectionState } from '../settings/useTeamData.ts';
import type { IClientRow } from './useClients.ts';

const clientsData = vi.hoisted(() => ({
  state: { status: 'loading' } as TCollectionState<IClientRow>,
  createClient: vi.fn(),
  updateClient: vi.fn(),
}));
vi.mock('./useClients.ts', () => ({
  useClients: () => clientsData.state,
  createClient: clientsData.createClient,
  updateClient: clientsData.updateClient,
}));

import { ClientsListPage } from './ClientsListPage.tsx';

function clientRow(overrides: Partial<IClientRow> = {}): IClientRow {
  return {
    id: 'c1',
    name: 'Ahmad bin Ismail',
    phone: '+60123456789',
    email: '',
    companyName: '',
    language: 'en',
    notes: '',
    notificationsOptOut: false,
    ...overrides,
  };
}

function renderPage(role: 'owner' | 'pm' | 'viewer' = 'owner') {
  return render(<ClientsListPage workspaceId="wksA" role={role} uid="u1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  clientsData.state = { status: 'ready', rows: [] };
  clientsData.createClient.mockResolvedValue('c-new');
  clientsData.updateClient.mockResolvedValue(undefined);
});

describe('ClientsListPage', () => {
  it('shows loading and error states', () => {
    clientsData.state = { status: 'loading' };
    const { unmount } = renderPage();
    expect(screen.getByText('Loading clients…')).toBeInTheDocument();
    unmount();

    clientsData.state = { status: 'error' };
    renderPage();
    expect(screen.getByText('Clients could not be loaded.')).toBeInTheDocument();
  });

  it('lists clients with phone actions and details', () => {
    clientsData.state = {
      status: 'ready',
      rows: [clientRow(), clientRow({ id: 'c2', name: 'Siti Aminah', companyName: 'Aminah Sdn Bhd' })],
    };
    renderPage();

    expect(screen.getByText('Ahmad bin Ismail')).toBeInTheDocument();
    expect(screen.getByText('Aminah Sdn Bhd')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Call Ahmad bin Ismail' })).toHaveAttribute(
      'href',
      'tel:+60123456789',
    );
    expect(screen.getByRole('link', { name: 'WhatsApp Ahmad bin Ismail' })).toHaveAttribute(
      'href',
      'https://wa.me/60123456789',
    );
    expect(
      screen.getByRole('button', { name: "Copy Ahmad bin Ismail's phone number" }),
    ).toBeInTheDocument();
  });

  it('shows the read-only notifications-off badge for opted-out clients', () => {
    clientsData.state = { status: 'ready', rows: [clientRow({ notificationsOptOut: true })] };
    renderPage();
    expect(screen.getByText('Notifications off')).toBeInTheDocument();
  });

  it('hides management controls from viewers', () => {
    clientsData.state = { status: 'ready', rows: [clientRow()] };
    renderPage('viewer');
    expect(screen.queryByRole('button', { name: 'New client' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it('creates a client with a normalized phone number', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'New client' }));
    await user.type(screen.getByLabelText('Name'), 'Siti Aminah');
    await user.type(screen.getByLabelText('Phone'), '012-345 6789');
    await user.click(screen.getByRole('button', { name: 'Add client' }));

    expect(clientsData.createClient).toHaveBeenCalledWith(
      'wksA',
      {
        name: 'Siti Aminah',
        phone: '+60123456789',
        email: '',
        companyName: '',
        language: 'en',
        notes: '',
      },
      'u1',
    );
  });

  it('rejects an invalid phone number without saving', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: 'New client' }));
    await user.type(screen.getByLabelText('Name'), 'Siti Aminah');
    await user.type(screen.getByLabelText('Phone'), 'not-a-phone');
    await user.click(screen.getByRole('button', { name: 'Add client' }));

    expect(await screen.findByText(/valid phone number/)).toBeInTheDocument();
    expect(clientsData.createClient).not.toHaveBeenCalled();
  });

  it('edits an existing client', async () => {
    const user = userEvent.setup();
    clientsData.state = { status: 'ready', rows: [clientRow()] };
    renderPage();

    await user.click(screen.getByRole('button', { name: 'Edit Ahmad bin Ismail' }));
    const nameInput = screen.getByLabelText('Name');
    expect(nameInput).toHaveValue('Ahmad bin Ismail');
    await user.clear(nameInput);
    await user.type(nameInput, 'Ahmad Ismail');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(clientsData.updateClient).toHaveBeenCalledWith('wksA', 'c1', {
      name: 'Ahmad Ismail',
      phone: '+60123456789',
      email: '',
      companyName: '',
      language: 'en',
      notes: '',
    });
  });
});
