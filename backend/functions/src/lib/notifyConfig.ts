/**
 * Per-task notification config resolution + status-diff trigger detection
 * (#18, D2/D4). Pure — unit-tests without emulators.
 *
 * Mirrors TASK_NOTIFY_DEFAULTS in @siapp/shared (source-only package this
 * NodeNext build cannot consume).
 */

export interface ITaskNotifyConfig {
  statusChange: boolean;
  dueSoon: boolean;
  blocked: boolean;
  toClient: boolean;
  toInternal: boolean;
}

/** D2: an absent `notify` map preserves pre-#18 behaviour. */
export const TASK_NOTIFY_DEFAULTS: ITaskNotifyConfig = {
  statusChange: true,
  dueSoon: true,
  blocked: true,
  toClient: true,
  toInternal: false,
};

/**
 * Effective notify config off a raw task doc: absent map (all pre-#18 tasks)
 * or malformed keys fall back to defaults key by key.
 */
export function resolveNotify(taskData: Record<string, unknown> | undefined): ITaskNotifyConfig {
  const raw = taskData?.['notify'];
  const map =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : undefined;
  const pick = (key: keyof ITaskNotifyConfig): boolean =>
    typeof map?.[key] === 'boolean' ? (map[key] as boolean) : TASK_NOTIFY_DEFAULTS[key];
  return {
    statusChange: pick('statusChange'),
    dueSoon: pick('dueSoon'),
    blocked: pick('blocked'),
    toClient: pick('toClient'),
    toInternal: pick('toInternal'),
  };
}

/**
 * Trigger fired by a task write's status diff (D4): a transition INTO
 * 'blocked' fires `blocked`; any other status transition fires
 * `statusChange`; creates, deletes, and non-status writes fire nothing.
 */
export function triggersFor(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): 'statusChange' | 'blocked' | null {
  if (before === undefined || after === undefined) {
    return null;
  }
  const from = before['status'];
  const to = after['status'];
  if (typeof from !== 'string' || typeof to !== 'string' || from === to) {
    return null;
  }
  return to === 'blocked' ? 'blocked' : 'statusChange';
}
