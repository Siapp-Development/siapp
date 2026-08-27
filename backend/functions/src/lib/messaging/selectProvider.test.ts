import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the twilio SDK so provider construction never touches the network or
// validates real credentials.
vi.mock('twilio', () => ({
  default: () => ({ messages: { create: vi.fn() } }),
}));

import { isEmulator, selectProvider } from './selectProvider.js';
import { NoopProvider } from './provider.js';
import { TwilioProvider } from './twilioProvider.js';

const ENV_KEYS = ['FUNCTIONS_EMULATOR', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe('isEmulator', () => {
  it('is true only when FUNCTIONS_EMULATOR === "true"', () => {
    expect(isEmulator()).toBe(false);
    process.env.FUNCTIONS_EMULATOR = 'true';
    expect(isEmulator()).toBe(true);
    process.env.FUNCTIONS_EMULATOR = 'false';
    expect(isEmulator()).toBe(false);
  });
});

describe('selectProvider', () => {
  it('returns NoopProvider under the emulator even when creds are present', () => {
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxxxxxx';
    process.env.TWILIO_AUTH_TOKEN = 'authtoken';
    expect(selectProvider()).toBeInstanceOf(NoopProvider);
  });

  it('returns NoopProvider when Twilio credentials are absent', () => {
    expect(selectProvider()).toBeInstanceOf(NoopProvider);
  });

  it('returns NoopProvider when only one credential is present', () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxxxxxx';
    expect(selectProvider()).toBeInstanceOf(NoopProvider);
  });

  it('returns a TwilioProvider when both creds are present and not in the emulator', () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxxxxxx';
    process.env.TWILIO_AUTH_TOKEN = 'authtoken';
    expect(selectProvider()).toBeInstanceOf(TwilioProvider);
  });
});
