/**
 * Shell-level billing banners (#24). Read-only takes precedence (role=alert,
 * not dismissible); the ≥70% WhatsApp-usage warning is role=status and
 * dismissible for the session. Both deep-link to the Billing settings page.
 */

import { Link } from 'react-router';
import { useState } from 'react';

import { USAGE_WARN_AT, useWorkspaceBilling } from './useWorkspaceBilling.ts';

export interface IBillingBannersProps {
  workspaceId: string;
  workspaceSlug: string;
}

export function BillingBanners({ workspaceId, workspaceSlug }: IBillingBannersProps) {
  const state = useWorkspaceBilling(workspaceId);
  const [usageDismissed, setUsageDismissed] = useState(false);

  if (state.status !== 'ready') {
    return null;
  }
  const { billing } = state;
  const billingHref = `/${workspaceSlug}/settings/billing`;

  if (billing.billingStatus === 'read_only') {
    return (
      <div
        role="alert"
        className="mb-6 rounded-md border border-destructive bg-destructive/10 px-4 py-3 text-sm"
      >
        <p className="font-semibold text-destructive">
          {billing.plan === 'trial'
            ? 'Your trial has ended — this workspace is now read-only.'
            : 'This workspace is read-only — its plan has expired.'}
        </p>
        <p className="mt-1">
          Your data is safe and everything stays viewable.{' '}
          <Link to={billingHref} className="font-medium underline">
            See billing options
          </Link>{' '}
          to reactivate.
        </p>
      </div>
    );
  }

  if (billing.waUsedFraction >= USAGE_WARN_AT && !usageDismissed) {
    const pct = Math.floor(billing.waUsedFraction * 100);
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-6 flex items-start justify-between gap-4 rounded-md border border-border bg-muted px-4 py-3 text-sm"
      >
        <p>
          You've used {pct}% of this month's WhatsApp allowance ({billing.waUsed} of{' '}
          {billing.waIncluded}).{' '}
          <Link to={billingHref} className="font-medium underline">
            View usage
          </Link>
        </p>
        <button
          type="button"
          onClick={() => setUsageDismissed(true)}
          aria-label="Dismiss usage warning"
          className="shrink-0 rounded px-1 text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      </div>
    );
  }

  return null;
}
