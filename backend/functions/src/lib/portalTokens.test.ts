/**
 * Pure token-helper tests for the #21 portal magic links (D2).
 */

import { describe, expect, it } from 'vitest';

import {
  PORTAL_LINK_TTL_MS,
  SHORT_CODE_LENGTH,
  buildPortalUrl,
  generatePortalToken,
  hashSecret,
  parsePortalToken,
  portalUid,
  verifySecret,
} from './portalTokens.js';

describe('generatePortalToken', () => {
  it('produces a 12-char alphanumeric shortCode and a base64url secret', () => {
    const { shortCode, secret, token } = generatePortalToken();
    expect(shortCode).toMatch(/^[a-zA-Z0-9]{12}$/);
    expect(secret).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(token).toBe(`${shortCode}_${secret}`);
  });

  it('never repeats across a batch (entropy smoke test)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      seen.add(generatePortalToken().token);
    }
    expect(seen.size).toBe(200);
  });
});

describe('hashSecret / verifySecret', () => {
  it('round-trips a generated secret', () => {
    const { secret } = generatePortalToken();
    expect(verifySecret(secret, hashSecret(secret))).toBe(true);
  });

  it('rejects a tampered secret', () => {
    const { secret } = generatePortalToken();
    const tampered = secret.slice(0, -1) + (secret.endsWith('A') ? 'B' : 'A');
    expect(verifySecret(tampered, hashSecret(secret))).toBe(false);
  });

  it('rejects a malformed stored hash without throwing', () => {
    expect(verifySecret('anything', 'not-hex')).toBe(false);
    expect(verifySecret('anything', '')).toBe(false);
  });
});

describe('parsePortalToken', () => {
  it('round-trips a generated token', () => {
    const { shortCode, secret, token } = generatePortalToken();
    expect(parsePortalToken(token)).toEqual({ shortCode, secret });
  });

  it('keeps secrets containing underscores intact (first separator only)', () => {
    const parsed = parsePortalToken('abcDEF123456_se_cret-part_more1234567890');
    expect(parsed).toEqual({ shortCode: 'abcDEF123456', secret: 'se_cret-part_more1234567890' });
  });

  it('rejects non-strings, oversized input and malformed shapes', () => {
    expect(parsePortalToken(undefined)).toBeNull();
    expect(parsePortalToken(42)).toBeNull();
    expect(parsePortalToken('')).toBeNull();
    expect(parsePortalToken('no-separator')).toBeNull();
    expect(parsePortalToken('short_secret1234567890123456')).toBeNull();
    expect(parsePortalToken(`${'x'.repeat(12)}_short`)).toBeNull();
    expect(parsePortalToken(`bad/code!!12_${'a'.repeat(43)}`)).toBeNull();
    expect(parsePortalToken(`${'a'.repeat(12)}_${'a'.repeat(300)}`)).toBeNull();
  });
});

describe('portalUid / buildPortalUrl / TTL', () => {
  it('is deterministic per (wid, pid, cid)', () => {
    expect(portalUid('w1', 'p1', 'c1')).toBe('portal_w1_p1_c1');
    expect(portalUid('w1', 'p1', 'c1')).toBe(portalUid('w1', 'p1', 'c1'));
  });

  it('builds the apex portal URL and tolerates a trailing slash', () => {
    expect(buildPortalUrl('https://siapp.app', 'code_secret')).toBe(
      'https://siapp.app/p/code_secret',
    );
    expect(buildPortalUrl('https://siapp.app/', 'code_secret')).toBe(
      'https://siapp.app/p/code_secret',
    );
  });

  it('mirrors the shared 90-day TTL', () => {
    expect(PORTAL_LINK_TTL_MS).toBe(90 * 24 * 60 * 60 * 1000);
    expect(SHORT_CODE_LENGTH).toBe(12);
  });
});
