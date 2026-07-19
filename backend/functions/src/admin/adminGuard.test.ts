import type { CallableRequest } from 'firebase-functions/v2/https';
import { afterEach, describe, expect, it } from 'vitest';

import { assertAdminCall } from './adminGuard.js';

const ORIGINAL_ENV = { ...process.env };

function makeRequest(overrides: {
  auth?: object | undefined;
  claims?: Record<string, unknown>;
  forwardedFor?: string;
  ip?: string;
}): CallableRequest<unknown> {
  const claims = overrides.claims ?? {
    isAdmin: true,
    firebase: { sign_in_second_factor: 'totp' },
  };
  return {
    auth:
      'auth' in overrides
        ? overrides.auth
        : { uid: 'admin1', token: claims },
    rawRequest: {
      headers:
        overrides.forwardedFor !== undefined
          ? { 'x-forwarded-for': overrides.forwardedFor }
          : {},
      ip: overrides.ip,
    },
  } as unknown as CallableRequest<unknown>;
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('assertAdminCall', () => {
  it('rejects unauthenticated callers', () => {
    process.env['FUNCTIONS_EMULATOR'] = 'true';
    expect(() => assertAdminCall(makeRequest({ auth: undefined }))).toThrowError(
      /Authentication required/,
    );
  });

  it('rejects callers without the isAdmin claim', () => {
    process.env['FUNCTIONS_EMULATOR'] = 'true';
    expect(() =>
      assertAdminCall(makeRequest({ claims: { isAdmin: false } })),
    ).toThrowError(/Not a Siapp admin/);
  });

  it('rejects admin tokens without a second factor outside the emulator', () => {
    delete process.env['FUNCTIONS_EMULATOR'];
    process.env['ADMIN_IP_ALLOWLIST'] = '203.0.113.7';
    expect(() =>
      assertAdminCall(makeRequest({ claims: { isAdmin: true, firebase: {} }, forwardedFor: '203.0.113.7' })),
    ).toThrowError(/Multi-factor authentication/);
  });

  it('allows missing second factor in the emulator', () => {
    process.env['FUNCTIONS_EMULATOR'] = 'true';
    delete process.env['ADMIN_IP_ALLOWLIST'];
    expect(() =>
      assertAdminCall(makeRequest({ claims: { isAdmin: true } })),
    ).not.toThrow();
  });

  it('fails closed when ADMIN_IP_ALLOWLIST is unset outside the emulator', () => {
    delete process.env['FUNCTIONS_EMULATOR'];
    delete process.env['ADMIN_IP_ALLOWLIST'];
    expect(() =>
      assertAdminCall(makeRequest({ forwardedFor: '203.0.113.7' })),
    ).toThrowError(/allowlist is not configured/);
  });

  it('fails closed when ADMIN_IP_ALLOWLIST is empty outside the emulator', () => {
    delete process.env['FUNCTIONS_EMULATOR'];
    process.env['ADMIN_IP_ALLOWLIST'] = '  ,  ';
    expect(() =>
      assertAdminCall(makeRequest({ forwardedFor: '203.0.113.7' })),
    ).toThrowError(/allowlist is not configured/);
  });

  it('skips the IP check in the emulator when the allowlist is unset', () => {
    process.env['FUNCTIONS_EMULATOR'] = 'true';
    delete process.env['ADMIN_IP_ALLOWLIST'];
    expect(() => assertAdminCall(makeRequest({}))).not.toThrow();
  });

  it('allows callers whose IP is in the allowlist', () => {
    delete process.env['FUNCTIONS_EMULATOR'];
    process.env['ADMIN_IP_ALLOWLIST'] = '198.51.100.4, 203.0.113.7';
    expect(() =>
      assertAdminCall(makeRequest({ forwardedFor: '203.0.113.7, 10.0.0.1' })),
    ).not.toThrow();
  });

  it('rejects callers whose IP is not in the allowlist', () => {
    delete process.env['FUNCTIONS_EMULATOR'];
    process.env['ADMIN_IP_ALLOWLIST'] = '198.51.100.4';
    expect(() =>
      assertAdminCall(makeRequest({ forwardedFor: '203.0.113.7' })),
    ).toThrowError(/IP not permitted/);
  });

  it('rejects when the caller IP cannot be determined', () => {
    delete process.env['FUNCTIONS_EMULATOR'];
    process.env['ADMIN_IP_ALLOWLIST'] = '198.51.100.4';
    expect(() => assertAdminCall(makeRequest({}))).toThrowError(/IP not permitted/);
  });
});
