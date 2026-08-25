import { render, screen } from '@testing-library/react';
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
});
