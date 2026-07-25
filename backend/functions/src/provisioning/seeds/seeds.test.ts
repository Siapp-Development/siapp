import { describe, expect, it } from 'vitest';

import type { ISeedDefinition } from '../seedTypes.js';
import { buildingApprovalSeed } from './buildingApproval.js';
import { conveyancingSeed } from './conveyancing.js';
import { residentialBuildSeed } from './residentialBuild.js';

const SEEDS: [string, ISeedDefinition][] = [
  ['residentialBuildSeed', residentialBuildSeed],
  ['buildingApprovalSeed', buildingApprovalSeed],
  ['conveyancingSeed', conveyancingSeed],
];

describe.each(SEEDS)('%s integrity', (_name, seed) => {
  it('has unique task ids', () => {
    const ids = seed.tasks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique, 1-based sequential task orders (deterministic Firestore ids)', () => {
    // writeStarterProject derives doc ids from `order`, so duplicates would
    // silently overwrite tasks inside the batch.
    const orders = seed.tasks.map((t) => t.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i + 1));
  });

  it('has unique phase ids with sequential orders', () => {
    const ids = seed.phases.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const orders = seed.phases.map((p) => p.order).sort((a, b) => a - b);
    expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i + 1));
  });

  it('references only existing phases from tasks', () => {
    const phaseIds = new Set(seed.phases.map((p) => p.id));
    for (const task of seed.tasks) {
      expect(phaseIds.has(task.phaseRef), `task ${task.id} → ${task.phaseRef}`).toBe(true);
    }
  });

  it('resolves every dependsOn reference to a seed task', () => {
    const taskIds = new Set(seed.tasks.map((t) => t.id));
    for (const task of seed.tasks) {
      for (const dep of task.dependsOn ?? []) {
        expect(taskIds.has(dep), `task ${task.id} dependsOn ${dep}`).toBe(true);
      }
    }
  });

  it('marks every milestone (client-visible task) for WhatsApp notification', () => {
    for (const task of seed.tasks) {
      expect(task.sendWhatsapp, `task ${task.id}`).toBe(task.visibleToClient);
    }
  });

  it('fits in a single Firestore batch (500 ops)', () => {
    // 1 project doc + phases + tasks.
    expect(1 + seed.phases.length + seed.tasks.length).toBeLessThan(500);
  });
});

describe('buildingApprovalSeed', () => {
  it('belongs to the construction vertical with its own label', () => {
    expect(buildingApprovalSeed.vertical).toBe('construction');
    expect(buildingApprovalSeed.label).toBe('Building Plan Approval');
  });

  it('covers the Malaysian approval flow end to end', () => {
    const phaseNames = buildingApprovalSeed.phases.map((p) => p.name);
    expect(phaseNames).toEqual([
      'Appointment & Preliminary Design',
      'KM Submission (Kebenaran Merancang)',
      'Building Plan (BP) Submission',
      'Infrastructure & Start-Work Permit',
      'Construction Stage',
      'CCC (Certificate of Completion & Compliance)',
      'Final Handover',
    ]);
  });

  it('chains phases sequentially via dependsOn on each phase-opening task', () => {
    // First task of phase N+1 depends on the last task of phase N.
    const openers = buildingApprovalSeed.tasks.filter((t) => (t.dependsOn ?? []).length > 0);
    expect(openers.map((t) => t.id)).toEqual([
      't-km-01',
      't-bp-01',
      't-in-01',
      't-cs-01',
      't-cc-01',
      't-ho-01',
    ]);
  });
});
