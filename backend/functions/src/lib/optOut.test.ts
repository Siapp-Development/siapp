import { describe, expect, it } from 'vitest';

import { countWaRecipients, isOptedOut } from './optOut.js';

describe('isOptedOut', () => {
  it('is true only for an explicit boolean true', () => {
    expect(isOptedOut({ notificationsOptOut: true })).toBe(true);
    expect(isOptedOut({ notificationsOptOut: false })).toBe(false);
    expect(isOptedOut({ notificationsOptOut: 'true' })).toBe(false);
    expect(isOptedOut({})).toBe(false);
    expect(isOptedOut(undefined)).toBe(false);
  });
});

describe('countWaRecipients (publish preview, D-035 + #26 D2 + #157 D4)', () => {
  const consented = { waConsent: { granted: true } };

  it('counts each linked client (by phone) and every consented collaborator', () => {
    expect(
      countWaRecipients({
        clientDocs: [{ name: 'Ahmad', phone: '+60111', ...consented }],
        collaboratorDocs: [
          { name: 'Lim', ...consented },
          { name: 'Tan', ...consented },
        ],
      }),
    ).toBe(3);
  });

  it('counts multiple linked clients with distinct phones', () => {
    expect(
      countWaRecipients({
        clientDocs: [
          { name: 'Ann', phone: '+60111', ...consented },
          { name: 'Ben', phone: '+60222', ...consented },
        ],
        collaboratorDocs: [],
      }),
    ).toBe(2);
  });

  it('de-dupes clients that share the same phone (D4)', () => {
    expect(
      countWaRecipients({
        clientDocs: [
          { name: 'Ann', phone: '+60111', ...consented },
          { name: 'Ben', phone: '+60111', ...consented },
        ],
        collaboratorDocs: [],
      }),
    ).toBe(1);
  });

  it('excludes an opted-out client even when consented', () => {
    expect(
      countWaRecipients({
        clientDocs: [{ phone: '+60111', notificationsOptOut: true, ...consented }],
        collaboratorDocs: [{ name: 'Lim', ...consented }],
      }),
    ).toBe(1);
  });

  it('excludes opted-out collaborators', () => {
    expect(
      countWaRecipients({
        clientDocs: [{ phone: '+60111', ...consented }],
        collaboratorDocs: [
          { notificationsOptOut: true, ...consented },
          { ...consented },
          { notificationsOptOut: true, ...consented },
        ],
      }),
    ).toBe(2);
  });

  it('excludes recipients without a waConsent grant (#26 D2: absent = no consent)', () => {
    expect(
      countWaRecipients({
        clientDocs: [{ name: 'Ahmad', phone: '+60111' }],
        collaboratorDocs: [{ name: 'Lim' }, { waConsent: { granted: false } }, { ...consented }],
      }),
    ).toBe(1);
  });

  it('excludes a consented client with no phone on file', () => {
    expect(
      countWaRecipients({
        clientDocs: [{ name: 'Ahmad', ...consented }],
        collaboratorDocs: [],
      }),
    ).toBe(0);
  });

  it('counts nothing when no client is linked and all collaborators opted out', () => {
    expect(
      countWaRecipients({
        clientDocs: [],
        collaboratorDocs: [{ notificationsOptOut: true, ...consented }],
      }),
    ).toBe(0);
  });

  it('no longer counts recipients whose docs are missing (#26: no doc, no consent)', () => {
    expect(
      countWaRecipients({
        clientDocs: [undefined],
        collaboratorDocs: [undefined],
      }),
    ).toBe(0);
  });
});
