/**
 * Quiet-hours window math (#18, D1/D6). Pure — unit-tests without emulators.
 *
 * MVP is Malaysia-only: Asia/Kuala_Lumpur is a constant UTC+8 with no DST,
 * so all window math is plain offset arithmetic (no tz library). The stored
 * shape carries `timezone` as a forward-compat literal; anything else is
 * rejected by the input validator and normalized to the default by the
 * resolver.
 *
 * Mirrors QUIET_HOURS_DEFAULT in @siapp/shared (source-only package this
 * NodeNext build cannot consume).
 */

export const MYT_TIMEZONE = 'Asia/Kuala_Lumpur';
const MYT_OFFSET_MINUTES = 8 * 60;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface IQuietHours {
  enabled: boolean;
  /** 'HH:mm' wall clock in MYT; start > end means the window wraps midnight. */
  start: string;
  end: string;
  timezone: typeof MYT_TIMEZONE;
}

export const QUIET_HOURS_DEFAULT: IQuietHours = {
  enabled: true,
  start: '21:00',
  end: '08:00',
  timezone: MYT_TIMEZONE,
};

/** True for a 24-hour 'HH:mm' string ('08:00', '23:59'). */
export function isValidTimeString(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

/**
 * Effective quiet hours off a raw workspace doc: absent/malformed
 * `notifications.quietHours` (or a non-MYT timezone) falls back to defaults
 * field by field, so a partial map can never produce an invalid window.
 */
export function resolveQuietHours(
  workspaceData: Record<string, unknown> | undefined,
): IQuietHours {
  const notifications = workspaceData?.['notifications'];
  const raw =
    typeof notifications === 'object' && notifications !== null
      ? (notifications as Record<string, unknown>)['quietHours']
      : undefined;
  if (typeof raw !== 'object' || raw === null) {
    return { ...QUIET_HOURS_DEFAULT };
  }
  const qh = raw as Record<string, unknown>;
  if (qh['timezone'] !== undefined && qh['timezone'] !== MYT_TIMEZONE) {
    return { ...QUIET_HOURS_DEFAULT };
  }
  return {
    enabled: typeof qh['enabled'] === 'boolean' ? qh['enabled'] : QUIET_HOURS_DEFAULT.enabled,
    start: isValidTimeString(qh['start']) ? qh['start'] : QUIET_HOURS_DEFAULT.start,
    end: isValidTimeString(qh['end']) ? qh['end'] : QUIET_HOURS_DEFAULT.end,
    timezone: MYT_TIMEZONE,
  };
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * When `now` falls inside the quiet-hours window, the instant the window
 * next ends (the `holdUntil` for enqueued messages); `null` when outside
 * the window or quiet hours are disabled. Boundary semantics: `start` is
 * inside the window, `end` is outside (21:00 holds, 08:00 sends).
 */
export function holdUntilFor(now: Date, qh: IQuietHours): Date | null {
  if (!qh.enabled) {
    return null;
  }
  const startMin = minutesOf(qh.start);
  const endMin = minutesOf(qh.end);
  if (startMin === endMin) {
    // Zero-length window — never inside.
    return null;
  }

  const mytMs = now.getTime() + MYT_OFFSET_MINUTES * 60_000;
  const myt = new Date(mytMs);
  const nowMin = myt.getUTCHours() * 60 + myt.getUTCMinutes();

  const wraps = startMin > endMin;
  const inside = wraps
    ? nowMin >= startMin || nowMin < endMin
    : nowMin >= startMin && nowMin < endMin;
  if (!inside) {
    return null;
  }

  // End of window as an MYT wall-clock instant: same day when the end is
  // still ahead of us today, otherwise (overnight window, pre-midnight
  // portion) the next day.
  const endIsTomorrow = wraps && nowMin >= startMin;
  const endUtcMs =
    Date.UTC(
      myt.getUTCFullYear(),
      myt.getUTCMonth(),
      myt.getUTCDate() + (endIsTomorrow ? 1 : 0),
      Math.floor(endMin / 60),
      endMin % 60,
    ) -
    MYT_OFFSET_MINUTES * 60_000;
  return new Date(endUtcMs);
}

/** `yyyy-MM-dd` of `now` in Malaysia time — the due-soon dedupe date (D5). */
export function mytDateString(now: Date): string {
  const myt = new Date(now.getTime() + MYT_OFFSET_MINUTES * 60_000);
  const month = String(myt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(myt.getUTCDate()).padStart(2, '0');
  return `${myt.getUTCFullYear()}-${month}-${day}`;
}
