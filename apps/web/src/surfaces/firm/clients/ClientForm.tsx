/**
 * Create / edit form for a client's firm-editable fields (#16). The
 * server-only notificationsOptOut flag is never shown here — it surfaces
 * as a read-only badge on the list page (D-035).
 */

import { Alert, Button, Input, Label } from '@siapp/ui';
import type { TLocale } from '@siapp/shared';
import { useState, type FormEvent } from 'react';

import { normalizePhone } from './normalizePhone.ts';
import type { IClientFormValues, IClientRow } from './useClients.ts';

const LANGUAGE_LABELS: Record<TLocale, string> = {
  en: 'English',
  ms: 'Bahasa Melayu',
};
const LANGUAGES = Object.keys(LANGUAGE_LABELS) as TLocale[];

export interface IClientFormProps {
  /** When set, the form edits this client; otherwise it creates a new one. */
  client?: IClientRow;
  onSubmit: (values: IClientFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

export function ClientForm({ client, onSubmit, onCancel, submitLabel }: IClientFormProps) {
  const [name, setName] = useState(client?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [companyName, setCompanyName] = useState(client?.companyName ?? '');
  const [language, setLanguage] = useState<TLocale>(client?.language ?? 'en');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName === '' || trimmedName.length > 120) {
      setError('Client names must be 1–120 characters.');
      return;
    }
    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone === null) {
      setError('Enter a valid phone number, e.g. 012-345 6789 or +60123456789.');
      return;
    }
    if (notes.trim().length > 2000) {
      setError('Notes must be at most 2000 characters.');
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSubmit({
        name: trimmedName,
        phone: normalizedPhone,
        email: email.trim(),
        companyName: companyName.trim(),
        language,
        notes: notes.trim(),
      });
    } catch {
      setError('Could not save the client.');
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
      {error !== null && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor="client-name">Name</Label>
          <Input id="client-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="flex min-w-48 flex-col gap-1.5">
          <Label htmlFor="client-phone">Phone</Label>
          <Input
            id="client-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-4">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5">
          <Label htmlFor="client-email">Email (optional)</Label>
          <Input
            id="client-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="client-company">Company (optional)</Label>
          <Input
            id="client-company"
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="client-language">Preferred language</Label>
          <select
            id="client-language"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            value={language}
            onChange={(event) => setLanguage(event.target.value as TLocale)}
          >
            {LANGUAGES.map((option) => (
              <option key={option} value={option}>
                {LANGUAGE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-notes">Notes (optional)</Label>
        <textarea
          id="client-notes"
          className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
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
