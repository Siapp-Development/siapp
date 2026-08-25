/**
 * Collaborator notes for the /t page (#22, D-c): add a note (via the
 * submitCollabUpdate callable) and read back ONLY this collaborator's own
 * entries — rules deny everything else.
 */

import { Quote, Send } from 'lucide-react';
import { useId, useState } from 'react';

import type { TCollabUpdatesState } from './useCollabTask.ts';

const TIME_FORMAT = new Intl.DateTimeFormat('en-MY', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const STATUS_LABELS: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
};

function updateLine(action: string, text: string, to: string): string {
  if (action === 'comment') {
    return text;
  }
  if (action === 'status_change') {
    return text !== ''
      ? `Asked for help: ${text}`
      : `Status changed to ${STATUS_LABELS[to] ?? to}`;
  }
  return text !== '' ? text : to;
}

export function CollabNotes({
  updates,
  busy,
  onAddNote,
}: {
  updates: TCollabUpdatesState;
  busy: boolean;
  onAddNote: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const fieldId = useId();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed === '') {
      return;
    }
    await onAddNote(trimmed);
    setText('');
  }

  return (
    <section aria-labelledby="collab-notes-heading" className="space-y-4">
      <h2 id="collab-notes-heading" className="text-lg font-semibold">
        Your notes
      </h2>
      <form onSubmit={(event) => void handleSubmit(event)} className="space-y-3">
        <label htmlFor={fieldId} className="block text-sm font-medium">
          Add a note for the project team
        </label>
        <textarea
          id={fieldId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={5000}
          rows={3}
          placeholder="Type your note here…"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <button
          type="submit"
          disabled={busy || text.trim() === ''}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-card hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Send note
          <Send aria-hidden="true" className="size-4" />
        </button>
      </form>
      {updates.status === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your notes&hellip;
        </p>
      ) : updates.status === 'error' ? (
        <p role="alert" className="text-sm text-destructive">
          Your notes couldn&rsquo;t be loaded.
        </p>
      ) : updates.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {updates.rows.map((row) => (
            <li
              key={row.id}
              className="flex gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
            >
              <span
                aria-hidden="true"
                className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <Quote className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm">{updateLine(row.action, row.text, row.to)}</p>
                {row.createdAt !== null ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {TIME_FORMAT.format(row.createdAt)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
