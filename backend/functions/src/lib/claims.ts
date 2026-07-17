/**
 * Pure claims helpers for syncMemberClaims — kept free of Admin SDK imports
 * so they unit-test without emulators.
 *
 * The role/claim shapes mirror `IWorkspaceClaims` in @siapp/shared
 * (packages/shared/src/firestoreTypes.ts). The shared package is source-only
 * with .ts-extension imports, which this package's NodeNext tsc build cannot
 * consume, so the contract is mirrored here; the rules tests assert the same
 * shape against firestore.rules using the shared types.
 */

export const MEMBER_ROLES = ['owner', 'admin', 'pm', 'viewer'] as const;
export type TMemberRole = (typeof MEMBER_ROLES)[number];

export interface IWorkspaceClaimEntry {
  role: TMemberRole;
  departments: string[];
}

export interface IWorkspaceClaims {
  workspaces: Record<string, IWorkspaceClaimEntry>;
}

/** One membership doc, reduced to the fields that land in claims. */
export interface IMembershipRecord {
  workspaceId: string;
  role: TMemberRole;
  departments: string[];
}

/** Firebase caps custom claims at 1000 bytes; warn well before the cliff. */
export const CLAIMS_WARN_BYTES = 800;

export function isMemberRole(value: unknown): value is TMemberRole {
  return typeof value === 'string' && (MEMBER_ROLES as readonly string[]).includes(value);
}

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

/** Rebuild the FULL claims payload from every membership doc of one user. */
export function buildClaimsPayload(memberships: IMembershipRecord[]): IWorkspaceClaims {
  const workspaces: Record<string, IWorkspaceClaimEntry> = {};
  for (const membership of memberships) {
    workspaces[membership.workspaceId] = {
      role: membership.role,
      departments: [...membership.departments],
    };
  }
  return { workspaces };
}

function sameStringArray(a: unknown, b: unknown): boolean {
  const left = toStringArray(a);
  const right = toStringArray(b);
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

/**
 * True when a member-doc write cannot change the claims payload — i.e. an
 * update that left both `role` and `departments` untouched. Creates and
 * deletes always sync.
 */
export function isClaimsNoOp(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): boolean {
  if (before === undefined && after === undefined) {
    return true;
  }
  if (before === undefined || after === undefined) {
    return false;
  }
  return (
    before['role'] === after['role'] &&
    sameStringArray(before['departments'], after['departments'])
  );
}

/** Serialized byte size of the payload (the 1000-byte limit counts bytes, not chars). */
export function claimsPayloadSizeBytes(payload: IWorkspaceClaims): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length;
}
