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

describe('redactMessagePii — #171 key-based name slots (F3)', () => {
  it('redacts client_first_name even though it is only the first word of a multi-word name', () => {
    const update = redactMessagePii(
      {
        recipientPhone: '+60123456789',
        variables: {
          firm_name: 'Acme Builders',
          client_first_name: 'Aminah',
          project_title: 'Bungalow Reno',
          portal_token: 'abcdEFGH2345_c2VjcmV0',
        },
      },
      { name: 'Aminah binti Ali', phone: '+60123456789' },
    );
    expect(update).toEqual({
      recipientPhone: PDPA_REDACTED,
      variables: {
        firm_name: 'Acme Builders',
        client_first_name: PDPA_REDACTED,
        project_title: 'Bungalow Reno',
        portal_token: 'abcdEFGH2345_c2VjcmV0',
      },
    });
  });

  it('redacts a stale collaborator_name after the collaborator was renamed', () => {
    const update = redactMessagePii(
      {
        recipientPhone: '+60199999999',
        variables: {
          firm_name: 'Acme',
          collaborator_name: 'Lim Electrical (old)',
          access_token: 't',
        },
      },
      { name: 'Lim Electrical Sdn Bhd', phone: '+60123456789' },
    );
    expect(update).toEqual({
      recipientPhone: PDPA_REDACTED,
      variables: { firm_name: 'Acme', collaborator_name: PDPA_REDACTED, access_token: 't' },
    });
  });

  it('redacts an empty name slot on a not-sent record (no_recipient: empty phone)', () => {
    const update = redactMessagePii(
      { recipientPhone: '', variables: { client_first_name: '', portal_token: '' } },
      { name: 'Aminah binti Ali', phone: null },
    );
    expect(update).toEqual({
      variables: { client_first_name: PDPA_REDACTED, portal_token: '' },
    });
  });

  it('is idempotent: a second pass over the redacted doc returns null', () => {
    const subject = { name: 'Aminah binti Ali', phone: '+60123456789' };
    const original = {
      recipientPhone: '+60123456789',
      variables: {
        client_first_name: 'Aminah',
        collaborator_name: 'Someone Else',
        clientName: 'Aminah binti Ali',
        contact: '+60123456789',
        firm_name: 'Acme',
      },
    };
    const first = redactMessagePii(original, subject);
    expect(first).not.toBeNull();
    const redacted = { ...original, ...first };
    expect(redactMessagePii(redacted, subject)).toBeNull();
  });

  it('still redacts other keys by value equality and leaves unrelated keys', () => {
    const update = redactMessagePii(
      {
        recipientPhone: PDPA_REDACTED,
        variables: { task_title: 'Aminah binti Ali', note: 'Call +60123456789', firm_name: 'Acme' },
      },
      { name: 'Aminah binti Ali', phone: '+60123456789' },
    );
    expect(update).toEqual({
      variables: { task_title: PDPA_REDACTED, note: 'Call +60123456789', firm_name: 'Acme' },
    });
  });

  it('does not touch the input object (returns a copy)', () => {
    const variables = { client_first_name: 'Aminah' };
    redactMessagePii({ variables }, { name: 'Aminah binti Ali', phone: null });
    expect(variables).toEqual({ client_first_name: 'Aminah' });
  });
});
