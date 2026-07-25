/**
 * Billing math for Cloud Functions (#24). Mirrors packages/shared/src/
 * billing.ts (source-only package this NodeNext build cannot consume) —
 * keep the two in sync. Pure — unit-tests without emulators.
 */

export type TWorkspacePlan = 'trial' | 'standard' | 'business';

/** Usage fraction that enqueues the owner WhatsApp DM (once per period). */
export const USAGE_ALERT_AT = 0.9;

/**
 * WhatsApp conversation allowance per plan (06-pricing-model.md):
 * trial = a one-time pool of 30 (never resets); paid = monthly per-seat.
 */
export const WA_ALLOWANCE: Record<TWorkspacePlan, { amount: number; perSeat: boolean }> = {
  trial: { amount: 30, perSeat: false },
  standard: { amount: 50, perSeat: true },
  business: { amount: 100, perSeat: true },
};

/** `whatsappAllowance.includedPerPeriod` implied by a plan + seat count. */
export function includedForPlan(plan: TWorkspacePlan, seats: number): number {
  const allowance = WA_ALLOWANCE[plan];
  return allowance.perSeat ? allowance.amount * Math.max(1, seats) : allowance.amount;
}

/**
 * True when the increment prevUsed → newUsed crosses `threshold` of
 * `included` (inclusive on the new side: landing exactly on 90% fires).
 * Never fires twice for the same crossing because prevUsed is already
 * at/over the line on subsequent increments.
 */
export function crossedThreshold(
  prevUsed: number,
  newUsed: number,
  included: number,
  threshold: number,
): boolean {
  if (included <= 0) {
    return false;
  }
  const line = included * threshold;
  return prevUsed < line && newUsed >= line;
}

const MYT_OFFSET_MINUTES = 8 * 60;

/** `YYYY-MM` usage-counter period key of `date` in Malaysia time. */
export function periodKey(date: Date): string {
  const myt = new Date(date.getTime() + MYT_OFFSET_MINUTES * 60_000);
  const month = String(myt.getUTCMonth() + 1).padStart(2, '0');
  return `${myt.getUTCFullYear()}-${month}`;
}

export interface IAllowanceState {
  used: number;
  periodStart: Date;
}

/**
 * Month-rollover decision for `whatsappAllowance` (#24, D4): paid plans
 * reset `used` when the stored period is not `now`'s period; the trial's
 * one-time pool never resets (06-pricing-model.md — dedicated test).
 */
export function rollAllowance(
  plan: TWorkspacePlan,
  current: IAllowanceState,
  now: Date,
): IAllowanceState {
  if (plan === 'trial' || periodKey(current.periodStart) === periodKey(now)) {
    return current;
  }
  return { used: 0, periodStart: now };
}
