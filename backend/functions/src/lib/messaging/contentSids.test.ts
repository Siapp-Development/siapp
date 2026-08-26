import { describe, expect, it } from 'vitest';

import {
  OUTBOUND_TRIGGERS,
  contentSidFromRegistry,
  isOutboundTrigger,
  type TContentSidRegistry,
} from './contentSids.js';

/** A fully-populated registry with a distinct HX per outbound trigger. */
function fullRegistry(): TContentSidRegistry {
  return {
    project_welcome: 'HX_project_welcome',
    task_assigned: 'HX_task_assigned',
    task_status_change: 'HX_task_status_change',
    task_due_soon: 'HX_task_due_soon',
    task_blocked: 'HX_task_blocked',
    need_help: 'HX_need_help',
    wa_quota_90: 'HX_wa_quota_90',
    collab_access_link: 'HX_collab_access_link',
  };
}

describe('contentSidFromRegistry', () => {
  it('returns the configured SID for a known outbound trigger + en', () => {
    expect(contentSidFromRegistry(fullRegistry(), 'task_status_change', 'en')).toBe(
      'HX_task_status_change',
    );
  });

  it('defaults locale to en when omitted', () => {
    expect(contentSidFromRegistry(fullRegistry(), 'task_assigned')).toBe('HX_task_assigned');
  });

  it('resolves every outbound trigger', () => {
    const registry = fullRegistry();
    for (const trigger of OUTBOUND_TRIGGERS) {
      expect(contentSidFromRegistry(registry, trigger, 'en')).toBe(`HX_${trigger}`);
    }
  });

  it('returns null when the SID is blank (unset param)', () => {
    const registry = { ...fullRegistry(), task_due_soon: '' };
    expect(contentSidFromRegistry(registry, 'task_due_soon', 'en')).toBeNull();
  });

  it('returns null for a non-en locale (D-026 defers ms)', () => {
    expect(contentSidFromRegistry(fullRegistry(), 'task_status_change', 'ms')).toBeNull();
  });

  it('returns null for an inbound-only trigger (no outbound template)', () => {
    expect(contentSidFromRegistry(fullRegistry(), 'inbound_auto_reply', 'en')).toBeNull();
  });
});

describe('isOutboundTrigger', () => {
  it('is true for outbound triggers', () => {
    expect(isOutboundTrigger('collab_access_link')).toBe(true);
    expect(isOutboundTrigger('wa_quota_90')).toBe(true);
  });

  it('is false for the inbound-only trigger', () => {
    expect(isOutboundTrigger('inbound_auto_reply')).toBe(false);
  });

  it('lists exactly the 8 outbound triggers', () => {
    expect(OUTBOUND_TRIGGERS).toHaveLength(8);
    expect(OUTBOUND_TRIGGERS).not.toContain('inbound_auto_reply');
  });
});
