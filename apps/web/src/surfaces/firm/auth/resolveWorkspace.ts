import type { IWorkspaceClaimEntry, IWorkspaceClaims, TMemberRole } from '@siapp/shared';

const MEMBER_ROLES: readonly TMemberRole[] = ['owner', 'admin', 'pm', 'viewer'];

function isMemberRole(value: unknown): value is TMemberRole {
  return typeof value === 'string' && (MEMBER_ROLES as readonly string[]).includes(value);
}

function isClaimEntry(value: unknown): value is IWorkspaceClaimEntry {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    isMemberRole(entry['role']) &&
    Array.isArray(entry['departments']) &&
    entry['departments'].every((department) => typeof department === 'string')
  );
}

/**
 * Narrow raw ID-token claims into the shared `IWorkspaceClaims` shape.
 * Malformed entries are dropped rather than trusted.
 */
export function parseWorkspaceClaims(tokenClaims: Record<string, unknown>): IWorkspaceClaims {
  const raw = tokenClaims['workspaces'];
  const workspaces: Record<string, IWorkspaceClaimEntry> = {};

  if (raw !== null && typeof raw === 'object') {
    for (const [wid, entry] of Object.entries(raw)) {
      if (isClaimEntry(entry)) {
        workspaces[wid] = { role: entry.role, departments: entry.departments };
      }
    }
  }

  return { workspaces };
}

export type TWorkspaceResolution =
  | { kind: 'none' }
  | { kind: 'one'; workspaceId: string }
  | { kind: 'many'; workspaceIds: string[] };

/**
 * Pick the workspace to land on after sign-in: an explicit default wins when
 * it is still present in the claims (a stale default is ignored); otherwise a
 * single membership resolves directly and multiple memberships need a picker.
 */
export function resolveWorkspace(
  claims: IWorkspaceClaims,
  defaultWorkspaceId?: string,
): TWorkspaceResolution {
  const workspaceIds = Object.keys(claims.workspaces);

  if (defaultWorkspaceId !== undefined && workspaceIds.includes(defaultWorkspaceId)) {
    return { kind: 'one', workspaceId: defaultWorkspaceId };
  }

  const [first] = workspaceIds;
  if (first === undefined) {
    return { kind: 'none' };
  }
  if (workspaceIds.length === 1) {
    return { kind: 'one', workspaceId: first };
  }
  return { kind: 'many', workspaceIds };
}
