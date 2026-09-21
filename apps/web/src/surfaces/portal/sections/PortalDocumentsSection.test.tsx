import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IPortalDocument, TPortalDocumentsState } from '../documents/usePortalDocuments.ts';
import { PortalDocumentsSection } from './PortalDocumentsSection.tsx';

const usePortalDocumentsMock = vi.fn();
// #168: mock the writer so we can assert its call shape and simulate rejection.
const softDeletePortalDocumentMock = vi.fn();

vi.mock('../documents/usePortalDocuments.ts', async () => {
  const actual = await vi.importActual<typeof import('../documents/usePortalDocuments.ts')>(
    '../documents/usePortalDocuments.ts',
  );
  return {
    ...actual,
    usePortalDocuments: (...args: unknown[]) => usePortalDocumentsMock(...args),
    softDeletePortalDocument: (...args: unknown[]) => softDeletePortalDocumentMock(...args),
  };
});

function setState(state: TPortalDocumentsState): void {
  usePortalDocumentsMock.mockReturnValue(state);
}

function docRow(overrides: Partial<IPortalDocument>): IPortalDocument {
  return {
    id: 'd1',
    name: 'Plan.pdf',
    attachmentType: 'file',
    url: '',
    linkProvider: '',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    uploadedAt: new Date('2026-08-01T00:00:00Z'),
    uploaderType: 'firm_member',
    uploadedBy: '',
    scanStatus: 'clean',
    storagePath: 'workspaces/w1/projects/p1/documents/d1.pdf',
    ...overrides,
  };
}

afterEach(() => {
  usePortalDocumentsMock.mockReset();
  softDeletePortalDocumentMock.mockReset();
});

describe('PortalDocumentsSection', () => {
  it('renders the upload control when interactive', () => {
    setState({ status: 'ready', rows: [] });

    render(<PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" />);

    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument();
    expect(
      screen.getByLabelText(/share a file with your project team/i),
    ).toBeInTheDocument();
  });

  it('shows a loading status while documents resolve', () => {
    setState({ status: 'loading' });

    render(<PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" />);

    expect(screen.getByRole('status')).toHaveTextContent(/loading documents/i);
  });

  it('shows an alert on error', () => {
    setState({ status: 'error' });

    render(<PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn.?t load documents/i);
  });

  it('lists shared documents with a download control', () => {
    setState({ status: 'ready', rows: [docRow({ name: 'Site-plan.pdf' })] });

    render(<PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" />);

    const list = screen.getByRole('list', { name: 'Shared documents' });
    expect(list).toHaveTextContent('Site-plan.pdf');
    expect(screen.getByRole('button', { name: /download site-plan\.pdf/i })).toBeInTheDocument();
  });

  it('renders a static list with no uploader or download when non-interactive (print)', () => {
    setState({ status: 'ready', rows: [docRow({ name: 'Site-plan.pdf' })] });

    render(
      <PortalDocumentsSection
        workspaceId="w1"
        projectId="p1"
        clientId="c1"
        interactive={false}
      />,
    );

    expect(screen.getByText('Site-plan.pdf')).toBeInTheDocument();
    expect(screen.queryByLabelText(/share a file/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });

  it('flags virus-scan-infected documents instead of offering a download', () => {
    setState({ status: 'ready', rows: [docRow({ name: 'Bad.pdf', scanStatus: 'infected' })] });

    render(<PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" />);

    expect(screen.getByText(/blocked by virus scan/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });

  it('renders a link row as an external Open anchor with a provider label and no download (D-043)', () => {
    setState({
      status: 'ready',
      rows: [
        docRow({
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

    render(<PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" />);

    const list = screen.getByRole('list', { name: 'Shared documents' });
    expect(list).toHaveTextContent('Rebar spec (Drive)');
    expect(within(list).getByText(/Google Drive link/)).toBeInTheDocument();

    const open = within(list).getByRole('link', { name: /open rebar spec \(drive\)/i });
    expect(open).toHaveAttribute('href', 'https://drive.google.com/file/d/abc123/view');
    expect(open).toHaveAttribute('target', '_blank');
    expect(open.getAttribute('rel')).toContain('noopener');
    // A link carries no Storage bytes → no Download control.
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
  });

  it('renders a link row as static text (no Open anchor) when non-interactive (print)', () => {
    setState({
      status: 'ready',
      rows: [
        docRow({
          name: 'Rebar spec (Drive)',
          attachmentType: 'link',
          url: 'https://drive.google.com/file/d/abc123/view',
          linkProvider: 'google_drive',
          storagePath: '',
        }),
      ],
    });

    render(
      <PortalDocumentsSection
        workspaceId="w1"
        projectId="p1"
        clientId="c1"
        interactive={false}
      />,
    );

    expect(screen.getByText('Rebar spec (Drive)')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /open/i })).not.toBeInTheDocument();
  });
});

describe('PortalDocumentsSection self-delete (#168)', () => {
  const ownFile = (): IPortalDocument =>
    docRow({ id: 'own1', name: 'my-photo.png', uploaderType: 'client', uploadedBy: 'c1' });

  it('shows a Delete control only on the client’s own uploaded rows', () => {
    setState({ status: 'ready', rows: [ownFile()] });

    render(<PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" />);

    expect(screen.getByRole('button', { name: /delete my-photo\.png/i })).toBeInTheDocument();
  });

  it('hides Delete on firm-uploaded rows, link rows, and in print (non-interactive)', () => {
    setState({
      status: 'ready',
      rows: [
        docRow({ id: 'firm1', name: 'firm.pdf', uploaderType: 'firm_member', uploadedBy: '' }),
        docRow({ id: 'other1', name: 'peer.png', uploaderType: 'client', uploadedBy: 'c2' }),
        docRow({
          id: 'lnk1',
          name: 'Drive link',
          attachmentType: 'link',
          uploaderType: 'client',
          uploadedBy: 'c1',
          url: 'https://drive.google.com/file/d/abc/view',
          linkProvider: 'google_drive',
          storagePath: '',
        }),
      ],
    });

    render(<PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" />);
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('hides Delete on the client’s own row when non-interactive (print)', () => {
    setState({ status: 'ready', rows: [ownFile()] });

    render(
      <PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" interactive={false} />,
    );
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('confirms then calls softDeletePortalDocument with the correct args', async () => {
    const user = userEvent.setup();
    softDeletePortalDocumentMock.mockResolvedValue(undefined);
    setState({ status: 'ready', rows: [ownFile()] });

    render(<PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" />);

    await user.click(screen.getByRole('button', { name: /delete my-photo\.png/i }));
    const group = screen.getByRole('group', { name: /confirm deleting my-photo\.png/i });
    expect(group).toBeInTheDocument();
    expect(softDeletePortalDocumentMock).not.toHaveBeenCalled();

    await user.click(within(group).getByRole('button', { name: /^delete/i }));

    expect(softDeletePortalDocumentMock).toHaveBeenCalledTimes(1);
    expect(softDeletePortalDocumentMock).toHaveBeenCalledWith({
      workspaceId: 'w1',
      projectId: 'p1',
      clientId: 'c1',
      documentId: 'own1',
    });
  });

  it('cancels without calling the writer', async () => {
    const user = userEvent.setup();
    setState({ status: 'ready', rows: [ownFile()] });

    render(<PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" />);

    await user.click(screen.getByRole('button', { name: /delete my-photo\.png/i }));
    const group = screen.getByRole('group', { name: /confirm deleting my-photo\.png/i });
    await user.click(within(group).getByRole('button', { name: /cancel/i }));

    expect(softDeletePortalDocumentMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /delete my-photo\.png/i })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /confirm deleting/i })).not.toBeInTheDocument();
  });

  it('surfaces an alert when the writer rejects', async () => {
    const user = userEvent.setup();
    softDeletePortalDocumentMock.mockRejectedValue(new Error('permission-denied'));
    setState({ status: 'ready', rows: [ownFile()] });

    render(<PortalDocumentsSection workspaceId="w1" projectId="p1" clientId="c1" />);

    await user.click(screen.getByRole('button', { name: /delete my-photo\.png/i }));
    const group = screen.getByRole('group', { name: /confirm deleting my-photo\.png/i });
    await user.click(within(group).getByRole('button', { name: /^delete/i }));

    const alert = await screen.findByRole('alert');
    // Text spans multiple nodes (sr-only filename in the middle); assert on the
    // alert container's concatenated text content, not the sr-only filename mid-string.
    expect(alert).toHaveTextContent(/couldn.?t delete/i);
    expect(alert).toHaveTextContent(
      /your project may be read-only or no longer active — please refresh and try again/i,
    );
  });
});
