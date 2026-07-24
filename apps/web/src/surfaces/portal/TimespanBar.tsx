/**
 * Elapsed-timespan bar (#21 B2): where "today" sits between the project's
 * start and target end. Hidden when there's no target end date — progress
 * (D5) is a separate progressbar; this is purely calendar time.
 */

export function timespanPercent(startDate: Date, targetEndDate: Date, today: Date): number {
  const total = targetEndDate.getTime() - startDate.getTime();
  if (total <= 0) {
    return 100;
  }
  const elapsed = today.getTime() - startDate.getTime();
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

export function TimespanBar({
  startDate,
  targetEndDate,
  today = new Date(),
}: {
  startDate: Date | null;
  targetEndDate: Date | null;
  today?: Date;
}) {
  if (startDate === null || targetEndDate === null) {
    return null;
  }
  const percent = timespanPercent(startDate, targetEndDate, today);

  return (
    <div
      role="img"
      aria-label={`Project timespan: ${percent}% of the scheduled time has passed`}
      className="relative h-2 w-full rounded-full bg-muted"
    >
      <div
        className="h-2 rounded-full bg-primary/40"
        style={{ width: `${percent}%` }}
        data-testid="timespan-fill"
      />
      <div
        className="absolute top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded bg-primary"
        style={{ left: `${percent}%` }}
        data-testid="timespan-today"
      />
    </div>
  );
}
