import { describe, expect, it } from 'vitest';

import { isDueSoonCandidate } from './dueSoonSweep.js';

describe('isDueSoonCandidate (D5 in-memory config filter)', () => {
  it('accepts a WhatsApp-enabled, not-done task with default notify', () => {
    expect(isDueSoonCandidate({ sendWhatsapp: true, status: 'todo' })).toBe(true);
    expect(isDueSoonCandidate({ sendWhatsapp: true, status: 'in_progress' })).toBe(true);
    expect(isDueSoonCandidate({ sendWhatsapp: true, status: 'blocked' })).toBe(true);
  });

  it('rejects when sendWhatsapp is off', () => {
    expect(isDueSoonCandidate({ sendWhatsapp: false, status: 'todo' })).toBe(false);
    expect(isDueSoonCandidate({ status: 'todo' })).toBe(false);
  });

  it('rejects done tasks', () => {
    expect(isDueSoonCandidate({ sendWhatsapp: true, status: 'done' })).toBe(false);
  });

  it('rejects when notify.dueSoon is off', () => {
    expect(
      isDueSoonCandidate({
        sendWhatsapp: true,
        status: 'todo',
        notify: { statusChange: true, dueSoon: false, blocked: true, toClient: true, toInternal: false },
      }),
    ).toBe(false);
  });
});
