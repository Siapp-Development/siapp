/**
 * #171 (H6): the shared direct-send envelope. Queued and not-sent records for
 * sendPortalLink / sendCollaboratorLink must have ONE shape, always carry
 * `restrictedToDepartments: []` (header-only content → no D-025 restriction),
 * and only a not-sent record carries `suppressed` / `suppressedReason`.
 */

import type { Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';

import {
  buildDirectSendRecord,
  type IDirectSendRecordInput,
  type TDirectSendSuppressedReason,
} from './directSendRecord.js';

const CREATED_AT = { toMillis: () => 1_700_000_000_000 } as unknown as Timestamp;

function input(overrides: Partial<IDirectSendRecordInput> = {}): IDirectSendRecordInput {
  return {
    id: 'msg1',
    recipientType: 'client',
    recipientId: 'c1',
    recipientPhone: '+60123456789',
    templateName: 'siapp_project_welcome_v1_en',
    trigger: 'project_welcome',
    variables: {
      firm_name: 'Acme Builders',
      client_first_name: 'Ahmad',
      project_title: 'Bungalow Reno',
      project_due_date: '2026-07-15',
      portal_token: 'abcdEFGH2345_c2VjcmV0',
    },
    costEstimateMyr: 0.1,
    relatedTo: { type: 'project', id: 'p1' },
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe('buildDirectSendRecord', () => {
  it('builds the queued envelope (no suppression keys)', () => {
    const record = buildDirectSendRecord(input());
    expect(record).toEqual({
      id: 'msg1',
      channel: 'whatsapp',
      recipientType: 'client',
      recipientId: 'c1',
      recipientPhone: '+60123456789',
      templateName: 'siapp_project_welcome_v1_en',
      trigger: 'project_welcome',
      variables: input().variables,
      status: 'queued',
      costEstimateMyr: 0.1,
      relatedTo: { type: 'project', id: 'p1' },
      createdAt: CREATED_AT,
      restrictedToDepartments: [],
    });
    expect(record).not.toHaveProperty('suppressed');
    expect(record).not.toHaveProperty('suppressedReason');
  });

  it.each<TDirectSendSuppressedReason>([
    'opt_out',
    'no_consent',
    'no_phone',
    'duplicate_phone',
    'no_recipient',
  ])('builds the suppressed (not-sent) envelope for %s', (reason) => {
    const queued = buildDirectSendRecord(input({ variables: { portal_token: '' } }));
    const notSent = buildDirectSendRecord(
      input({ variables: { portal_token: '' }, suppressedReason: reason }),
    );
    // Same envelope as the queued record plus exactly the two suppression keys.
    expect(notSent).toEqual({ ...queued, suppressed: true, suppressedReason: reason });
    // status stays 'queued'; `suppressed` is what keeps it out of dispatch/billing.
    expect(notSent.status).toBe('queued');
  });

  it('always stamps restrictedToDepartments: [] for both recipient types', () => {
    const collab = buildDirectSendRecord(
      input({
        recipientType: 'collaborator',
        recipientId: 'col1',
        trigger: 'collab_access_link',
        templateName: 'siapp_collab_access_link_v1_en',
        variables: { firm_name: 'Acme', collaborator_name: 'Lim', access_token: '' },
        relatedTo: { type: 'collaborator', id: 'col1' },
        suppressedReason: 'no_phone',
      }),
    );
    expect(collab.restrictedToDepartments).toEqual([]);
    expect(buildDirectSendRecord(input()).restrictedToDepartments).toEqual([]);
  });

  it('returns a fresh restrictedToDepartments array per record (no shared mutable state)', () => {
    const a = buildDirectSendRecord(input());
    const b = buildDirectSendRecord(input());
    expect(a.restrictedToDepartments).not.toBe(b.restrictedToDepartments);
  });
});
