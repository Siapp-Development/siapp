import { describe, expect, it } from 'vitest';
import twilio from 'twilio';
import { verifyTwilioSignature } from './twilioSignature.js';

const authToken = 'local-unit-test-token';
const url = 'https://siapp.app/webhooks/twilio/status?wid=w+one&mid=m%2B1';
const params = {
  AccountSid: 'ACtest',
  MessageSid: 'SMtest',
  MessageStatus: 'sent',
  To: 'whatsapp:+60000000000',
};
const signature = twilio.getExpectedTwilioSignature(authToken, url, params);
const input = { authToken, url, params, signature };

describe('verifyTwilioSignature', () => {
  it('accepts SDK-signed exact URL and form parameters', () => {
    expect(verifyTwilioSignature(input)).toBe(true);
  });
  it.each([
    { url: url.replace('w+one', 'other') },
    { url: url.replace('m%2B1', 'other') },
    { url: url.replace('w+one', 'w%20one') },
    { url: url.replace('wid=w+one&mid=m%2B1', 'mid=m%2B1&wid=w+one') },
    { params: { ...params, MessageStatus: 'read' } },
    { params: { ...params, To: 'whatsapp:+61111111111' } },
    { authToken: 'wrong-token' },
    { authToken: '' },
    { authToken: '  ' },
    { signature: undefined },
    { signature: '' },
    { signature: 'invalid' },
  ])('rejects tampering or missing credentials %#', (change) => {
    expect(verifyTwilioSignature({ ...input, ...change })).toBe(false);
  });
  it('fails closed for a malformed configured URL instead of throwing', () => {
    expect(verifyTwilioSignature({ ...input, url: 'not-a-url' })).toBe(false);
  });
});
