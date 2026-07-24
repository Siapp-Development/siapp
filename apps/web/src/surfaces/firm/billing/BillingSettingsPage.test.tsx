import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IWorkspaceBilling, TWorkspaceBillingState } from './useWorkspaceBilling.ts';

const billingData = vi.hoisted(() => ({
  state: { status: 'loading' } as TWorkspaceBillingState,
}));
vi.mock('./useWorkspaceBilling.ts', () => ({
  useWorkspaceBilling: () => billingData.state,
}));

import { BillingSettingsPage } from './BillingSettingsPage.tsx';

function billing(overrides: Partial<IWorkspaceBilling> = {}): IWorkspaceBilling {
  return {
    plan: 'standard',
    billingStatus: 'active',
    seatLimit: 5,
    seatsUsed: 3,
    planExpiresAt: new Date('2027-01-15T00:00:00Z'),
    waUsed: 100,
    waIncluded: 250,
    waUsedFraction: 0.4,
    waForecast: 180,
    ...overrides,
  };
}

function renderPage(role: 'owner' | 'admin' | 'pm' | 'viewer' = 'owner') {
  return render(
    <BillingSettingsPage workspaceId="wksA" workspaceName="Acme Builders" role={role} />,
  );
}

beforeEach(() => {
  billingData.state = { status: 'loading' };
});

describe('BillingSettingsPage', () => {
  it('blocks pm/viewer with a not-available message', () => {
    billingData.state = { status: 'ready', billing: billing() };
    renderPage('pm');

    expect(
      screen.getByText(/only available to workspace owners and admins/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/current plan/i)).not.toBeInTheDocument();
  });

  it('renders plan, price, usage and the mailto CTA for owners', () => {
    billingData.state = { status: 'ready', billing: billing() };
    renderPage('owner');

    expect(screen.getByText('Current plan')).toBeInTheDocument();
    // "Standard" appears in the plan card AND the comparison table.
    expect(screen.getAllByText('Standard').length).toBeGreaterThanOrEqual(1);
    // 5 seats × RM79
    expect(screen.getByText('RM 395/yr')).toBeInTheDocument();
    // D6: paid plan → "Renews" label
    expect(screen.getByText('Renews')).toBeInTheDocument();
    expect(screen.queryByText('Trial ends')).not.toBeInTheDocument();

    const bar = screen.getByRole('progressbar', { name: /whatsapp conversations used/i });
    expect(bar).toHaveAttribute('aria-valuenow', '100');
    expect(bar).toHaveAttribute('aria-valuemax', '250');

    expect(screen.getByRole('table', { name: /plan comparison/i })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /contact us about your plan/i }),
    ).toHaveAttribute('href', expect.stringContaining('mailto:billing@siapp.app'));
    // D8: manual-billing copy
    expect(screen.getByText(/invoices by email/i)).toBeInTheDocument();
  });

  it('labels the expiry "Trial ends" on a trial and shows Free pricing (D6)', () => {
    billingData.state = {
      status: 'ready',
      billing: billing({ plan: 'trial', waIncluded: 30, waUsed: 3, waUsedFraction: 0.1 }),
    };
    renderPage('admin');

    expect(screen.getByText('Trial ends')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
  });

  it('warns when the forecast exceeds the allowance', () => {
    billingData.state = {
      status: 'ready',
      billing: billing({ waUsed: 200, waUsedFraction: 0.8, waForecast: 320 }),
    };
    renderPage('owner');

    expect(screen.getByText(/on pace to exceed the included allowance/i)).toBeInTheDocument();
  });

  it('shows the read-only notice with reactivation copy', () => {
    billingData.state = {
      status: 'ready',
      billing: billing({ billingStatus: 'read_only' }),
    };
    renderPage('owner');

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/read-only because its plan has expired/i);
    expect(alert).toHaveTextContent(/preserved and still viewable/i);
  });

  it('announces loading and surfaces errors', () => {
    renderPage('owner');
    expect(screen.getByRole('status')).toHaveTextContent(/loading billing/i);

    billingData.state = { status: 'error' };
    renderPage('owner');
    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load billing/i);
  });
});
