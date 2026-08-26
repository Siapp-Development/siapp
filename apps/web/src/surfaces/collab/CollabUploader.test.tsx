/**
 * #129: the collaborator uploader advertises the shared collab allowlist plus
 * the literal `.dwg` token on its file <input accept>, and its pre-upload
 * validator accepts `.dwg` (empty browser type) and zip archives.
 */

import { COLLAB_ALLOWED_DOCUMENT_MIME_TYPES } from '@siapp/shared';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase.ts', () => ({ db: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  Timestamp: class {},
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  orderBy: vi.fn(),
  query: vi.fn(),
  setDoc: vi.fn(),
  where: vi.fn(),
}));
vi.mock('firebase/storage', () => ({
  getDownloadURL: vi.fn(),
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
}));

import { CollabUploader } from './CollabUploader.tsx';
import { validateCollabFile, type ICollabTask } from './useCollabTask.ts';

const task: ICollabTask = {
  title: 'Rebar inspection',
  description: '',
  status: 'in_progress',
  dueDate: null,
  blockedReason: '',
  collaboratorCanSeeAllAttachments: false,
  visibleToClient: false,
  restrictedToDepartments: [],
};

function renderUploader() {
  return render(
    <CollabUploader
      workspaceId="wksA"
      projectId="p1"
      taskId="t1"
      collaboratorId="col1"
      task={task}
      documents={{ status: 'ready', rows: [] }}
    />,
  );
}

describe('CollabUploader accept', () => {
  it('derives accept from COLLAB_ALLOWED_DOCUMENT_MIME_TYPES and appends .dwg', () => {
    const { container } = renderUploader();
    const input = container.querySelector('input[type="file"]');
    const accept = input?.getAttribute('accept') ?? '';

    for (const mime of COLLAB_ALLOWED_DOCUMENT_MIME_TYPES) {
      expect(accept).toContain(mime);
    }
    expect(accept).toContain('.dwg');
    expect(accept).toBe(`${COLLAB_ALLOWED_DOCUMENT_MIME_TYPES.join(',')},.dwg`);
  });
});

describe('validateCollabFile (#129)', () => {
  it('accepts a .dwg file the browser reports with an empty type', () => {
    expect(validateCollabFile({ name: 'floor.dwg', size: 1024, type: '' })).toBeNull();
  });

  it('accepts zip archives', () => {
    expect(validateCollabFile({ name: 'bundle.zip', size: 1024, type: 'application/zip' })).toBeNull();
    expect(
      validateCollabFile({ name: 'bundle.zip', size: 1024, type: 'application/x-zip-compressed' }),
    ).toBeNull();
  });
});
