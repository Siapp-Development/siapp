import { describe, expect, it } from 'vitest';

import { parseQuietHoursInput } from './updateNotificationSettings.js';

describe('parseQuietHoursInput', () => {
  it('accepts a valid window and pins the timezone', () => {
    expect(parseQuietHoursInput({ enabled: true, start: '21:00', end: '08:00' })).toEqual({
      enabled: true,
      start: '21:00',
      end: '08:00',
      timezone: 'Asia/Kuala_Lumpur',
    });
  });

  it('accepts an explicit MYT timezone', () => {
    expect(
      parseQuietHoursInput({
        enabled: false,
        start: '22:30',
        end: '06:00',
        timezone: 'Asia/Kuala_Lumpur',
      }),
    ).toMatchObject({ enabled: false, start: '22:30', end: '06:00' });
  });

  it('rejects a missing or non-object payload', () => {
    expect(() => parseQuietHoursInput(undefined)).toThrowError(/quietHours is required/);
    expect(() => parseQuietHoursInput('21:00-08:00')).toThrowError(/quietHours is required/);
  });

  it('rejects a non-boolean enabled', () => {
    expect(() => parseQuietHoursInput({ enabled: 'true', start: '21:00', end: '08:00' })).toThrowError(
      /enabled must be a boolean/,
    );
  });

  it('rejects malformed HH:mm times', () => {
    expect(() => parseQuietHoursInput({ enabled: true, start: '9:00', end: '08:00' })).toThrowError(
      /HH:mm/,
    );
    expect(() => parseQuietHoursInput({ enabled: true, start: '21:00', end: '24:00' })).toThrowError(
      /HH:mm/,
    );
    expect(() => parseQuietHoursInput({ enabled: true, start: '21:00' })).toThrowError(/HH:mm/);
  });

  it('rejects any timezone other than Asia/Kuala_Lumpur (D6)', () => {
    expect(() =>
      parseQuietHoursInput({ enabled: true, start: '21:00', end: '08:00', timezone: 'UTC' }),
    ).toThrowError(/Asia\/Kuala_Lumpur/);
  });
});
