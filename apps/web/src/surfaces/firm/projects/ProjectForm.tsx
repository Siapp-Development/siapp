/**
 * Create / edit form for a project's client-editable fields (#12). Vertical
 * is create-only (client-immutable in rules); lifecycle is never edited here —
 * transitions go through lifecycle action buttons on the detail page.
 */

import { Alert, Button, Input, Label } from '@siapp/ui';
import type { TProjectStatus, TProjectVertical } from '@siapp/shared';
import { useState, type FormEvent } from 'react';

import type { IProjectFormValues, IProjectRow } from './useProjects.ts';
import { STATUS_LABELS, VERTICAL_LABELS } from './projectLabels.ts';

const STATUSES = Object.keys(STATUS_LABELS) as TProjectStatus[];
const VERTICALS = Object.keys(VERTICAL_LABELS) as TProjectVertical[];

function toDateInput(date: Date | null): string {
  if (date === null) {
    return '';
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromDateInput(value: string): Date | null {
  if (value === '') {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export interface IProjectFormProps {
  /** When set, the form edits this project; otherwise it creates a new one. */
  project?: IProjectRow;
  /** Initial values for a fresh form (duplicate mode). Ignored when `project` is set. */
  prefill?: Partial<IProjectFormValues>;
  /** Locks the vertical select — duplicate mode copies it from the source. */
  verticalLocked?: boolean;
  /** Maps a submit error to the message shown in the form's alert. */
  errorMessage?: (error: unknown) => string;
  onSubmit: (values: IProjectFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

export function ProjectForm({
  project,
  prefill,
  verticalLocked = false,
  errorMessage,
  onSubmit,
  onCancel,
  submitLabel,
}: IProjectFormProps) {
  const [name, setName] = useState(project?.name ?? prefill?.name ?? '');
  const [code, setCode] = useState(project?.code ?? prefill?.code ?? '');
  const [vertical, setVertical] = useState<TProjectVertical>(
    project?.vertical ?? prefill?.vertical ?? 'construction',
  );
  const [status, setStatus] = useState<TProjectStatus>(
    project?.status ?? prefill?.status ?? 'planning',
  );
  const [startDate, setStartDate] = useState(
    toDateInput(project?.startDate ?? prefill?.startDate ?? new Date()),
  );
  const [targetEndDate, setTargetEndDate] = useState(
    toDateInput(project?.targetEndDate ?? prefill?.targetEndDate ?? null),
  );
  const [clientCanSee, setClientCanSee] = useState(
    project?.clientCanSee ?? prefill?.clientCanSee ?? true,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName === '' || trimmedName.length > 120) {
      setError('Project names must be 1–120 characters.');
      return;
    }
    if (code.trim().length > 20) {
      setError('Project codes must be at most 20 characters.');
      return;
    }
    const start = fromDateInput(startDate);
    if (start === null) {
      setError('Enter a start date.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        name: trimmedName,
        code: code.trim(),
        vertical,
        status,
        startDate: start,
        targetEndDate: fromDateInput(targetEndDate),
        clientCanSee,
      });
    } catch (submitError) {
      setError(errorMessage !== undefined ? errorMessage(submitError) : 'Could not save the project.');
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
      {error !== null && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-code">Code (optional)</Label>
          <Input
            id="project-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="max-w-32"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        {project === undefined && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-vertical">Vertical</Label>
            <select
              id="project-vertical"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              value={vertical}
              disabled={verticalLocked}
              onChange={(event) => setVertical(event.target.value as TProjectVertical)}
            >
              {VERTICALS.map((option) => (
                <option key={option} value={option}>
                  {VERTICAL_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-status">Status</Label>
          <select
            id="project-status"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as TProjectStatus)}
          >
            {STATUSES.map((option) => (
              <option key={option} value={option}>
                {STATUS_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-start">Start date</Label>
          <Input
            id="project-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-target-end">Target end (optional)</Label>
          <Input
            id="project-target-end"
            type="date"
            value={targetEndDate}
            onChange={(event) => setTargetEndDate(event.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={clientCanSee}
          onChange={(event) => setClientCanSee(event.target.checked)}
        />
        Client can see this project once published
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
