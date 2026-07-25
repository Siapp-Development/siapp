import { cn } from '@siapp/ui';

import { SectionHeading } from '../components/SectionHeading.tsx';
import { DesktopWindow } from '../components/demo/DeviceFrames.tsx';

interface IDemoProject {
  name: string;
  firm: string;
  phase: string;
  health: 'on-track' | 'attention';
  due: string;
  whatsapp: string;
}

const PROJECTS: IDemoProject[] = [
  {
    name: 'The Vue Phase 2',
    firm: 'Lim Builders',
    phase: 'Structural',
    health: 'on-track',
    due: '30 Nov 2026',
    whatsapp: '12 sent · all delivered',
  },
  {
    name: 'Bungalow Renovation — Damansara Heights',
    firm: 'Lim Builders',
    phase: 'Finishing',
    health: 'attention',
    due: '14 Sep 2026',
    whatsapp: '8 sent · all delivered',
  },
  {
    name: 'Fit-out — Menara UOA',
    firm: 'Lim Builders',
    phase: 'Approvals',
    health: 'on-track',
    due: '20 Jan 2027',
    whatsapp: '3 sent · all delivered',
  },
];

const FEATURE_LABELS = [
  'Duplicate a proven project',
  'Keep sensitive work restricted',
  'Decide what the client can see',
  'Know which messages were delivered',
  'See overdue work immediately',
];

/** Internal product section — brief §12. */
export function InternalProduct() {
  return (
    <section id="product" className="py-[var(--mk-section-y)]">
      <div className="mx-auto max-w-[var(--mk-container)] px-4 sm:px-6">
        <SectionHeading
          eyebrow="For your team"
          title="Simple enough to start. Structured enough to trust."
        />
        <div className="mt-12 grid items-start gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
          <DesktopWindow title="Lim Builders — Projects">
            <div className="p-4">
              <div className="hidden grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)] gap-3 border-b border-border px-2 pb-2 text-[0.6875rem] font-semibold tracking-wide text-muted-foreground uppercase sm:grid">
                <span>Project</span>
                <span>Phase</span>
                <span>Health</span>
                <span>WhatsApp updates</span>
              </div>
              <ul className="divide-y divide-border">
                {PROJECTS.map((project) => (
                  <li
                    key={project.name}
                    className="grid gap-1 px-2 py-3 sm:grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)] sm:items-center sm:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {project.name}
                      </p>
                      <p className="text-xs text-muted-foreground">Due {project.due}</p>
                    </div>
                    <p className="text-xs text-foreground">{project.phase}</p>
                    <p>
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
                          project.health === 'on-track'
                            ? 'bg-success-tint text-success'
                            : 'bg-warning-tint text-warning',
                        )}
                      >
                        {project.health === 'on-track' ? 'On track' : 'Needs attention'}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">{project.whatsapp}</p>
                  </li>
                ))}
              </ul>
            </div>
          </DesktopWindow>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {FEATURE_LABELS.map((label) => (
              <li
                key={label}
                className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-card"
              >
                {label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
