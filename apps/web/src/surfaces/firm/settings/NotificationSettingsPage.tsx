/**
 * Notification settings (#18): workspace quiet hours. Owner/admin edit the
 * window; pm/viewer see read-only values (mirrors TeamSettingsPage role
 * gating — the callable enforces the same server-side). Timezone is fixed to
 * Malaysia time at MVP (D6), so no picker is shown.
 */

import { Alert, Button, Card, CardContent, CardHeader, Input, Label } from '@siapp/ui';
import type { TMemberRole } from '@siapp/shared';
import { useEffect, useState, type FormEvent } from 'react';

import { saveQuietHours, useNotificationSettings } from './useNotificationSettings.ts';

interface IQuietHoursFormProps {
  workspaceId: string;
  initial: { enabled: boolean; start: string; end: string };
}

function QuietHoursForm({ workspaceId, initial }: IQuietHoursFormProps) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sync when another admin's save lands via the live subscription.
  useEffect(() => {
    setEnabled(initial.enabled);
    setStart(initial.start);
    setEnd(initial.end);
  }, [initial.enabled, initial.start, initial.end]);

  async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (start === '' || end === '') {
      setError('Enter both a start and an end time.');
      return;
    }
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await saveQuietHours(workspaceId, { enabled, start, end });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save quiet hours.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSave(event)} noValidate className="flex flex-col gap-4">
      {error !== null && <Alert variant="destructive">{error}</Alert>}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Enable quiet hours
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quiet-hours-start">Start</Label>
          <Input
            id="quiet-hours-start"
            type="time"
            value={start}
            disabled={!enabled}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quiet-hours-end">End</Label>
          <Input
            id="quiet-hours-end"
            type="time"
            value={end}
            disabled={!enabled}
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Times are in Malaysia time. Messages triggered during quiet hours are sent at {end} the
        next morning.
      </p>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? 'Saving…' : 'Save quiet hours'}
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {saved ? 'Quiet hours saved.' : ''}
        </p>
      </div>
    </form>
  );
}

export interface INotificationSettingsPageProps {
  workspaceId: string;
  workspaceName: string;
  role: TMemberRole;
}

export function NotificationSettingsPage({
  workspaceId,
  workspaceName,
  role,
}: INotificationSettingsPageProps) {
  const canManage = role === 'owner' || role === 'admin';
  const settings = useNotificationSettings(workspaceId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Notification settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">{workspaceName}</p>
      </div>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Quiet hours</h2>
          <p className="text-sm">
            WhatsApp messages are held during this window and sent when it ends.
          </p>
        </CardHeader>
        <CardContent>
          {settings.status === 'loading' && <p className="text-sm">Loading settings…</p>}
          {settings.status === 'error' && (
            <p className="text-sm">Notification settings could not be loaded.</p>
          )}
          {settings.status === 'ready' && canManage && (
            <QuietHoursForm workspaceId={workspaceId} initial={settings.quietHours} />
          )}
          {settings.status === 'ready' && !canManage && (
            <div className="flex flex-col gap-1 text-sm">
              <p>
                Quiet hours are{' '}
                <span className="font-medium">
                  {settings.quietHours.enabled ? 'on' : 'off'}
                </span>
                {settings.quietHours.enabled && (
                  <>
                    , {settings.quietHours.start}–{settings.quietHours.end} Malaysia time
                  </>
                )}
                .
              </p>
              <p className="text-muted-foreground">
                Only the workspace owner or an admin can change this.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
