/**
 * Local type mirrors for admin functions.
 *
 * The @siapp/shared package uses .ts-extension imports which are incompatible
 * with this package's NodeNext tsc build. Types used by admin functions are
 * mirrored here; the shared package remains the source of truth.
 */

export type TWorkspacePlan = 'trial' | 'standard' | 'business';

/** Mirrors `TBillingStatus` from @siapp/shared (#24). Absent = 'active'. */
export type TBillingStatus = 'active' | 'read_only';

export type TAdminAction =
  | 'workspace.provision'
  | 'workspace.plan_change'
  | 'workspace.seat_adjust'
  | 'workspace.renewal_adjust'
  | 'workspace.status_change'
  | 'user.impersonate';

/** `/adminLog/{alid}` — mirrors `IAdminLogDoc` from @siapp/shared. */
export interface IAdminLogDoc {
  id: string;
  actorUid: string;
  actorEmail: string;
  action: TAdminAction;
  targetType: 'workspace' | 'user';
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
  ts: Date;
}
