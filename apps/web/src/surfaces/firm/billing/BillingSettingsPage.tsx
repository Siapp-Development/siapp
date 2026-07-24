/**
 * Billing settings page (#24, D-019). Manual billing at MVP (D8): no
 * self-serve checkout or invoice history — plan/usage readout, a static
 * plan-comparison table off the shared constants, and a mailto CTA. Tiers
 * are billing metadata only (D1): nothing here gates features. Owner/admin
 * only; pm/viewer get the same not-available treatment as team settings.
 */

import {
  PLAN_PRICES_MYR,
  TRIAL_DAYS,
  USAGE_ALERT_AT,
  USAGE_WARN_AT,
  WA_ALLOWANCE,
  type TMemberRole,
} from '@siapp/shared';
import { Card, CardContent, CardHeader } from '@siapp/ui';

import { useWorkspaceBilling, type IWorkspaceBilling } from './useWorkspaceBilling.ts';

export interface IBillingSettingsPageProps {
  workspaceId: string;
  workspaceName: string;
  role: TMemberRole;
}

const BILLING_EMAIL = 'billing@siapp.app';

function formatDate(date: Date | null): string {
  if (date === null) return '—';
  return date.toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' });
}

const PLAN_LABELS: Record<string, string> = {
  trial: 'Trial',
  standard: 'Standard',
  business: 'Business',
};

function PlanCard({ billing }: { billing: IWorkspaceBilling }) {
  const isTrial = billing.plan === 'trial';
  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium">Current plan</h2>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Plan</dt>
            <dd className="font-medium">{PLAN_LABELS[billing.plan]}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Seats</dt>
            <dd className="font-medium">
              {billing.seatsUsed} / {billing.seatLimit}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Price</dt>
            <dd className="font-medium">
              {isTrial
                ? 'Free'
                : `RM ${(PLAN_PRICES_MYR[billing.plan] * billing.seatLimit).toLocaleString()}/yr`}
            </dd>
          </div>
          <div>
            {/* D6: one expiry field — the label carries the meaning. */}
            <dt className="text-muted-foreground">{isTrial ? 'Trial ends' : 'Renews'}</dt>
            <dd className="font-medium">{formatDate(billing.planExpiresAt)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function UsageCard({ billing }: { billing: IWorkspaceBilling }) {
  const pct = Math.min(100, Math.round(billing.waUsedFraction * 100));
  const overForecast = billing.waForecast > billing.waIncluded;
  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium">WhatsApp usage this month</h2>
      </CardHeader>
      <CardContent>
        <p className="text-sm">
          <span className="font-medium">{billing.waUsed}</span> of{' '}
          <span className="font-medium">{billing.waIncluded}</span> included conversations used
        </p>
        <div
          role="progressbar"
          aria-valuenow={billing.waUsed}
          aria-valuemin={0}
          aria-valuemax={billing.waIncluded}
          aria-label="WhatsApp conversations used this month"
          className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-muted"
        >
          <div
            className={
              billing.waUsedFraction >= USAGE_ALERT_AT
                ? 'h-full bg-destructive'
                : billing.waUsedFraction >= USAGE_WARN_AT
                  ? 'h-full bg-accent'
                  : 'h-full bg-primary'
            }
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Projected by month end: <span className="font-medium">{billing.waForecast}</span>{' '}
          conversations
          {overForecast &&
            ' — on pace to exceed the included allowance. Extra conversations are billed at cost on your next invoice.'}
        </p>
      </CardContent>
    </Card>
  );
}

function PlanTable() {
  return (
    <Card>
      <CardHeader>
        <h2 className="font-medium">Plans</h2>
      </CardHeader>
      <CardContent>
        <table className="min-w-full max-w-2xl text-sm" aria-label="Plan comparison">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Plan</th>
              <th className="py-2 pr-4 font-medium">Price</th>
              <th className="py-2 font-medium">WhatsApp conversations / month</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2 pr-4 font-medium">Trial</td>
              <td className="py-2 pr-4">Free for {TRIAL_DAYS} days</td>
              <td className="py-2">{WA_ALLOWANCE.trial.amount} (workspace pool)</td>
            </tr>
            <tr className="border-b">
              <td className="py-2 pr-4 font-medium">Standard</td>
              <td className="py-2 pr-4">RM {PLAN_PRICES_MYR.standard} per seat / year</td>
              <td className="py-2">{WA_ALLOWANCE.standard.amount} per seat</td>
            </tr>
            <tr>
              <td className="py-2 pr-4 font-medium">Business</td>
              <td className="py-2 pr-4">RM {PLAN_PRICES_MYR.business} per seat / year</td>
              <td className="py-2">{WA_ALLOWANCE.business.amount} per seat</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          All plans include every feature — tiers only set seats and the WhatsApp allowance.
        </p>
      </CardContent>
    </Card>
  );
}

export function BillingSettingsPage({ workspaceId, workspaceName, role }: IBillingSettingsPageProps) {
  const state = useWorkspaceBilling(workspaceId);

  if (role !== 'owner' && role !== 'admin') {
    return (
      <section aria-labelledby="billing-heading">
        <h1 id="billing-heading" className="text-xl font-semibold">Billing</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Billing is only available to workspace owners and admins.
        </p>
      </section>
    );
  }

  if (state.status === 'loading') {
    return (
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        Loading billing…
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't load billing for {workspaceName}. Try again later.
      </p>
    );
  }

  const { billing } = state;
  const mailto = `mailto:${BILLING_EMAIL}?subject=${encodeURIComponent(
    `Siapp billing — ${workspaceName}`,
  )}`;

  return (
    <section aria-labelledby="billing-heading" className="flex flex-col gap-6">
      <div>
        <h1 id="billing-heading" className="text-xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We send invoices by email, payable by FPX bank transfer or a card payment link. No card
          details are stored in the app.
        </p>
      </div>

      {billing.billingStatus === 'read_only' && (
        <div
          role="alert"
          className="rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm"
        >
          <p className="font-semibold text-destructive">
            {billing.plan === 'trial'
              ? 'Your trial has ended and this workspace is read-only.'
              : 'This workspace is read-only because its plan has expired.'}
          </p>
          <p className="mt-1">
            All your projects, tasks and documents are preserved and still viewable — including
            by your clients. Email{' '}
            <a href={mailto} className="font-medium underline">
              {BILLING_EMAIL}
            </a>{' '}
            to reactivate.
          </p>
        </div>
      )}

      <PlanCard billing={billing} />
      <UsageCard billing={billing} />
      <PlanTable />

      <div>
        <a
          href={mailto}
          className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Contact us about your plan
        </a>
        <p className="mt-2 text-xs text-muted-foreground">
          Upgrades, seat changes and renewals are handled over email — we'll confirm the same
          working day.
        </p>
      </div>
    </section>
  );
}
