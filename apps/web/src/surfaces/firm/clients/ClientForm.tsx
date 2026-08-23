/**
 * Create / edit form for a client's firm-editable fields (#16). The
 * server-only notificationsOptOut flag is never shown here — it surfaces
 * as a read-only badge on the list page (D-035).
 * #26: captures the firm-attested WhatsApp/SMS consent (D1); a flip on edit
 * writes a fresh dated record via useClients.
 */

import { Alert, Button, Input, Label } from '@siapp/ui';
import type { TLocale } from '@siapp/shared';
import { Building2, Globe, Mail, Phone, StickyNote, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { ConsentCheckbox } from '../pdpa/ConsentCheckbox.tsx';
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
  /** For the consent attestation copy (#26 D1). */
  firmName: string;
  onSubmit: (values: IClientFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}

export function ClientForm({ client, firmName, onSubmit, onCancel, submitLabel }: IClientFormProps) {
  const [name, setName] = useState(client?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [email, setEmail] = useState(client?.email ?? '');
  const [companyName, setCompanyName] = useState(client?.companyName ?? '');
  const [language, setLanguage] = useState<TLocale>(client?.language ?? 'en');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [waConsentGranted, setWaConsentGranted] = useState(client?.waConsentGranted === true);
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
        waConsentGranted,
      });
    } catch {
      setError('Could not save the client.');
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} noValidate className="flex flex-col gap-4">
      {error !== null && <Alert variant="destructive">{error}</Alert>}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-name" className="flex items-center gap-1.5">
          <User className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Name
        </Label>
        <Input id="client-name" value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-phone" className="flex items-center gap-1.5">
          <Phone className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Phone
        </Label>
        <Input
          id="client-phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-email" className="flex items-center gap-1.5">
          <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Email (optional)
        </Label>
        <Input
          id="client-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-company" className="flex items-center gap-1.5">
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Company (optional)
        </Label>
        <Input
          id="client-company"
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-language" className="flex items-center gap-1.5">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Preferred language
        </Label>
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="client-notes" className="flex items-center gap-1.5">
          <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          Notes (optional)
        </Label>
        <textarea
          id="client-notes"
          className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <ConsentCheckbox
        firmName={firmName}
        checked={waConsentGranted}
        onChange={setWaConsentGranted}
        storedGranted={client?.waConsentGranted ?? null}
        storedRecordedAt={client?.waConsentRecordedAt ?? null}
      />
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
