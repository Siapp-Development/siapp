import type { TMemberRole, TProjectLifecycle } from '@siapp/shared';
import { Button, Card, CardContent, CardHeader } from '@siapp/ui';
import { useState } from 'react';

import { issuePortalLink } from '@/lib/callables.ts';

export interface IPortalLinkCardProps {
  workspaceId: string;
  projectId: string;
  lifecycle: TProjectLifecycle;
  clientId: string;
  role: TMemberRole;
}

type TLinkState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'copied'; expiresAt: string }
  | { status: 'reset'; url: string; expiresAt: string }
  | { status: 'error' };

const EXPIRY_FORMAT = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatExpiry(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : EXPIRY_FORMAT.format(date);
}

/**
 * Firm-side portal link controls (#21, D2) in the project Details tab.
 * Every issue rotates the link (only the secret's hash is at rest), so
 * "Copy" both mints and invalidates earlier links; "Reset" is the explicit,
 * confirm-guarded variant that audit-logs as portal_link.reset.
 */
export function PortalLinkCard({
  workspaceId,
  projectId,
  lifecycle,
  clientId,
  role,
}: IPortalLinkCardProps) {
  const [state, setState] = useState<TLinkState>({ status: 'idle' });
  const [confirmingReset, setConfirmingReset] = useState(false);

  const canIssueRole = role === 'owner' || role === 'admin' || role === 'pm';
  const blockedReason = !canIssueRole
    ? 'Only owners, admins and PMs can share portal links.'
    : lifecycle !== 'published' && lifecycle !== 'completed'
      ? 'Publish the project before sharing a portal link.'
      : clientId === ''
        ? 'Link a client to the project first.'
        : null;

  async function issue(reset: boolean): Promise<void> {
    setState({ status: 'working' });
    setConfirmingReset(false);
    try {
      const { url, expiresAt } = await issuePortalLink({
        workspaceId,
        projectId,
        ...(reset ? { reset: true } : {}),
      });
      try {
        await navigator.clipboard.writeText(url);
        setState({ status: 'copied', expiresAt });
      } catch {
        // Clipboard denied (permissions/insecure context) — show the URL.
        setState({ status: 'reset', url, expiresAt });
      }
    } catch {
      setState({ status: 'error' });
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Client portal link</h2>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {blockedReason !== null ? (
          <p className="text-sm text-muted-foreground">{blockedReason}</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Links last 90 days. Copying issues a fresh link — earlier links stop working.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={state.status === 'working'}
                onClick={() => void issue(false)}
              >
                Copy portal link
              </Button>
              {confirmingReset ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={state.status === 'working'}
                    onClick={() => void issue(true)}
                  >
                    Confirm reset
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmingReset(false)}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={state.status === 'working'}
                  onClick={() => setConfirmingReset(true)}
                >
                  Reset link
                </Button>
              )}
            </div>
            {state.status === 'copied' && (
              <p role="status" className="text-sm text-primary">
                Link copied — valid until {formatExpiry(state.expiresAt)}.
              </p>
            )}
            {state.status === 'reset' && (
              <p role="status" className="break-all text-sm">
                New link (valid until {formatExpiry(state.expiresAt)}):{' '}
                <span className="font-mono">{state.url}</span>
              </p>
            )}
            {state.status === 'error' && (
              <p role="alert" className="text-sm text-destructive">
                Couldn&rsquo;t issue the link. Please try again.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
