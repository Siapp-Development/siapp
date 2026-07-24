import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IWorkspaceBilling, TWorkspaceBillingState } from './useWorkspaceBilling.ts';

const billingData = vi.hoisted(() => ({
  state: { status: 'loading' } as TWorkspaceBillingState,
}));
vi.mock('./useWorkspaceBilling.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useWorkspaceBilling.ts')>();
  return {
    USAGE_WARN_AT: actual.USAGE_WARN_AT,
    USAGE_ALERT_AT: actual.USAGE_ALERT_AT,
    useWorkspaceBilling: () => billingData.state,
  };
});

import { BillingBanners } from './BillingBanners.tsx';

function billing(overrides: Partial<IWorkspaceBilling> = {}): IWorkspaceBilling {
  return {
    plan: 'standard',
    billingStatus: 'active',
    seatLimit: 5,
    seatsUsed: 3,
    planExpiresAt: new Date('2027-01-01T00:00:00Z'),
    waUsed: 0,
    waIncluded: 250,
    waUsedFraction: 0,
    waForecast: 0,
    ...overrides,
  };
}

function renderBanners() {
  return render(
    <MemoryRouter>
      <BillingBanners workspaceId="wksA" workspaceSlug="acme" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  billingData.state = { status: 'loading' };
});

describe('BillingBanners', () => {
  it('renders nothing while loading and on a healthy active workspace', () => {
    renderBanners();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    billingData.state = { status: 'ready', billing: billing({ waUsedFraction: 0.69 }) };
    renderBanners();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the dismissible usage warning at 70%', async () => {
    billingData.state = {
      status: 'ready',
      billing: billing({ waUsed: 175, waUsedFraction: 0.7 }),
    };
    renderBanners();

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent(/70% of this month's whatsapp allowance/i);
    expect(banner).toHaveTextContent('175 of 250');
    expect(screen.getByRole('link', { name: /view usage/i })).toHaveAttribute(
      'href',
      '/acme/settings/billing',
    );

    await userEvent.click(screen.getByRole('button', { name: /dismiss usage warning/i }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('still warns at 90%+ via the same banner', () => {
    billingData.state = {
      status: 'ready',
      billing: billing({ waUsed: 230, waUsedFraction: 0.92 }),
    };
    renderBanners();
    expect(screen.getByRole('status')).toHaveTextContent(/92%/);
  });

  it('shows the read-only alert with trial copy, taking precedence over usage', () => {
    billingData.state = {
      status: 'ready',
      billing: billing({ plan: 'trial', billingStatus: 'read_only', waUsedFraction: 0.95 }),
    };
    renderBanners();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/your trial has ended/i);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see billing options/i })).toHaveAttribute(
      'href',
      '/acme/settings/billing',
    );
  });

  it('uses plan-expired copy for a read-only paid workspace', () => {
    billingData.state = {
      status: 'ready',
      billing: billing({ plan: 'business', billingStatus: 'read_only' }),
    };
    renderBanners();
    expect(screen.getByRole('alert')).toHaveTextContent(/its plan has expired/i);
  });
});
