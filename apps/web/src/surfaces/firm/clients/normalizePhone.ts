/**
 * Phone normalization for client/collaborator forms (#16, decision 9).
 * Firestore rules require E.164 (`+` then 7–15 digits, no leading zero);
 * this helper turns common Malaysian input shapes into that form without a
 * libphonenumber dependency. No React/Firebase imports — pure.
 */

const E164_PATTERN = /^\+[1-9]\d{6,14}$/;

/** True when `value` is already a rules-valid E.164 number. */
export function isValidE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

/**
 * Normalizes user phone input to E.164, or returns `null` when it can't be:
 * separators (spaces, dashes, dots, parentheses) are stripped; a leading
 * `0` is treated as a Malaysian local number (`0123…` → `+60123…`); bare
 * digit strings get a `+` prefixed (`60123…` → `+60123…`).
 */
export function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, '');
  if (compact === '') {
    return null;
  }
  let candidate: string;
  if (compact.startsWith('+')) {
    candidate = compact;
  } else if (compact.startsWith('0')) {
    candidate = `+60${compact.slice(1)}`;
  } else {
    candidate = `+${compact}`;
  }
  return isValidE164(candidate) ? candidate : null;
}
