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

describe('countWaRecipients (publish preview, D-035 + #26 D2)', () => {
  const consented = { waConsent: { granted: true } };

  it('counts the linked client and every consented collaborator', () => {
    expect(
      countWaRecipients({
        clientLinked: true,
        clientData: { name: 'Ahmad', ...consented },
        collaboratorDocs: [
          { name: 'Lim', ...consented },
          { name: 'Tan', ...consented },
        ],
      }),
    ).toBe(3);
  });

  it('excludes an opted-out client even when consented', () => {
    expect(
      countWaRecipients({
        clientLinked: true,
        clientData: { notificationsOptOut: true, ...consented },
        collaboratorDocs: [{ name: 'Lim', ...consented }],
      }),
    ).toBe(1);
  });

  it('excludes opted-out collaborators', () => {
    expect(
      countWaRecipients({
        clientLinked: true,
        clientData: { ...consented },
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
        clientLinked: true,
        clientData: { name: 'Ahmad' },
        collaboratorDocs: [{ name: 'Lim' }, { waConsent: { granted: false } }, { ...consented }],
      }),
    ).toBe(1);
  });

  it('counts nothing when no client is linked and all collaborators opted out', () => {
    expect(
      countWaRecipients({
        clientLinked: false,
        clientData: undefined,
        collaboratorDocs: [{ notificationsOptOut: true, ...consented }],
      }),
    ).toBe(0);
  });

  it('no longer counts recipients whose docs are missing (#26: no doc, no consent)', () => {
    expect(
      countWaRecipients({
        clientLinked: true,
        clientData: undefined,
        collaboratorDocs: [undefined],
      }),
    ).toBe(0);
  });
});
