import type {
  IPortalClientLink,
  IPortalClientSendResult,
  TMemberRole,
  TProjectLifecycle,
} from '@siapp/shared';
import { Button, Card, CardContent, CardHeader } from '@siapp/ui';
import { useState } from 'react';

import { issuePortalLink, sendPortalLink } from '@/lib/callables.ts';

import type { IProjectClientRef } from './useProjects.ts';

export interface IPortalLinkCardProps {
  workspaceId: string;
  projectId: string;
  lifecycle: TProjectLifecycle;
  /** Linked clients (#157). Empty → the card is gated with a "link a client" hint. */
  clients: readonly IProjectClientRef[];
  role: TMemberRole;
}

type TLinkState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'links'; links: IPortalClientLink[]; copiedClientId: string | null }
  | { status: 'sent'; results: IPortalClientSendResult[] }
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

function sendResultMessage(result: IPortalClientSendResult): string {
  switch (result.status) {
    case 'queued':
      return `Sent via WhatsApp — valid until ${formatExpiry(result.expiresAt ?? '')}.`;
    case 'opted_out':
      return 'Turned off WhatsApp notifications — no message sent.';
    case 'no_consent':
      return 'Has not consented to WhatsApp — no message sent.';
    case 'no_phone':
      return 'No phone number on file — no message sent.';
    case 'duplicate_phone':
      return 'Shares a phone with another client — one message covers both.';
    default:
      return 'No message sent.';
  }
}

/**
 * Firm-side portal link controls (#21, D2; #157) in the project Details tab.
 * Every linked client has its OWN durable, client-scoped portal link — Copy and
 * Send fan out across all clients (#157 D3), and Send de-dupes WhatsApp messages
 * by shared phone (D4). "Copy" auto-copies to the clipboard only when a single
 * client is linked; with several clients each link is listed for manual copy.
 *
 * Durable, reset-only: "Copy" and "Send portal link" are idempotent — they
 * get-or-create and re-surface the SAME links every time, so earlier links keep
 * working. Only the explicit, confirm-guarded "Reset link" rotates every
 * client's link (audit-logged as portal_link.reset).
 */
export function PortalLinkCard({
  workspaceId,
  projectId,
  lifecycle,
  clients,
  role,
}: IPortalLinkCardProps) {
  const [state, setState] = useState<TLinkState>({ status: 'idle' });
  const [confirmingReset, setConfirmingReset] = useState(false);

  const canIssueRole = role === 'owner' || role === 'admin' || role === 'pm';
  const blockedReason = !canIssueRole
    ? 'Only owners, admins and PMs can share portal links.'
    : lifecycle !== 'published' && lifecycle !== 'completed'
      ? 'Publish the project before sharing a portal link.'
      : clients.length === 0
        ? 'Link a client to the project first.'
        : null;

  const working = state.status === 'working';

  async function issue(reset: boolean): Promise<void> {
    setState({ status: 'working' });
    setConfirmingReset(false);
    try {
      const { links } = await issuePortalLink({
        workspaceId,
        projectId,
        ...(reset ? { reset: true } : {}),
      });
      // Auto-copy only makes sense for a single link; multi-client projects list
      // each link for manual copy instead.
      let copiedClientId: string | null = null;
      const only = links.length === 1 ? links[0] : undefined;
      if (only !== undefined) {
        try {
          await navigator.clipboard.writeText(only.url);
          copiedClientId = only.clientId;
        } catch {
          // Clipboard denied (permissions/insecure context) — fall back to display.
        }
      }
      setState({ status: 'links', links, copiedClientId });
    } catch {
      setState({ status: 'error' });
    }
  }

  async function copyOne(link: IPortalClientLink, links: IPortalClientLink[]): Promise<void> {
    try {
      await navigator.clipboard.writeText(link.url);
      setState({ status: 'links', links, copiedClientId: link.clientId });
    } catch {
      // Leave the current listing in place; the URL is already shown for manual copy.
    }
  }

  async function send(): Promise<void> {
    setState({ status: 'working' });
    setConfirmingReset(false);
    try {
      const { results } = await sendPortalLink({ workspaceId, projectId });
      setState({ status: 'sent', results });
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
              Each client gets their own link, valid 90 days. Copy and Send re-surface the same
              links — earlier links keep working. Only Reset rotates them.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={working} onClick={() => void issue(false)}>
                {clients.length > 1 ? 'Get portal links' : 'Copy portal link'}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={working}
                onClick={() => void send()}
              >
                Send portal link{clients.length > 1 ? 's' : ''}
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
                  Reset link{clients.length > 1 ? 's' : ''}
                </Button>
              )}
            </div>
            {state.status === 'links' && (
              <ul className="flex flex-col gap-2" aria-label="Portal links">
                {state.links.map((link) => (
                  <li key={link.clientId} className="text-sm">
                    <span className="font-medium">{link.clientName}</span> — valid until{' '}
                    {formatExpiry(link.expiresAt)}
                    {state.copiedClientId === link.clientId ? (
                      <span className="ml-2 text-primary" role="status">
                        Copied
                      </span>
                    ) : (
                      <>
                        {': '}
                        <span className="break-all font-mono">{link.url}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="ml-2"
                          onClick={() => void copyOne(link, state.links)}
                        >
                          Copy
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {state.status === 'sent' && (
              <ul className="flex flex-col gap-1" aria-label="Send results">
                {state.results.map((result) => (
                  <li
                    key={result.clientId}
                    className={`text-sm ${
                      result.status === 'queued' ? 'text-primary' : 'text-muted-foreground'
                    }`}
                    role="status"
                  >
                    <span className="font-medium">{result.clientName}</span>:{' '}
                    {sendResultMessage(result)}
                  </li>
                ))}
              </ul>
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
