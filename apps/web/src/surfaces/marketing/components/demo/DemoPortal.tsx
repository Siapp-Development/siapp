import { Progress, cn } from '@siapp/ui';

import { ChatIcon } from '../icons.tsx';
import type { IIndustryDemo } from './demoContent.ts';

export interface IDemoPortalProps {
  demo: IIndustryDemo;
  /** Render the full portal anatomy (dates, documents, WhatsApp button). */
  full?: boolean;
  className?: string;
}

/**
 * Stylized client-portal page. Visual DNA copied from the real
 * PortalProjectPage — not imported (bundle isolation). Wrap the parent in
 * [data-surface='portal'] so the warm neutrals apply.
 */
export function DemoPortal({ demo, full = false, className }: IDemoPortalProps) {
  return (
    <div className={cn('bg-background', className)}>
      <div className="border-b border-border bg-card px-4 py-3">
        <p className="font-display text-sm font-semibold text-foreground">{demo.firmName}</p>
        <p className="text-xs text-muted-foreground">Prepared for {demo.clientName}</p>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <p className="font-display text-base font-semibold text-foreground">
            {demo.projectName}
          </p>
          {full && (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Started</dt>
                <dd className="font-medium text-foreground">12 Feb 2026</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Target completion</dt>
                <dd className="font-medium text-foreground">30 Nov 2026</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-3 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Progress</p>
            <p className="font-display text-lg font-semibold text-foreground tabular-nums">
              {demo.progressPct}%
            </p>
          </div>
          <Progress
            value={demo.progressPct}
            label={`${demo.projectLabel} progress`}
            className="mt-1.5 h-2"
            indicatorClassName="bg-accent"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Current phase: <span className="font-medium text-foreground">{demo.currentPhase}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Next: <span className="font-medium text-foreground">{demo.nextMilestone}</span> —{' '}
            {demo.nextMilestoneDate}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card p-3 shadow-card">
          <p className="text-xs font-medium text-muted-foreground">Recent updates</p>
          <ul className="mt-1.5 space-y-1.5 text-xs text-foreground">
            {demo.tasks
              .filter((t) => t.status !== 'todo')
              .map((t) => (
                <li key={t.id} className="flex justify-between gap-2">
                  <span className="truncate">{t.title}</span>
                  {t.due !== undefined && (
                    <span className="shrink-0 text-muted-foreground tabular-nums">{t.due}</span>
                  )}
                </li>
              ))}
          </ul>
        </div>

        {full && (
          <>
            <div className="rounded-lg border border-border bg-card p-3 shadow-card">
              <p className="text-xs font-medium text-muted-foreground">Shared documents</p>
              <ul className="mt-1.5 space-y-1 text-xs text-foreground">
                <li>Signed agreement.pdf</li>
                <li>Progress photos — July.zip</li>
              </ul>
            </div>
            {/* Decorative mockup element — intentionally not interactive. */}
            <div
              aria-hidden="true"
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-success font-medium text-white"
            >
              <ChatIcon className="size-4" />
              <span className="text-sm">Message on WhatsApp</span>
            </div>
            <p className="pt-1 text-center text-[0.625rem] text-muted-foreground">
              Powered by Siapp
            </p>
          </>
        )}
      </div>
    </div>
  );
}
