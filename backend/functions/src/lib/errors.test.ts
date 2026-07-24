import { describe, expect, it } from 'vitest';

import { errorPayload } from './errors.js';

describe('errorPayload', () => {
  it('extracts name, message, and stack from an Error', () => {
    const error = new Error('boom');

    const payload = errorPayload(error);

    expect(payload.name).toBe('Error');
    expect(payload.message).toBe('boom');
    expect(payload.stack).toEqual(expect.any(String));
  });

  it('preserves the subclass name', () => {
    class QuotaError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'QuotaError';
      }
    }

    const payload = errorPayload(new QuotaError('over quota'));

    expect(payload.name).toBe('QuotaError');
    expect(payload.message).toBe('over quota');
  });

  it('wraps a string throw as a NonError', () => {
    const payload = errorPayload('something failed');

    expect(payload).toEqual({ name: 'NonError', message: 'something failed' });
  });

  it('wraps undefined as a NonError with a string message', () => {
    const payload = errorPayload(undefined);

    expect(payload).toEqual({ name: 'NonError', message: 'undefined' });
  });

  it('describes plain objects without throwing', () => {
    const payload = errorPayload({ code: 6, details: 'ALREADY_EXISTS' });

    expect(payload.name).toBe('NonError');
    expect(payload.message).toBe('{"code":6,"details":"ALREADY_EXISTS"}');
  });

  it('never throws on circular structures', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;

    const payload = errorPayload(circular);

    expect(payload.name).toBe('NonError');
    expect(typeof payload.message).toBe('string');
  });
});
