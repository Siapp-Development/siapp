/**
 * Notification settings data layer (#18). The workspace doc is already
 * member-readable, so the page subscribes to it directly and maps
 * `notifications.quietHours` with QUIET_HOURS_DEFAULT when absent. Saves go
 * through the updateNotificationSettings callable (D1) — the workspace doc
 * stays client-write-denied in rules.
 */

import { QUIET_HOURS_DEFAULT, type IQuietHoursSettings } from '@siapp/shared';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { updateNotificationSettings } from '@/lib/callables.ts';
import { db } from '@/lib/firebase.ts';

export type TNotificationSettingsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; quietHours: IQuietHoursSettings };

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function asTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && TIME_PATTERN.test(value) ? value : fallback;
}

/** Effective quiet hours off a raw workspace doc — defaults when absent. */
export function mapQuietHours(data: DocumentData | undefined): IQuietHoursSettings {
  const notifications = data?.['notifications'] as Record<string, unknown> | undefined;
  const raw = notifications?.['quietHours'];
  if (typeof raw !== 'object' || raw === null) {
    return { ...QUIET_HOURS_DEFAULT };
  }
  const qh = raw as Record<string, unknown>;
  return {
    enabled: typeof qh['enabled'] === 'boolean' ? qh['enabled'] : QUIET_HOURS_DEFAULT.enabled,
    start: asTime(qh['start'], QUIET_HOURS_DEFAULT.start),
    end: asTime(qh['end'], QUIET_HOURS_DEFAULT.end),
    timezone: 'Asia/Kuala_Lumpur',
  };
}

export function useNotificationSettings(workspaceId: string): TNotificationSettingsState {
  const [state, setState] = useState<TNotificationSettingsState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      doc(db, `workspaces/${workspaceId}`),
      (snapshot) => {
        setState({ status: 'ready', quietHours: mapQuietHours(snapshot.data()) });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId]);

  return state;
}

/** Persists the quiet-hours window via the owner/admin callable. */
export async function saveQuietHours(
  workspaceId: string,
  quietHours: { enabled: boolean; start: string; end: string },
): Promise<void> {
  await updateNotificationSettings({ workspaceId, quietHours });
}
