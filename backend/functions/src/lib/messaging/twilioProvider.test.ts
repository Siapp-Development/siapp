import { describe, expect, it, vi } from 'vitest';

import {
  TwilioProvider,
  buildContentVariables,
  mapTwilioError,
  type ITwilioClient,
  type ITwilioCreateOptions,
  type ITwilioMessageResult,
  type TResolveContentSid,
} from './twilioProvider.js';
import { logger } from 'firebase-functions';
import type { IQueuedMessage } from './provider.js';
import type { TNotificationTrigger } from './contentSids.js';

vi.mock('firebase-functions', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const SENDER = '+13604414161';

/** Builds a fake Twilio client whose `create` is a spy with the given behaviour. */
function makeClient(behaviour: (opts: ITwilioCreateOptions) => Promise<ITwilioMessageResult>): {
  client: ITwilioClient;
  create: ReturnType<typeof vi.fn>;
} {
  const create = vi.fn(behaviour);
  return { client: { messages: { create } }, create };
}

function baseMessage(overrides: Partial<IQueuedMessage> = {}): IQueuedMessage {
  return {
    id: 'm1',
    workspaceId: 'w1',
    channel: 'whatsapp',
    recipientPhone: '+60123456789',
    templateName: 'task_status_change_v1',
    variables: { name: 'Ada', status: 'done' },
    trigger: 'task_status_change',
    ...overrides,
  };
}

const resolveTo =
  (sid: string | null): TResolveContentSid =>
  (_trigger: TNotificationTrigger, _locale?: string): string | null =>
    sid;

describe('TwilioProvider.send — success path', () => {
  it('calls messages.create with prefixed from/to, resolved contentSid and JSON variables', async () => {
    const { client, create } = makeClient(() => Promise.resolve({ sid: 'SM123' }));
    const provider = new TwilioProvider({
      client,
      sender: SENDER,
      statusCallbackBase: '',
      resolveContentSid: resolveTo('HXabc123'),
    });

    const result = await provider.send(baseMessage());

    // #171 A4: the resolved Content SID is reported back for the log.
    expect(result).toEqual({ ok: true, providerSid: 'SM123', contentSid: 'HXabc123' });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      from: 'whatsapp:+13604414161',
      to: 'whatsapp:+60123456789',
      contentSid: 'HXabc123',
      contentVariables: JSON.stringify({ name: 'Ada', status: 'done' }),
    });
  });

  it('resolves the ContentSid by the message trigger and locale', async () => {
    const resolve = vi.fn(() => 'HXresolved');
    const { client } = makeClient(() => Promise.resolve({ sid: 'SM9' }));
    const provider = new TwilioProvider({
      client,
      sender: SENDER,
      statusCallbackBase: '',
      resolveContentSid: resolve,
    });

    await provider.send(baseMessage({ trigger: 'task_assigned', locale: 'en' }));

    expect(resolve).toHaveBeenCalledWith('task_assigned', 'en');
  });

  it('defaults locale to "en" when the message has none', async () => {
    const resolve = vi.fn(() => 'HXresolved');
    const { client } = makeClient(() => Promise.resolve({ sid: 'SM9' }));
    const provider = new TwilioProvider({
      client,
      sender: SENDER,
      statusCallbackBase: '',
      resolveContentSid: resolve,
    });

    await provider.send(baseMessage({ locale: undefined }));

    expect(resolve).toHaveBeenCalledWith('task_status_change', 'en');
  });
});

describe('TwilioProvider.send — missing ContentSid (O-7)', () => {
  it('returns no_content_sid and never calls Twilio', async () => {
    const { client, create } = makeClient(() => Promise.resolve({ sid: 'SHOULD_NOT' }));
    const provider = new TwilioProvider({
      client,
      sender: SENDER,
      statusCallbackBase: '',
      resolveContentSid: resolveTo(null),
    });

    const result = await provider.send(baseMessage());

    expect(result).toEqual({ ok: false, errorCode: 'no_content_sid' });
    // #171 A4: no SID was resolved, so none is reported.
    expect(result).not.toHaveProperty('contentSid');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('TwilioProvider.send — Twilio errors are mapped, never rethrown', () => {
  it('maps a known WhatsApp session-window error (63016)', async () => {
    const { client } = makeClient(() =>
      Promise.reject(Object.assign(new Error('nope'), { code: 63016 })),
    );
    const provider = new TwilioProvider({
      client,
      sender: SENDER,
      statusCallbackBase: '',
      resolveContentSid: resolveTo('HXabc'),
    });

    const result = await provider.send(baseMessage());

    // #171 A4: the attempted Content SID is still reported on a Twilio error.
    expect(result).toEqual({
      ok: false,
      errorCode: 'wa_outside_session_window',
      contentSid: 'HXabc',
    });
  });

  it('maps a known undeliverable error (63021)', async () => {
    const { client } = makeClient(() =>
      Promise.reject(Object.assign(new Error('nope'), { code: 63021 })),
    );
    const provider = new TwilioProvider({
      client,
      sender: SENDER,
      statusCallbackBase: '',
      resolveContentSid: resolveTo('HXabc'),
    });

    const result = await provider.send(baseMessage());

    expect(result).toEqual({
      ok: false,
      errorCode: 'wa_message_undeliverable',
      contentSid: 'HXabc',
    });
  });

  it('does not rethrow even for an unmapped error code', async () => {
    const { client } = makeClient(() =>
      Promise.reject(Object.assign(new Error('boom'), { code: 99999 })),
    );
    const provider = new TwilioProvider({
      client,
      sender: SENDER,
      statusCallbackBase: '',
      resolveContentSid: resolveTo('HXabc'),
    });

    await expect(provider.send(baseMessage())).resolves.toEqual({
      ok: false,
      errorCode: 'twilio_99999',
      contentSid: 'HXabc',
    });
  });
});

describe('TwilioProvider.send — contentSid stamp (#171 A4)', () => {
  it('reports the SID resolved for THIS trigger/locale, on success and on error', async () => {
    const resolve = vi.fn((trigger: TNotificationTrigger) =>
      trigger === 'project_welcome' ? 'HXwelcome' : 'HXother',
    );
    const ok = new TwilioProvider({
      client: makeClient(() => Promise.resolve({ sid: 'SM1' })).client,
      sender: SENDER,
      statusCallbackBase: '',
      resolveContentSid: resolve,
    });
    await expect(ok.send(baseMessage({ trigger: 'project_welcome' }))).resolves.toMatchObject({
      ok: true,
      contentSid: 'HXwelcome',
    });

    const failing = new TwilioProvider({
      client: makeClient(() => Promise.reject(Object.assign(new Error('x'), { code: 21211 })))
        .client,
      sender: SENDER,
      statusCallbackBase: '',
      resolveContentSid: resolve,
    });
    await expect(failing.send(baseMessage({ trigger: 'collab_access_link' }))).resolves.toEqual({
      ok: false,
      errorCode: 'invalid_to_number',
      contentSid: 'HXother',
    });
  });
});

describe('mapTwilioError', () => {
  it('maps known numeric codes to stable strings', () => {
    expect(mapTwilioError({ code: 21211 })).toBe('invalid_to_number');
    expect(mapTwilioError({ code: 63016 })).toBe('wa_outside_session_window');
  });

  it('falls back to twilio_<code> for unknown numeric codes', () => {
    expect(mapTwilioError({ code: 40404 })).toBe('twilio_40404');
  });

  it('falls back to twilio_error for a non-numeric / missing code', () => {
    expect(mapTwilioError(new Error('plain'))).toBe('twilio_error');
    expect(mapTwilioError(null)).toBe('twilio_error');
    expect(mapTwilioError({ code: 'ETIMEDOUT' })).toBe('twilio_error');
  });
});

describe('buildContentVariables', () => {
  it('serialises variables to JSON', () => {
    expect(buildContentVariables({ a: '1', b: '2' })).toBe(JSON.stringify({ a: '1', b: '2' }));
  });

  it('substitutes an em-dash for an empty optional value (e.g. absent dueDate)', () => {
    const json = buildContentVariables({ taskName: 'File taxes', dueDate: '' });
    expect(JSON.parse(json)).toEqual({ taskName: 'File taxes', dueDate: '—' });
  });

  it('returns an empty JSON object for no variables', () => {
    expect(buildContentVariables({})).toBe('{}');
  });
});

describe('TwilioProvider receipt URL wiring', () => {
  it('adds a per-message callback on every create', async () => {
    const { client, create } = makeClient(() => Promise.resolve({ sid: 'SMtest' }));
    const provider = new TwilioProvider({
      client,
      sender: SENDER,
      statusCallbackBase: 'https://siapp.app/webhooks/twilio/status',
      resolveContentSid: resolveTo('HXtest'),
    });
    await provider.send(baseMessage());
    await provider.send(baseMessage({ workspaceId: 'w +雪', id: 'm&+?' }));
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        statusCallback: 'https://siapp.app/webhooks/twilio/status?wid=w1&mid=m1',
      }),
    );
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        statusCallback:
          'https://siapp.app/webhooks/twilio/status?wid=w+%2B%E9%9B%AA&mid=m%26%2B%3F',
      }),
    );
  });
  it.each(['', '   '])(
    'omits statusCallback entirely for blank base %j',
    async (statusCallbackBase) => {
      const { client, create } = makeClient(() => Promise.resolve({ sid: 'SMtest' }));
      const provider = new TwilioProvider({
        client,
        sender: SENDER,
        statusCallbackBase,
        resolveContentSid: resolveTo('HXtest'),
      });
      await provider.send(baseMessage());
      expect(create.mock.calls[0][0]).not.toHaveProperty('statusCallback');
    },
  );
});

it('logs only mapped error context, never recipient PII or raw provider error', async () => {
  vi.mocked(logger.error).mockClear();
  const rawError = Object.assign(
    new Error('To whatsapp:+60000000000 From whatsapp:+61111111111 credential-token'),
    { code: 63016 },
  );
  const { client } = makeClient(() => Promise.reject(rawError));
  const provider = new TwilioProvider({
    client,
    sender: '+61111111111',
    statusCallbackBase: '',
    resolveContentSid: resolveTo('HXtest'),
  });
  await provider.send(baseMessage({ recipientPhone: '+60000000000' }));
  expect(logger.error).toHaveBeenCalledWith('TwilioProvider: send failed', {
    messageId: 'm1',
    trigger: 'task_status_change',
    errorCode: 'wa_outside_session_window',
  });
  const logs = JSON.stringify(vi.mocked(logger.error).mock.calls);
  expect(logs).not.toContain('+60000000000');
  expect(logs).not.toContain('+61111111111');
  expect(logs).not.toContain('credential-token');
});
