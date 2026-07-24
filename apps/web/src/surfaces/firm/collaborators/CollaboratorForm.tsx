/**
 * Create / edit form for a collaborator's firm-editable fields (#16).
 * Server-only fields (notificationsOptOut, lastTaskAt) never appear here;
 * archival is a separate action on the list page, not a form field.
 */

import { Alert, Button, Input, Label } from '@siapp/ui';
import type { TCollaboratorType } from '@siapp/shared';
import { useState, type FormEvent } from 'react';

import { normalizePhone } from '../clients/normalizePhone.ts';
import type { ICollaboratorFormValues, ICollaboratorRow } from './useCollaborators.ts';

const TYPE_LABELS: Record<TCollaboratorType, string> = {
  individual: 'Individual',
  company: 'Company',
};
const TYPES = Object.keys(TYPE_LABELS) as TCollaboratorType[];

export interface ICollaboratorFormProps {
  /** When set, the form edits this collaborator; otherwise it creates one. */
  collaborator?: ICollaboratorRow;
  onSubmit: (values: ICollaboratorFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

export function CollaboratorForm({
  collaborator,
  onSubmit,
  onCancel,
  submitLabel,
}: ICollaboratorFormProps) {
  const [name, setName] = useState(collaborator?.name ?? '');
  const [phone, setPhone] = useState(collaborator?.phone ?? '');
  const [email, setEmail] = useState(collaborator?.email ?? '');
  const [company, setCompany] = useState(collaborator?.company ?? '');
  const [trade, setTrade] = useState(collaborator?.trade ?? '');
  const [type, setType] = useState<TCollaboratorType>(collaborator?.type ?? 'individual');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName === '' || trimmedName.length > 120) {
      setError('Collaborator names must be 1–120 characters.');
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone === null) {
      setError('Enter a valid phone number, e.g. 012-345 6789 or +60123456789.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        name: trimmedName,
        phone: normalizedPhone,
        email: email.trim(),
        company: company.trim(),
        trade: trade.trim(),
        type,
      });
    } catch {
      setError('Could not save the collaborator.');
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
      {error !== null && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor="collaborator-name">Name</Label>
          <Input
            id="collaborator-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex min-w-48 flex-col gap-1.5">
          <Label htmlFor="collaborator-phone">Phone</Label>
          <Input
            id="collaborator-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="collaborator-type">Type</Label>
          <select
            id="collaborator-type"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={type}
            onChange={(event) => setType(event.target.value as TCollaboratorType)}
          >
            {TYPES.map((option) => (
              <option key={option} value={option}>
                {TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="collaborator-trade">Trade (optional)</Label>
          <Input
            id="collaborator-trade"
            value={trade}
            onChange={(event) => setTrade(event.target.value)}
          />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="collaborator-company">Company (optional)</Label>
          <Input
            id="collaborator-company"
            value={company}
            onChange={(event) => setCompany(event.target.value)}
          />
        </div>
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor="collaborator-email">Email (optional)</Label>
          <Input
            id="collaborator-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
      </div>
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
