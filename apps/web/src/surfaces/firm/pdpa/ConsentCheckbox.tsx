/**
 * Firm-attested WhatsApp/SMS consent checkbox (#26, D1) shared by the client
 * and collaborator forms. Shows the bilingual attestation copy; when a
 * record already exists its status line explains what unchecking does.
 */

import { useId } from 'react';

import { consentAttestationCopy } from './consent.ts';

export interface IConsentCheckboxProps {
  firmName: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Stored record state: null = no record yet (D2: absent = no consent). */
  storedGranted: boolean | null;
  /** When the stored record was written, if known. */
  storedRecordedAt: Date | null;
  disabled?: boolean;
}

export function ConsentCheckbox({
  firmName,
  checked,
  onChange,
  storedGranted,
  storedRecordedAt,
  disabled = false,
}: IConsentCheckboxProps) {
  const checkboxId = useId();
  const descriptionId = useId();
  const copy = consentAttestationCopy(firmName);
  const recordedOn =
    storedRecordedAt !== null ? ` (recorded ${storedRecordedAt.toLocaleDateString()})` : '';

  return (
    <fieldset className="rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">WhatsApp/SMS notifications (PDPA)</legend>
      <div className="flex items-start gap-2">
        <input
          id={checkboxId}
          type="checkbox"
          className="mt-1 h-4 w-4"
          checked={checked}
          disabled={disabled}
          aria-describedby={descriptionId}
          onChange={(event) => onChange(event.target.checked)}
        />
        <label htmlFor={checkboxId} className="text-sm">
          <span className="block">{copy.en}</span>
          <span className="mt-1 block text-muted-foreground" lang="ms">
            {copy.ms}
          </span>
        </label>
      </div>
      <p id={descriptionId} className="mt-2 text-xs text-muted-foreground">
        {storedGranted === null &&
          'No consent is on record — without it, WhatsApp/SMS updates to this person are suppressed.'}
        {storedGranted === true &&
          `Consent is on record${recordedOn}. Unchecking records a dated withdrawal.`}
        {storedGranted === false &&
          `A refusal is on record${recordedOn}. Checking records fresh consent.`}
      </p>
    </fieldset>
  );
}
