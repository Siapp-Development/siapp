/**
 * Env-sourced Twilio Content Template SID registry (#133, O-1/O-6/O-7).
 *
 * Resolves a `TNotificationTrigger` (+ locale) to the approved Content
 * Template SID (an `HX…` id) declared in `plans/whatsapp-templates-v1.md`.
 * SIDs are NOT secrets (same committed-param pattern as `PORTAL_ORIGIN`): one
 * `defineString('WA_CONTENT_SID_<TRIGGER>')` per outbound trigger, defaulting
 * to `''`. A blank/unset SID resolves to `null` so a not-yet-approved template
 * degrades to a `failed` doc (`errorCode: 'no_content_sid'`, O-7) rather than
 * crashing the sweep.
 */

import { defineString } from 'firebase-functions/params';

/**
 * Local mirror of `TNotificationTrigger` in `@siapp/shared` (source-only
 * package this NodeNext `tsc` build cannot consume — same rationale as the
 * mirrors in `triggers/messageUsage.ts` and `lib/notifyConfig.ts`). Keep in
 * sync with `packages/shared/src/enums.ts`.
 */
export type TNotificationTrigger =
  | 'project_welcome'
  | 'task_assigned'
  | 'task_status_change'
  | 'task_due_soon'
  | 'task_blocked'
  | 'need_help'
  | 'inbound_auto_reply'
  | 'wa_quota_90'
  | 'collab_access_link';

/** Locales with a v1 template pack. MVP is `en` (D-026 defers `ms`). */
export type TWaLocale = 'en';

/**
 * Outbound triggers that can carry a send-time Content Template (O-6: 8
 * params). `inbound_auto_reply` is inbound-only (#20, out of scope) and has no
 * outbound template.
 */
export const OUTBOUND_TRIGGERS = [
  'project_welcome',
  'task_assigned',
  'task_status_change',
  'task_due_soon',
  'task_blocked',
  'need_help',
  'wa_quota_90',
  'collab_access_link',
] as const;

export type TOutboundTrigger = (typeof OUTBOUND_TRIGGERS)[number];

/**
 * One committed, non-secret `defineString` param per outbound trigger. Read
 * via `.value()` at invocation time (never at module load) in
 * `readContentSidRegistry`.
 */
const CONTENT_SID_PARAMS: Record<TOutboundTrigger, ReturnType<typeof defineString>> = {
  project_welcome: defineString('WA_CONTENT_SID_PROJECT_WELCOME', { default: '' }),
  task_assigned: defineString('WA_CONTENT_SID_TASK_ASSIGNED', { default: '' }),
  task_status_change: defineString('WA_CONTENT_SID_TASK_STATUS_CHANGE', { default: '' }),
  task_due_soon: defineString('WA_CONTENT_SID_TASK_DUE_SOON', { default: '' }),
  task_blocked: defineString('WA_CONTENT_SID_TASK_BLOCKED', { default: '' }),
  need_help: defineString('WA_CONTENT_SID_NEED_HELP', { default: '' }),
  wa_quota_90: defineString('WA_CONTENT_SID_WA_QUOTA_90', { default: '' }),
  collab_access_link: defineString('WA_CONTENT_SID_COLLAB_ACCESS_LINK', { default: '' }),
};

/** A resolved SID registry keyed by outbound trigger (`''` = unset). */
export type TContentSidRegistry = Record<TOutboundTrigger, string>;

/** Narrowing guard: is this trigger one that carries an outbound template? */
export function isOutboundTrigger(trigger: TNotificationTrigger): trigger is TOutboundTrigger {
  return (OUTBOUND_TRIGGERS as readonly string[]).includes(trigger);
}

/**
 * Reads every `WA_CONTENT_SID_*` param into a plain registry. Must run inside
 * a function invocation (param `.value()` is unavailable at module load).
 */
export function readContentSidRegistry(): TContentSidRegistry {
  const registry = {} as TContentSidRegistry;
  for (const trigger of OUTBOUND_TRIGGERS) {
    registry[trigger] = CONTENT_SID_PARAMS[trigger].value().trim();
  }
  return registry;
}

/**
 * PURE resolver (unit-tested without env): returns the configured SID for a
 * trigger+locale, or `null` when the trigger is inbound-only, the locale is
 * unsupported, or the SID is blank/unset (O-7).
 */
export function contentSidFromRegistry(
  registry: TContentSidRegistry,
  trigger: TNotificationTrigger,
  locale: string = 'en',
): string | null {
  if (locale !== 'en' || !isOutboundTrigger(trigger)) {
    return null;
  }
  const sid = registry[trigger];
  return sid.length > 0 ? sid : null;
}

/**
 * Production resolver closure: reads the env registry, then resolves. Passed
 * to `TwilioProvider` so the provider itself stays free of param plumbing and
 * remains unit-testable with an injected resolver.
 */
export function resolveContentSid(trigger: TNotificationTrigger, locale: string = 'en'): string | null {
  return contentSidFromRegistry(readContentSidRegistry(), trigger, locale);
}
