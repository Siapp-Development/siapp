import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DocumentPreview } from './DocumentPreview.tsx';

async function buildZipBlob(): Promise<Blob> {
  const zip = new JSZip();
  zip.file('readme.txt', 'hello'); // 5 bytes
  zip.file('drawings/site.dwg', new Uint8Array(2048)); // 2 KB
  return zip.generateAsync({ type: 'blob' });
}

/** Mock global fetch to hand the component a local Blob (the blob: object URL flow). */
function mockFetchReturning(blob: Blob | Promise<Blob>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ blob: () => Promise.resolve(blob) } as Response)),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DocumentPreview branches', () => {
  it('renders an iframe for PDFs', () => {
    render(
      <DocumentPreview
        name="site-plan.pdf"
        mimeType="application/pdf"
        url="blob:pdf-url"
        onClose={vi.fn()}
      />,
    );
    const frame = screen.getByTitle('site-plan.pdf');
    expect(frame.tagName).toBe('IFRAME');
    expect(frame).toHaveAttribute('src', 'blob:pdf-url');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders an img for images', () => {
    render(
      <DocumentPreview name="photo.png" mimeType="image/png" url="blob:img-url" onClose={vi.fn()} />,
    );
    const img = screen.getByRole('img', { name: 'photo.png' });
    expect(img).toHaveAttribute('src', 'blob:img-url');
  });

  it('calls onClose from the Close button', async () => {
    const onClose = vi.fn();
    render(
      <DocumentPreview name="photo.png" mimeType="image/png" url="blob:img-url" onClose={onClose} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders the "No preview available" branch for a .dwg (never an img/iframe)', () => {
    render(
      <DocumentPreview
        name="floor.dwg"
        mimeType="image/vnd.dwg"
        url="blob:dwg-url"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/no preview available/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByTitle('floor.dwg')).not.toBeInTheDocument();
  });

  it('renders the "No preview available" branch for a Word doc', () => {
    render(
      <DocumentPreview
        name="brief.doc"
        mimeType="application/msword"
        url="blob:doc-url"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText(/no preview available/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});

describe('DocumentPreview zip contents', () => {
  it('renders an accessible, captioned list of entry names and uncompressed sizes', async () => {
    mockFetchReturning(await buildZipBlob());

    render(
      <DocumentPreview
        name="archive.zip"
        mimeType="application/zip"
        url="blob:zip-url"
        onClose={vi.fn()}
      />,
    );

    // Table is labelled by its (sr-only) caption for assistive tech.
    const table = await screen.findByRole('table', { name: 'Contents of archive.zip' });
    expect(table).toBeInTheDocument();

    expect(await screen.findByText('readme.txt')).toBeInTheDocument();
    expect(screen.getByText('drawings/site.dwg')).toBeInTheDocument();
    // Directory entry shown with a trailing slash and an em-dash size.
    expect(screen.getByText('drawings/')).toBeInTheDocument();

    // Uncompressed sizes rendered via formatBytes (5 B, 2 KB).
    expect(screen.getByText('5 B')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();

    // Column headers are accessible.
    expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Size' })).toBeInTheDocument();
  });

  it('exposes a role="status" element while the archive is being read', () => {
    // fetch never resolves → stays in the loading state.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));

    render(
      <DocumentPreview
        name="pending.zip"
        mimeType="application/zip"
        url="blob:pending"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/reading archive/i);
  });

  it('exposes a role="alert" when the archive cannot be read', async () => {
    mockFetchReturning(new Blob(['not a zip at all']));

    render(
      <DocumentPreview
        name="corrupt.zip"
        mimeType="application/zip"
        url="blob:corrupt"
        onClose={vi.fn()}
      />,
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be read/i);
  });

  it('renders an empty-archive message when there are no entries', async () => {
    mockFetchReturning(await new JSZip().generateAsync({ type: 'blob' }));

    render(
      <DocumentPreview
        name="empty.zip"
        mimeType="application/zip"
        url="blob:empty"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText(/this archive is empty/i)).toBeInTheDocument());
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
