/**
 * Multi-client project helpers (#157). A project links to one or more clients
 * via `clientIds: string[]` (rules-queryable membership) + `clients: {id,name}[]`
 * (display denorm). During the migration window (#157 D5) the firm forms also
 * dual-write the legacy single `clientId`/`clientNameDenorm`, so these helpers
 * fall back to the legacy field for not-yet-backfilled docs. Pure — no Admin
 * SDK — so callers unit-test without emulators.
 */

/**
 * The project's linked client ids. Prefers the `clientIds` array; falls back to
 * the legacy single `clientId` for docs written/backfilled before #157.
 */
export function resolveProjectClientIds(
  projectData: Record<string, unknown> | undefined,
): string[] {
  const list = projectData?.['clientIds'];
  if (Array.isArray(list)) {
    return list.filter((v): v is string => typeof v === 'string' && v !== '');
  }
  const legacy = projectData?.['clientId'];
  return typeof legacy === 'string' && legacy !== '' ? [legacy] : [];
}

/**
 * The project's linked client display names, in link order. Prefers the
 * `clients` denorm array; falls back to the legacy `clientNameDenorm`.
 */
export function resolveProjectClientNames(
  projectData: Record<string, unknown> | undefined,
): string[] {
  const list = projectData?.['clients'];
  if (Array.isArray(list)) {
    const names = list
      .map((entry) =>
        entry !== null && typeof entry === 'object'
          ? (entry as Record<string, unknown>)['name']
          : undefined,
      )
      .filter((name): name is string => typeof name === 'string' && name !== '');
    if (names.length > 0) {
      return names;
    }
  }
  const legacy = projectData?.['clientNameDenorm'];
  return typeof legacy === 'string' && legacy !== '' ? [legacy] : [];
}

/** An `{id,name}` pair for one linked client. */
export interface IProjectClientRef {
  id: string;
  name: string;
}

/**
 * The project's linked clients as aligned `{id,name}` pairs, in link order.
 * Prefers the `clients` denorm array; falls back to the legacy single
 * `clientId`/`clientNameDenorm` for not-yet-backfilled docs.
 */
export function resolveProjectClients(
  projectData: Record<string, unknown> | undefined,
): IProjectClientRef[] {
  const list = projectData?.['clients'];
  if (Array.isArray(list)) {
    const refs: IProjectClientRef[] = [];
    for (const entry of list) {
      if (entry !== null && typeof entry === 'object') {
        const id = (entry as Record<string, unknown>)['id'];
        const name = (entry as Record<string, unknown>)['name'];
        if (typeof id === 'string' && id !== '') {
          refs.push({ id, name: typeof name === 'string' ? name : '' });
        }
      }
    }
    if (refs.length > 0) {
      return refs;
    }
  }
  const legacyId = projectData?.['clientId'];
  const legacyName = projectData?.['clientNameDenorm'];
  return typeof legacyId === 'string' && legacyId !== ''
    ? [{ id: legacyId, name: typeof legacyName === 'string' ? legacyName : '' }]
    : [];
}
