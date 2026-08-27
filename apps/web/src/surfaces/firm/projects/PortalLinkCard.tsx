import type { TMemberRole, TProjectLifecycle } from '@siapp/shared';
import { Button, Card, CardContent, CardHeader } from '@siapp/ui';
import { useState } from 'react';

import { issuePortalLink, sendPortalLink } from '@/lib/callables.ts';

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
  | { status: 'sent'; expiresAt: string }
  | { status: 'opted_out' }
  | { status: 'no_consent' }
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
 * confirm-guarded variant that audit-logs as portal_link.reset. "Send portal
 * link" (#137, Part C) mints a fresh link and enqueues it over WhatsApp,
 * honouring the client's opt-out / consent.
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

  const working = state.status === 'working';

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

  async function send(): Promise<void> {
    setState({ status: 'working' });
    setConfirmingReset(false);
    try {
      const result = await sendPortalLink({ workspaceId, projectId });
      if (result.status === 'queued') {
        setState({ status: 'sent', expiresAt: result.expiresAt });
      } else if (result.status === 'opted_out') {
        setState({ status: 'opted_out' });
      } else {
        setState({ status: 'no_consent' });
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
                disabled={working}
                onClick={() => void issue(false)}
              >
                Copy portal link
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={working}
                onClick={() => void send()}
              >
                Send portal link
              </Button>
              {confirmingReset ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={working}
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
                  disabled={working}
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
            {state.status === 'sent' && (
              <p role="status" className="text-sm text-primary">
                Portal link sent via WhatsApp — valid until {formatExpiry(state.expiresAt)}.
              </p>
            )}
            {state.status === 'opted_out' && (
              <p role="status" className="text-sm text-destructive">
                This client has turned off WhatsApp notifications, so no message was sent.
              </p>
            )}
            {state.status === 'no_consent' && (
              <p role="status" className="text-sm text-destructive">
                This client has not consented to WhatsApp, so no message was sent.
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
