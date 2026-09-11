import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { IPortalDocument, TPortalDocumentsState } from '../documents/usePortalDocuments.ts';
import { PortalDocumentsSection } from './PortalDocumentsSection.tsx';

const usePortalDocumentsMock = vi.fn();

vi.mock('../documents/usePortalDocuments.ts', async () => {
  const actual = await vi.importActual<typeof import('../documents/usePortalDocuments.ts')>(
    '../documents/usePortalDocuments.ts',
  );
  return {
    ...actual,
    usePortalDocuments: (...args: unknown[]) => usePortalDocumentsMock(...args),
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
    scanStatus: 'clean',
    storagePath: 'workspaces/w1/projects/p1/documents/d1.pdf',
    ...overrides,
  };
}

afterEach(() => {
  usePortalDocumentsMock.mockReset();
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
