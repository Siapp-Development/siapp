/**
 * Collaborator access-link distribution (#127): Copy / Reset / Send-via-WhatsApp
 * for a collaborator's ONE durable, workspace-scoped access link. Reused by the
 * Collaborators card (`variant="card"`, all three actions) and by the
 * collaborator assignee chip in the task panel (`variant="chip"`, copy-icon
 * only).
 *
 * Durable, reset-only (locked): Copy and Send-via-WhatsApp are idempotent —
 * they re-surface the SAME URL every time (get-or-create), so earlier links
 * keep working and no "earlier links stop working" warning is shown. ONLY the
 * explicit "Reset link" action rotates (revoke + mint), and it first asks for
 * confirmation because it invalidates the collaborator's current link.
 */

import { Button, ConfirmDialog } from '@siapp/ui';
import { Copy, Link2, MessageCircle, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { issueCollaboratorLink, sendCollaboratorLink } from '@/lib/callables.ts';

const EXPIRY_FORMAT = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function formatExpiry(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : EXPIRY_FORMAT.format(date);
}

type TLinkState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'copied'; expiresAt: string }
  | { status: 'reset'; expiresAt: string }
  | { status: 'shown'; url: string; expiresAt: string; reset: boolean }
  | { status: 'sent'; expiresAt: string }
  | { status: 'opted_out' }
  | { status: 'no_consent' }
  | { status: 'no_phone' }
  | { status: 'error' };

const ICON_BUTTON_CLASS =
  'h-8 w-8 p-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card';

export interface ICollabAccessLinkButtonProps {
  workspaceId: string;
  collaboratorId: string;
  collaboratorName: string;
  variant: 'card' | 'chip';
}

/** The transient status message announced in the live region, or ''. */
function statusMessage(state: TLinkState): string {
  switch (state.status) {
    case 'copied':
      // Durable link: copying re-surfaces the same URL, so no invalidation.
      return `Access link copied — valid until ${formatExpiry(state.expiresAt)}.`;
    case 'reset':
      return `Link reset — a new link is valid until ${formatExpiry(state.expiresAt)}. The previous link no longer works.`;
    case 'shown':
      return state.reset
        ? `New link (valid until ${formatExpiry(state.expiresAt)}, the previous link no longer works): ${state.url}`
        : `Access link (valid until ${formatExpiry(state.expiresAt)}): ${state.url}`;
    case 'sent':
      return `Access link sent via WhatsApp — valid until ${formatExpiry(state.expiresAt)}.`;
    case 'opted_out':
      return 'This collaborator has turned off WhatsApp notifications, so no message was sent.';
    case 'no_consent':
      return 'This collaborator has not consented to WhatsApp, so no message was sent.';
    case 'no_phone':
      return 'This collaborator has no phone number on file, so no message was sent.';
    case 'error':
      return 'Something went wrong. Please try again.';
    default:
      return '';
  }
}

export function CollabAccessLinkButton({
  workspaceId,
  collaboratorId,
  collaboratorName,
  variant,
}: ICollabAccessLinkButtonProps) {
  const [state, setState] = useState<TLinkState>({ status: 'idle' });
  const [confirmingReset, setConfirmingReset] = useState(false);
  const working = state.status === 'working';

  async function issueAndCopy(reset: boolean): Promise<void> {
    setState({ status: 'working' });
    try {
      const { url, expiresAt } = await issueCollaboratorLink({
        workspaceId,
        collaboratorId,
        ...(reset ? { reset: true } : {}),
      });
      try {
        await navigator.clipboard.writeText(url);
        setState(reset ? { status: 'reset', expiresAt } : { status: 'copied', expiresAt });
      } catch {
        // Clipboard denied (permissions/insecure context) — show the URL.
        setState({ status: 'shown', url, expiresAt, reset });
      }
    } catch {
      setState({ status: 'error' });
    }
  }

  async function confirmReset(): Promise<void> {
    setConfirmingReset(false);
    await issueAndCopy(true);
  }

  async function send(): Promise<void> {
    setState({ status: 'working' });
    try {
      const result = await sendCollaboratorLink({ workspaceId, collaboratorId });
      if (result.status === 'queued') {
        setState({ status: 'sent', expiresAt: result.expiresAt });
      } else if (result.status === 'opted_out') {
        setState({ status: 'opted_out' });
      } else if (result.status === 'no_phone') {
        setState({ status: 'no_phone' });
      } else {
        setState({ status: 'no_consent' });
      }
    } catch {
      setState({ status: 'error' });
    }
  }

  const message = statusMessage(state);
  const isError =
    state.status === 'error' ||
    state.status === 'opted_out' ||
    state.status === 'no_consent' ||
    state.status === 'no_phone';

  if (variant === 'chip') {
    return (
      <>
        <button
          type="button"
          aria-label={`Copy ${collaboratorName}'s access link`}
          disabled={working}
          onClick={() => void issueAndCopy(false)}
          className="inline-flex items-center rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {message}
        </span>
      </>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Copy ${collaboratorName}'s access link`}
          className={ICON_BUTTON_CLASS}
          disabled={working}
          onClick={() => void issueAndCopy(false)}
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Reset ${collaboratorName}'s access link`}
          className={ICON_BUTTON_CLASS}
          disabled={working}
          onClick={() => setConfirmingReset(true)}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Send ${collaboratorName}'s access link via WhatsApp`}
          className={ICON_BUTTON_CLASS}
          disabled={working}
          onClick={() => void send()}
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <span
        role="status"
        aria-live="polite"
        className={`text-xs ${isError ? 'text-destructive' : 'text-primary'} ${message === '' ? 'sr-only' : ''}`}
      >
        {message}
      </span>
      <ConfirmDialog
        open={confirmingReset}
        title={`Reset ${collaboratorName}'s access link?`}
        description="This invalidates the collaborator's current link. Anyone using the old link will lose access, and you'll need to share the new one."
        confirmLabel="Reset link"
        variant="destructive"
        pending={working}
        onConfirm={() => void confirmReset()}
        onCancel={() => setConfirmingReset(false)}
      />
    </div>
  );
}
