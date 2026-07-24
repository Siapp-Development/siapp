/**
 * Small read-only PDPA status badges (#26) for the client/collaborator list
 * rows: a "No WA consent" hint (D2: absent = no consent → notifications
 * suppressed) and the "Personal data deleted" marker on erased, frozen docs.
 */

export function NoConsentBadge() {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
      No WhatsApp consent
    </span>
  );
}

export function PdpaErasedBadge() {
  return (
    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      Personal data deleted
    </span>
  );
}
