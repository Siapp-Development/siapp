/**
 * Status actions for the /t page (#22, Q1 submit-only): todo → Start task;
 * in_progress/blocked → Mark as done. Done tasks show a confirmation line
 * instead of actions.
 */

import type { TTaskStatus } from '@siapp/shared';

const BUTTON_CLASS =
  'min-h-11 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

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
      <p role="status" className="text-sm font-medium text-muted-foreground">
        Task completed — thank you. The project team has been notified.
      </p>
    );
  }
  if (status === 'todo') {
    return (
      <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={onStart}>
        Start task
      </button>
    );
  }
  return (
    <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={onDone}>
      Mark as done
    </button>
  );
}
