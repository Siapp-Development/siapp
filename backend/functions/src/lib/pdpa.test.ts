/**
 * PDPA helper tests (#26): the D2 consent gate, D3 anonymize builders, and
 * D6 message redaction (including idempotent re-runs).
 */

import { describe, expect, it } from 'vitest';

import {
  ANONYMIZED_CLIENT_NAME,
  ANONYMIZED_COLLABORATOR_NAME,
  PDPA_REDACTED,
  buildAnonymizedClientFields,
  buildAnonymizedCollaboratorFields,
  hasWaConsent,
  redactMessagePii,
} from './pdpa.js';

const DELETE_MARKER = Symbol('FieldValue.delete') as unknown;

describe('hasWaConsent (D2: absent = no consent)', () => {
  it('is true only for granted: true', () => {
    expect(hasWaConsent({ waConsent: { granted: true } })).toBe(true);
  });

  it('treats a dated refusal (granted: false) as no consent', () => {
    expect(hasWaConsent({ waConsent: { granted: false } })).toBe(false);
  });

  it('treats absent or malformed fields as no consent', () => {
    expect(hasWaConsent({})).toBe(false);
    expect(hasWaConsent(undefined)).toBe(false);
    expect(hasWaConsent({ waConsent: true })).toBe(false);
    expect(hasWaConsent({ waConsent: null })).toBe(false);
    expect(hasWaConsent({ waConsent: { granted: 'true' } })).toBe(false);
  });
});

describe('anonymize builders (D3)', () => {
  it('anonymizes client PII and drops the consent record', () => {
    const fields = buildAnonymizedClientFields(DELETE_MARKER);
    expect(fields).toEqual({
      name: ANONYMIZED_CLIENT_NAME,
      phone: DELETE_MARKER,
      email: DELETE_MARKER,
      companyName: DELETE_MARKER,
      notes: DELETE_MARKER,
      waConsent: DELETE_MARKER,
    });
  });

  it('anonymizes collaborator PII and archives the collaborator', () => {
    const fields = buildAnonymizedCollaboratorFields(DELETE_MARKER);
    expect(fields).toEqual({
      name: ANONYMIZED_COLLABORATOR_NAME,
      phone: DELETE_MARKER,
      email: DELETE_MARKER,
      company: DELETE_MARKER,
      trade: DELETE_MARKER,
      waConsent: DELETE_MARKER,
      status: 'archived',
    });
  });
});

describe('redactMessagePii (D6)', () => {
  const subject = { name: 'Aminah binti Ali', phone: '+60123456789' };

  it('redacts recipientPhone and matching template variables', () => {
    const update = redactMessagePii(
      {
        recipientPhone: '+60123456789',
        variables: {
          taskTitle: 'Pour slab',
          clientName: 'Aminah binti Ali',
          contact: '+60123456789',
        },
      },
      subject,
    );
    expect(update).toEqual({
      recipientPhone: PDPA_REDACTED,
      variables: {
        taskTitle: 'Pour slab',
        clientName: PDPA_REDACTED,
        contact: PDPA_REDACTED,
      },
    });
  });

  it('leaves non-matching variables untouched', () => {
    const update = redactMessagePii(
      { recipientPhone: '+60111111111', variables: { firmName: 'Studio X' } },
      subject,
    );
    expect(update).toEqual({ recipientPhone: PDPA_REDACTED });
  });

  it('returns null when already redacted (idempotent re-run)', () => {
    const update = redactMessagePii(
      { recipientPhone: PDPA_REDACTED, variables: { clientName: PDPA_REDACTED } },
      subject,
    );
    expect(update).toBeNull();
  });

  it('ignores empty phone and missing variables', () => {
    expect(redactMessagePii({ recipientPhone: '' }, subject)).toBeNull();
    expect(redactMessagePii({}, { name: 'X', phone: null })).toBeNull();
  });

  it('does not match variables on a null subject phone', () => {
    const update = redactMessagePii(
      { recipientPhone: PDPA_REDACTED, variables: { note: '' } },
      { name: 'X', phone: null },
    );
    expect(update).toBeNull();
  });
});
