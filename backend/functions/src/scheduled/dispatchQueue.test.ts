import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_DISPATCH_ATTEMPTS,
  STALE_CLAIM_MS,
  claimDecision,
  selectDispatchable,
} from './dispatchQueue.js';
import type { IMessageProvider, IQueuedMessage, ISendResult } from '../lib/messaging/provider.js';

// Shared mutable store the fake Firestore reads/mutates. `vi.hoisted` runs
// before the `vi.mock` factory (which is itself hoisted above imports).
const store = vi.hoisted(() => ({
  messages: [] as Array<{ id: string; data: Record<string, unknown> }>,
}));

vi.mock('firebase-admin/firestore', () => {
  function applyPatch(data: Record<string, unknown>, patch: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(patch)) {
      if (key.includes('.')) {
        const [head, tail] = key.split('.');
        const nested = (data[head] ?? {}) as Record<string, unknown>;
        nested[tail] = value;
        data[head] = nested;
      } else {
        data[key] = value;
      }
    }
  }

  interface IFakeDoc {
    id: string;
    data: Record<string, unknown>;
  }
  interface IFakeRef {
    __doc: IFakeDoc;
    update: (patch: Record<string, unknown>) => Promise<void>;
  }

  function makeRef(doc: IFakeDoc): IFakeRef {
    return {
      __doc: doc,
      update: (patch) => {
        applyPatch(doc.data, patch);
        return Promise.resolve();
      },
    };
  }

  function messageSnaps() {
    return store.messages
      .filter((doc) => doc.data['status'] === 'queued')
      .map((doc) => ({ id: doc.id, ref: makeRef(doc), exists: true, data: () => doc.data }));
  }

  const workspaceRef = {
    collection: (_name: string) => ({
      where: (_field: string, _op: string, _value: unknown) => ({
        get: () => Promise.resolve({ docs: messageSnaps() }),
      }),
    }),
  };

  const fakeDb = {
    collection: (_name: string) => ({
      get: () => Promise.resolve({ docs: [{ id: 'w1', ref: workspaceRef }] }),
    }),
    runTransaction: <T>(
      fn: (tx: {
        get: (ref: IFakeRef) => Promise<{ exists: boolean; data: () => Record<string, unknown> }>;
        update: (ref: IFakeRef, patch: Record<string, unknown>) => void;
      }) => Promise<T>,
    ): Promise<T> =>
      fn({
        get: (ref) => Promise.resolve({ exists: true, data: () => ref.__doc.data }),
        update: (ref, patch) => {
          applyPatch(ref.__doc.data, patch);
        },
      }),
  };

  return {
    getFirestore: () => fakeDb,
    Timestamp: {
      fromDate: (d: Date) => ({ toMillis: () => d.getTime(), toDate: () => d }),
    },
  };
});

// Imported AFTER the mock so it binds the faked firebase-admin/firestore.
import { sweepMessageQueue } from './dispatchQueue.js';

const NOW = new Date('2026-08-26T09:00:00Z');
const NOW_MS = NOW.getTime();

/** A Timestamp-like value offset from NOW. */
function tsOffset(ms: number) {
  const d = new Date(NOW_MS + ms);
  return { toMillis: () => d.getTime(), toDate: () => d };
}

function dispatchableDoc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'queued',
    channel: 'whatsapp',
    recipientPhone: '+60123456789',
    trigger: 'task_status_change',
    variables: { name: 'Ada' },
    ...overrides,
  };
}

describe('selectDispatchable (pure filter)', () => {
  it('accepts a queued, non-suppressed, no-hold WhatsApp doc with a phone', () => {
    expect(selectDispatchable(dispatchableDoc(), NOW)).toBe(true);
  });

  it('accepts when holdUntil is absent or in the past', () => {
    expect(selectDispatchable(dispatchableDoc({ holdUntil: undefined }), NOW)).toBe(true);
    expect(selectDispatchable(dispatchableDoc({ holdUntil: null }), NOW)).toBe(true);
    expect(selectDispatchable(dispatchableDoc({ holdUntil: tsOffset(-1000) }), NOW)).toBe(true);
    expect(selectDispatchable(dispatchableDoc({ holdUntil: tsOffset(0) }), NOW)).toBe(true);
  });

  it('rejects when status is not queued', () => {
    expect(selectDispatchable(dispatchableDoc({ status: 'sent' }), NOW)).toBe(false);
    expect(selectDispatchable(dispatchableDoc({ status: 'failed' }), NOW)).toBe(false);
  });

  it('rejects a suppressed doc', () => {
    expect(selectDispatchable(dispatchableDoc({ suppressed: true }), NOW)).toBe(false);
  });

  it('rejects when holdUntil is in the future', () => {
    expect(selectDispatchable(dispatchableDoc({ holdUntil: tsOffset(60_000) }), NOW)).toBe(false);
  });

  it('rejects a non-whatsapp channel (SMS out of scope, O-5)', () => {
    expect(selectDispatchable(dispatchableDoc({ channel: 'sms' }), NOW)).toBe(false);
  });

  it('rejects a missing or empty recipientPhone', () => {
    expect(selectDispatchable(dispatchableDoc({ recipientPhone: '' }), NOW)).toBe(false);
    expect(selectDispatchable(dispatchableDoc({ recipientPhone: undefined }), NOW)).toBe(false);
  });
});

describe('claimDecision (pure)', () => {
  it('allows a fresh claim on a never-claimed queued doc', () => {
    expect(claimDecision({ status: 'queued' }, NOW_MS)).toEqual({
      claim: true,
      nextAttempts: 1,
      reason: 'ok',
    });
  });

  it('does not claim a non-queued doc', () => {
    expect(claimDecision({ status: 'sent' }, NOW_MS)).toEqual({
      claim: false,
      nextAttempts: 0,
      reason: 'not_queued',
    });
  });

  it('skips a recently-claimed doc (in flight, < stale window)', () => {
    const data = { status: 'queued', dispatch: { claimedAt: tsOffset(-(STALE_CLAIM_MS - 1000)), attempts: 1 } };
    expect(claimDecision(data, NOW_MS)).toEqual({ claim: false, nextAttempts: 1, reason: 'in_flight' });
  });

  it('reclaims a stale claim (>= stale window) and increments attempts', () => {
    const data = { status: 'queued', dispatch: { claimedAt: tsOffset(-STALE_CLAIM_MS), attempts: 1 } };
    expect(claimDecision(data, NOW_MS)).toEqual({ claim: true, nextAttempts: 2, reason: 'ok' });
  });

  it('is terminal once attempts reach the ceiling (leave queued, no claim)', () => {
    const data = {
      status: 'queued',
      dispatch: { claimedAt: tsOffset(-STALE_CLAIM_MS), attempts: MAX_DISPATCH_ATTEMPTS },
    };
    expect(claimDecision(data, NOW_MS)).toEqual({
      claim: false,
      nextAttempts: MAX_DISPATCH_ATTEMPTS,
      reason: 'max_attempts',
    });
  });
});

/** A stub provider whose send behaviour is scripted per call. */
function stubProvider(impl: (msg: IQueuedMessage) => Promise<ISendResult>): {
  provider: IMessageProvider;
  send: ReturnType<typeof vi.fn>;
} {
  const send = vi.fn(impl);
  return { provider: { send }, send };
}

describe('sweepMessageQueue (fake db)', () => {
  beforeEach(() => {
    store.messages = [];
  });

  it('claims then marks a dispatchable doc sent with providerSid', async () => {
    store.messages = [{ id: 'm1', data: dispatchableDoc() }];
    const { provider, send } = stubProvider(() => Promise.resolve({ ok: true, providerSid: 'SM999' }));

    const stats = await sweepMessageQueue(NOW, provider);

    expect(stats).toEqual({ sent: 1, failed: 0, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const doc = store.messages[0].data;
    expect(doc['status']).toBe('sent');
    expect(doc['providerSid']).toBe('SM999');
    expect(doc['sentAt']).toBeDefined();
    // Claim was written before the send.
    expect((doc['dispatch'] as Record<string, unknown>)['attempts']).toBe(1);
    expect((doc['dispatch'] as Record<string, unknown>)['claimedAt']).toBeDefined();
  });

  it('marks a doc failed with errorCode when the provider reports failure', async () => {
    store.messages = [{ id: 'm1', data: dispatchableDoc() }];
    const { provider } = stubProvider(() => Promise.resolve({ ok: false, errorCode: 'wa_message_undeliverable' }));

    const stats = await sweepMessageQueue(NOW, provider);

    expect(stats).toEqual({ sent: 0, failed: 1, skipped: 0 });
    const doc = store.messages[0].data;
    expect(doc['status']).toBe('failed');
    expect(doc['errorCode']).toBe('wa_message_undeliverable');
    expect(doc['failedAt']).toBeDefined();
    expect(doc['providerSid']).toBeUndefined();
  });

  it('skips a doc already claimed within the stale window (no double-send)', async () => {
    store.messages = [
      {
        id: 'm1',
        data: dispatchableDoc({ dispatch: { claimedAt: tsOffset(-1000), attempts: 1 } }),
      },
    ];
    const { provider, send } = stubProvider(() => Promise.resolve({ ok: true, providerSid: 'SM1' }));

    const stats = await sweepMessageQueue(NOW, provider);

    expect(send).not.toHaveBeenCalled();
    expect(stats).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(store.messages[0].data['status']).toBe('queued');
  });

  it('does not send docs filtered out by selectDispatchable (suppressed / sms / future hold)', async () => {
    store.messages = [
      { id: 'sup', data: dispatchableDoc({ suppressed: true }) },
      { id: 'sms', data: dispatchableDoc({ channel: 'sms' }) },
      { id: 'held', data: dispatchableDoc({ holdUntil: tsOffset(60_000) }) },
    ];
    const { provider, send } = stubProvider(() => Promise.resolve({ ok: true, providerSid: 'SMx' }));

    const stats = await sweepMessageQueue(NOW, provider);

    expect(send).not.toHaveBeenCalled();
    expect(stats).toEqual({ sent: 0, failed: 0, skipped: 0 });
  });

  it('catches a provider throw per-doc and continues the batch', async () => {
    store.messages = [
      { id: 'bad', data: dispatchableDoc({ recipientPhone: '+60111111111' }) },
      { id: 'good', data: dispatchableDoc({ recipientPhone: '+60122222222' }) },
    ];
    const { provider, send } = stubProvider((msg) => {
      if (msg.recipientPhone === '+60111111111') {
        return Promise.reject(new Error('provider blew up'));
      }
      return Promise.resolve({ ok: true, providerSid: 'SMgood' });
    });

    const stats = await sweepMessageQueue(NOW, provider);

    expect(send).toHaveBeenCalledTimes(2);
    expect(stats.sent).toBe(1);
    expect(stats.failed).toBe(1);
    const good = store.messages.find((m) => m.id === 'good');
    expect(good?.data['status']).toBe('sent');
    expect(good?.data['providerSid']).toBe('SMgood');
  });

  it('passes the resolved trigger and variables through to the provider', async () => {
    store.messages = [
      { id: 'm1', data: dispatchableDoc({ trigger: 'task_assigned', variables: { name: 'Zed' } }) },
    ];
    const { provider, send } = stubProvider(() => Promise.resolve({ ok: true, providerSid: 'SM1' }));

    await sweepMessageQueue(NOW, provider);

    const sent = send.mock.calls[0][0] as IQueuedMessage;
    expect(sent.trigger).toBe('task_assigned');
    expect(sent.channel).toBe('whatsapp');
    expect(sent.recipientPhone).toBe('+60123456789');
    expect(sent.variables).toEqual({ name: 'Zed' });
  });
});
