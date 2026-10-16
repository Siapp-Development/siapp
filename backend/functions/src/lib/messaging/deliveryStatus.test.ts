import { describe, expect, it } from 'vitest';
import { buildStatusCallbackUrl, planStatusUpdate, rankOf } from './deliveryStatus.js';

const NOW = new Date('2026-10-16T07:15:00Z');
const OLD = new Date('2026-10-15T07:15:00Z');
const ranks: Record<string, number> = {
  queued: 1,
  accepted: 1,
  scheduled: 1,
  sending: 1,
  sent: 2,
  delivered: 3,
  undelivered: 3,
  failed: 3,
  read: 4,
  canceled: 0,
  unknown: 0,
};
const appliedStatuses = ['sent', 'delivered', 'undelivered', 'failed', 'read'];
const pairs = Object.entries(ranks).flatMap(([current, rank]) =>
  Object.entries(ranks).map(([incoming, incomingRank]) => ({
    current,
    incoming,
    applies: appliedStatuses.includes(incoming) && incomingRank > rank,
  })),
);

// Expected ranks are the approved contract, not imported from implementation.
describe.each(['status', 'providerStatus'] as const)('monotonic receipt using %s', (field) => {
  it.each(pairs)('$current → $incoming (applies=$applies)', ({ current, incoming, applies }) => {
    const update = planStatusUpdate(
      { status: 'queued', [field]: current },
      { status: incoming, messageSid: 'SMtest' },
      NOW,
    );
    expect(update !== null).toBe(applies);
  });
});

describe('rankOf', () => {
  it.each(['toString', 'constructor', '__proto__'])(
    'ignores unknown inherited-property status %s',
    (status) => {
      expect(rankOf(status)).toBe(0);
    },
  );

  it.each(Object.entries(ranks))('ranks %s as %i', (status, rank) => {
    expect(rankOf(status)).toBe(rank);
  });
  it.each([undefined, null, 3, {}, [], '', 'SENT'])('ignores malformed/unknown %j', (status) => {
    expect(rankOf(status)).toBe(0);
  });
});

describe('receipt fields', () => {
  it.each([
    ['sent', { status: 'sent', sentAt: NOW }],
    ['delivered', { status: 'delivered', deliveredAt: NOW }],
    ['read', { status: 'read', readAt: NOW, deliveredAt: NOW }],
    ['failed', { status: 'failed', failedAt: NOW, errorCode: 'twilio_failed' }],
    ['undelivered', { status: 'failed', failedAt: NOW, errorCode: 'twilio_undelivered' }],
  ] as const)('writes only the approved %s fields', (status, fields) => {
    expect(planStatusUpdate({ status: 'queued' }, { status, messageSid: 'SMtest' }, NOW)).toEqual({
      ...fields,
      providerStatus: status,
      providerSid: 'SMtest',
      statusUpdatedAt: NOW,
    });
  });
  it.each([
    ['sent', { sentAt: OLD }],
    ['read', { deliveredAt: OLD }],
  ] as const)('preserves existing timestamps for %s', (status, timestamps) => {
    const update = planStatusUpdate(
      { status: 'queued', ...timestamps },
      { status, messageSid: 'SMtest' },
      NOW,
    );
    expect(update).not.toHaveProperty(Object.keys(timestamps)[0]);
  });
  it.each([undefined, null, '', 42])('fills absent/malformed provider SID %j', (providerSid) => {
    expect(
      planStatusUpdate(
        { status: 'queued', providerSid },
        { status: 'sent', messageSid: 'SMnew' },
        NOW,
      ),
    ).toHaveProperty('providerSid', 'SMnew');
  });
  it('never overwrites an existing provider SID', () => {
    expect(
      planStatusUpdate(
        { status: 'queued', providerSid: 'SMold' },
        { status: 'sent', messageSid: 'SMnew' },
        NOW,
      ),
    ).not.toHaveProperty('providerSid');
  });
  it('does not mutate the stored message', () => {
    const current = Object.freeze({ status: 'queued', providerSid: '' });
    planStatusUpdate(current, { status: 'read', messageSid: 'SMtest' }, NOW);
    expect(current).toEqual({ status: 'queued', providerSid: '' });
  });
  it.each(['sent', 'delivered', 'read', 'failed'])('ignores suppressed %s', (status) => {
    expect(
      planStatusUpdate(
        { status: 'queued', suppressed: true },
        { status, messageSid: 'SMtest' },
        NOW,
      ),
    ).toBeNull();
  });
  it.each([undefined, null, ''])(
    'falls back to document status for providerStatus %j',
    (providerStatus) => {
      expect(
        planStatusUpdate(
          { status: 'read', providerStatus },
          { status: 'sent', messageSid: 'SMtest' },
          NOW,
        ),
      ).toBeNull();
    },
  );
  it('uses providerStatus rather than conflicting document status', () => {
    expect(
      planStatusUpdate(
        { status: 'queued', providerStatus: 'read' },
        { status: 'delivered', messageSid: 'SMtest' },
        NOW,
      ),
    ).toBeNull();
  });
  it('handles absent legacy status', () => {
    expect(planStatusUpdate({}, { status: 'sent', messageSid: 'SMtest' }, NOW)).toHaveProperty(
      'status',
      'sent',
    );
  });
  it('keeps delivered before sent, permits read after failure, and ignores competing failure', () => {
    const delivered = planStatusUpdate(
      { status: 'queued' },
      { status: 'delivered', messageSid: 'SMtest' },
      NOW,
    )!;
    expect(planStatusUpdate(delivered, { status: 'sent', messageSid: 'SMtest' }, NOW)).toBeNull();
    expect(planStatusUpdate(delivered, { status: 'failed', messageSid: 'SMtest' }, NOW)).toBeNull();
    expect(
      planStatusUpdate({ status: 'failed' }, { status: 'read', messageSid: 'SMtest' }, NOW),
    ).toMatchObject({ status: 'read', readAt: NOW });
  });
});

describe.each(['failed', 'undelivered'])('%s error mapping', (status) => {
  it.each([
    ['21211', 'invalid_to_number'],
    ['63003', 'wa_channel_not_available'],
    ['63015', 'wa_channel_not_found'],
    ['63016', 'wa_outside_session_window'],
    ['63018', 'wa_rate_limited'],
    ['63021', 'wa_message_undeliverable'],
    ['63032', 'twilio_63032'],
    [undefined, `twilio_${status}`],
    ['', `twilio_${status}`],
    ['bad', `twilio_${status}`],
  ])('maps ErrorCode %s to %s', (errorCode, expected) => {
    expect(
      planStatusUpdate({ status: 'queued' }, { status, errorCode, messageSid: 'SMtest' }, NOW),
    ).toHaveProperty('errorCode', expected);
  });
});

describe('buildStatusCallbackUrl', () => {
  it.each(['', ' ', '\t\n'])('omits blank base %j', (base) => {
    expect(buildStatusCallbackUrl(base, 'w1', 'm1')).toBeUndefined();
  });
  it('trims base and encodes IDs exactly once', () => {
    const url = buildStatusCallbackUrl(
      ' https://siapp.app/webhooks/twilio/status ',
      'w +&?雪',
      'm/%#=',
    );
    expect(url).toBe(
      'https://siapp.app/webhooks/twilio/status?wid=w+%2B%26%3F%E9%9B%AA&mid=m%2F%25%23%3D',
    );
    expect(new URL(url!).searchParams.get('wid')).toBe('w +&?雪');
    expect(new URL(url!).searchParams.get('mid')).toBe('m/%#=');
  });
});
