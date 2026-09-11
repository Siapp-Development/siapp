/**
 * #129: the firm upload pre-check normalizes `.dwg` files (which browsers
 * report with an empty/non-standard MIME) to `image/vnd.dwg` via
 * resolveUploadContentType, so a `.dwg` File with `type: ''` validates and is
 * written with the allowlisted content type.
 */

import { DWG_CONTENT_TYPE, resolveUploadContentType } from '@siapp/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A single shared write-batch whose `set`/`commit` calls we can inspect, plus
// a sequential id generator so the document ref and its activity ref differ.
const firestoreMock = vi.hoisted(() => {
  const batch = {
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
  let seq = 0;
  return {
    batch,
    nextId: () => `doc-${(seq += 1)}`,
    resetSeq: () => {
      seq = 0;
    },
  };
});

vi.mock('@/lib/firebase.ts', () => ({ db: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  Timestamp: class {},
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn(() => ({ id: firestoreMock.nextId() })),
  onSnapshot: vi.fn(() => () => {}),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  where: vi.fn(),
  writeBatch: vi.fn(() => firestoreMock.batch),
}));
vi.mock('firebase/storage', () => ({
  getBlob: vi.fn(),
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
}));

import { uploadBytesResumable } from 'firebase/storage';

import { addLinkAttachment, validateDocumentFile, validateDriveUrl } from './useDocuments.ts';

beforeEach(() => {
  firestoreMock.batch.set.mockClear();
  firestoreMock.batch.commit.mockClear();
  firestoreMock.resetSeq();
  vi.mocked(uploadBytesResumable).mockClear();
});

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

describe('validateDriveUrl (D-043)', () => {
  it('accepts https drive.google.com and docs.google.com share links', () => {
    expect(validateDriveUrl('https://drive.google.com/file/d/abc123/view')).toBeNull();
    expect(validateDriveUrl('https://docs.google.com/document/d/abc123/edit')).toBeNull();
    // Leading/trailing whitespace is trimmed before parsing.
    expect(validateDriveUrl('  https://drive.google.com/drive/folders/xyz  ')).toBeNull();
  });

  it('rejects a non-Drive host, http://, a non-URL string and empty/blank input', () => {
    expect(validateDriveUrl('http://drive.google.com/file/d/abc123')).not.toBeNull();
    expect(validateDriveUrl('https://evil.com/drive.google.com')).not.toBeNull();
    expect(validateDriveUrl('https://drivexgoogle.com/file')).not.toBeNull();
    expect(validateDriveUrl('drive.google.com/file/d/abc')).not.toBeNull();
    expect(validateDriveUrl('not a url')).not.toBeNull();
    expect(validateDriveUrl('')).not.toBeNull();
    expect(validateDriveUrl('   ')).not.toBeNull();
  });

  it('rejects a bare Drive host with no file path (client/rules predicate parity)', () => {
    // The rules regex requires https://<host>/.* — a bare host would pass the
    // host check but fail server-side. The client now rejects it up front so a
    // user cannot Attach a link the batch would reject.
    expect(validateDriveUrl('https://drive.google.com')).not.toBeNull();
    expect(validateDriveUrl('https://drive.google.com/')).not.toBeNull();
    expect(validateDriveUrl('https://docs.google.com')).not.toBeNull();
    expect(validateDriveUrl('https://docs.google.com/')).not.toBeNull();
    // A full share link (host + path) still validates.
    expect(validateDriveUrl('https://drive.google.com/file/d/ABC/view')).toBeNull();
  });

  it('returns a human-readable message (not just a boolean) for invalid input', () => {
    expect(typeof validateDriveUrl('')).toBe('string');
    expect(typeof validateDriveUrl('https://evil.com')).toBe('string');
  });
});

describe('addLinkAttachment (D-043)', () => {
  const baseInput = {
    workspaceId: 'wksA',
    projectId: 'p1',
    taskId: 't1',
    url: 'https://drive.google.com/file/d/abc123/view',
    name: 'Rebar spec (Drive)',
    visibleToClient: true,
    restrictedToDepartments: ['dep-ops'],
    uid: 'u1',
    userName: 'Alice Tan',
  };

  function setCalls(): Array<[unknown, Record<string, unknown>]> {
    return firestoreMock.batch.set.mock.calls as Array<[unknown, Record<string, unknown>]>;
  }

  it('writes a link-type documents doc with the inherited visibility and no Storage keys', async () => {
    await addLinkAttachment(baseInput);

    const docPayload = setCalls().find(([, data]) => data['attachmentType'] === 'link')?.[1];
    expect(docPayload).toBeDefined();
    expect(docPayload).toMatchObject({
      attachmentType: 'link',
      url: baseInput.url,
      linkProvider: 'google_drive',
      scope: 'task',
      scopeId: 't1',
      uploadedBy: 'u1',
      uploaderType: 'firm_member',
      visibleToClient: true,
      visibleToCollaboratorIds: [],
      restrictedToDepartments: ['dep-ops'],
      scanStatus: 'clean',
      deletedAt: null,
    });
    // No Storage bytes → none of the file-only keys are written.
    expect(docPayload).not.toHaveProperty('storagePath');
    expect(docPayload).not.toHaveProperty('sizeBytes');
    expect(docPayload).not.toHaveProperty('mimeType');
  });

  it('appends a doc_added activity update carrying the url and commits once', async () => {
    await addLinkAttachment(baseInput);

    const activity = setCalls().find(([, data]) => data['action'] === 'doc_added')?.[1];
    expect(activity).toBeDefined();
    expect(activity).toMatchObject({ action: 'doc_added', authorId: 'u1' });
    const payload = activity?.['payload'] as Record<string, unknown>;
    expect(payload['url']).toBe(baseInput.url);
    expect(payload['text']).toBe(baseInput.name);
    // Link activity must not masquerade as a file upload.
    expect(payload).not.toHaveProperty('storagePath');
    expect(payload).not.toHaveProperty('mimeType');
    expect(firestoreMock.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('never triggers a Storage upload', async () => {
    await addLinkAttachment(baseInput);
    expect(vi.mocked(uploadBytesResumable)).not.toHaveBeenCalled();
  });

  it('inherits a firm-internal (not visible to client) task visibility unchanged', async () => {
    await addLinkAttachment({ ...baseInput, visibleToClient: false, restrictedToDepartments: [] });
    const docPayload = setCalls().find(([, data]) => data['attachmentType'] === 'link')?.[1];
    expect(docPayload).toMatchObject({ visibleToClient: false, restrictedToDepartments: [] });
  });
});
