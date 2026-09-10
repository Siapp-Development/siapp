/**
 * Create / edit form for a project's client-editable fields (#12). Vertical
 * is create-only (client-immutable in rules); lifecycle is never edited here —
 * transitions go through lifecycle action buttons on the detail page.
 */

import { Alert, Button, Input, Label } from '@siapp/ui';
import { MAX_PROJECT_CLIENTS, type TProjectStatus, type TProjectVertical } from '@siapp/shared';
import { useState, type FormEvent } from 'react';

import type { IProjectClientRef, IProjectFormValues, IProjectRow } from './useProjects.ts';
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

export interface IProjectFormClientOption {
  id: string;
  name: string;
  /** Server-only flag (D-035) — surfaced as a label suffix, never edited. */
  notificationsOptOut: boolean;
}

export interface IProjectFormProps {
  /** When set, the form edits this project; otherwise it creates a new one. */
  project?: IProjectRow;
  /** Initial values for a fresh form (duplicate mode). Ignored when `project` is set. */
  prefill?: Partial<IProjectFormValues>;
  /** Workspace clients for the optional client link (#16). */
  clients?: readonly IProjectFormClientOption[];
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
  clients = [],
  verticalLocked = false,
  errorMessage,
  onSubmit,
  onCancel,
  submitLabel,
}: IProjectFormProps) {
  const [name, setName] = useState(project?.name ?? prefill?.name ?? '');
  const [description, setDescription] = useState(
    project?.description ?? prefill?.description ?? '',
  );
  const [code, setCode] = useState(project?.code ?? prefill?.code ?? '');
  const [vertical, setVertical] = useState<TProjectVertical>(
    project?.vertical ?? prefill?.vertical ?? 'construction',
  );
  const [status, setStatus] = useState<TProjectStatus>(
    project?.status ?? prefill?.status ?? 'planning',
  );
  const [clientIds, setClientIds] = useState<string[]>(
    project?.clientIds ?? prefill?.clientIds ?? [],
  );
  const [clientToAdd, setClientToAdd] = useState('');
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

  // Names come from the live options first, then the project's existing denorm
  // (an already-linked client may have been archived out of the options list).
  function nameFor(id: string): string {
    const option = clients.find((client) => client.id === id);
    if (option !== undefined) {
      return option.name;
    }
    return project?.clients.find((client) => client.id === id)?.name ?? '';
  }

  const selectedClients = clientIds.map((id) => ({ id, name: nameFor(id) }));
  const availableClients = clients.filter((client) => !clientIds.includes(client.id));
  const atCap = clientIds.length >= MAX_PROJECT_CLIENTS;

  function addClient(id: string): void {
    if (id === '' || clientIds.includes(id) || clientIds.length >= MAX_PROJECT_CLIENTS) {
      return;
    }
    setClientIds([...clientIds, id]);
    setClientToAdd('');
  }

  function removeClient(id: string): void {
    setClientIds(clientIds.filter((clientId) => clientId !== id));
  }

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
    if (description.trim().length > 5000) {
      setError('Descriptions must be at most 5000 characters.');
      return;
    }
    const start = fromDateInput(startDate);
    if (start === null) {
      setError('Enter a start date.');
      return;
    }
    // Resolve denormalized names for each linked client from the option list,
    // falling back to the project's existing denorm when an option is still
    // loading. Rules require `clients[]` to parallel `clientIds[]` (#157).
    const clients: IProjectClientRef[] = [];
    for (const id of clientIds) {
      const name = nameFor(id);
      if (name === '') {
        setError('One or more selected clients could not be resolved. Try again.');
        return;
      }
      clients.push({ id, name });
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        name: trimmedName,
        description: description.trim(),
        code: code.trim(),
        vertical,
        status,
        clientIds,
        clients,
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-description">Description (optional)</Label>
        <textarea
          id="project-description"
          className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
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
        <div className="flex min-w-64 flex-col gap-1.5">
          <Label htmlFor="project-client">Clients (optional)</Label>
          {selectedClients.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Linked clients">
              {selectedClients.map((client) => (
                <li
                  key={client.id}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-sm"
                >
                  <span>{client.name}</span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${client.name}`}
                    onClick={() => removeClient(client.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <select
            id="project-client"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={clientToAdd}
            disabled={atCap || availableClients.length === 0}
            onChange={(event) => addClient(event.target.value)}
          >
            <option value="">
              {atCap ? `Client limit reached (${MAX_PROJECT_CLIENTS})` : 'Add a client…'}
            </option>
            {availableClients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
                {client.notificationsOptOut ? ' (notifications off)' : ''}
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
