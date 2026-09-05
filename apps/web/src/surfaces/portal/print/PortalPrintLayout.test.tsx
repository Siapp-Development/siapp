import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  IPortalDocument,
  TPortalDocumentsState,
} from '../documents/usePortalDocuments.ts';
import type { IPortalTaskGroup } from '../tasks/usePortalTasks.ts';
import type { IPortalProject } from '../usePortalProject.ts';
import { PortalPrintLayout } from './PortalPrintLayout.tsx';

const usePortalUpdatesMock = vi.fn(() => ({
  state: { status: 'ready', rows: [], hasMore: false },
  loadMore: vi.fn(),
}));
const usePortalDocumentsMock = vi.fn(
  (): TPortalDocumentsState => ({ status: 'ready', rows: [] }),
);

vi.mock('../updates/usePortalUpdates.ts', async () => {
  const actual = await vi.importActual<typeof import('../updates/usePortalUpdates.ts')>(
    '../updates/usePortalUpdates.ts',
  );
  return { ...actual, usePortalUpdates: () => usePortalUpdatesMock() };
});

vi.mock('../documents/usePortalDocuments.ts', async () => {
  const actual = await vi.importActual<typeof import('../documents/usePortalDocuments.ts')>(
    '../documents/usePortalDocuments.ts',
  );
  return { ...actual, usePortalDocuments: () => usePortalDocumentsMock() };
});

const PROJECT: IPortalProject = {
  name: 'Cafe Fitout',
  clientName: 'Acme Retail',
  lifecycle: 'published',
  startDate: new Date('2026-08-01T00:00:00Z'),
  targetEndDate: new Date('2026-12-01T00:00:00Z'),
  progressPct: 45,
};

const GROUPS: IPortalTaskGroup[] = [
  {
    phaseId: 'p1',
    name: 'Discovery',
    tasks: [
      {
        id: 't1',
        title: 'Kickoff',
        status: 'in_progress',
        phaseId: 'p1',
        startDate: new Date('2026-08-10T00:00:00Z'),
        dueDate: new Date('2026-08-20T00:00:00Z'),
        completedAt: null,
        order: 0,
      },
    ],
  },
];

afterEach(() => {
  vi.clearAllMocks();
});

function renderLayout() {
  return render(
    <PortalPrintLayout
      project={PROJECT}
      groups={GROUPS}
      workspaceId="w1"
      projectId="p1"
      clientId="c1"
    />,
  );
}

describe('PortalPrintLayout', () => {
  it('renders the project header with the progress ring', () => {
    renderLayout();

    // The print DOM is aria-hidden; query with { hidden: true }.
    expect(screen.getByRole('heading', { name: 'Cafe Fitout', hidden: true })).toBeInTheDocument();
    expect(screen.getByText(/Prepared for Acme Retail/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '45% complete', hidden: true })).toBeInTheDocument();
  });

  it('renders all four sections', () => {
    renderLayout();

    // The print DOM is aria-hidden; query the four section headings with
    // { hidden: true }. (The wrapper <section aria-label> and the inner section
    // heading intentionally share a name, so assert on the headings.)
    expect(screen.getByRole('heading', { name: 'Project tasks', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Timeline', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Recent updates', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Documents', hidden: true })).toBeInTheDocument();
  });

  it('renders BOTH task views — the list and the fit-to-width timeline', () => {
    renderLayout();

    // List view row.
    const listRegion = screen.getByRole('region', { name: 'Project tasks list', hidden: true });
    expect(listRegion).toHaveTextContent('Kickoff');
    // Timeline view exposes the same task as a labelled bar.
    const timelineRegion = screen.getByRole('region', { name: 'Project timeline', hidden: true });
    expect(timelineRegion).toHaveTextContent('Kickoff');
    // PortalTaskTimeline uses the real clock here (no `now` prop), so assert
    // the bar exists and names the task without pinning a time-dependent status.
    expect(screen.getByRole('img', { name: /Kickoff —/, hidden: true })).toBeInTheDocument();
    // Print path renders no granularity switcher (fitToWidth hides it).
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });
});


// --- #151: `print-color-adjust` scoping invariants ---------------------------
// The iOS-print fix narrows the `print-color-adjust: exact` CSS rule from a
// universal `*` selector to `.print-layout, .print-layout *`. These tests lock
// the DOM contract that fix depends on: (a) the root print container keeps the
// `print-layout` marker (plus its existing `hidden print:block`) so the CSS has
// a hook, and (b) the three meaning-bearing colored elements — timeline bars,
// status Badge chips, and the "Blocked by virus scan" chip — stay *inside* that
// container so their backgrounds still print. A refactor that drops the marker
// or moves a colored element out of `.print-layout` would silently break the
// accessibility invariant; these anchors fail loudly instead.

// Deterministic fixture: a `done` task derives to the same status regardless of
// the real clock (no `now` prop is threaded through PortalPrintLayout), so the
// timeline bar class (`bg-success`) and the Badge variant (`bg-success-tint`)
// are stable.
const DONE_GROUPS: IPortalTaskGroup[] = [
  {
    phaseId: 'p1',
    name: 'Discovery',
    tasks: [
      {
        id: 't1',
        title: 'Site Survey',
        status: 'done',
        phaseId: 'p1',
        startDate: new Date('2026-08-10T00:00:00Z'),
        dueDate: new Date('2026-08-20T00:00:00Z'),
        completedAt: new Date('2026-08-18T00:00:00Z'),
        order: 0,
      },
    ],
  },
];

function renderWith(groups: IPortalTaskGroup[]) {
  return render(
    <PortalPrintLayout
      project={PROJECT}
      groups={groups}
      workspaceId="w1"
      projectId="p1"
      clientId="c1"
    />,
  );
}

function printContainer(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>('div.print-layout');
  if (root === null) {
    throw new Error('print-layout container not found');
  }
  return root;
}

describe('PortalPrintLayout — print-color-adjust scoping (#151)', () => {
  it('root container keeps the `print-layout` marker plus `hidden print:block` and stays aria-hidden', () => {
    const { container } = renderLayout();

    const root = printContainer(container);
    // The CSS scope hook and the existing print visibility utilities must all
    // survive — losing `print-layout` would drop every colored background in
    // print; losing `hidden`/`print:block` would leak the print DOM on screen.
    expect(root).toHaveClass('print-layout', 'hidden', 'print:block');
    expect(root).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the timeline status bar (bg-* fill) inside the .print-layout container', () => {
    const { container } = renderWith(DONE_GROUPS);
    const root = printContainer(container);

    const bar = screen.getByRole('img', { name: /Site Survey — Done/, hidden: true });
    expect(root).toContainElement(bar);
    // BAR_STATUS_CLASSES[done] === 'bg-success' — a meaning-bearing fill that
    // must remain a descendant of the scoped container to print.
    expect(bar.className).toMatch(/\bbg-success\b/);
  });

  it('renders the status Badge chip (tint fill) inside the .print-layout container', () => {
    const { container } = renderWith(DONE_GROUPS);
    const root = printContainer(container);

    const listRegion = screen.getByRole('region', { name: 'Project tasks list', hidden: true });
    // The Badge is a text chip; find it by its status label within the list.
    const chip = within(listRegion).getByText('Done');
    expect(root).toContainElement(chip);
    // Badge variant `success` → `bg-success-tint`, a meaning-bearing fill.
    expect(chip.className).toMatch(/bg-success-tint/);
  });

  it('renders the infected virus-scan chip (bg-destructive/10) inside the .print-layout container', () => {
    // The static (print) documents list surfaces a colored "Blocked by virus
    // scan" chip when a row is infected — the third meaning-bearing background.
    const infectedRow: IPortalDocument = {
      id: 'd1',
      name: 'Bad.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      uploadedAt: new Date('2026-08-01T00:00:00Z'),
      uploaderType: 'firm_member',
      scanStatus: 'infected',
      storagePath: 'workspaces/w1/projects/p1/documents/d1.pdf',
    };
    usePortalDocumentsMock.mockReturnValueOnce({ status: 'ready', rows: [infectedRow] });

    const { container } = renderLayout();
    const root = printContainer(container);

    const chip = screen.getByText(/blocked by virus scan/i);
    expect(root).toContainElement(chip);
    expect(chip.className).toMatch(/bg-destructive/);
  });
});
