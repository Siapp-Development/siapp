/**
 * Need-help disclosure + form for the /t page (#22, D-d): submitting sets
 * the task to blocked with the reason; the firm gets a task_blocked WA (#18)
 * and a collaborator_need_help activity entry (Q2).
 */

import { useId, useState } from 'react';

export function NeedHelpForm({
  busy,
  alreadyBlocked,
  onSubmit,
}: {
  busy: boolean;
  /** Task already blocked — form stays available to update the reason. */
  alreadyBlocked: boolean;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const fieldId = useId();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed === '') {
      return;
    }
    await onSubmit(trimmed);
    setReason('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        className="min-h-11 rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={() => setOpen(true)}
      >
        {alreadyBlocked ? 'Update help request' : 'I need help'}
      </button>
    );
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
      <label htmlFor={fieldId} className="block text-sm font-medium">
        What do you need help with?
      </label>
      <textarea
        id={fieldId}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={1000}
        rows={3}
        required
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <div className="flex gap-3">
        <button
          type="submit"
          disabled={busy || reason.trim() === ''}
          className="min-h-11 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Send help request
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-md border border-border px-5 py-2.5 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
