/**
 * #129: the collaborator uploader advertises the shared collab allowlist plus
 * the literal `.dwg` token on its file <input accept>, and its pre-upload
 * validator accepts `.dwg` (empty browser type) and zip archives.
 */

import { COLLAB_ALLOWED_DOCUMENT_MIME_TYPES } from '@siapp/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

// #168: mock the writer so we can assert its call shape and simulate rejection
// without touching Firestore. Everything else (types, validateCollabFile) is
// the real module.
const softDeleteCollabDocumentMock = vi.fn();
vi.mock('./useCollabTask.ts', async () => {
  const actual =
    await vi.importActual<typeof import('./useCollabTask.ts')>('./useCollabTask.ts');
  return {
    ...actual,
    softDeleteCollabDocument: (...args: unknown[]) => softDeleteCollabDocumentMock(...args),
  };
});

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
    uploadedBy: '',
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
    expect(within(item).getByText('floor-plan.pdf', { selector: 'p' })).toBeInTheDocument();
    expect(within(item).getByRole('button', { name: /open floor-plan\.pdf/i })).toBeInTheDocument();
    expect(within(item).queryByRole('link', { name: /open/i })).not.toBeInTheDocument();
    expect(within(item).queryByText(/Google Drive link/)).not.toBeInTheDocument();
  });
});

describe('CollabUploader self-delete (#168)', () => {
  afterEach(() => {
    softDeleteCollabDocumentMock.mockReset();
  });

  const ownFile = () =>
    docRow({ id: 'own1', name: 'my-shot.jpg', uploaderType: 'collaborator', uploadedBy: 'col1' });

  it('shows a Delete control only on the caller’s own collaborator file rows', () => {
    renderUploader({ status: 'ready', rows: [ownFile()] });
    expect(screen.getByRole('button', { name: /delete my-shot\.jpg/i })).toBeInTheDocument();
  });

  it('hides Delete on firm-uploaded, peer-collaborator, and link rows', () => {
    renderUploader({
      status: 'ready',
      rows: [
        docRow({ id: 'firm1', name: 'firm.pdf', uploaderType: 'firm_member', uploadedBy: 'user-x' }),
        docRow({ id: 'peer1', name: 'peer.pdf', uploaderType: 'collaborator', uploadedBy: 'col2' }),
        docRow({
          id: 'lnk1',
          name: 'Drive link',
          attachmentType: 'link',
          uploaderType: 'collaborator',
          uploadedBy: 'col1',
          url: 'https://drive.google.com/file/d/abc/view',
          linkProvider: 'google_drive',
          storagePath: '',
        }),
      ],
    });
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('confirms then calls softDeleteCollabDocument with the correct args', async () => {
    const user = userEvent.setup();
    softDeleteCollabDocumentMock.mockResolvedValue(undefined);
    renderUploader({ status: 'ready', rows: [ownFile()] });

    await user.click(screen.getByRole('button', { name: /delete my-shot\.jpg/i }));
    // Confirm affordance appears (accessible group), no write yet.
    expect(screen.getByRole('group', { name: /confirm deleting my-shot\.jpg/i })).toBeInTheDocument();
    expect(softDeleteCollabDocumentMock).not.toHaveBeenCalled();

    const group = screen.getByRole('group', { name: /confirm deleting my-shot\.jpg/i });
    await user.click(within(group).getByRole('button', { name: /^delete/i }));

    expect(softDeleteCollabDocumentMock).toHaveBeenCalledTimes(1);
    expect(softDeleteCollabDocumentMock).toHaveBeenCalledWith({
      workspaceId: 'wksA',
      projectId: 'p1',
      collaboratorId: 'col1',
      documentId: 'own1',
    });
  });

  it('cancels without calling the writer', async () => {
    const user = userEvent.setup();
    renderUploader({ status: 'ready', rows: [ownFile()] });

    await user.click(screen.getByRole('button', { name: /delete my-shot\.jpg/i }));
    const group = screen.getByRole('group', { name: /confirm deleting my-shot\.jpg/i });
    await user.click(within(group).getByRole('button', { name: /cancel/i }));

    expect(softDeleteCollabDocumentMock).not.toHaveBeenCalled();
    // Back to the initial single Delete affordance.
    expect(screen.getByRole('button', { name: /delete my-shot\.jpg/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /confirm deleting/i })).not.toBeInTheDocument();
  });

  it('surfaces an alert when the writer rejects', async () => {
    const user = userEvent.setup();
    softDeleteCollabDocumentMock.mockRejectedValue(new Error('permission-denied'));
    renderUploader({ status: 'ready', rows: [ownFile()] });

    await user.click(screen.getByRole('button', { name: /delete my-shot\.jpg/i }));
    const group = screen.getByRole('group', { name: /confirm deleting my-shot\.jpg/i });
    await user.click(within(group).getByRole('button', { name: /^delete/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.?t delete/i);
  });
});
