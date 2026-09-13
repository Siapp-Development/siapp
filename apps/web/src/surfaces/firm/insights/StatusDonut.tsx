/**
 * Status mix donut (issue #164, Insights Tier 1 #2): a vibrant, dependency-free
 * SVG donut that shows how the workspace's projects are distributed across a
 * friendly status vocabulary. Pure presentation over the already-loaded
 * `useProjects` rows — no new Firestore reads, fields, rules or indexes, and no
 * chart library (the ring is hand-drawn with stacked `<circle>` segments).
 *
 * Tone: reassuring, never a performance scoreboard. Colour is never the sole
 * signal — the donut carries a full `aria-label` summary and a visible legend
 * pairs every swatch with a text label and count.
 *
 * Colour choice (matches the shared TASK-status semantic palette so the buckets
 * read with the same vocabulary as status chips): Upcoming → neutral grey
 * (`--muted-foreground`), In progress → `--primary`, On hold → `--warning`
 * (amber), Completed → `--success` (green). All come from design tokens via
 * Tailwind `text-*`/`bg-*` utilities + `currentColor`; no raw hex. The ring
 * track stays a light neutral (`--muted`).
 *
 * Zero-count buckets: omitted from the drawn ring (a 0% arc is invisible anyway)
 * but always listed in the legend showing "0", so the full vocabulary stays
 * visible and the ring never carries meaning the legend doesn't also state.
 */

import { Card, CardContent, CardHeader } from '@siapp/ui';

import { deriveStatusBucket, type TStatusBucketKey } from './insightsStatus.ts';
import type { IProjectRow } from '../projects/useProjects.ts';

export type { TStatusBucketKey };

export interface IStatusBucket {
  key: TStatusBucketKey;
  label: string;
  count: number;
}

/** Ordered, friendly vocabulary. `archived` is intentionally not represented. */
const BUCKET_ORDER: ReadonlyArray<{ key: TStatusBucketKey; label: string }> = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'on_hold', label: 'On hold' },
  { key: 'completed', label: 'Completed' },
];

/**
 * Token-backed colour class per bucket, aligned with the shared TASK-status
 * semantic palette (neutral / primary / warning / success). Used for both the
 * SVG stroke (`stroke="currentColor"`) and the legend swatch (`bg-current`), so
 * a single class keeps ring and legend in lockstep.
 */
const BUCKET_COLOR_CLASS: Record<TStatusBucketKey, string> = {
  upcoming: 'text-muted-foreground',
  in_progress: 'text-primary',
  on_hold: 'text-warning',
  completed: 'text-success',
};

/**
 * Count projects into the four friendly status buckets, always returning all
 * four in order (including zero-count buckets). Archived projects are excluded;
 * deleted-lifecycle rows are already excluded upstream on the Insights page.
 */
export function computeStatusMix(projects: readonly IProjectRow[]): IStatusBucket[] {
  const counts: Record<TStatusBucketKey, number> = {
    upcoming: 0,
    in_progress: 0,
    on_hold: 0,
    completed: 0,
  };

  for (const project of projects) {
    const bucket = deriveStatusBucket(project);
    if (bucket !== null) {
      counts[bucket] += 1;
    }
  }

  return BUCKET_ORDER.map(({ key, label }) => ({ key, label, count: counts[key] }));
}

// Radius chosen so the circumference is ~100 units — segment lengths then read
// directly as percentages (same trick as CircularProgress).
const RADIUS = 15.915_494_309_189_533;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface IStatusDonutProps {
  projects: readonly IProjectRow[];
}

export function StatusDonut({ projects }: IStatusDonutProps) {
  const buckets = computeStatusMix(projects);
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);

  const summary = buckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => `${bucket.count} ${bucket.label}`)
    .join(', ');

  // Build the drawn segments (skip zero-count buckets — a 0% arc is invisible).
  let accumulated = 0;
  const segments = buckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => {
      const fraction = bucket.count / total;
      const length = fraction * CIRCUMFERENCE;
      // Rotate each segment to start where the previous one ended; -90 puts the
      // first segment at 12 o'clock.
      const startAngle = -90 + (accumulated / CIRCUMFERENCE) * 360;
      accumulated += length;
      return { ...bucket, length, startAngle };
    });

  return (
    <Card className="print:break-inside-avoid">
      <CardHeader className="pb-0">
        <h2 className="text-base font-semibold tracking-tight">Where things stand</h2>
        <p className="text-sm text-muted-foreground">
          How your projects are spread across their journey.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6 pt-6 sm:flex-row sm:items-center sm:gap-8">
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No status data yet.</p>
        ) : (
          <>
            <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
              <svg
                viewBox="0 0 36 36"
                className="h-full w-full"
                role="img"
                aria-label={`Project status: ${summary}`}
              >
                <circle
                  cx="18"
                  cy="18"
                  r={RADIUS}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={4}
                  className="text-muted"
                />
                {segments.map((segment) => (
                  <circle
                    key={segment.key}
                    cx="18"
                    cy="18"
                    r={RADIUS}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={4}
                    strokeDasharray={`${segment.length} ${CIRCUMFERENCE}`}
                    transform={`rotate(${segment.startAngle} 18 18)`}
                    className={BUCKET_COLOR_CLASS[segment.key]}
                  />
                ))}
              </svg>
              <div
                className="absolute inset-0 flex flex-col items-center justify-center"
                aria-hidden="true"
              >
                <span className="text-2xl font-bold tabular-nums">{total}</span>
                <span className="text-xs text-muted-foreground">projects</span>
              </div>
            </div>

            <ul className="flex w-full flex-col gap-2">
              {buckets.map((bucket) => {
                const pct = total === 0 ? 0 : Math.round((bucket.count / total) * 100);
                return (
                  <li key={bucket.key} className="flex items-center gap-3 text-sm">
                    <span
                      aria-hidden="true"
                      className={`h-3 w-3 shrink-0 rounded-full bg-current ${
                        BUCKET_COLOR_CLASS[bucket.key]
                      }`}
                    />
                    <span className="flex-1">{bucket.label}</span>
                    <span className="font-semibold tabular-nums">{bucket.count}</span>
                    <span className="w-10 text-right text-muted-foreground tabular-nums">
                      {pct}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
