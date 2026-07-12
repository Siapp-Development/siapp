---
title: "Firestore Data Model"
status: draft
updated: 2026-07-12
---

# Firestore Data Model

Closes **Q44** (blocker). Locks the structural choice that everything downstream depends on.

## Design principles

1. **Workspace-scoped subcollections.** Every customer-data document lives under `/workspaces/{wid}/…`. Security rule = one ownership check.
2. **Denormalize for read patterns.** Names, counts, and rollups are duplicated onto parent docs so dashboards render in one read. Cloud Functions keep them consistent.
3. **No joins, no cross-workspace queries** at MVP. If a use case needs them, it's a v2 feature, not a data-model change.
4. **Magic-link access is server-mediated.** Collaborators and clients never touch Firestore from the client. A Cloud Run endpoint validates the JWT and uses the Admin SDK with `withConverter`-style scope checks.
5. **Pre-aggregate, don't compute.** Counts (`summary.totalTasks`, `usageCounters`) are maintained on writes — never computed at read time.
6. **Indexes are part of the model.** Every list view in the UI maps to a composite index defined upfront.

## Three actors recap (from collaborator design)

| Actor | Auth method | Reaches Firestore via |
|---|---|---|
| Firm staff (member) | Firebase Auth (email/password, magic link, Google) | Direct client SDK + security rules |
| Client | Magic link in WhatsApp | Cloud Run endpoint (server-side) |
| Collaborator | Magic link in WhatsApp | Cloud Run endpoint (server-side) |

## Top-level collections

```
firestore/
├── users/{uid}              ← Firebase Auth profile (firm staff only)
├── phoneIndex/{phoneE164}   ← Phone → collaborator/client refs (cross-workspace lookup)
└── workspaces/{wid}/…       ← Everything else is workspace-scoped
```

### `users/{uid}`

One per Firebase Auth user. Only firm staff have records here — clients and collaborators do **not** create Firebase Auth users.

```typescript
{
  uid: string,                  // matches Firebase Auth UID
  email: string,
  displayName: string,
  photoUrl?: string,
  phone?: string,
  defaultWorkspaceId?: string,  // last-visited
  locale: 'en' | 'ms',
  createdAt: Timestamp,
  lastSeenAt: Timestamp
}
```

Workspace memberships live in `workspaces/{wid}/members/{uid}` and are mirrored to Firebase Auth custom claims.

### `phoneIndex/{phoneE164}`

Indexed by E.164 phone number (e.g. `+60123456789`). Lets us find "which workspaces have invited Ahmad?" without scanning every workspace.

```typescript
{
  phone: string,
  refs: Array<{
    workspaceId: string,
    type: 'collaborator' | 'client',
    refId: string,
    addedAt: Timestamp
  }>,
  updatedAt: Timestamp
}
```

Maintained by Cloud Function on collaborator/client create or delete.

## Workspace tree

```
workspaces/{wid}
├── (workspace doc)
├── members/{uid}
├── departments/{depId}
├── clients/{cid}
├── collaborators/{colid}
├── projects/{pid}
│   ├── (project doc)
│   ├── phases/{phid}
│   ├── tasks/{tid}
│   │   ├── (task doc)
│   │   └── updates/{updid}
│   ├── documents/{did}
│   └── milestones/{mid}
├── magicLinks/{shortCode}
├── messages/{mid}
├── auditLog/{alid}
└── usageCounters/{period}    // e.g. "2026-07"
```

### `workspaces/{wid}` — workspace document

```typescript
{
  id: string,
  name: string,
  slug: string,                // URL slug, unique
  ownerId: string,             // creator's uid
  plan: 'trial' | 'standard' | 'business',   // MVP: all paying workspaces = 'standard' (single tier per D-030); other values reserved for post-MVP
  planExpiresAt: Timestamp,
  seatLimit: number,
  seatsUsed: number,           // maintained by Cloud Function on member changes
  branding: {
    logoUrl?: string,
    primaryColor?: string      // hex
    // customDomain: post-MVP (D-030). Not written or read in MVP.
  },
  whatsappAllowance: {
    includedPerPeriod: number, // e.g. 50 × seatsUsed
    periodStart: Timestamp,    // monthly reset
    used: number               // pulled from usageCounters on read; cached here for quick checks
  },
  defaultLocale: 'en' | 'ms',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `workspaces/{wid}/members/{uid}` — firm staff

```typescript
{
  uid: string,
  email: string,
  displayName: string,
  role: 'owner' | 'admin' | 'pm' | 'viewer',
  departments: string[],       // department ids; see 20-access-control-departments.md
  seatActive: boolean,         // counts against seatLimit when true
  joinedAt: Timestamp,
  invitedBy: string            // uid
}
```

**Roles:**

| Role | Capabilities |
|---|---|
| `owner` | Everything + delete workspace + change plan |
| `admin` | Everything except change plan / delete workspace |
| `pm` | Create/edit projects, tasks, clients, collaborators; cannot manage members or billing |
| `viewer` | Read-only |

Roles answer *what you can do*. **Departments** (separate, orthogonal axis) answer *what restricted content you can see*. Details in [20-access-control-departments.md](./20-access-control-departments.md).

### `workspaces/{wid}/departments/{depId}` — internal access groups

```typescript
{
  id: string,                // slug, e.g. "finance"
  name: string,              // display, e.g. "Finance"
  description?: string,
  color?: string,            // hex, for badge rendering
  createdAt: Timestamp,
  createdBy: string,         // uid
  memberCount: number        // maintained by Cloud Function
}
```

### `workspaces/{wid}/clients/{cid}`

End-customer contacts. **Free** — do not count against any limit.

```typescript
{
  id: string,
  name: string,
  phone: string,              // E.164
  email?: string,
  companyName?: string,
  language: 'en' | 'ms',
  notes?: string,
  notificationsOptOut?: boolean, // set by STOP keyword on inbound webhook (D-035); suppresses all outbound WA/SMS
  createdAt: Timestamp,
  createdBy: string
}
```

### `workspaces/{wid}/collaborators/{colid}`

External parties (subcontractors, vendors). **Free** — do not count against any limit.

```typescript
{
  id: string,
  name: string,
  phone: string,              // E.164, primary identifier
  email?: string,
  company?: string,
  trade?: string,             // "Electrician", "Surveyor"
  type: 'individual' | 'company',
  status: 'active' | 'archived',
  notificationsOptOut?: boolean, // set by STOP keyword on inbound webhook (D-035); suppresses all outbound WA/SMS
  createdAt: Timestamp,
  invitedBy: string,          // uid
  lastTaskAt?: Timestamp      // for sorting "frequently used"
}
```

### `workspaces/{wid}/projects/{pid}`

```typescript
{
  id: string,
  name: string,
  code?: string,              // short reference (e.g. "VUE-12")
  vertical: 'construction' | 'legal' | 'other',

  // Project lifecycle (D-027). Controls outbound notifications + external access.
  // See "Project lifecycle & notification gate" section below.
  lifecycle: 'draft' | 'published' | 'completed' | 'archived' | 'deleted',
  publishedAt?: Timestamp,
  completedAt?: Timestamp,
  archivedAt?: Timestamp,
  deletedAt?: Timestamp,            // soft delete; hard purge handled by retention job

  // Workflow status (independent of lifecycle — describes execution state, not external visibility)
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'archived',

  // Provenance. Set when the project was created via Duplicate (D-031); absent for blank projects and
  // for the Siapp-Admin-seeded starter project. Never used for permission checks — audit only.
  duplicatedFromProjectId?: string,

  clientId: string,
  clientNameDenorm: string,   // for project list rendering

  ownerUid: string,
  ownerNameDenorm: string,

  startDate: Timestamp,         // required in MVP for the client-portal timespan visualization (D-034)
  targetEndDate?: Timestamp,
  actualEndDate?: Timestamp,

  summary: {                  // maintained by Cloud Function on task writes
    totalTasks: number,
    doneTasks: number,
    overdueTasks: number,
    progressPct: number,
    lastActivityAt: Timestamp
  },

  visibility: {
    clientCanSee: boolean,    // master switch; per-task overrides below
    collaboratorsCount: number
  },

  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: string
}
```

### `workspaces/{wid}/projects/{pid}/phases/{phid}` — optional grouping

```typescript
{
  id: string,
  name: string,
  order: number,
  startDate?: Timestamp,
  endDate?: Timestamp,
  status: 'todo' | 'in_progress' | 'done'
}
```

### `workspaces/{wid}/projects/{pid}/tasks/{tid}`

```typescript
{
  id: string,
  title: string,
  description?: string,
  phaseId?: string,
  status: 'todo' | 'in_progress' | 'blocked' | 'done',

  dueDate?: Timestamp,
  completedAt?: Timestamp,

  assignees: Array<
    | { type: 'user',         id: string, name: string }
    | { type: 'collaborator', id: string, name: string, phone: string }
  >,

  // NOTE: `requiresPhoto`, `requiresFirmApproval`, and `pendingApproval` were removed in D-032.
  // Existing docs with these fields are ignored (Firestore is schemaless). Do not read them in new code.

  visibleToClient: boolean,        // default from project.visibility.clientCanSee
  visibleToCollaboratorIds: string[], // empty = all assigned collaborators see it
  restrictedToDepartments: string[],  // empty/missing = unrestricted; see 20-access-control-departments.md

  order: number,                   // for manual sort within phase / board
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: string
}
```

### `workspaces/{wid}/projects/{pid}/tasks/{tid}/updates/{updid}` — activity stream

Append-only. Drives task page activity feed, audit, and notifications.

```typescript
{
  id: string,
  authorType: 'user' | 'collaborator' | 'client' | 'system',
  authorId: string,
  authorNameDenorm: string,
  source: 'web' | 'system',      // 'whatsapp' reserved post-MVP — inbound WA is not processed at MVP (D-035)
  action:
    | 'status_change'
    | 'eta_change'
    | 'comment'
    | 'photo_added'
    | 'doc_added'
    | 'doc_deleted'
    | 'assigned'
    | 'approved'
    | 'rejected',
  payload: {
    from?: any,
    to?: any,
    text?: string,
    storagePath?: string,
    mimeType?: string
  },
  createdAt: Timestamp
}
```

### `workspaces/{wid}/projects/{pid}/documents/{did}`

```typescript
{
  id: string,
  name: string,
  mimeType: string,
  sizeBytes: number,
  storagePath: string,           // Firebase Storage path. Client uploads land under `.../projects/{projId}/client-uploads/{uuid}-{filename}` per D-034.
  scope: 'project' | 'task',
  scopeId: string,
  uploadedBy: string,            // uid, colid, or cid (client)
  uploaderType: 'firm_member' | 'collaborator' | 'client',  // D-034: client uploads via portal are always `uploaderType: 'client'`, `scope: 'project'`, `visibleToClient: true`.
  uploadedAt: Timestamp,
  visibleToClient: boolean,      // for task-scoped docs: defaults to the parent task's `visibleToClient` at upload time. Applies equally to firm and collaborator uploads (D-029). Client-uploaded docs are always true.
  visibleToCollaboratorIds: string[],
  restrictedToDepartments: string[], // inherits task restriction; can be set directly for project-scoped docs. Client uploads always start with `[]` (unrestricted within the firm).
  scanStatus: 'pending' | 'clean' | 'infected',
  retentionUntil?: Timestamp,    // for Q54 — set on project close
  deletedAt?: Timestamp,         // soft delete; see deletion rules below (D-029)
  deletedBy?: string,            // uid, colid, or cid
  deletedByType?: 'firm_member' | 'collaborator' | 'client'
}
```

**Upload size caps:**

- Firm members: 25 MB per file.
- Collaborators: 25 MB per file.
- Clients (D-034): **10 MB per file.** Prevents accidental video dumps from mobile.

**Deletion rules (D-029 + D-034):**

- Firm users (owner / admin / pm with project access) can soft-delete any document.
- A collaborator can soft-delete a document **only if** all of: `uploaderType == 'collaborator'`, `uploadedBy == request.colid`, `scope == 'task'`, `scopeId` is a task they are currently assigned to, and `scanStatus != 'infected'` (infected files stay quarantined regardless).
- A client (D-034) can soft-delete a document **only if** all of: `uploaderType == 'client'`, `uploadedBy == request.cid`, `scope == 'project'`, `scopeId` is the client's own project, and the document was uploaded < 24 hours ago (grace window for wrong-file recovery). After 24h, only firm members can delete.
- Soft delete only sets `deletedAt` / `deletedBy` / `deletedByType` and hides the doc from listings; the Storage object and activity record (`action: 'doc_added'`) remain for audit.
- Hard purge is performed by the retention job once `retentionUntil` passes; no UI exposes hard delete.
- A successful delete writes a corresponding `updates/{updid}` entry with `action: 'doc_deleted'` so the firm sees it in the activity feed.

### `workspaces/{wid}/projects/{pid}/milestones/{mid}` — client-facing checkpoints

```typescript
{
  id: string,
  name: string,
  targetDate: Timestamp,
  completedAt?: Timestamp,
  order: number,
  description?: string
}
```

> **Project templates removed from MVP (D-031).** The `workspaces/{wid}/templates/{tplid}` collection that previously held vertical project blueprints has been removed. New projects in MVP are created via one of two paths:
>
> 1. **Siapp-Admin starter project** — the tenant-provisioning script ([Z2]) writes one starter project per new firm from a hardcoded internal seed (`functions/src/provisioning/seeds/{residentialBuild,conveyancing}.ts`). Phases + tasks land directly in `phases/` and `tasks/` subcollections under the new project; no template doc exists.
> 2. **Duplicate project** — firm picks an existing project from the projects list and clicks Duplicate. The duplicate copies task titles, order, phase grouping, dependency links, `restrictedToDepartments`, `visibleToClient`, and WhatsApp toggles only. Assignees, dates, statuses, updates, documents, and client/collaborator assignments are cleared. `duplicatedFromProjectId` is set on the new project doc.
>
> Re-introduction path (post-MVP): add `workspaces/{wid}/templates/{tplid}` as a new subcollection and an optional `templateId` field on `projects/{pid}` — both additive, no migration needed.

### `workspaces/{wid}/magicLinks/{shortCode}` — collaborator + client tokens
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### `workspaces/{wid}/magicLinks/{shortCode}` — collaborator + client tokens

`shortCode` is the URL-safe identifier (e.g. `a8K2pQ`). Looked up first, then validated against the JWT.

```typescript
{
  shortCode: string,           // doc id
  audience: 'collaborator' | 'client',
  scopeType: 'task' | 'project',
  scopeId: string,             // taskId or projectId
  subjectId: string,           // colid or cid
  issuedAt: Timestamp,
  expiresAt: Timestamp,
  lastUsedAt?: Timestamp,
  useCount: number,
  revoked: boolean,
  revokedAt?: Timestamp,
  revokedBy?: string
}
```

JWT signature is verified server-side; this doc enables fast lookup, revocation, and usage tracking.

### `workspaces/{wid}/messages/{mid}` — outbound WhatsApp/SMS log

```typescript
{
  id: string,
  channel: 'whatsapp' | 'sms',
  recipientPhone: string,
  recipientType: 'client' | 'collaborator',
  recipientId: string,
  templateName: string,
  variables: Record<string, string>,
  status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed',
  twilioSid?: string,
  conversationId?: string,     // Twilio conversation grouping
  errorCode?: string,
  costEstimateMyr: number,
  relatedTo?: {                // back-pointer for activity feed
    type: 'task' | 'project' | 'milestone',
    id: string
  },
  createdAt: Timestamp,
  sentAt?: Timestamp,
  deliveredAt?: Timestamp
}
```

### `workspaces/{wid}/auditLog/{alid}`

```typescript
{
  id: string,
  actorType: 'user' | 'collaborator' | 'client' | 'system' | 'admin',
  actorId: string,
  action: string,              // 'project.create', 'task.assign', 'plan.upgrade', ...
  targetType: string,
  targetId: string,
  before?: any,
  after?: any,
  ip?: string,
  userAgent?: string,
  ts: Timestamp
}
```

### `workspaces/{wid}/usageCounters/{period}` — monthly rollups

`period` is `YYYY-MM` (e.g. `2026-07`).

```typescript
{
  period: string,
  whatsappConv: number,         // counted on Twilio webhook delivery
  smsSegments: number,
  storageBytes: number,
  activeProjects: number,
  membersBilled: number,
  computedAt: Timestamp
}
```

Use **sharded counter** pattern if a workspace can produce > 100 message events/min (see "Hot-doc protection" below).

## Custom claims (Firebase Auth)

Set by Cloud Function on member create/update/delete.

```typescript
user.customClaims = {
  workspaces: {
    'wks_lim':  { role: 'owner', departments: [] },
    'wks_kpmg': { role: 'pm',    departments: ['finance'] }
  }
}
```

Security rules read this for O(1) membership + role + department checks without an extra Firestore read. Watch the 1 KB claims budget; if it's ever exceeded, drop `departments` from claims and read `members/{uid}` once per session.

## Required composite indexes

Define in `firestore.indexes.json`. List view → index mapping:

| View | Collection group | Index |
|---|---|---|
| Workspace project list | `projects` | `status ASC, summary.lastActivityAt DESC` |
| Timeline board (grouped by status within phase) | `tasks` | `status ASC, order ASC` |
| Overdue tasks | `tasks` | `status ASC, dueDate ASC` |
| My tasks (across projects) | `tasks` (collection group) | `assignees.id ASC, status ASC, dueDate ASC` |
| Task activity feed | `updates` | `createdAt DESC` (single-field; default) |
| Failed messages dashboard | `messages` | `status ASC, createdAt DESC` |
| Active magic links | `magicLinks` | `revoked ASC, expiresAt DESC` |
| Collaborator history | `tasks` (collection group) | `assignees.id ASC, completedAt DESC` |

**Collection-group queries** are used sparingly — only for "my tasks" cross-project view. Each requires explicit indexing.

## Hot-doc protection

## Project lifecycle & notification gate (D-027)

Every project carries a `lifecycle` field, set on create and changed only by explicit firm action. This is the **single gate** for all outbound WhatsApp/SMS to clients and collaborators, plus external access to the portal and collaborator task page.

| Lifecycle state | Set when | Outbound WA / SMS | Client portal access | Collaborator magic links | Editable by firm |
|---|---|---|---|---|---|
| `draft` (default on create) | Project created (blank, duplicated, or Siapp-Admin starter); before publish | **Suppressed.** Events still written to `updates/*` and a `would_have_sent: true` flag on the corresponding `outbox` doc for preview. No Twilio calls made. | None — portal returns "This project hasn't started yet" if a client URL is opened. | Not generated. Pre-assignments stored on tasks; queued until publish. | ✅ Full edit |
| `published` | PM explicitly publishes the project | **Active.** Triggers fire per task/recipient toggles. On the transition itself: one welcome WA to client + one assignment WA per pre-assigned collaborator. | ✅ Full read per `visibleToClient` rules. | ✅ Generated on assignment. | ✅ Full edit |
| `completed` | PM marks project done (or final milestone closes) | **Suppressed** except a one-time "project completed" handover WA to client. | ✅ Read-only. | Existing links revoked; no new links issued. | ⚠️ Read-only except admin can re-open → returns to `published` |
| `archived` | PM archives a completed/abandoned project; hides from default lists | **Suppressed.** All outbound dropped silently. | Revoked. Portal URL returns 404. | Revoked. | 🚫 Read-only |
| `deleted` | Owner soft-deletes the project | **Suppressed.** | Revoked. | Revoked. | 🚫 Hidden everywhere. Hard-purged after retention window (see [14-legal-compliance.md](./14-legal-compliance.md)). |

### Gate enforcement (defense in depth)

1. **`triggerNotifications` Cloud Function** reads `project.lifecycle` before writing to `outbox`. If not `published`, writes the would-be message with `suppressed: true` + `suppressedReason: 'lifecycle:draft'` and returns. No Twilio call.
2. **`outbox` → Cloud Tasks dispatcher** re-checks `project.lifecycle` at enqueue time (handles race between event and lifecycle change).
3. **Magic-link issuer** (`/api/links/issue`) refuses to mint a JWT if the target project is not in `published` or `completed`.
4. **Client portal handler** verifies `project.lifecycle ∈ { published, completed }` on every request; otherwise returns a friendly "not started / archived" state.
5. **Activity feed** always records events regardless of lifecycle, with a visual "would have notified" marker on suppressed entries during draft.

### Allowed transitions

```
         ┌──────────┐
         │  draft   │ ◄─────── (create)
         └────┬─────┘
              │ publish
              ▼
         ┌──────────┐
  ┌──────┤ published├─────┐
  │      └────┬─────┘     │
  │           │ complete  │ archive
  │           ▼           ▼
  │      ┌──────────┐ ┌──────────┐
  │      │completed │ │ archived │
  │      └────┬─────┘ └────┬─────┘
  │           │ archive    │
  │           ▼            │
  │      ┌──────────┐ ◄────┘
  │      │ archived │
  │      └────┬─────┘
  │           │ delete
  ▼           ▼
┌────────────────┐
│    deleted     │  (terminal — soft delete, hard purge by retention)
└────────────────┘
```

- `draft → published`: owner/admin/pm. Shows a confirm dialog with the count and cost of WAs that will fire on transition.
- `published → completed`: owner/admin/pm. Triggers one handover WA per `visibility.clientCanSee`.
- `published → archived`: owner/admin only (PMs cannot archive a live project).
- `completed → archived`: any of owner/admin/pm.
- `completed → published` (re-open): owner/admin only; rare; logged in audit.
- Any → `deleted`: owner only.
- `deleted` is terminal from a UI perspective. Hard purge runs on a scheduled job.

### Quiet hours (applies only when `lifecycle = published`)

Workspace-level setting; default 21:00–08:00 Asia/Kuala_Lumpur. Outbound WA queued during quiet hours is held in `outbox` with `holdUntil: <next 08:00>` and dispatched then. Audit log captures the delay.

### Why this is one field, not two

The earlier `status` field on `projects` (`planning | active | on_hold | completed | archived`) describes **execution** ("is work happening?") and stays as-is for dashboards, filters, and project health. `lifecycle` describes **external visibility + outbound messaging** ("can the system talk to outsiders about this?"). They are intentionally orthogonal — a project can be `status: on_hold` but still `lifecycle: published` (the client should still see the pause), and a project can be `status: active` but `lifecycle: draft` (firm is configuring while internally working on tasks).

---

Firestore limit: **1 sustained write/sec per document**.

| Hot spot | Mitigation |
|---|---|
| `workspaces/{wid}` (seat changes) | Only write on plan/seat transitions, not on activity. |
| `projects/{pid}.summary` (task writes) | Cloud Function debounces — rebuilds at most every 2s per project; uses transaction. |
| `usageCounters/{period}` (every message) | Sharded counter (10 shards). Reader sums shards on display. |
| `phoneIndex/{phone}` (multi-workspace) | Cloud Function adds/removes refs in transaction. |

## Cloud Function triggers (data-model maintenance)

| Trigger | Function | Purpose |
|---|---|---|
| `onWrite tasks/{tid}` | `recomputeProjectSummary` | Debounced; updates `projects/{pid}.summary`. |
| `onCreate members/{uid}` | `incrementSeatsUsed` + `setCustomClaim` | Updates workspace counter + Auth claims (role + departments). |
| `onUpdate members/{uid}` (departments change) | `setCustomClaim` | Refreshes Auth claims. |
| `onDelete members/{uid}` | `decrementSeatsUsed` + `removeCustomClaim` | Reverse of above. |
| `onWrite departments/{depId}` | `recomputeDepartmentMemberCount` | Maintains `departments.memberCount`. |
| `onWrite collaborators/{colid}` | `syncPhoneIndex` | Maintains `phoneIndex/{phone}`. |
| `onCreate messages/{mid}` (status delivered) | `incrementUsageCounter` | Bumps sharded counter on `usageCounters/{currentPeriod}`. |
| `onCreate updates/{updid}` (status_change, photo_added) | `updateTaskState` + `triggerNotifications` | Cascades changes; enqueues WhatsApp messages. Gated by `project.lifecycle` (see below). |
| `onUpdate projects/{pid}` (lifecycle → published) | `firePublishWelcomeMessages` | Sends one-time welcome WA to client + first assignment WA to any pre-assigned collaborators. Idempotent on `project.publishedAt`. |
| `onUpdate projects/{pid}` (lifecycle → completed) | `setRetentionDates` + `fireCompletionMessages` | Sets `retentionUntil` on documents; sends handover WA to client; suppresses further outbound. |
| `onUpdate projects/{pid}` (lifecycle → archived | deleted) | `revokeExternalAccess` | Invalidates client + collaborator magic-link JWTs; suppresses all outbound. |
| `scheduled daily` | `expireMagicLinks` | Marks expired links revoked. |
| `scheduled daily` | `expireTrials` | Sets workspace to read-only after day 30. |

## Storage layout (Firebase Storage)

Mirrors Firestore paths for trivial security rules:

```
gs://siapp-prod/
└── workspaces/{wid}/
    ├── projects/{pid}/
    │   ├── tasks/{tid}/photos/{filename}
    │   ├── tasks/{tid}/docs/{filename}
    │   └── docs/{filename}                    ← project-level
    └── branding/
        └── logo.{ext}
```

Storage rules use the same `request.auth.token.workspaces[wid]` check; collaborator/client uploads go through signed URLs from Cloud Run.

## Migration & evolution

**One-way doors:**
- Workspace-scoped subcollections (vs top-level)
- `tasks` under `projects` (vs top-level)
- Denormalized name fields

**Reversible later:**
- Adding new subcollections (`integrations`, `webhooks`, `automations`)
- Adding fields to existing docs
- Splitting hot fields into separate docs

**Hard things deliberately deferred:**
- Cross-workspace search → BigQuery export + Algolia/Typesense (Q50)
- Free-text search → same
- Customer-facing project templates with version + diff → deferred per [D-031](./decisions-log.md); revisit on customer demand
- Soft delete with restore → only if customer demand

## Why not other shapes (rejected alternatives)

| Alternative | Why rejected |
|---|---|
| Top-level `tasks` collection with `workspaceId` field | Every query needs the filter; security rules need reads; harder pagination; loses subcollection ergonomics. |
| Flatten everything to top-level for "easier queries" | Defeats Firestore's strengths; multiplies security-rule complexity by N collections. |
| Postgres-style normalization with reference lookups | Firestore can't join. Each dashboard render becomes N+1 reads. |
| Embed tasks inside project doc (array) | Hits 1 MB doc limit fast; every task edit rewrites the project; no per-task realtime listeners. |
| Single `events` log instead of subcollection `updates` | Loses per-task pagination; hot doc per workspace; harder rules. |

## Open follow-ups (will not block build)

- **Q57** (virus scan choice) — affects `documents.scanStatus` flow
- **Q54** (retention period) — sets `retentionUntil` value
- **Q56** (collaborator visibility to peers) — read rules on `tasks`
- **Q51** (client sees live collaborator updates vs approval-gated) — **Closed by D-032**: the approval gate was removed from MVP. Collaborator `Mark Done` fires the client-facing WA immediately, subject only to D-027 lifecycle and per-task `visibleToClient`.

These are model-compatible; no schema change needed when answered.

## Companion plans

- [20-access-control-departments.md](./20-access-control-departments.md) — internal need-to-know access via Departments; defines `members.departments`, `departments/`, and `tasks.restrictedToDepartments`.

## Companion files (to be created in repo when build starts)

- `firestore.rules` — security rules (sketch at end of this doc, productionize in Sprint A)
- `firestore.indexes.json` — composite indexes (use table above)
- `storage.rules` — Firebase Storage rules
- `functions/src/triggers/*.ts` — one file per trigger listed above

## Security rules sketch (illustrative)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isFirmMember(wid) {
      return request.auth != null
        && request.auth.token.workspaces[wid] != null;
    }
    function hasRole(wid, roles) {
      return isFirmMember(wid)
        && request.auth.token.workspaces[wid].role in roles;
    }
    function canSeeRestricted(wid, taskRestrictions) {
      let ws = request.auth.token.workspaces[wid];
      return ws != null && (
        ws.role in ['owner', 'admin']
        || taskRestrictions.size() == 0
        || taskRestrictions.hasAny(ws.departments)
      );
    }

    // Users — read self only
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }

    // Phone index — server-only
    match /phoneIndex/{phone} {
      allow read, write: if false;   // Admin SDK only
    }

    // Workspace tree
    match /workspaces/{wid} {
      allow read: if isFirmMember(wid);
      allow update: if hasRole(wid, ['owner']);
      allow delete: if hasRole(wid, ['owner']);
      allow create: if request.auth != null;   // any auth user can create

      match /members/{uid} {
        allow read: if isFirmMember(wid);
        allow write: if hasRole(wid, ['owner', 'admin']);
      }

      match /departments/{depId} {
        allow read: if isFirmMember(wid);
        allow write: if hasRole(wid, ['owner', 'admin']);
      }

      match /clients/{cid} {
        allow read, write: if hasRole(wid, ['owner', 'admin', 'pm']);
      }

      match /collaborators/{colid} {
        allow read, write: if hasRole(wid, ['owner', 'admin', 'pm']);
      }

      match /projects/{pid} {
        allow read: if isFirmMember(wid);
        allow write: if hasRole(wid, ['owner', 'admin', 'pm']);

        match /{rest=**} {
          allow read: if isFirmMember(wid);
          allow write: if hasRole(wid, ['owner', 'admin', 'pm']);
        }
      }

      match /magicLinks/{code} {
        allow read, write: if false;   // server-only (Cloud Run)
      }

      match /messages/{mid} {
        allow read: if isFirmMember(wid);
        allow write: if false;         // server-only
      }

      match /auditLog/{alid} {
        allow read: if hasRole(wid, ['owner', 'admin']);
        allow write: if false;         // server-only
      }

      match /usageCounters/{period} {
        allow read: if isFirmMember(wid);
        allow write: if false;         // server-only
      }
    }
  }
}
```

Productionize: harden field-level validation, add rate limits via App Check, write a unit-test suite using `@firebase/rules-unit-testing`.
