import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IDocumentRow, TDocumentsState } from './useDocuments.ts';

const docsData = vi.hoisted(() => ({
  state: { status: 'loading' } as TDocumentsState,
  uploadDocument: vi.fn(),
  addLinkAttachment: vi.fn(),
  softDeleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
  getPreviewUrl: vi.fn(),
  validateDocumentFile: vi.fn<(file: File) => string | null>(() => null),
  validateDriveUrl: vi.fn<(raw: string) => string | null>(() => null),
}));
vi.mock('./useDocuments.ts', () => ({
  useDocuments: () => docsData.state,
  uploadDocument: docsData.uploadDocument,
  addLinkAttachment: docsData.addLinkAttachment,
  softDeleteDocument: docsData.softDeleteDocument,
  downloadDocument: docsData.downloadDocument,
  getPreviewUrl: docsData.getPreviewUrl,
  validateDocumentFile: docsData.validateDocumentFile,
  validateDriveUrl: docsData.validateDriveUrl,
}));

vi.mock('../../settings/useTeamData.ts', () => ({
  useMembers: () => ({
    status: 'ready',
    rows: [
      {
        uid: 'u1',
        email: 'alice@x.com',
        displayName: 'Alice Tan',
        role: 'pm',
        departments: [],
        seatActive: true,
      },
    ],
  }),
  useDepartments: () => ({
    status: 'ready',
    rows: [
      { id: 'dep-fin', name: 'Finance', memberCount: 1 },
      { id: 'dep-ops', name: 'Operations', memberCount: 2 },
    ],
  }),
}));

import { DocumentsSection, TaskAttachments } from './DocumentsSection.tsx';
import { formatBytes } from './formatBytes.ts';

function docRow(overrides: Partial<IDocumentRow> = {}): IDocumentRow {
  return {
    id: 'd1',
    name: 'site-plan.pdf',
    attachmentType: 'file',
    url: '',
    linkProvider: '',
    mimeType: 'application/pdf',
    sizeBytes: 2.5 * 1024 * 1024,
    storagePath: 'workspaces/wksA/projects/p1/uuid-site-plan.pdf',
    scope: 'project',
    scopeId: 'p1',
    uploadedBy: 'u1',
    uploaderType: 'firm_member',
    uploadedAt: new Date('2026-07-20T10:00:00'),
    visibleToClient: false,
    restrictedToDepartments: [],
    scanStatus: 'pending',
    ...overrides,
  };
}

function renderSection(overrides: Partial<Parameters<typeof DocumentsSection>[0]> = {}) {
  return render(
    <DocumentsSection
      workspaceId="wksA"
      projectId="p1"
      role="pm"
      departments={['dep-ops']}
      uid="u1"
      userName="Alice Tan"
      canEdit
      {...overrides}
    />,
  );
}

async function pickFile(file: File): Promise<void> {
  await userEvent.upload(screen.getByTestId('document-file-input'), file);
}

beforeEach(() => {
  vi.clearAllMocks();
  docsData.state = { status: 'ready', rows: [] };
  docsData.validateDocumentFile.mockReturnValue(null);
  docsData.uploadDocument.mockResolvedValue(undefined);
  docsData.softDeleteDocument.mockResolvedValue(undefined);
  docsData.addLinkAttachment.mockResolvedValue(undefined);
  // Realistic Drive-host validator so the dialog's disabled/error wiring is
  // exercised end-to-end (the pure validator itself is covered in useDocuments.test.ts).
  docsData.validateDriveUrl.mockImplementation((raw: string) =>
    /^https:\/\/(drive|docs)\.google\.com\//.test(raw.trim())
      ? null
      : 'Enter a Google Drive share link (drive.google.com/…).',
  );
  Object.assign(URL, { revokeObjectURL: vi.fn() });
});

describe('formatBytes', () => {
  it('formats B, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });
});

describe('DocumentsSection list', () => {
  it('renders rows with size, uploader, scope chip, restricted chip and scan badge', () => {
    docsData.state = {
      status: 'ready',
      rows: [
        docRow({ restrictedToDepartments: ['dep-fin'] }),
        docRow({ id: 'd2', name: 'budget.xlsx', scope: 'task', scopeId: 't1', scanStatus: 'clean' }),
      ],
    };
    renderSection();

    expect(screen.getByText('site-plan.pdf')).toBeInTheDocument();
    expect(screen.getAllByText('2.5 MB')).toHaveLength(2);
    expect(screen.getAllByText(/Alice Tan/)).not.toHaveLength(0);
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText(/Restricted · Finance/)).toBeInTheDocument();
    expect(screen.getAllByText('Scan pending')).toHaveLength(1);
  });

  it('shows the Preview button only for previewable mime types', () => {
    docsData.state = {
      status: 'ready',
      rows: [
        docRow(),
        docRow({
          id: 'd2',
          name: 'contract.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      ],
    };
    renderSection();
    expect(screen.getAllByRole('button', { name: 'Preview' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Download' })).toHaveLength(2);
  });

  it('exposes a Preview action for zip rows (#129 isPreviewable includes zip)', () => {
    docsData.state = {
      status: 'ready',
      rows: [
        docRow({ id: 'z1', name: 'bundle.zip', mimeType: 'application/zip' }),
        docRow({ id: 'z2', name: 'bundle2.zip', mimeType: 'application/x-zip-compressed' }),
      ],
    };
    renderSection();
    expect(screen.getAllByRole('button', { name: 'Preview' })).toHaveLength(2);
  });

  it('advertises .dwg on the file input accept, alongside the firm mime allowlist (#129)', () => {
    docsData.state = { status: 'ready', rows: [] };
    renderSection();
    const accept = screen.getByTestId('document-file-input').getAttribute('accept');
    expect(accept).toContain('.dwg');
    expect(accept).toContain('image/vnd.dwg');
    expect(accept).toContain('application/zip');
    expect(accept).toContain('application/pdf');
  });

  it('hides upload and delete when canEdit is false', () => {
    docsData.state = { status: 'ready', rows: [docRow()] };
    renderSection({ role: 'viewer', canEdit: false });
    expect(screen.queryByRole('button', { name: 'Upload document' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});

describe('DocumentsSection upload', () => {
  it('rejects invalid files with an alert and never uploads', async () => {
    docsData.validateDocumentFile.mockReturnValue('This file type is not supported.');
    renderSection();

    // applyAccept off so the disallowed type reaches the client-side validator.
    await userEvent.upload(
      screen.getByTestId('document-file-input'),
      new File(['x'], 'malware.zip', { type: 'application/zip' }),
      { applyAccept: false },
    );

    expect(await screen.findByText('This file type is not supported.')).toBeInTheDocument();
    expect(docsData.uploadDocument).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Upload' })).not.toBeInTheDocument();
  });

  it('uploads with the selected visibility and department restriction', async () => {
    renderSection();
    const file = new File(['%PDF'], 'site-plan.pdf', { type: 'application/pdf' });

    await pickFile(file);
    await userEvent.click(screen.getByLabelText('Client can see this document'));
    await userEvent.click(screen.getByRole('button', { name: 'Operations' }));
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));

    expect(docsData.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'wksA',
        projectId: 'p1',
        file,
        scope: 'project',
        scopeId: 'p1',
        visibleToClient: true,
        restrictedToDepartments: ['dep-ops'],
        uid: 'u1',
        userName: 'Alice Tan',
      }),
    );
  });

  it('limits a pm to their own departments in the restriction chips', async () => {
    renderSection();
    await pickFile(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    expect(screen.getByRole('button', { name: 'Operations' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Finance' })).not.toBeInTheDocument();
  });

  it('shows all departments to owners', async () => {
    renderSection({ role: 'owner', departments: [] });
    await pickFile(new File(['%PDF'], 'a.pdf', { type: 'application/pdf' }));
    expect(screen.getByRole('button', { name: 'Finance' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Operations' })).toBeInTheDocument();
  });
});

describe('DocumentsSection delete', () => {
  it('requires a confirm step before soft deleting', async () => {
    const row = docRow();
    docsData.state = { status: 'ready', rows: [row] };
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(docsData.softDeleteDocument).not.toHaveBeenCalled();
    expect(screen.getByText(/delete “site-plan\.pdf”\?/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete document' }));
    expect(docsData.softDeleteDocument).toHaveBeenCalledWith('wksA', 'p1', row, 'u1', 'Alice Tan');
  });
});

describe('DocumentsSection preview', () => {
  it('opens the inline preview and revokes the object URL on close', async () => {
    docsData.state = { status: 'ready', rows: [docRow()] };
    docsData.getPreviewUrl.mockResolvedValue('blob:preview-url');
    renderSection();

    await userEvent.click(screen.getByRole('button', { name: 'Preview' }));

    const frame = await screen.findByTitle('site-plan.pdf');
    expect(frame).toHaveAttribute('src', 'blob:preview-url');
    expect(docsData.getPreviewUrl).toHaveBeenCalledWith(
      'workspaces/wksA/projects/p1/uuid-site-plan.pdf',
    );

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview-url');
    expect(screen.queryByTitle('site-plan.pdf')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TaskAttachments — the compact task-detail block with Upload File + Google
// Drive link attachments (D-043).
// ---------------------------------------------------------------------------

function renderTaskAttachments(
  overrides: Partial<Parameters<typeof TaskAttachments>[0]> = {},
) {
  return render(
    <TaskAttachments
      workspaceId="wksA"
      projectId="p1"
      taskId="t1"
      taskVisibleToClient={false}
      taskRestrictedToDepartments={[]}
      role="pm"
      departments={['dep-ops']}
      uid="u1"
      userName="Alice Tan"
      canEdit
      {...overrides}
    />,
  );
}

function linkRow(overrides: Partial<IDocumentRow> = {}): IDocumentRow {
  return docRow({
    id: 'lnk1',
    name: 'Rebar spec (Drive)',
    attachmentType: 'link',
    url: 'https://drive.google.com/file/d/abc123/view',
    linkProvider: 'google_drive',
    mimeType: '',
    sizeBytes: 0,
    storagePath: '',
    scope: 'task',
    scopeId: 't1',
    ...overrides,
  });
}

describe('TaskAttachments buttons + count header', () => {
  it('renders Upload File and Google Drive buttons when canEdit', () => {
    renderTaskAttachments();
    expect(screen.getByRole('button', { name: 'Upload File' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google Drive' })).toBeInTheDocument();
  });

  it('hides both buttons when canEdit is false', () => {
    renderTaskAttachments({ canEdit: false });
    expect(screen.queryByRole('button', { name: 'Upload File' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Google Drive' })).not.toBeInTheDocument();
  });

  it('shows a right-aligned file count that pluralises with the row count', () => {
    docsData.state = { status: 'ready', rows: [] };
    const { rerender } = renderTaskAttachments();
    expect(screen.getByText('0 files')).toBeInTheDocument();

    docsData.state = { status: 'ready', rows: [linkRow()] };
    rerender(
      <TaskAttachments
        workspaceId="wksA"
        projectId="p1"
        taskId="t1"
        taskVisibleToClient={false}
        taskRestrictedToDepartments={[]}
        role="pm"
        departments={['dep-ops']}
        uid="u1"
        userName="Alice Tan"
        canEdit
      />,
    );
    expect(screen.getByText('1 file')).toBeInTheDocument();

    docsData.state = { status: 'ready', rows: [linkRow(), docRow({ id: 'd9', scope: 'task' })] };
    rerender(
      <TaskAttachments
        workspaceId="wksA"
        projectId="p1"
        taskId="t1"
        taskVisibleToClient={false}
        taskRestrictedToDepartments={[]}
        role="pm"
        departments={['dep-ops']}
        uid="u1"
        userName="Alice Tan"
        canEdit
      />,
    );
    expect(screen.getByText('2 files')).toBeInTheDocument();
  });
});

describe('TaskAttachments Google Drive dialog', () => {
  it('opens the dialog, gates submit on validation, and attaches with inherited visibility', async () => {
    const user = userEvent.setup();
    renderTaskAttachments({ taskVisibleToClient: true, taskRestrictedToDepartments: ['dep-ops'] });

    await user.click(screen.getByRole('button', { name: 'Google Drive' }));
    const dialog = screen.getByRole('dialog', { name: 'Attach a Google Drive link' });

    const urlField = within(dialog).getByLabelText('Google Drive link');
    const submit = within(dialog).getByRole('button', { name: 'Attach' });

    // Invalid URL → error shown after blur and submit stays disabled.
    await user.type(urlField, 'https://evil.com/x');
    await user.tab();
    expect(
      within(dialog).getByText('Enter a Google Drive share link (drive.google.com/…).'),
    ).toBeInTheDocument();
    expect(submit).toBeDisabled();

    // Valid Drive URL → submit enabled.
    await user.clear(urlField);
    await user.type(urlField, 'https://drive.google.com/file/d/abc123/view');
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(docsData.addLinkAttachment).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'wksA',
        projectId: 'p1',
        taskId: 't1',
        url: 'https://drive.google.com/file/d/abc123/view',
        visibleToClient: true,
        restrictedToDepartments: ['dep-ops'],
        uid: 'u1',
        userName: 'Alice Tan',
      }),
    );
  });

  it('closes the dialog on Cancel without attaching', async () => {
    const user = userEvent.setup();
    renderTaskAttachments();

    await user.click(screen.getByRole('button', { name: 'Google Drive' }));
    expect(screen.getByRole('dialog', { name: 'Attach a Google Drive link' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(docsData.addLinkAttachment).not.toHaveBeenCalled();
  });
});

describe('TaskAttachments rows', () => {
  it('renders a link row as an external Open anchor with a provider label and no size', () => {
    docsData.state = { status: 'ready', rows: [linkRow()] };
    renderTaskAttachments();

    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Rebar spec (Drive)')).toBeInTheDocument();
    expect(within(item).getByText('Google Drive link')).toBeInTheDocument();

    const open = within(item).getByRole('link', { name: 'Open' });
    expect(open).toHaveAttribute('href', 'https://drive.google.com/file/d/abc123/view');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open.getAttribute('rel')).toContain('noopener');

    // A link carries no bytes → no size text and no download button.
    expect(screen.queryByText('0 B')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument();
  });

  it('renders a file row with size + download and no external Open link', () => {
    docsData.state = { status: 'ready', rows: [docRow({ scope: 'task', scopeId: 't1' })] };
    renderTaskAttachments();

    expect(screen.getByText(/2\.5 MB/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open' })).not.toBeInTheDocument();
  });

  it('remove (×) calls softDeleteDocument with the row', async () => {
    const row = linkRow();
    docsData.state = { status: 'ready', rows: [row] };
    renderTaskAttachments();

    await userEvent.click(screen.getByRole('button', { name: 'Remove Rebar spec (Drive)' }));
    expect(docsData.softDeleteDocument).toHaveBeenCalledWith(
      'wksA',
      'p1',
      row,
      'u1',
      'Alice Tan',
    );
  });

  it('hides the remove control when canEdit is false', () => {
    docsData.state = { status: 'ready', rows: [linkRow()] };
    renderTaskAttachments({ canEdit: false });
    expect(
      screen.queryByRole('button', { name: 'Remove Rebar spec (Drive)' }),
    ).not.toBeInTheDocument();
  });
});
