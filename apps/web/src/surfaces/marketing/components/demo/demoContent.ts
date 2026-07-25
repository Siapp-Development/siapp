/**
 * Fixture content for the product demonstrations (impl-28 §3). Single source
 * for the hero scene and the industry switcher so both surfaces stay
 * consistent. All names/places are realistic Malaysian examples, per brief.
 */

export type TIndustry = 'construction' | 'legal';

export interface IDemoTask {
  id: string;
  title: string;
  status: 'done' | 'in-progress' | 'todo';
  due?: string;
}

export interface IIndustryDemo {
  industry: TIndustry;
  label: string;
  firmName: string;
  projectLabel: string;
  projectName: string;
  clientName: string;
  phases: string[];
  currentPhase: string;
  tasks: IDemoTask[];
  progressPct: number;
  nextMilestone: string;
  nextMilestoneDate: string;
  whatsappMessage: string;
}

export const CONSTRUCTION_DEMO: IIndustryDemo = {
  industry: 'construction',
  label: 'Construction',
  firmName: 'Lim Builders',
  projectLabel: 'Project',
  projectName: 'The Vue Phase 2',
  clientName: 'Aisha Rahman',
  phases: ['Design', 'Approvals', 'Site preparation', 'Structural', 'MEP', 'Finishing', 'Handover'],
  currentPhase: 'Structural',
  tasks: [
    { id: 'c1', title: 'Steel frame inspection', status: 'done', due: '28 Jul' },
    { id: 'c2', title: 'Roof installation', status: 'in-progress', due: '4 Aug' },
    { id: 'c3', title: 'Ceiling works', status: 'todo', due: '18 Aug' },
  ],
  progressPct: 64,
  nextMilestone: 'Ceiling works',
  nextMilestoneDate: '18 Aug 2026',
  whatsappMessage:
    'Hi Aisha, roof installation at The Vue Phase 2 is now complete. Next: ceiling works. View your project: siapp.app/p/demo',
};

export const LEGAL_DEMO: IIndustryDemo = {
  industry: 'legal',
  label: 'Legal',
  firmName: 'Tan & Partners',
  projectLabel: 'Matter',
  projectName: 'Conveyancing — 14 Jalan Maarof',
  clientName: 'Daniel Wong',
  phases: [
    'Engagement',
    'Title search',
    'Sale and purchase agreement',
    'Loan documentation',
    'Stamp duty',
    'Transfer',
    'Vacant possession',
  ],
  currentPhase: 'Sale and purchase agreement',
  tasks: [
    { id: 'l1', title: 'Title search completed', status: 'done', due: '14 Jul' },
    { id: 'l2', title: 'Sale and purchase agreement signed', status: 'in-progress', due: '1 Aug' },
    { id: 'l3', title: 'Loan documentation', status: 'todo', due: '22 Aug' },
  ],
  progressPct: 43,
  nextMilestone: 'Loan documentation',
  nextMilestoneDate: '22 Aug 2026',
  whatsappMessage:
    'Hi Daniel, your sale and purchase agreement for 14 Jalan Maarof has been signed. Loan documentation is the next stage. View your matter: siapp.app/p/demo',
};

export const INDUSTRY_DEMOS: Record<TIndustry, IIndustryDemo> = {
  construction: CONSTRUCTION_DEMO,
  legal: LEGAL_DEMO,
};

/** Hero scene end-state values after "Mark task complete" runs. */
export const HERO_COMPLETED = {
  progressPct: 68,
  portalUpdate: 'Roof installation complete',
} as const;
