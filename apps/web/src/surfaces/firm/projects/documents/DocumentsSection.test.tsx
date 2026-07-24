import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { IDocumentRow, TDocumentsState } from './useDocuments.ts';

const docsData = vi.hoisted(() => ({
  state: { status: 'loading' } as TDocumentsState,
  uploadDocument: vi.fn(),
  softDeleteDocument: vi.fn(),
  downloadDocument: vi.fn(),
  getPreviewUrl: vi.fn(),
  validateDocumentFile: vi.fn<(file: File) => string | null>(() => null),
}));
vi.mock('./useDocuments.ts', () => ({
  useDocuments: () => docsData.state,
  uploadDocument: docsData.uploadDocument,
  softDeleteDocument: docsData.softDeleteDocument,
  downloadDocument: docsData.downloadDocument,
  getPreviewUrl: docsData.getPreviewUrl,
  validateDocumentFile: docsData.validateDocumentFile,
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

import { DocumentsSection } from './DocumentsSection.tsx';
import { formatBytes } from './formatBytes.ts';

function docRow(overrides: Partial<IDocumentRow> = {}): IDocumentRow {
  return {
    id: 'd1',
    name: 'site-plan.pdf',
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
