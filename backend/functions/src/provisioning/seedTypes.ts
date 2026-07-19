/** Interfaces for vertical starter-project seed definitions (D-031). */

export interface ITaskDef {
  /** Stable local id used for dependency references within this seed. */
  id: string;
  title: string;
  order: number;
  /** Matches `IPhaseDef.id` of the phase this task belongs to. */
  phaseRef: string;
  /** ITaskDef.id values this task depends on (within this seed). */
  dependsOn?: string[];
  visibleToClient: boolean;
  sendWhatsapp: boolean;
  restrictedToDepartments: string[];
}

export interface IPhaseDef {
  /** Stable local id — also used as the Firestore phase doc ID. */
  id: string;
  name: string;
  order: number;
}

export interface ISeedDefinition {
  vertical: 'construction' | 'legal';
  /** Human-readable label, e.g. "Residential Build". */
  label: string;
  phases: IPhaseDef[];
  tasks: ITaskDef[];
}
