import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { IExportProjectResponse } from '@siapp/shared';

const mockCallables = vi.hoisted(() => ({ exportProject: vi.fn() }));
vi.mock('@/lib/callables.ts', () => mockCallables);

const mockStorage = vi.hoisted(() => ({ getDownloadURL: vi.fn(), ref: vi.fn() }));
vi.mock('firebase/storage', () => mockStorage);
vi.mock('@/lib/firebase.ts', () => ({ storage: {} }));

import { ExportSection } from './ExportSection.tsx';

function payload(overrides: Partial<IExportProjectResponse> = {}): IExportProjectResponse {
  return {
    exportVersion: 1,
    exportedAt: '2026-07-24T08:00:00.000Z',
    workspaceId: 'w1',
    projectId: 'p1',
    project: { id: 'p1', name: 'Bungalow Build' },
    phases: [],
    milestones: [],
    tasks: [{ id: 't1', title: 'Pour foundation', updates: [] }],
    activity: [],
    documents: [],
    ...overrides,
  };
}

const clickedAnchors: HTMLAnchorElement[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  clickedAnchors.length = 0;
  URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clickedAnchors.push(this);
  });
  mockCallables.exportProject.mockResolvedValue(payload());
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderSection(role: 'owner' | 'admin' | 'pm' | 'viewer' = 'owner') {
  return render(<ExportSection workspaceId="w1" projectId="p1" role={role} />);
}

describe('ExportSection', () => {
  it('renders nothing for pm and viewer roles', () => {
    const { container: pmContainer } = renderSection('pm');
    expect(pmContainer).toBeEmptyDOMElement();
    const { container: viewerContainer } = renderSection('viewer');
    expect(viewerContainer).toBeEmptyDOMElement();
  });

  it('renders the JSON and four CSV buttons for owner and admin', () => {
    renderSection('admin');
    expect(screen.getByRole('heading', { name: 'Export project data' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeInTheDocument();
    for (const label of ['Tasks CSV', 'Updates CSV', 'Activity CSV', 'Documents CSV']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('downloads the JSON export and announces it via the status region', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Download JSON' }));

    await waitFor(() => expect(clickedAnchors).toHaveLength(1));
    expect(mockCallables.exportProject).toHaveBeenCalledWith({
      workspaceId: 'w1',
      projectId: 'p1',
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickedAnchors[0].download).toBe('bungalow-build-export-2026-07-24.json');
    expect(screen.getByRole('status')).toHaveTextContent('JSON export downloaded.');
  });

  it('reuses the cached payload for CSV downloads after a JSON export', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
    await waitFor(() => expect(clickedAnchors).toHaveLength(1));

    await userEvent.click(screen.getByRole('button', { name: 'Tasks CSV' }));
    await waitFor(() => expect(clickedAnchors).toHaveLength(2));

    expect(mockCallables.exportProject).toHaveBeenCalledTimes(1);
    expect(clickedAnchors[1].download).toBe('bungalow-build-tasks.csv');
    expect(screen.getByRole('status')).toHaveTextContent('tasks.csv downloaded.');
  });

  it('fetches the payload when a CSV is requested first', async () => {
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Activity CSV' }));

    await waitFor(() => expect(clickedAnchors).toHaveLength(1));
    expect(mockCallables.exportProject).toHaveBeenCalledTimes(1);
    expect(clickedAnchors[0].download).toBe('bungalow-build-activity.csv');
  });

  it('shows the mapped error when the callable fails', async () => {
    mockCallables.exportProject.mockRejectedValue(new Error('permission denied'));
    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Download JSON' }));

    expect(await screen.findByText('permission denied')).toBeInTheDocument();
    expect(clickedAnchors).toHaveLength(0);
  });

  it('lists documents with fresh "Get link" resolution, disabled for deleted/infected (D3/D6)', async () => {
    mockCallables.exportProject.mockResolvedValue(
      payload({
        documents: [
          {
            id: 'd1',
            deleted: false,
            name: 'plan.pdf',
            storagePath: 'workspaces/w1/projects/p1/documents/d1',
            scanStatus: 'clean',
          },
          {
            id: 'd2',
            deleted: true,
            name: 'old.pdf',
            storagePath: 'workspaces/w1/projects/p1/documents/d2',
            scanStatus: 'clean',
          },
          {
            id: 'd3',
            deleted: false,
            name: 'bad.pdf',
            storagePath: 'workspaces/w1/projects/p1/documents/d3',
            scanStatus: 'infected',
          },
        ],
      }),
    );
    mockStorage.ref.mockReturnValue({ path: 'mock-ref' });
    mockStorage.getDownloadURL.mockResolvedValue('https://storage.example/fresh-token-url');

    renderSection();
    await userEvent.click(screen.getByRole('button', { name: 'Download JSON' }));
    expect(await screen.findByText('Documents (3)')).toBeInTheDocument();

    expect(screen.getByText('(deleted)')).toBeInTheDocument();
    expect(screen.getByText('(failed virus scan)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Get link for old.pdf' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Get link for bad.pdf' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Get link for plan.pdf' }));
    const link = await screen.findByRole('link', { name: 'Open plan.pdf' });
    expect(link).toHaveAttribute('href', 'https://storage.example/fresh-token-url');
    expect(mockStorage.ref).toHaveBeenCalledWith({}, 'workspaces/w1/projects/p1/documents/d1');
    expect(screen.getByRole('status')).toHaveTextContent('Download link ready for plan.pdf.');
  });
});
