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

describe('countWaRecipients (publish preview, D-035)', () => {
  it('counts the linked client and every collaborator when nobody opted out', () => {
    expect(
      countWaRecipients({
        clientLinked: true,
        clientData: { name: 'Ahmad' },
        collaboratorDocs: [{ name: 'Lim' }, { name: 'Tan' }],
      }),
    ).toBe(3);
  });

  it('excludes an opted-out client', () => {
    expect(
      countWaRecipients({
        clientLinked: true,
        clientData: { notificationsOptOut: true },
        collaboratorDocs: [{ name: 'Lim' }],
      }),
    ).toBe(1);
  });

  it('excludes opted-out collaborators', () => {
    expect(
      countWaRecipients({
        clientLinked: true,
        clientData: {},
        collaboratorDocs: [{ notificationsOptOut: true }, {}, { notificationsOptOut: true }],
      }),
    ).toBe(2);
  });

  it('counts nothing when no client is linked and all collaborators opted out', () => {
    expect(
      countWaRecipients({
        clientLinked: false,
        clientData: undefined,
        collaboratorDocs: [{ notificationsOptOut: true }],
      }),
    ).toBe(0);
  });

  it('still counts recipients whose docs are missing (dangling refs)', () => {
    expect(
      countWaRecipients({
        clientLinked: true,
        clientData: undefined,
        collaboratorDocs: [undefined],
      }),
    ).toBe(2);
  });
});
