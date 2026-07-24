import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TNotificationSettingsState } from './useNotificationSettings.ts';

const settingsData = vi.hoisted(() => ({
  state: { status: 'loading' } as TNotificationSettingsState,
  saveQuietHours: vi.fn(),
}));
vi.mock('./useNotificationSettings.ts', () => ({
  useNotificationSettings: () => settingsData.state,
  saveQuietHours: settingsData.saveQuietHours,
}));

import { NotificationSettingsPage } from './NotificationSettingsPage.tsx';

function ready(overrides: Partial<{ enabled: boolean; start: string; end: string }> = {}) {
  settingsData.state = {
    status: 'ready',
    quietHours: {
      enabled: true,
      start: '21:00',
      end: '08:00',
      timezone: 'Asia/Kuala_Lumpur',
      ...overrides,
    },
  };
}

function renderPage(role: 'owner' | 'admin' | 'pm' | 'viewer' = 'owner') {
  return render(
    <NotificationSettingsPage workspaceId="wksA" workspaceName="Acme Builders" role={role} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  settingsData.state = { status: 'loading' };
});

describe('NotificationSettingsPage', () => {
  it('renders the default window for owners with an MYT note', () => {
    ready();
    renderPage('owner');

    expect(screen.getByLabelText('Enable quiet hours')).toBeChecked();
    expect(screen.getByLabelText('Start')).toHaveValue('21:00');
    expect(screen.getByLabelText('End')).toHaveValue('08:00');
    expect(screen.getByText(/times are in malaysia time/i)).toBeInTheDocument();
  });

  it('saves edited quiet hours through the callable and announces success', async () => {
    ready();
    settingsData.saveQuietHours.mockResolvedValue(undefined);
    renderPage('admin');

    const end = screen.getByLabelText('End');
    await userEvent.clear(end);
    await userEvent.type(end, '07:30');
    await userEvent.click(screen.getByRole('button', { name: /save quiet hours/i }));

    expect(settingsData.saveQuietHours).toHaveBeenCalledWith('wksA', {
      enabled: true,
      start: '21:00',
      end: '07:30',
    });
    expect(await screen.findByText('Quiet hours saved.')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Quiet hours saved.');
  });

  it('surfaces a save failure', async () => {
    ready();
    settingsData.saveQuietHours.mockRejectedValue(new Error('permission-denied'));
    renderPage('owner');

    await userEvent.click(screen.getByRole('button', { name: /save quiet hours/i }));

    expect(await screen.findByText('permission-denied')).toBeInTheDocument();
  });

  it('shows a read-only summary for pm/viewer', () => {
    ready({ start: '22:00', end: '06:30' });
    renderPage('viewer');

    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    expect(screen.getByText(/22:00–06:30 malaysia time/i)).toBeInTheDocument();
    expect(screen.getByText(/only the workspace owner or an admin/i)).toBeInTheDocument();
  });

  it('shows loading and error states', () => {
    const { rerender } = renderPage('owner');
    expect(screen.getByText(/loading settings/i)).toBeInTheDocument();

    settingsData.state = { status: 'error' };
    rerender(
      <NotificationSettingsPage workspaceId="wksA" workspaceName="Acme Builders" role="owner" />,
    );
    expect(screen.getByText(/could not be loaded/i)).toBeInTheDocument();
  });
});
