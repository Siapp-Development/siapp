import { describe, expect, it } from 'vitest';

import { deriveStatusBucket } from './insightsStatus.ts';
import type { IProjectRow } from '../projects/useProjects.ts';

type TLifecycleStatus = Pick<IProjectRow, 'lifecycle' | 'status'>;

const proj = (lifecycle: IProjectRow['lifecycle'], status: IProjectRow['status']): TLifecycleStatus => ({
  lifecycle,
  status,
});

describe('deriveStatusBucket', () => {
  it('maps the four friendly buckets from status', () => {
    expect(deriveStatusBucket(proj('published', 'planning'))).toBe('upcoming');
    expect(deriveStatusBucket(proj('published', 'active'))).toBe('in_progress');
    expect(deriveStatusBucket(proj('published', 'on_hold'))).toBe('on_hold');
    expect(deriveStatusBucket(proj('published', 'completed'))).toBe('completed');
  });

  it('classifies a lifecycle-completed/status-active project as completed (precedence)', () => {
    expect(deriveStatusBucket(proj('completed', 'active'))).toBe('completed');
  });

  it('classifies status-completed regardless of lifecycle', () => {
    expect(deriveStatusBucket(proj('published', 'completed'))).toBe('completed');
    expect(deriveStatusBucket(proj('completed', 'completed'))).toBe('completed');
  });

  it('excludes archived projects (returns null)', () => {
    expect(deriveStatusBucket(proj('published', 'archived'))).toBeNull();
    expect(deriveStatusBucket(proj('archived', 'archived'))).toBeNull();
  });

  it('excludes archived lifecycle before applying completed precedence', () => {
    // Archiving a completed project leaves status 'completed'; it must still drop
    // out of the vocabulary rather than surface as "completed".
    expect(deriveStatusBucket(proj('archived', 'completed'))).toBeNull();
    // An archived project whose status is still 'active' must not read as
    // "in progress" either.
    expect(deriveStatusBucket(proj('archived', 'active'))).toBeNull();
  });

  it('excludes deleted lifecycle (returns null)', () => {
    expect(deriveStatusBucket(proj('deleted', 'active'))).toBeNull();
  });
});
