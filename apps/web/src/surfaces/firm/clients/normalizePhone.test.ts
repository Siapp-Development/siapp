import { describe, expect, it } from 'vitest';

import { isValidE164, normalizePhone } from './normalizePhone.ts';

describe('normalizePhone', () => {
  it('converts a Malaysian local number to E.164', () => {
    expect(normalizePhone('0123456789')).toBe('+60123456789');
  });

  it('strips spaces, dashes, dots and parentheses', () => {
    expect(normalizePhone('012-345 6789')).toBe('+60123456789');
    expect(normalizePhone('+60 12-345.6789')).toBe('+60123456789');
    expect(normalizePhone('(012) 345 6789')).toBe('+60123456789');
  });

  it('passes an already-E.164 number through unchanged', () => {
    expect(normalizePhone('+60123456789')).toBe('+60123456789');
    expect(normalizePhone('+6598765432')).toBe('+6598765432');
  });

  it('prefixes + on bare country-code digits', () => {
    expect(normalizePhone('60123456789')).toBe('+60123456789');
  });

  it('rejects junk', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('not a phone')).toBeNull();
    expect(normalizePhone('+0123456789')).toBeNull();
    expect(normalizePhone('0123')).toBeNull();
    expect(normalizePhone('+601234567890123456')).toBeNull();
  });
});

describe('isValidE164', () => {
  it('matches the firestore.rules phone regex semantics', () => {
    expect(isValidE164('+60123456789')).toBe(true);
    expect(isValidE164('+1234567')).toBe(true);
    expect(isValidE164('60123456789')).toBe(false);
    expect(isValidE164('+0123456789')).toBe(false);
    expect(isValidE164('+601234')).toBe(false);
  });
});
