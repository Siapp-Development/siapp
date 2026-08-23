/**
 * Personalized, time-aware greeting helpers for the #102 Home header. Pure and
 * prop-driven (name/email arrive from FirmShell) so the page stays
 * presentational and the logic is unit-testable without an auth context.
 */

/**
 * First name for the greeting: the first whitespace-delimited token of the
 * display name, else the local-part of the email, else a friendly fallback.
 */
export function firstNameFrom(displayName: string, email: string): string {
  const firstToken = displayName.trim().split(/\s+/).filter(Boolean)[0];
  if (firstToken !== undefined && firstToken !== '') {
    return firstToken;
  }

  const localPart = email.trim().split('@')[0];
  if (localPart !== undefined && localPart !== '') {
    return localPart;
  }

  return 'there';
}

/** Time-of-day greeting in the viewer's local timezone. */
export function timeGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}
