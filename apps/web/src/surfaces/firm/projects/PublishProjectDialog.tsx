/**
 * Publish button + confirmation dialog (D-027). Reuses the existing
 * `setProjectLifecycle` mechanism: opening runs a `dryRun` to fetch the
 * WhatsApp count + estimated cost preview, and confirming re-calls it without
 * `dryRun`. Extracted from the old inline `PublishConfirm` so the single
 * publish entry point is the header button next to the DRAFT badge.
 */

import type { IPublishPreview } from '@siapp/shared';
import { Button, ConfirmDialog } from '@siapp/ui';
import { useState } from 'react';

import { projectErrorCode, setProjectLifecycle } from '@/lib/callables.ts';

const PUBLISH_ERROR_MESSAGES: Record<string, string> = {
  'project/not-found': 'This project no longer exists.',
  'project/invalid-transition': 'This project has changed — refresh and try again.',
  'project/forbidden-transition': 'Your role cannot publish this project.',
};

function publishErrorMessage(err: unknown): string {
  const code = projectErrorCode(err);
  if (code !== null && code in PUBLISH_ERROR_MESSAGES) {
    return PUBLISH_ERROR_MESSAGES[code];
  }
  return err instanceof Error ? err.message : 'Could not publish the project.';
}

export interface IPublishProjectDialogProps {
  workspaceId: string;
  projectId: string;
}

export function PublishProjectDialog({ workspaceId, projectId }: IPublishProjectDialogProps) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<IPublishPreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDialog(): Promise<void> {
    setOpen(true);
    setPreview(null);
    setError(null);
    setPending(true);
    try {
      const result = await setProjectLifecycle({
        workspaceId,
        projectId,
        action: 'publish',
        dryRun: true,
      });
      setPreview(result.publishPreview ?? { waCount: 0, estimatedCostMyr: 0 });
    } catch (err) {
      setError(publishErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  async function confirmPublish(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await setProjectLifecycle({ workspaceId, projectId, action: 'publish' });
      setOpen(false);
    } catch (err) {
      setError(publishErrorMessage(err));
      setPending(false);
    }
  }

  function cancel(): void {
    setOpen(false);
    setPending(false);
    setError(null);
    setPreview(null);
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="bg-success text-primary-foreground shadow-card hover:bg-success/90"
        onClick={() => void openDialog()}
      >
        Publish
      </Button>
      <ConfirmDialog
        open={open}
        title="Publish this project?"
        confirmLabel="Publish"
        pending={pending}
        error={error}
        onConfirm={() => void confirmPublish()}
        onCancel={cancel}
      >
        <p className="mt-2 text-sm text-muted-foreground">
          {preview === null
            ? 'Checking what will be sent…'
            : preview.waCount === 0
              ? 'No WhatsApp messages will be sent.'
              : `${preview.waCount} WhatsApp ${
                  preview.waCount === 1 ? 'message' : 'messages'
                } will be sent — est. RM ${preview.estimatedCostMyr.toFixed(2)}.`}
        </p>
      </ConfirmDialog>
    </>
  );
}
