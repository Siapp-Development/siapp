import type { TMemberRole, TProjectLifecycle } from '@siapp/shared';
import { Button } from '@siapp/ui';
import { useState } from 'react';

import { issueCollabLink } from '@/lib/callables.ts';

export interface ICollabLinkButtonProps {
  workspaceId: string;
  projectId: string;
  taskId: string;
  collaboratorId: string;
  collaboratorName: string;
  lifecycle: TProjectLifecycle;
  role: TMemberRole;
}

type TLinkState =
  | { status: 'idle' }
  | { status: 'working' }
  | { status: 'copied'; expiresAt: string }
  | { status: 'shown'; url: string; expiresAt: string }
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
 * Firm-side "Copy task link" per collaborator assignee (#22, D-e).
 * Every issue rotates the collaborator's link for this task — copying both
 * mints a fresh 90-day link and invalidates earlier ones, so the row shows a
 * rotation warning alongside the expiry.
 */
export function CollabLinkButton({
  workspaceId,
  projectId,
  taskId,
  collaboratorId,
  collaboratorName,
  lifecycle,
  role,
}: ICollabLinkButtonProps) {
  const [state, setState] = useState<TLinkState>({ status: 'idle' });

  const canIssueRole = role === 'owner' || role === 'admin' || role === 'pm';
  const blockedReason = !canIssueRole
    ? 'Only owners, admins and PMs can share task links.'
    : lifecycle !== 'published' && lifecycle !== 'completed'
      ? 'Publish the project before sharing task links.'
      : null;

  async function issue(): Promise<void> {
    setState({ status: 'working' });
    try {
      const { url, expiresAt } = await issueCollabLink({
        workspaceId,
        projectId,
        taskId,
        collaboratorId,
      });
      try {
        await navigator.clipboard.writeText(url);
        setState({ status: 'copied', expiresAt });
      } catch {
        // Clipboard denied (permissions/insecure context) — show the URL.
        setState({ status: 'shown', url, expiresAt });
      }
    } catch {
      setState({ status: 'error' });
    }
  }

  if (blockedReason !== null) {
    return <p className="text-xs text-muted-foreground">{blockedReason}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={state.status === 'working'}
        onClick={() => void issue()}
      >
        Copy task link for {collaboratorName}
      </Button>
      {state.status === 'copied' && (
        <p role="status" className="text-xs text-primary">
          Link copied — valid until {formatExpiry(state.expiresAt)}. Earlier links stop working.
        </p>
      )}
      {state.status === 'shown' && (
        <p role="status" className="break-all text-xs">
          New link (valid until {formatExpiry(state.expiresAt)}, earlier links stop working):{' '}
          <span className="font-mono">{state.url}</span>
        </p>
      )}
      {state.status === 'error' && (
        <p role="alert" className="text-xs text-destructive">
          Couldn&rsquo;t issue the link. Please try again.
        </p>
      )}
    </div>
  );
}
