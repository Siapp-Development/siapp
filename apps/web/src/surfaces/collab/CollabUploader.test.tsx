/**
 * #129: the collaborator uploader advertises the shared collab allowlist plus
 * the literal `.dwg` token on its file <input accept>, and its pre-upload
 * validator accepts `.dwg` (empty browser type) and zip archives.
 */

import { COLLAB_ALLOWED_DOCUMENT_MIME_TYPES } from '@siapp/shared';
import { render, screen, within } from '@testing-library/react';
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
import {
  validateCollabFile,
  type ICollabDocument,
  type ICollabTask,
  type TCollabDocumentsState,
} from './useCollabTask.ts';

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

function docRow(overrides: Partial<ICollabDocument> = {}): ICollabDocument {
  return {
    id: 'd1',
    name: 'floor-plan.pdf',
    attachmentType: 'file',
    url: '',
    linkProvider: '',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    uploadedAt: new Date('2026-08-01T00:00:00Z'),
    uploaderType: 'firm_member',
    storagePath: 'workspaces/wksA/projects/p1/tasks/t1/d1.pdf',
    ...overrides,
  };
}

function renderUploader(documents: TCollabDocumentsState = { status: 'ready', rows: [] }) {
  return render(
    <CollabUploader
      workspaceId="wksA"
      projectId="p1"
      taskId="t1"
      collaboratorId="col1"
      task={task}
      documents={documents}
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

describe('CollabUploader rows (D-043)', () => {
  it('renders a link row as an external Open anchor with a provider label and no Storage open button', () => {
    renderUploader({
      status: 'ready',
      rows: [
        docRow({
          id: 'lnk1',
          name: 'Rebar spec (Drive)',
          attachmentType: 'link',
          url: 'https://drive.google.com/file/d/abc123/view',
          linkProvider: 'google_drive',
          mimeType: '',
          sizeBytes: 0,
          storagePath: '',
        }),
      ],
    });

    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Rebar spec (Drive)')).toBeInTheDocument();
    expect(within(item).getByText(/Google Drive link/)).toBeInTheDocument();

    // A link opens via a real anchor (new tab), not the Storage "Open" button.
    const open = within(item).getByRole('link', { name: /open/i });
    expect(open).toHaveAttribute('href', 'https://drive.google.com/file/d/abc123/view');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open.getAttribute('rel')).toContain('noopener');
    expect(within(item).queryByRole('button', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('renders a file row as a Storage Open button with a size label and no external anchor', () => {
    renderUploader({ status: 'ready', rows: [docRow({ name: 'floor-plan.pdf', sizeBytes: 2048 })] });

    const item = screen.getByRole('listitem');
    expect(within(item).getByText('floor-plan.pdf')).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(within(item).queryByRole('link', { name: /open/i })).not.toBeInTheDocument();
    expect(within(item).queryByText(/Google Drive link/)).not.toBeInTheDocument();
  });
});
