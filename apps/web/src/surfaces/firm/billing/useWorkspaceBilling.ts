/**
 * Billing data layer (#24). Same pattern as useNotificationSettings: the
 * workspace doc is already member-readable, so subscribe directly and map
 * the billing-relevant fields. Absent `billingStatus` = 'active' — pre-#24
 * workspaces are never backfilled (D2). All writes stay server-side.
 */

import {
  USAGE_ALERT_AT,
  USAGE_WARN_AT,
  forecastUsage,
  includedForPlan,
  type TBillingStatus,
  type TWorkspacePlan,
} from '@siapp/shared';
import { Timestamp, doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { useEffect, useState } from 'react';

import { db } from '@/lib/firebase.ts';

export interface IWorkspaceBilling {
  plan: TWorkspacePlan;
  billingStatus: TBillingStatus;
  seatLimit: number;
  seatsUsed: number;
  planExpiresAt: Date | null;
  waUsed: number;
  waIncluded: number;
  /** 0..1+ fraction of the WhatsApp allowance consumed this period. */
  waUsedFraction: number;
  /** Linear month-end projection of WA conversations (D-019 forecast). */
  waForecast: number;
}

export type TWorkspaceBillingState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; billing: IWorkspaceBilling };

export { USAGE_ALERT_AT, USAGE_WARN_AT };

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

/** Billing view of a raw workspace doc — resilient to missing fields. */
export function mapWorkspaceBilling(
  data: DocumentData | undefined,
  now: Date = new Date(),
): IWorkspaceBilling {
  const plan: TWorkspacePlan =
    data?.['plan'] === 'standard' || data?.['plan'] === 'business' ? data['plan'] : 'trial';
  const billingStatus: TBillingStatus =
    data?.['billingStatus'] === 'read_only' ? 'read_only' : 'active';
  const seatLimit = asNumber(data?.['seatLimit'], 1);
  const allowance = data?.['whatsappAllowance'] as Record<string, unknown> | undefined;
  const waUsed = asNumber(allowance?.['used'], 0);
  const waIncluded = asNumber(
    allowance?.['includedPerPeriod'],
    includedForPlan(plan, seatLimit),
  );
  const periodStart = asDate(allowance?.['periodStart']) ?? now;
  return {
    plan,
    billingStatus,
    seatLimit,
    seatsUsed: asNumber(data?.['seatsUsed'], 0),
    planExpiresAt: asDate(data?.['planExpiresAt']),
    waUsed,
    waIncluded,
    waUsedFraction: waIncluded > 0 ? waUsed / waIncluded : 0,
    waForecast: forecastUsage(waUsed, periodStart, now),
  };
}

export function useWorkspaceBilling(workspaceId: string): TWorkspaceBillingState {
  const [state, setState] = useState<TWorkspaceBillingState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    return onSnapshot(
      doc(db, `workspaces/${workspaceId}`),
      (snapshot) => {
        setState({ status: 'ready', billing: mapWorkspaceBilling(snapshot.data()) });
      },
      () => setState({ status: 'error' }),
    );
  }, [workspaceId]);

  return state;
}
