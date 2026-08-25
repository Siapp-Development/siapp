/**
 * #129: the firm upload pre-check normalizes `.dwg` files (which browsers
 * report with an empty/non-standard MIME) to `image/vnd.dwg` via
 * resolveUploadContentType, so a `.dwg` File with `type: ''` validates and is
 * written with the allowlisted content type.
 */

import { DWG_CONTENT_TYPE, resolveUploadContentType } from '@siapp/shared';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase.ts', () => ({ db: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  Timestamp: class {},
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  where: vi.fn(),
  writeBatch: vi.fn(),
}));
vi.mock('firebase/storage', () => ({
  getBlob: vi.fn(),
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
}));

import { validateDocumentFile } from './useDocuments.ts';

describe('resolveUploadContentType', () => {
  it('pins image/vnd.dwg for .dwg files regardless of the browser type', () => {
    expect(resolveUploadContentType('plan.dwg', '')).toBe('image/vnd.dwg');
    expect(resolveUploadContentType('plan.dwg', '')).toBe(DWG_CONTENT_TYPE);
    expect(resolveUploadContentType('plan.dwg', 'application/octet-stream')).toBe(DWG_CONTENT_TYPE);
  });

  it('is case-insensitive on the extension', () => {
    expect(resolveUploadContentType('PLAN.DWG', '')).toBe(DWG_CONTENT_TYPE);
    expect(resolveUploadContentType('Site.Dwg', '')).toBe(DWG_CONTENT_TYPE);
  });

  it('passes every other type through unchanged', () => {
    expect(resolveUploadContentType('doc.pdf', 'application/pdf')).toBe('application/pdf');
    expect(resolveUploadContentType('photo.png', 'image/png')).toBe('image/png');
    expect(resolveUploadContentType('archive.zip', 'application/zip')).toBe('application/zip');
  });
});

describe('validateDocumentFile', () => {
  it('accepts a .dwg File that the browser reports with an empty type', () => {
    const file = new File(['DWG-bytes'], 'plan.dwg', { type: '' });
    expect(validateDocumentFile(file)).toBeNull();
  });

  it('accepts a zip File', () => {
    const file = new File(['PK'], 'bundle.zip', { type: 'application/zip' });
    expect(validateDocumentFile(file)).toBeNull();
  });

  it('rejects an empty file', () => {
    const file = new File([], 'plan.dwg', { type: '' });
    expect(validateDocumentFile(file)).toBe('This file is empty.');
  });

  it('rejects an unsupported type', () => {
    const file = new File(['x'], 'evil.svg', { type: 'image/svg+xml' });
    expect(validateDocumentFile(file)).toBe('This file type is not supported.');
  });
});
