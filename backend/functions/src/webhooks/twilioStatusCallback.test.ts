import { describe, expect, it, vi } from 'vitest';
import twilio from 'twilio';
import type { Firestore } from 'firebase-admin/firestore';
import type { Request } from 'firebase-functions/v2/https';
import { createTwilioStatusHandler } from './twilioStatusCallback.js';

const TOKEN = 'local-unit-test-token';
const BASE = 'https://siapp.app/webhooks/twilio/status';
const QUERY = 'wid=w1&mid=m1';
const NOW = new Date('2026-10-16T07:15:00Z');
const FORM = {
  AccountSid: 'ACtest',
  MessageSid: 'SMtest',
  MessageStatus: 'sent',
  To: 'whatsapp:+60000000000',
  From: 'whatsapp:+61111111111',
};

function fixture(initial: Record<string, unknown> | null = { status: 'queued' }) {
  let data = initial === null ? null : { ...initial };
  const ref = { path: 'workspaces/w1/messages/m1' };
  const read = vi.fn(async () => ({ exists: data !== null, data: () => data }));
  const update = vi.fn((_ref: unknown, patch: Record<string, unknown>) => {
    data = { ...data, ...patch };
  });
  const messageDoc = vi.fn(() => ref);
  const messages = vi.fn(() => ({ doc: messageDoc }));
  const workspaceDoc = vi.fn(() => ({ collection: messages }));
  const collection = vi.fn(() => ({ doc: workspaceDoc }));
  const runTransaction = vi.fn(
    async (fn: (tx: { get: typeof read; update: typeof update }) => Promise<unknown>) =>
      fn({ get: read, update }),
  );
  const logger = { warn: vi.fn(), error: vi.fn() };
  const config = { authToken: TOKEN, accountSid: 'ACtest', callbackUrl: BASE };
  const handler = createTwilioStatusHandler({
    db: { collection, runTransaction } as unknown as Firestore,
    authToken: () => config.authToken,
    accountSid: () => config.accountSid,
    callbackUrl: () => config.callbackUrl,
    now: () => NOW,
    logger,
  });
  async function post(
    options: {
      method?: string;
      query?: string;
      form?: Record<string, unknown>;
      signature?: string | null;
      signUrl?: string;
      body?: unknown;
    } = {},
  ) {
    const query = options.query ?? QUERY;
    const form = options.form ?? FORM;
    const originalUrl = `/internal/function${query === '' ? '' : `?${query}`}`;
    const signature =
      options.signature === null
        ? undefined
        : (options.signature ??
          twilio.getExpectedTwilioSignature(
            TOKEN,
            options.signUrl ?? `${BASE}${query === '' ? '' : `?${query}`}`,
            form,
          ));
    const get = vi.fn((header: string) =>
      header.toLowerCase() === 'x-twilio-signature' ? signature : 'untrusted.internal.host',
    );
    const request = {
      method: options.method ?? 'POST',
      originalUrl,
      body: options.body ?? form,
      get,
    } as unknown as Request;
    const response = { status: vi.fn(), send: vi.fn() };
    response.status.mockReturnValue(response);
    await handler(request, response);
    return response;
  }
  return {
    post,
    read,
    update,
    runTransaction,
    collection,
    workspaceDoc,
    messages,
    messageDoc,
    logger,
    config,
    data: () => data,
  };
}

function expectNoPii(logger: ReturnType<typeof fixture>['logger']) {
  const logs = JSON.stringify([logger.warn.mock.calls, logger.error.mock.calls]);
  expect(logs).not.toContain(FORM.To);
  expect(logs).not.toContain(FORM.From);
  expect(logs).not.toContain('+60000000000');
  expect(logs).not.toContain('+61111111111');
  expect(logs).not.toContain(TOKEN);
}

describe('callback gates before Firestore', () => {
  it.each(['GET', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'])('returns 405 for %s', async (method) => {
    const f = fixture();
    const response = await f.post({ method });
    expect(response.status).toHaveBeenCalledWith(405);
    expect(f.collection).not.toHaveBeenCalled();
    expect(f.runTransaction).not.toHaveBeenCalled();
  });
  it.each([null, '', 'invalid'])('returns 403 for signature %j', async (signature) => {
    const f = fixture();
    const response = await f.post({ signature: signature === '' ? null : signature });
    expect(response.status).toHaveBeenCalledWith(403);
    expect(f.collection).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
  });
  it.each(['authToken', 'accountSid', 'callbackUrl'] as const)(
    'fails closed when %s is blank',
    async (key) => {
      const f = fixture();
      f.config[key] = '   ';
      expect((await f.post()).status).toHaveBeenCalledWith(403);
      expect(f.collection).not.toHaveBeenCalled();
      expect(f.runTransaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    `${BASE}?wid=other&mid=m1`,
    `${BASE}?wid=w1&mid=other`,
    `${BASE}?mid=m1&wid=w1`,
    'https://untrusted.internal.host/internal/function?wid=w1&mid=m1',
  ])('rejects a signature for a different raw URL %s', async (signUrl) => {
    const f = fixture();
    expect((await f.post({ signUrl })).status).toHaveBeenCalledWith(403);
    expect(f.collection).not.toHaveBeenCalled();
  });
  it('rejects changed form parameters before any database access', async () => {
    const f = fixture();
    const signature = twilio.getExpectedTwilioSignature(TOKEN, `${BASE}?${QUERY}`, FORM);
    expect(
      (await f.post({ signature, form: { ...FORM, MessageStatus: 'read' } })).status,
    ).toHaveBeenCalledWith(403);
    expect(f.collection).not.toHaveBeenCalled();
  });
  it('accepts configured base plus exact raw query despite rewritten path/Host', async () => {
    const f = fixture();
    const query = 'mid=m%2B1&wid=w+one&extra=%2f';
    expect((await f.post({ query })).status).toHaveBeenCalledWith(200);
    expect(f.workspaceDoc).toHaveBeenCalledWith('w one');
    expect(f.messageDoc).toHaveBeenCalledWith('m+1');
    expect(f.update).toHaveBeenCalledOnce();
  });
  it('accepts SDK-supported legacy encoding of the same raw-query values', async () => {
    const f = fixture();
    // Twilio validateRequest deliberately also validates its legacy querystring form.
    // Changed wid/mid values and query reordering are rejected in the tests above.
    expect(
      (await f.post({ query: 'wid=w+one&mid=m1', signUrl: `${BASE}?wid=w%20one&mid=m1` })).status,
    ).toHaveBeenCalledWith(200);
    expect(f.workspaceDoc).toHaveBeenCalledWith('w one');
  });
});

describe('signed malformed or mismatched payloads are acknowledged without DB access', () => {
  it.each([
    '',
    'wid=w1',
    'mid=m1',
    'wid=&mid=m1',
    'wid=w1&mid=',
    'wid=w1&wid=w2&mid=m1',
    'wid=w1&mid=m1&mid=m2',
    'wid=w%2F1&mid=m1',
    'wid=w1&mid=m%2F1',
    'wid=w%001&mid=m1',
    'wid=w1&mid=m%7F1',
    `wid=${'x'.repeat(1501)}&mid=m1`,
  ])('ignores malformed routing query %s', async (query) => {
    const f = fixture();
    expect((await f.post({ query })).status).toHaveBeenCalledWith(200);
    expect(f.collection).not.toHaveBeenCalled();
    expect(f.runTransaction).not.toHaveBeenCalled();
    expect(f.logger.warn).toHaveBeenCalledOnce();
    expectNoPii(f.logger);
  });
  it.each([
    { AccountSid: ['ACtest', 'ACother'] },
    { MessageSid: ['SMtest', 'SMother'] },
    { MessageStatus: ['sent', 'read'] },
    { ErrorCode: ['63016', '63021'] },
    { AccountSid: '' },
    { AccountSid: ' ' },
    { AccountSid: 'ACother' },
    { MessageSid: '' },
    { MessageSid: '  ' },
    { MessageStatus: '' },
    { ErrorCode: 'abc' },
    { ErrorCode: '-1' },
    { ErrorCode: '1.5' },
    { ErrorCode: ' 63016' },
  ])('ignores malformed/mismatched fields %j', async (change) => {
    const f = fixture();
    expect((await f.post({ form: { ...FORM, ...change } })).status).toHaveBeenCalledWith(200);
    expect(f.collection).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
    expectNoPii(f.logger);
  });
  it.each(['AccountSid', 'MessageSid', 'MessageStatus'])('ignores missing %s', async (key) => {
    const f = fixture();
    const form: Record<string, unknown> = { ...FORM };
    delete form[key];
    expect((await f.post({ form })).status).toHaveBeenCalledWith(200);
    expect(f.collection).not.toHaveBeenCalled();
  });
  it.each([[], 'raw body', 123])('ignores non-form body %j', async (body) => {
    const f = fixture();
    expect((await f.post({ body, form: {} })).status).toHaveBeenCalledWith(200);
    expect(f.read).not.toHaveBeenCalled();
  });
});

describe('callback transaction outcomes', () => {
  it.each([
    ['sent', { status: 'sent', sentAt: NOW }],
    ['delivered', { status: 'delivered', deliveredAt: NOW }],
    ['read', { status: 'read', deliveredAt: NOW, readAt: NOW }],
    ['failed', { status: 'failed', failedAt: NOW, errorCode: 'wa_outside_session_window' }],
    ['undelivered', { status: 'failed', failedAt: NOW, errorCode: 'wa_outside_session_window' }],
  ] as const)('applies signed %s with only approved fields', async (MessageStatus, fields) => {
    const f = fixture({ status: 'queued', recipientPhone: FORM.To });
    const response = await f.post({ form: { ...FORM, MessageStatus, ErrorCode: '63016' } });
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.send).toHaveBeenCalledWith('');
    expect(f.collection).toHaveBeenCalledWith('workspaces');
    expect(f.messages).toHaveBeenCalledWith('messages');
    expect(f.update).toHaveBeenCalledWith(expect.anything(), {
      ...fields,
      providerStatus: MessageStatus,
      providerSid: 'SMtest',
      statusUpdatedAt: NOW,
    });
    expect(f.data()).toHaveProperty('recipientPhone', FORM.To);
    expectNoPii(f.logger);
  });
  it.each([
    null,
    { status: 'queued', suppressed: true },
    { status: 'queued', providerSid: 'SMother' },
    { status: 'sent' },
    { status: 'read' },
    { status: 'failed' },
  ])('acknowledges without write for current document %j', async (initial) => {
    const f = fixture(initial);
    expect((await f.post()).status).toHaveBeenCalledWith(200);
    expect(f.read).toHaveBeenCalledOnce();
    expect(f.update).not.toHaveBeenCalled();
    expect(f.data()).toEqual(initial);
    expectNoPii(f.logger);
  });
  it.each(['queued', 'accepted', 'scheduled', 'sending', 'canceled', 'unknown'])(
    'ignores signed %s',
    async (MessageStatus) => {
      const f = fixture();
      expect((await f.post({ form: { ...FORM, MessageStatus } })).status).toHaveBeenCalledWith(200);
      expect(f.update).not.toHaveBeenCalled();
    },
  );
  it('survives duplicate/out-of-order callbacks without replacing timestamps', async () => {
    const f = fixture();
    await f.post({ form: { ...FORM, MessageStatus: 'delivered' } });
    const delivered = { ...f.data() };
    await f.post({ form: { ...FORM, MessageStatus: 'delivered' } });
    await f.post();
    await f.post({ form: { ...FORM, MessageStatus: 'failed' } });
    expect(f.data()).toEqual(delivered);
    expect(f.update).toHaveBeenCalledOnce();
    await f.post({ form: { ...FORM, MessageStatus: 'read' } });
    expect(f.data()).toMatchObject({ status: 'read', deliveredAt: NOW, readAt: NOW });
    expect(f.update).toHaveBeenCalledTimes(2);
  });
  it('accepts an empty ErrorCode', async () => {
    const f = fixture();
    await f.post({ form: { ...FORM, MessageStatus: 'failed', ErrorCode: '' } });
    expect(f.data()).toHaveProperty('errorCode', 'twilio_failed');
  });
  it('returns 500 on transaction failure and logs structured context without form PII', async () => {
    const f = fixture();
    f.runTransaction.mockRejectedValueOnce(new Error('database unavailable'));
    expect((await f.post()).status).toHaveBeenCalledWith(500);
    expect(f.update).not.toHaveBeenCalled();
    expect(f.logger.error).toHaveBeenCalledWith('twilioStatusCallback: transaction failed', {
      workspaceId: 'w1',
      messageId: 'm1',
      err: expect.objectContaining({ name: 'Error', message: 'database unavailable' }),
    });
    expectNoPii(f.logger);
  });
});

describe('legacy callback documents', () => {
  it.each([{}, { status: null }, { status: 123 }, { providerSid: 123 }])(
    'advances malformed/absent legacy fields %j',
    async (initial) => {
      const f = fixture(initial);
      expect((await f.post()).status).toHaveBeenCalledWith(200);
      expect(f.data()).toMatchObject({
        status: 'sent',
        providerStatus: 'sent',
        providerSid: 'SMtest',
      });
    },
  );
  it('read is positive evidence after failure, preserving existing delivery timestamp', async () => {
    const old = new Date('2026-10-15T07:15:00Z');
    const f = fixture({
      status: 'failed',
      providerStatus: 'undelivered',
      providerSid: 'SMtest',
      deliveredAt: old,
    });
    await f.post({ form: { ...FORM, MessageStatus: 'read' } });
    expect(f.data()).toMatchObject({ status: 'read', deliveredAt: old, readAt: NOW });
  });
});
