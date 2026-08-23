/**
 * "Portfolio at a glance" strip for the #102 Home page. Presentational: it
 * consumes the pure `portfolioStats` output and renders four labeled tiles.
 * Color reinforces meaning but is never the sole signal — every tile pairs its
 * accent with an icon and a text label.
 */

import type { ReactNode } from 'react';

import {
  AlarmIcon,
  CalendarIcon,
  FolderIcon,
  TargetCheckIcon,
} from './dashboardIcons.tsx';
import type { IPortfolioStats } from './portfolioStats.ts';

interface IStatTile {
  key: string;
  label: string;
  value: string;
  accent: string;
  icon: ReactNode;
}

export function StatStrip({ stats }: { stats: IPortfolioStats }) {
  const tiles: readonly IStatTile[] = [
    {
      key: 'active',
      label: 'Active projects',
      value: String(stats.activeProjects),
      accent: 'text-primary',
      icon: <FolderIcon />,
    },
    {
      key: 'onTrack',
      label: 'On track',
      value: stats.onTrackPct === null ? '—' : `${stats.onTrackPct}%`,
      accent: 'text-success',
      icon: <TargetCheckIcon />,
    },
    {
      key: 'overdue',
      label: 'Overdue tasks',
      value: String(stats.overdueTasks),
      accent: 'text-danger',
      icon: <AlarmIcon />,
    },
    {
      key: 'dueThisWeek',
      label: 'Due this week',
      value: String(stats.dueThisWeek),
      accent: 'text-warning',
      icon: <CalendarIcon />,
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className="flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3.5 shadow-card"
        >
          <dt className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <span className={tile.accent}>{tile.icon}</span>
            {tile.label}
          </dt>
          <dd className={`font-display text-3xl font-bold tabular-nums ${tile.accent}`}>
            {tile.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
