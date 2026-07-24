import { Button, Card, CardContent, CardHeader, Input, Label } from '@siapp/ui';
import { useState, type FormEvent } from 'react';

import {
  addMilestone,
  removeMilestone,
  setMilestoneDone,
  useMilestones,
} from './useMilestones.ts';

const DATE_FORMAT = new Intl.DateTimeFormat('en-MY', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export interface IMilestonesEditorProps {
  workspaceId: string;
  projectId: string;
  canEdit: boolean;
}

/**
 * Minimal milestones editor (#21, Q2) for the project Details tab: add
 * (name + target date), toggle done, delete. The portal overview shows the
 * earliest incomplete milestone as "next milestone".
 */
export function MilestonesEditor({ workspaceId, projectId, canEdit }: IMilestonesEditorProps) {
  const state = useMilestones(workspaceId, projectId);
  const [name, setName] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [failed, setFailed] = useState(false);

  async function handleAdd(event: FormEvent): Promise<void> {
    event.preventDefault();
    const targetDate = new Date(`${dateInput}T00:00:00`);
    if (name.trim() === '' || Number.isNaN(targetDate.getTime())) {
      return;
    }
    setFailed(false);
    try {
      await addMilestone(workspaceId, projectId, { name: name.trim(), targetDate });
      setName('');
      setDateInput('');
    } catch {
      setFailed(true);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Milestones</h2>
        <p className="text-sm text-muted-foreground">
          Shown to your client as &ldquo;next milestone&rdquo; on their portal.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {state.status === 'loading' && <p className="text-sm">Loading milestones…</p>}
        {state.status === 'error' && (
          <p role="alert" className="text-sm text-destructive">
            Milestones could not be loaded.
          </p>
        )}
        {state.status === 'ready' &&
          (state.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No milestones yet.</p>
          ) : (
            <ul aria-label="Milestones" className="flex flex-col gap-2">
              {state.rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 rounded-md border p-2 text-sm">
                  <input
                    type="checkbox"
                    id={`milestone-done-${row.id}`}
                    checked={row.completedAt !== null}
                    disabled={!canEdit}
                    onChange={(event) =>
                      void setMilestoneDone(workspaceId, projectId, row.id, event.target.checked)
                    }
                  />
                  <label htmlFor={`milestone-done-${row.id}`} className="flex-1">
                    <span className={row.completedAt !== null ? 'line-through opacity-60' : ''}>
                      {row.name}
                    </span>
                    {row.targetDate !== null && (
                      <span className="ml-2 text-muted-foreground">
                        {DATE_FORMAT.format(row.targetDate)}
                      </span>
                    )}
                  </label>
                  {canEdit && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void removeMilestone(workspaceId, projectId, row.id)}
                    >
                      Delete
                      <span className="sr-only"> milestone {row.name}</span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ))}

        {canEdit && (
          <form onSubmit={(event) => void handleAdd(event)} className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-40 flex-1 flex-col gap-1">
              <Label htmlFor="milestone-name">Milestone name</Label>
              <Input
                id="milestone-name"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="milestone-date">Target date</Label>
              <Input
                id="milestone-date"
                type="date"
                value={dateInput}
                onChange={(event) => setDateInput(event.target.value)}
                required
              />
            </div>
            <Button type="submit" size="sm">
              Add milestone
            </Button>
          </form>
        )}
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            Couldn&rsquo;t save the milestone. Please try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
