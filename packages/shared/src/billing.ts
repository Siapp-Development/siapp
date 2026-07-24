/**
 * Billing tier metadata + WhatsApp allowance math (#24, D-019/D-020).
 *
 * Tiers are billing metadata ONLY (D1 / D-030 amendment): plan prices,
 * seat-based WA allowances, and usage-forecast thresholds. No per-tier
 * feature gates live here or anywhere else at MVP.
 *
 * Mirrored in backend/functions/src/lib/billing.ts (source-only package
 * boundary — keep the two in sync).
 */

import type { TWorkspacePlan } from './enums.ts';

/** Trial length in days (06-pricing-model.md). */
export const TRIAL_DAYS = 30;

/** Per-seat annual price in MYR; trial is free. */
export const PLAN_PRICES_MYR: Record<TWorkspacePlan, number> = {
  trial: 0,
  standard: 79,
  business: 149,
};

/**
 * WhatsApp conversation allowance per plan (06-pricing-model.md):
 * trial = a one-time pool of 30 (never resets, `perSeat: false`);
 * paid plans = monthly per-seat allowances.
 */
export const WA_ALLOWANCE: Record<TWorkspacePlan, { amount: number; perSeat: boolean }> = {
  trial: { amount: 30, perSeat: false },
  standard: { amount: 50, perSeat: true },
  business: { amount: 100, perSeat: true },
};

/** Usage fraction that raises the in-app warning banner. */
export const USAGE_WARN_AT = 0.7;

/** Usage fraction that enqueues the owner WhatsApp DM (once per period). */
export const USAGE_ALERT_AT = 0.9;

/** `whatsappAllowance.includedPerPeriod` implied by a plan + seat count. */
export function includedForPlan(plan: TWorkspacePlan, seats: number): number {
  const allowance = WA_ALLOWANCE[plan];
  return allowance.perSeat ? allowance.amount * Math.max(1, seats) : allowance.amount;
}

/**
 * Linear month-end usage projection for the [Bill] usage bar: consumption
 * rate so far this period extrapolated to the end of `now`'s month.
 * Returns `used` unchanged when the elapsed time is too small to project.
 */
export function forecastUsage(used: number, periodStart: Date, now: Date): number {
  const elapsedMs = now.getTime() - periodStart.getTime();
  if (used <= 0 || elapsedMs < 3_600_000) {
    return used;
  }
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const totalMs = monthEnd.getTime() - periodStart.getTime();
  if (totalMs <= elapsedMs) {
    return used;
  }
  return Math.round((used / elapsedMs) * totalMs);
}
