/**
 * Status actions for the /t page (#22, Q1 submit-only): todo → Start task;
 * in_progress/blocked → Mark as done. Done tasks show a confirmation line
 * instead of actions.
 */

import type { TTaskStatus } from '@siapp/shared';
import { CheckCircle2, Play } from 'lucide-react';

const BUTTON_CLASS =
  'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-card hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function CollabStatusButtons({
  status,
  busy,
  onStart,
  onDone,
}: {
  status: TTaskStatus;
  busy: boolean;
  onStart: () => void;
  onDone: () => void;
}) {
  if (status === 'done') {
    return (
      <p
        role="status"
        className="inline-flex items-center gap-2 text-sm font-medium text-success"
      >
        <CheckCircle2 aria-hidden="true" className="size-4" />
        Task completed — thank you. The project team has been notified.
      </p>
    );
  }
  if (status === 'todo') {
    return (
      <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={onStart}>
        <Play aria-hidden="true" className="size-4" />
        Start task
      </button>
    );
  }
  return (
    <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={onDone}>
      <CheckCircle2 aria-hidden="true" className="size-4" />
      Mark as done
    </button>
  );
}
