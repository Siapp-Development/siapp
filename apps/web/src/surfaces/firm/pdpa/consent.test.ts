import { describe, expect, it } from 'vitest';

import {
  CONSENT_TEXT_VERSION,
  buildWaConsentRecord,
  consentAttestationCopy,
  consentWriteNeeded,
  scrubSummary,
} from './consent.ts';

describe('consentAttestationCopy', () => {
  it('names the firm in both languages', () => {
    const copy = consentAttestationCopy('Studio North');
    expect(copy.en).toContain('Studio North');
    expect(copy.en).toContain('WhatsApp/SMS');
    expect(copy.ms).toContain('Studio North');
    expect(copy.ms).toContain('WhatsApp/SMS');
  });
});

describe('buildWaConsentRecord', () => {
  it('produces the exact rules-valid key set', () => {
    const record = buildWaConsentRecord(true, 'u1', 'ms');
    expect(Object.keys(record).sort()).toEqual([
      'granted',
      'language',
      'method',
      'recordedAt',
      'recordedBy',
      'textVersion',
    ]);
    expect(record['granted']).toBe(true);
    expect(record['method']).toBe('firm_attested');
    expect(record['recordedBy']).toBe('u1');
    expect(record['language']).toBe('ms');
    expect(record['textVersion']).toBe(CONSENT_TEXT_VERSION);
    expect(record['recordedAt']).toBeDefined();
  });

  it('records refusals as granted:false', () => {
    expect(buildWaConsentRecord(false, 'u1', 'en')['granted']).toBe(false);
  });
});

describe('consentWriteNeeded', () => {
  it('writes nothing when unchecked and no record exists (D2)', () => {
    expect(consentWriteNeeded(false, null)).toBe(false);
  });

  it('writes when checked and no record exists', () => {
    expect(consentWriteNeeded(true, null)).toBe(true);
  });

  it('writes only when the checkbox differs from the stored record', () => {
    expect(consentWriteNeeded(true, true)).toBe(false);
    expect(consentWriteNeeded(false, true)).toBe(true);
    expect(consentWriteNeeded(true, false)).toBe(true);
    expect(consentWriteNeeded(false, false)).toBe(false);
  });
});

describe('scrubSummary', () => {
  it('sums record counts and reports links and messages separately', () => {
    expect(
      scrubSummary({
        scrubbed: {
          projects: 2,
          tasks: 3,
          taskUpdates: 1,
          activity: 4,
          messages: 5,
          magicLinks: 6,
        },
      }),
    ).toBe(
      'record anonymized and frozen, 6 access link(s) revoked, 10 related record(s) scrubbed, 5 queued message(s) redacted',
    );
  });
});
