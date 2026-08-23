import { describe, expect, it } from 'vitest';

import { firstNameFrom, timeGreeting } from './greeting.ts';

describe('firstNameFrom', () => {
  it('takes the first whitespace token of a multi-word display name', () => {
    expect(firstNameFrom('Alice Tan', 'alice@acme.test')).toBe('Alice');
  });

  it('collapses repeated internal whitespace to the first token', () => {
    expect(firstNameFrom('Mary   Jane Watson', '')).toBe('Mary');
  });

  it('returns a single-word display name unchanged', () => {
    expect(firstNameFrom('Bob', '')).toBe('Bob');
  });

  it('falls back to the email local-part when the display name is empty', () => {
    expect(firstNameFrom('', 'jane.doe@example.com')).toBe('jane.doe');
  });

  it('falls back to the email local-part when the display name is whitespace only', () => {
    expect(firstNameFrom('   ', 'jack@example.com')).toBe('jack');
  });

  it('falls back to "there" when both name and email are empty', () => {
    expect(firstNameFrom('', '')).toBe('there');
  });
});

describe('timeGreeting', () => {
  it('greets "Good morning" before noon', () => {
    expect(timeGreeting(new Date(2026, 0, 15, 8, 0, 0))).toBe('Good morning');
  });

  it('still greets "Good morning" at 11:59 (boundary just before noon)', () => {
    expect(timeGreeting(new Date(2026, 0, 15, 11, 59, 0))).toBe('Good morning');
  });

  it('greets "Good afternoon" from noon', () => {
    expect(timeGreeting(new Date(2026, 0, 15, 12, 0, 0))).toBe('Good afternoon');
  });

  it('greets "Good afternoon" at 17:00 (boundary just before evening)', () => {
    expect(timeGreeting(new Date(2026, 0, 15, 17, 0, 0))).toBe('Good afternoon');
  });

  it('greets "Good evening" from 18:00 onward', () => {
    expect(timeGreeting(new Date(2026, 0, 15, 18, 0, 0))).toBe('Good evening');
  });

  it('greets "Good evening" late at night', () => {
    expect(timeGreeting(new Date(2026, 0, 15, 22, 30, 0))).toBe('Good evening');
  });
});
