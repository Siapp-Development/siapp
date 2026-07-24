/**
 * Phone-cell actions for the A6/A7 contact lists (#16): Copy · Call ·
 * WhatsApp. Always rendered and keyboard-focusable (not hover-only — the
 * wireframe's hover reveal is expressed as hover *emphasis* instead), with
 * per-contact accessible names.
 */

import { useState } from 'react';

export interface IPhoneActionsProps {
  /** E.164 phone number. */
  phone: string;
  /** Contact name for the accessible action labels. */
  name: string;
}

export function PhoneActions({ phone, name }: IPhoneActionsProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(): Promise<void> {
    await navigator.clipboard.writeText(phone);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const linkClass =
    'rounded px-1 py-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:text-primary';

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-label={`Copy ${name}'s phone number`}
        className={linkClass}
        onClick={() => void handleCopy()}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <a href={`tel:${phone}`} aria-label={`Call ${name}`} className={linkClass}>
        Call
      </a>
      <a
        href={`https://wa.me/${phone.replace('+', '')}`}
        target="_blank"
        rel="noreferrer"
        aria-label={`WhatsApp ${name}`}
        className={linkClass}
      >
        WhatsApp
      </a>
    </span>
  );
}

/** Read-only opt-out indicator — the flag is server-only (D-035). */
export function NotificationsOffBadge() {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      Notifications off
    </span>
  );
}
