/**
 * Cross-package constants shared between the web app and Cloud Functions.
 */

import type { IQuietHoursSettings, ITaskNotifyConfig } from './firestoreTypes.ts';

/**
 * Approximate cost of one WhatsApp utility conversation in Malaysia
 * (pm_ux/plans/21-cost-estimation.md §2.8, June 2026). Used for the
 * publish-dialog cost preview (D-027); refined when billing lands (#24).
 */
export const WA_UTILITY_COST_MYR = 0.1;

/** Max upload size for project/task documents (#14) — enforced in storage.rules and firestore.rules; keep the three in sync. */
export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Content types accepted for document uploads (#14). Mirrored verbatim in
 * storage.rules (parity enforced by a rules test). `image/svg+xml` is
 * deliberately excluded — SVGs can carry scripts and we preview inline.
 */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
] as const;

/** Subset of the allowlist the web app previews inline (iframe/img); the rest are download-only (#14). */
export const PREVIEWABLE_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

/**
 * A collaborator counts as "Active" on the A7 list when a task they were
 * assigned to was completed within this window (#16); otherwise "Idle".
 * `lastTaskAt` is stamped server-side by the onTaskWrite trigger. A
 * configurable threshold (Settings → Team) is a deferred follow-up.
 */
export const COLLABORATOR_ACTIVE_WINDOW_DAYS = 60;

/**
 * Workspace quiet-hours defaults (#18, D1/D6) — an absent
 * `workspaces/{wid}.notifications` map means exactly this. Mirrored in
 * backend/functions/src/lib/quietHours.ts (source-only package boundary).
 */
export const QUIET_HOURS_DEFAULT = {
  enabled: true,
  start: '21:00',
  end: '08:00',
  timezone: 'Asia/Kuala_Lumpur',
} as const satisfies IQuietHoursSettings;

/** Due-soon sweep window (#18, D5): tasks due within the next 24 h. */
export const DUE_SOON_WINDOW_HOURS = 24;

/**
 * Effective per-task notify config when the task's `notify` map is absent
 * (#18, D2) — preserves pre-#18 behaviour (client gets updates) with zero
 * backfill. Mirrored in backend/functions/src/lib/notifyConfig.ts.
 */
export const TASK_NOTIFY_DEFAULTS = {
  statusChange: true,
  dueSoon: true,
  blocked: true,
  toClient: true,
  toInternal: false,
} as const satisfies ITaskNotifyConfig;

/**
 * Max upload size for client portal uploads (#21, D-034) — enforced in
 * storage.rules and firestore.rules; keep the three in sync.
 */
export const MAX_CLIENT_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Content types accepted for client portal uploads (#21, D-034): PDF, images
 * and Word only — a deliberate subset of ALLOWED_DOCUMENT_MIME_TYPES.
 * Mirrored verbatim in storage.rules and firestore.rules (parity enforced by
 * a rules test). No image/svg+xml — SVGs can carry scripts.
 */
export const CLIENT_ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
] as const;

/**
 * Portal magic-link lifetime (#21, D2): 90 days from issue. Expiry is
 * enforced at redemption; live sessions are bounded by the lifecycle
 * re-check in firestore.rules (D-027). Mirrored in
 * backend/functions/src/lib/portalTokens.ts.
 */
export const PORTAL_LINK_TTL_DAYS = 90;
