/**
 * Portfolio snapshot cards (issue #164, Insights Tier 1 #1): four reassuring,
 * client-friendly headline numbers rendered above the projects timeline. This
 * is pure presentation over the already-loaded `useProjects` rows — no new
 * Firestore reads, fields, rules or indexes.
 *
 * Tone: forward-looking and calm. We never say "late", "at-risk" or "behind";
 * "Wrapping up soon" is a gentle heads-up, not a warning. Every number is
 * explainable in one plain sentence (see each field's doc comment) and is
 * always present as readable text — the completion ring is decorative and
 * duplicates its percentage in words.
 */

import { Card, CardContent, CircularProgress } from '@siapp/ui';

import { deriveStatusBucket } from './insightsStatus.ts';
import type { IProjectRow } from '../projects/useProjects.ts';

/** How many days ahead a target date can fall and still count as "soon". */
const WRAPPING_UP_WINDOW_DAYS = 30;

export interface IPortfolioStats {
  /** In-flight projects: published and not yet completed or archived. */
  activeCount: number;
  /**
   * Rounded average progress across the active set, 0–100. Zero when nothing is
   * in flight (so we never divide by an empty set).
   */
  overallCompletionPct: number;
  /**
   * Active-ish projects whose target date lands within the next 30 days
   * (inclusive of today and day 30) — a friendly "coming up" heads-up, not a
   * deadline alarm. Completed/archived projects are excluded.
   */
  wrappingUpSoonCount: number;
  /**
   * Projects finished, by either their lifecycle or their status. Uses the
   * shared `deriveStatusBucket` predicate so this count is exactly the set the
   * status donut shows as Completed (no card-vs-donut parity drift).
   */
  completedCount: number;
}

/** Start of the given day (local midnight) — used for inclusive date windows. */
function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Derive the four portfolio headline numbers from the already-loaded project
 * rows. Pure and deterministic: pass `now` to make date-relative counts
 * ("wrapping up soon") testable.
 */
export function computePortfolioStats(
  projects: readonly IProjectRow[],
  now: Date = new Date(),
): IPortfolioStats {
  const active = projects.filter(
    (project) =>
      project.lifecycle === 'published' &&
      project.status !== 'completed' &&
      project.status !== 'archived',
  );

  const overallCompletionPct =
    active.length === 0
      ? 0
      : Math.round(active.reduce((sum, project) => sum + project.progressPct, 0) / active.length);

  const windowStart = startOfDay(now);
  const windowEnd = startOfDay(now);
  windowEnd.setDate(windowEnd.getDate() + WRAPPING_UP_WINDOW_DAYS);

  const wrappingUpSoonCount = projects.filter((project) => {
    if (project.targetEndDate === null) {
      return false;
    }
    if (project.status === 'completed' || project.status === 'archived') {
      return false;
    }
    const target = startOfDay(project.targetEndDate);
    return target >= windowStart && target <= windowEnd;
  }).length;

  const completedCount = projects.filter(
    (project) => deriveStatusBucket(project) === 'completed',
  ).length;

  return {
    activeCount: active.length,
    overallCompletionPct,
    wrappingUpSoonCount,
    completedCount,
  };
}

interface IStatCardProps {
  label: string;
  value: string;
  hint: string;
}

function StatCard({ label, value, hint }: IStatCardProps) {
  return (
    <Card className="print:break-inside-avoid">
      <CardContent className="flex flex-col gap-1 p-5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        <p className="text-3xl font-bold tracking-tight tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export interface IPortfolioStatsProps {
  projects: readonly IProjectRow[];
  now?: Date;
}

export function PortfolioStats({ projects, now }: IPortfolioStatsProps) {
  const stats = computePortfolioStats(projects, now);

  return (
    <section aria-label="Portfolio snapshot" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="In flight"
        value={String(stats.activeCount)}
        hint="Projects currently underway"
      />

      <Card className="print:break-inside-avoid">
        <CardContent className="flex items-center gap-4 p-5">
          {/* Decorative: the percentage is stated as text beside it, so the ring
              is hidden from assistive tech to avoid a duplicate announcement. */}
          <span aria-hidden="true">
            <CircularProgress
              value={stats.overallCompletionPct}
              label={`Overall completion ${stats.overallCompletionPct}%`}
              size={64}
              indicatorClassName="text-primary"
            >
              <span className="text-xs font-semibold tabular-nums">
                {stats.overallCompletionPct}%
              </span>
            </CircularProgress>
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Overall completion
            </p>
            <p className="text-3xl font-bold tracking-tight tabular-nums">
              {stats.overallCompletionPct}%
            </p>
            <p className="text-xs text-muted-foreground">Average across in-flight projects</p>
          </div>
        </CardContent>
      </Card>

      <StatCard
        label="Wrapping up soon"
        value={String(stats.wrappingUpSoonCount)}
        hint="Target date within 30 days"
      />
      <StatCard
        label="Completed"
        value={String(stats.completedCount)}
        hint="Projects brought to the finish line"
      />
    </section>
  );
}
