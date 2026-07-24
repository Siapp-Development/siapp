/**
 * validateClientFile (#21 D7): mirrors the rules caps (10 MB, client mime
 * allowlist) so users get feedback before bytes move.
 */

import { MAX_CLIENT_DOCUMENT_SIZE_BYTES } from '@siapp/shared';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase.ts', () => ({ db: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  Timestamp: class {},
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  setDoc: vi.fn(),
  where: vi.fn(),
}));
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
}));

import { validateClientFile } from './usePortalDocuments.ts';

describe('validateClientFile', () => {
  it('accepts an allowed mime type under the size cap', () => {
    expect(validateClientFile({ size: 1024, type: 'application/pdf' })).toBeNull();
    expect(validateClientFile({ size: 1024, type: 'image/png' })).toBeNull();
  });

  it('rejects files over 10 MB', () => {
    expect(
      validateClientFile({ size: MAX_CLIENT_DOCUMENT_SIZE_BYTES + 1, type: 'application/pdf' }),
    ).toBe('too-large');
  });

  it('rejects mime types outside the client allowlist', () => {
    expect(
      validateClientFile({
        size: 1024,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ).toBe('unsupported');
  });
});
