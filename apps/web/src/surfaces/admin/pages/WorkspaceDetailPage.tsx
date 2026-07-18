import type { IWorkspaceDoc } from '@siapp/shared';
import { Button, Input, Label } from '@siapp/ui';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router';

import { db } from '@/lib/firebase.ts';
import { SkipLink } from '@/components/SkipLink.tsx';
import {
  adjustWorkspaceFn,
  impersonateUserFn,
  type IAdjustInput,
} from '../lib/adminFunctions.ts';

type TWorkspacePlan = 'trial' | 'standard' | 'business';

function formatDate(value: unknown): string {
  if (value === undefined || value === null) return '—';
  const date = value instanceof Timestamp ? value.toDate() : new Date(value as string);
  return date.toLocaleDateString('en-MY', { year: 'numeric', month: 'short', day: 'numeric' });
}

function toInputDate(value: unknown): string {
  if (value === undefined || value === null) return '';
  const date = value instanceof Timestamp ? value.toDate() : new Date(value as string);
  return date.toISOString().slice(0, 10);
}

/** Workspace detail page — plan/seat/expiry controls + user impersonation. */
export function WorkspaceDetailPage() {
  const { wid } = useParams<'wid'>();

  const [workspace, setWorkspace] = useState<(IWorkspaceDoc & { id: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Plan form
  const [newPlan, setNewPlan] = useState<TWorkspacePlan>('trial');
  const [planSaving, setPlanSaving] = useState(false);
  const [planMsg, setPlanMsg] = useState<string | null>(null);

  // Seat form
  const [newSeatLimit, setNewSeatLimit] = useState(5);
  const [seatSaving, setSeatSaving] = useState(false);
  const [seatMsg, setSeatMsg] = useState<string | null>(null);

  // Expiry form
  const [newExpiry, setNewExpiry] = useState('');
  const [expirySaving, setExpirySaving] = useState(false);
  const [expiryMsg, setExpiryMsg] = useState<string | null>(null);

  // Impersonate form
  const [targetUid, setTargetUid] = useState('');
  const [impersonateReason, setImpersonateReason] = useState('');
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateMsg, setImpersonateMsg] = useState<string | null>(null);

  useEffect(() => {
    if (wid === undefined) return;
    return onSnapshot(
      doc(db, 'workspaces', wid),
      (snap) => {
        if (!snap.exists()) {
          setFetchError('Workspace not found.');
          setLoading(false);
          return;
        }
        const raw = snap.data() as Omit<IWorkspaceDoc, 'id'> & { id?: string };
        const data = { ...raw, id: snap.id };
        setWorkspace(data);
        setNewPlan(data.plan);
        setNewSeatLimit(data.seatLimit);
        setNewExpiry(toInputDate(data.planExpiresAt));
        setLoading(false);
      },
      (err) => {
        setFetchError(err.message);
        setLoading(false);
      },
    );
  }, [wid]);

  async function savePlan(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (wid === undefined) return;
    setPlanSaving(true);
    setPlanMsg(null);
    try {
      const input: IAdjustInput = { wid, plan: newPlan };
      await adjustWorkspaceFn(input);
      setPlanMsg('Plan updated.');
    } catch (err) {
      setPlanMsg(err instanceof Error ? err.message : 'Failed to update plan.');
    } finally {
      setPlanSaving(false);
    }
  }

  async function saveSeats(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (wid === undefined) return;
    setSeatSaving(true);
    setSeatMsg(null);
    try {
      const input: IAdjustInput = { wid, seatLimit: newSeatLimit };
      await adjustWorkspaceFn(input);
      setSeatMsg('Seat limit updated.');
    } catch (err) {
      setSeatMsg(err instanceof Error ? err.message : 'Failed to update seats.');
    } finally {
      setSeatSaving(false);
    }
  }

  async function saveExpiry(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (wid === undefined) return;
    setExpirySaving(true);
    setExpiryMsg(null);
    try {
      const input: IAdjustInput = { wid, planExpiresAt: newExpiry };
      await adjustWorkspaceFn(input);
      setExpiryMsg('Renewal date updated.');
    } catch (err) {
      setExpiryMsg(err instanceof Error ? err.message : 'Failed to update expiry.');
    } finally {
      setExpirySaving(false);
    }
  }

  async function handleImpersonate(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (wid === undefined) return;
    if (targetUid.trim() === '' || impersonateReason.trim() === '') return;
    setImpersonating(true);
    setImpersonateMsg(null);
    try {
      const result = await impersonateUserFn({
        targetUid: targetUid.trim(),
        reason: impersonateReason.trim(),
      });
      // Sign in as the target user in a new tab using the custom token.
      // Store the token in sessionStorage so the relay page can pick it up.
      sessionStorage.setItem('_impersonateToken', result.data.customToken);
      const slug = workspace?.slug ?? '';
      window.open(
        `https://dashboard.siapp.app/${slug}?impersonate=1`,
        '_blank',
        'noopener',
      );
      setImpersonateMsg('Custom token minted. New tab opened — sign-in with custom token and then clear sessionStorage.');
    } catch (err) {
      setImpersonateMsg(err instanceof Error ? err.message : 'Impersonation failed.');
    } finally {
      setImpersonating(false);
    }
  }

  if (loading) {
    return (
      <p role="status" aria-live="polite" className="mt-6 text-sm text-muted-foreground">
        Loading workspace…
      </p>
    );
  }

  if (fetchError !== null || workspace === null) {
    return (
      <p role="alert" className="mt-6 text-sm text-destructive">
        {fetchError ?? 'Workspace not found.'}
      </p>
    );
  }

  return (
    <>
      <SkipLink />
      <div className="space-y-8">
        <div>
          <h1 className="text-xl font-semibold">{workspace.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {workspace.slug} · {workspace.id}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-medium capitalize">{workspace.plan}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Seats</dt>
              <dd className="font-medium">
                {workspace.seatsUsed} / {workspace.seatLimit}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Expires</dt>
              <dd className="font-medium">{formatDate(workspace.planExpiresAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="font-medium">{formatDate(workspace.createdAt)}</dd>
            </div>
          </dl>
        </div>

        {/* Plan change */}
        <section aria-labelledby="plan-heading" className="rounded-lg border p-4">
          <h2 id="plan-heading" className="font-medium">Change plan</h2>
          <form onSubmit={(e) => void savePlan(e)} className="mt-3 flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="newPlan">Plan</Label>
              <select
                id="newPlan"
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value as TWorkspacePlan)}
                className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
              >
                <option value="trial">Trial</option>
                <option value="standard">Standard</option>
                <option value="business">Business</option>
              </select>
            </div>
            <Button type="submit" disabled={planSaving} size="sm">
              {planSaving ? 'Saving…' : 'Save'}
            </Button>
          </form>
          {planMsg !== null && <p className="mt-2 text-xs" role="status">{planMsg}</p>}
        </section>

        {/* Seat adjustment */}
        <section aria-labelledby="seats-heading" className="rounded-lg border p-4">
          <h2 id="seats-heading" className="font-medium">Adjust seat limit</h2>
          <form onSubmit={(e) => void saveSeats(e)} className="mt-3 flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="newSeats">Seat limit</Label>
              <Input
                id="newSeats"
                type="number"
                min={1}
                max={100}
                value={newSeatLimit}
                onChange={(e) => setNewSeatLimit(parseInt(e.target.value, 10))}
                className="w-24"
              />
            </div>
            <Button type="submit" disabled={seatSaving} size="sm">
              {seatSaving ? 'Saving…' : 'Save'}
            </Button>
          </form>
          {seatMsg !== null && <p className="mt-2 text-xs" role="status">{seatMsg}</p>}
        </section>

        {/* Renewal date */}
        <section aria-labelledby="expiry-heading" className="rounded-lg border p-4">
          <h2 id="expiry-heading" className="font-medium">Adjust renewal date</h2>
          <form onSubmit={(e) => void saveExpiry(e)} className="mt-3 flex items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="newExpiry">Expiry date</Label>
              <Input
                id="newExpiry"
                type="date"
                value={newExpiry}
                onChange={(e) => setNewExpiry(e.target.value)}
                className="w-40"
              />
            </div>
            <Button type="submit" disabled={expirySaving} size="sm">
              {expirySaving ? 'Saving…' : 'Save'}
            </Button>
          </form>
          {expiryMsg !== null && <p className="mt-2 text-xs" role="status">{expiryMsg}</p>}
        </section>

        {/* Impersonate */}
        <section aria-labelledby="impersonate-heading" className="rounded-lg border p-4">
          <h2 id="impersonate-heading" className="font-medium">Impersonate user</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Mints a custom Firebase token. A new tab opens to dashboard.siapp.app/{workspace.slug}. All
            impersonation actions are audit-logged.
          </p>
          <form onSubmit={(e) => void handleImpersonate(e)} className="mt-3 space-y-3">
            <div className="space-y-1">
              <Label htmlFor="targetUid">Target Firebase UID</Label>
              <Input
                id="targetUid"
                value={targetUid}
                onChange={(e) => setTargetUid(e.target.value)}
                placeholder="uid from Firebase Auth"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="impersonateReason">Reason (required for audit trail)</Label>
              <Input
                id="impersonateReason"
                value={impersonateReason}
                onChange={(e) => setImpersonateReason(e.target.value)}
                placeholder="e.g. Support ticket #1234"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={impersonating || targetUid.trim() === '' || impersonateReason.trim() === ''}
              variant="outline"
              size="sm"
            >
              {impersonating ? 'Minting token…' : 'Impersonate'}
            </Button>
          </form>
          {impersonateMsg !== null && (
            <p className="mt-2 text-xs" role="status">
              {impersonateMsg}
            </p>
          )}
        </section>
      </div>
    </>
  );
}
