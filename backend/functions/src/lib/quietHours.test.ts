import { describe, expect, it } from 'vitest';

import {
  QUIET_HOURS_DEFAULT,
  holdUntilFor,
  isValidTimeString,
  mytDateString,
  resolveQuietHours,
  type IQuietHours,
} from './quietHours.js';

// Default window 21:00–08:00 MYT. MYT = UTC+8, so 21:00 MYT = 13:00 UTC and
// 08:00 MYT = 00:00 UTC.
const DEFAULTS: IQuietHours = { ...QUIET_HOURS_DEFAULT };

function utc(iso: string): Date {
  return new Date(iso);
}

describe('isValidTimeString', () => {
  it('accepts 24-hour HH:mm', () => {
    expect(isValidTimeString('00:00')).toBe(true);
    expect(isValidTimeString('08:00')).toBe(true);
    expect(isValidTimeString('23:59')).toBe(true);
  });

  it('rejects malformed values', () => {
    expect(isValidTimeString('24:00')).toBe(false);
    expect(isValidTimeString('8:00')).toBe(false);
    expect(isValidTimeString('08:60')).toBe(false);
    expect(isValidTimeString('0800')).toBe(false);
    expect(isValidTimeString('')).toBe(false);
    expect(isValidTimeString(800)).toBe(false);
    expect(isValidTimeString(undefined)).toBe(false);
  });
});

describe('resolveQuietHours', () => {
  it('returns defaults when the workspace doc or notifications map is absent', () => {
    expect(resolveQuietHours(undefined)).toEqual(DEFAULTS);
    expect(resolveQuietHours({})).toEqual(DEFAULTS);
    expect(resolveQuietHours({ notifications: {} })).toEqual(DEFAULTS);
  });

  it('reads a stored window', () => {
    expect(
      resolveQuietHours({
        notifications: {
          quietHours: { enabled: false, start: '22:00', end: '06:30', timezone: 'Asia/Kuala_Lumpur' },
        },
      }),
    ).toEqual({ enabled: false, start: '22:00', end: '06:30', timezone: 'Asia/Kuala_Lumpur' });
  });

  it('falls back field by field on malformed values', () => {
    expect(
      resolveQuietHours({
        notifications: { quietHours: { enabled: 'yes', start: '25:00', end: '07:00' } },
      }),
    ).toEqual({ ...DEFAULTS, end: '07:00' });
  });

  it('rejects a non-MYT timezone wholesale (D6)', () => {
    expect(
      resolveQuietHours({
        notifications: {
          quietHours: { enabled: false, start: '01:00', end: '02:00', timezone: 'Europe/London' },
        },
      }),
    ).toEqual(DEFAULTS);
  });
});

describe('holdUntilFor (default 21:00–08:00 MYT window)', () => {
  it('20:59 MYT → null (window not started)', () => {
    expect(holdUntilFor(utc('2026-07-23T12:59:00Z'), DEFAULTS)).toBeNull();
  });

  it('21:00 MYT (boundary in) → next-day 08:00 MYT', () => {
    expect(holdUntilFor(utc('2026-07-23T13:00:00Z'), DEFAULTS)).toEqual(
      utc('2026-07-24T00:00:00Z'),
    );
  });

  it('23:30 MYT → next-day 08:00 MYT', () => {
    expect(holdUntilFor(utc('2026-07-23T15:30:00Z'), DEFAULTS)).toEqual(
      utc('2026-07-24T00:00:00Z'),
    );
  });

  it('02:00 MYT (after midnight) → same-day 08:00 MYT', () => {
    // 2026-07-23T18:00Z = 02:00 MYT on Jul 24; 08:00 MYT Jul 24 = 00:00Z Jul 24.
    expect(holdUntilFor(utc('2026-07-23T18:00:00Z'), DEFAULTS)).toEqual(
      utc('2026-07-24T00:00:00Z'),
    );
  });

  it('07:59 MYT → same-day 08:00 MYT', () => {
    expect(holdUntilFor(utc('2026-07-23T23:59:00Z'), DEFAULTS)).toEqual(
      utc('2026-07-24T00:00:00Z'),
    );
  });

  it('08:00 MYT (boundary out) → null', () => {
    expect(holdUntilFor(utc('2026-07-24T00:00:00Z'), DEFAULTS)).toBeNull();
  });

  it('enabled: false → null even inside the window', () => {
    expect(holdUntilFor(utc('2026-07-23T15:30:00Z'), { ...DEFAULTS, enabled: false })).toBeNull();
  });

  it('honours a custom overnight window (22:00–06:30)', () => {
    const custom: IQuietHours = { ...DEFAULTS, start: '22:00', end: '06:30' };
    // 23:00 MYT Jul 23 → 06:30 MYT Jul 24 = 22:30Z Jul 23.
    expect(holdUntilFor(utc('2026-07-23T15:00:00Z'), custom)).toEqual(
      utc('2026-07-23T22:30:00Z'),
    );
    // 21:30 MYT — outside the custom window.
    expect(holdUntilFor(utc('2026-07-23T13:30:00Z'), custom)).toBeNull();
  });

  it('handles a same-day (non-wrapping) window', () => {
    const daytime: IQuietHours = { ...DEFAULTS, start: '09:00', end: '17:00' };
    // 10:00 MYT Jul 23 → 17:00 MYT Jul 23 = 09:00Z.
    expect(holdUntilFor(utc('2026-07-23T02:00:00Z'), daytime)).toEqual(
      utc('2026-07-23T09:00:00Z'),
    );
    expect(holdUntilFor(utc('2026-07-23T10:00:00Z'), daytime)).toBeNull();
  });

  it('treats a zero-length window (start == end) as never inside', () => {
    const zero: IQuietHours = { ...DEFAULTS, start: '08:00', end: '08:00' };
    expect(holdUntilFor(utc('2026-07-23T00:00:00Z'), zero)).toBeNull();
  });
});

describe('mytDateString', () => {
  it('formats the date in Malaysia time, not UTC', () => {
    // 23:00Z Jul 23 = 07:00 MYT Jul 24.
    expect(mytDateString(utc('2026-07-23T23:00:00Z'))).toBe('2026-07-24');
    expect(mytDateString(utc('2026-07-23T12:00:00Z'))).toBe('2026-07-23');
  });
});
