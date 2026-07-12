---
title: "Internal Access Control — Departments"
status: draft
updated: 2026-06-21
---

# Internal Access Control — Departments

How firm-side staff get **need-to-know** access to sensitive task content (notes, documents, financial detail) without losing the shared project timeline. Answers part of **Q11** (document permissioning) for the *internal* case; client-side document visibility is covered separately in [firestore-data-model.md](./firestore-data-model.md) (`visibleToClient`, `visibleToCollaboratorIds`).

## The problem

Today every firm-side member of a workspace sees every task's full detail (description, updates, documents). For most tasks that's correct — projects need shared visibility to function. But some tasks contain content that should only be visible to a subset of staff:

- **Finance / billing** tasks — invoice amounts, payment notes, statements of account.
- **Legal-privileged** matter notes inside a law firm.
- **HR / disciplinary** items in any firm.
- **Senior-management decisions** attached as documents to a project.

The request: a Finance person can view full detail of finance tasks; everyone else sees the task exists (so the project plan stays coherent) but cannot open notes or documents.

## Naming — recommendation: `Departments`

**Call it `Departments`** (the group). Per-task access is **`Restricted to`**.

| Candidate | Verdict |
|---|---|
| **Departments** ✅ | Matches how firms already talk ("send to Finance", "Legal handles that"). Vertical-neutral. Doesn't collide with the existing `role` (owner/admin/pm/viewer). |
| Teams | Conflicts with platform features named "Teams" elsewhere (Microsoft Teams, MS Teams integration confusion). |
| Groups | Too generic; reads like an ad-hoc list, not an org structure. |
| Functions | Accurate but jargony. |
| Practice Areas | Legal-specific; doesn't read for construction. |
| Permission Groups | Reads as IT plumbing, not as how the firm sees itself. |

## The two-layer model

The existing **role** stays as-is. **Department** is a new, orthogonal axis.

| Axis | Existing? | Question it answers | Values |
|---|---|---|---|
| **Role** | yes | *What can you do?* (permission tier) | `owner`, `admin`, `pm`, `viewer` |
| **Department** | new | *What sensitive content can you see?* (need-to-know) | Firm-defined: e.g. `finance`, `legal`, `ops`, `admin`, `hr` |

A member belongs to **zero or more** departments. The two axes are independent: a Finance person can be a PM *or* a viewer; a PM can be in zero departments (sees all non-restricted content) or in multiple.

### Special cases

- **`owner` and `admin`** always see full detail regardless of department membership. Required for audit, incident response, and to avoid lockouts.
- **`pm`** sees full detail of *un-restricted* tasks. On restricted tasks they see only the header unless they belong to one of the listed departments.
- **`viewer`** follows the same restriction rule (header-only on restricted tasks unless they're in a listed department).
- **Clients and collaborators** are unaffected — they already use the separate `visibleToClient` / `visibleToCollaboratorIds` path.

## What "restricted" means in practice

A task with `restrictedToDepartments: ["finance"]`:

| Surface | Non-Finance member sees | Finance member (or owner/admin) sees |
|---|---|---|
| Task in project list / timeline | ✅ title, status, assignee, due date, % complete contribution | ✅ everything |
| Task detail page | ⚠️ header only + a "Restricted — Finance" badge | ✅ full page |
| `description` field | 🚫 hidden | ✅ visible |
| `updates/*` (notes, comments, status-change history) | 🚫 hidden, replaced with "Restricted content — Finance only" | ✅ visible |
| `documents/*` attached to the task | 🚫 hidden from list | ✅ visible |
| Audit log entries | ✅ "task created", "status changed" headers visible to all firm members; ✅ field-level diffs only to authorized departments | ✅ all |
| Notifications (WhatsApp/email) to non-authorized members | ⚠️ only fire if the recipient is in an authorized department | ✅ fire normally |

**Why keep the header visible:** the project's % complete, dependency graph, and dashboards depend on tasks counting. Hiding the task entirely would break planning views and create the kind of "ghost task" confusion that's worse than the original problem.

## Data model changes

Layers on top of [firestore-data-model.md](./firestore-data-model.md) — no breaking changes.

### New collection: `workspaces/{wid}/departments/{depId}`

```typescript
{
  id: string,             // slug, e.g. "finance"
  name: string,           // display, e.g. "Finance"
  description?: string,
  color?: string,         // hex, for badge rendering
  createdAt: Timestamp,
  createdBy: string,      // uid
  memberCount: number     // maintained by Cloud Function
}
```

### Extend `members/{uid}`

```diff
  role: 'owner' | 'admin' | 'pm' | 'viewer',
+ departments: string[],         // array of department ids
  seatActive: boolean,
```

### Extend `tasks/{tid}`

```diff
  visibleToClient: boolean,
  visibleToCollaboratorIds: string[],
+ restrictedToDepartments: string[],   // empty/missing = unrestricted
```

### Extend `documents/{did}`

Inherit task restriction by default, but allow per-document override (matters for project-level docs not attached to a task):

```diff
  scope: 'project' | 'task',
  scopeId: string,
  visibleToClient: boolean,
  visibleToCollaboratorIds: string[],
+ restrictedToDepartments: string[],
```

### Custom claims

Mirror `departments` into Firebase Auth custom claims for O(1) rule evaluation:

```diff
  user.customClaims = {
    workspaces: {
-     'wks_lim':  'owner',
-     'wks_kpmg': 'pm'
+     'wks_lim':  { role: 'owner',  departments: [] },
+     'wks_kpmg': { role: 'pm',     departments: ['finance'] }
    }
  }
```

Maintained by the existing `setCustomClaim` Cloud Function on member create/update.

> Note: custom claims have a 1 KB budget. Department arrays are short slugs (< 20 chars each) so 10+ workspaces × 5 departments fits comfortably. Watch the size; if it ever approaches the limit, drop departments from claims and read `members/{uid}` once per session.

## Security rules

Adds department checks alongside role checks. The unrestricted path stays unchanged.

```javascript
function inDepartment(wid, dept) {
  let ws = request.auth.token.workspaces[wid];
  return ws != null && (dept in ws.departments);
}

function canSeeRestricted(wid, taskRestrictions) {
  let ws = request.auth.token.workspaces[wid];
  return ws != null && (
    ws.role in ['owner', 'admin']
    || taskRestrictions.size() == 0
    || taskRestrictions.hasAny(ws.departments)
  );
}
```

Apply to: `tasks/{tid}` reads of `description` (field-level not enforced by rules → handled at API layer; rules deny the full doc only if `restrictedToDepartments` is set AND user isn't authorized AND request is for full read), `tasks/{tid}/updates/*` (deny read), `documents/{did}` (deny read).

Header-level fields (`title`, `status`, `assignees`, `dueDate`, `phaseId`, `order`) are served via a **projection** — the firm app reads from a public-by-default view when the user isn't authorized. Two implementation options:

1. **Two reads** (simplest): client reads task doc with rules that allow if member; UI hides restricted fields client-side. Risk: any user can pop devtools and read raw doc. **Reject for sensitive content.**
2. **Server-mediated read** (chosen): when `restrictedToDepartments.size() > 0` and user isn't authorized, deny client read; UI calls a Cloud Run endpoint that returns the safe projection. Cost: one extra request per restricted task; acceptable.

## UI surface

- **Workspace settings → Departments**: owner/admin creates/edits/deletes departments. Empty by default (feature hidden until first department exists).
- **Member profile → Departments**: multi-select chips. Owner/admin only.
- **Task header → "Restricted to" control**: chip selector visible to owner/admin/pm. Default empty.
- **Restricted task badge**: small colored chip (uses department `color`) next to the task title in all list views.
- **Restricted task detail page (when user not authorized)**: header + a clear empty-state — "This task contains restricted content visible to: Finance. Ask an admin for access if you need it." No silent failures.

Discoverability rule: **the feature stays hidden until an admin creates the first department.** SMB firms with 3 users see zero new UI; firms that need it opt in.

## Concerns and how we address them

| Concern | Mitigation |
|---|---|
| **PMs lose visibility into project finances they're managing.** | PMs can be added to the Finance department selectively. Default is *not* universal restriction — owner explicitly marks a task. |
| **Lockout: only one Finance person and they leave.** | Owner/admin always retain access. Recovery path: owner adds themselves or another member to the department. |
| **Configuration overhead for tiny firms.** | Feature is hidden until first department is created. No forced setup. |
| **Audit log leaks restricted content via "before/after" diffs.** | Audit log read is gated: headers visible to owner/admin/pm; field-level diffs only to authorized departments. Cloud Function strips fields on read for non-authorized requests. |
| **Notifications might leak restricted content in WhatsApp/email body.** | Notification template renderer checks recipient's departments before rendering the task's `description` or notes into the message body. If unauthorized, fall back to a minimal "A task was updated" template with a link. |
| **Department slug collisions across workspaces.** | Slugs are workspace-scoped. Two workspaces can both have a "finance" department; they're independent docs. |
| **Custom-claims size creep.** | Watched in code review. Fallback: drop departments from claims, read `members/{uid}` once per session, cache in memory. |
| **What about per-project departments (e.g. only Legal sees Project X)?** | Out of scope for v1. Project-level visibility is handled by setting `restrictedToDepartments` on every task in the starter project (or via Duplicate, since the field carries forward — D-031). Re-evaluate after first 10 paying customers. |

## Starter projects + Duplicate

Per D-031, MVP has no customer-facing project-template engine. Departments interact with the two project-creation paths as follows:

- **Siapp-Admin starter project** — the provisioning script writes tasks directly with `restrictedToDepartments?: string[]` set per task. Residential build + conveyancing seeds leave it empty by default; future legal seeds can pre-set `restrictedToDepartments: ['legal']` on privilege-sensitive tasks.
- **Duplicate from existing** — `restrictedToDepartments` is one of the fields that **carries forward** when a project is duplicated (see D-031). Firms can edit per-task after duplication.

## Rejected alternatives

| Alternative | Why rejected |
|---|---|
| **Make "Finance" a `role`.** | Collides with permission tier. A Finance person can be a PM *or* a viewer; conflating the axes forces unnatural combinations. |
| **`private: boolean` flag on tasks.** | Too coarse — doesn't say *who* can see. Admins re-invent departments by convention. |
| **Per-task ACLs (pick specific users).** | High UI burden, brittle when staff churn. Departments give the same outcome with one dropdown and survive turnover. |
| **Project-level departments only.** | Doesn't match the user's framing — they want some tasks within a project restricted, not whole projects. |
| **Field-level rules in Firestore.** | Firestore rules don't enforce field-level reads natively. Forces a server-mediated read either way; departments + Cloud Run is the cleaner shape. |
| **Defer to v1.5.** | The construction + legal design partners both have a real need — finance staff exists at the construction firm; privileged matter content exists at the law firm. Deferring leaves a sharp edge in two of two pilot customers. Build a minimal version in v1. |

## MVP scope

**In v1:**
- `departments` collection + CRUD UI (owner/admin only).
- `members.departments` array + member-profile UI.
- `tasks.restrictedToDepartments` array + task header chip.
- Security rules + Cloud Run projection endpoint for restricted tasks.
- Restricted-task badge + empty-state in UI.
- Notification renderer respects departments.

**Deferred:**
- Project-level "this whole project is Legal-restricted" (workaround: starter-project seed or duplicate-source marks all tasks).
- Per-document override when document is task-scoped (inherits task's restriction; standalone project-scoped docs can be restricted directly).
- Audit log field-level redaction polish (do the basics in v1; iterate based on actual usage).
- Department-based assignment defaults in starter-project seeds (only `defaultAssigneeRole` exists today).

## Open follow-ups

- **Q11 (document permissioning).** This plan answers the *internal* half. The *client-facing* half (which documents the client sees, per-doc) is already modeled via `visibleToClient` and stays as-is.
- **Naming UX testing.** Validate "Departments" reads correctly with both pilot firms in customer discovery before locking copy. If a partner pushes back hard (e.g. legal calls them "practice areas"), per-workspace renaming is cheap — store a `departmentLabel?: string` on the workspace doc.
- **Notification template grammar.** Specify the fallback template wording for unauthorized recipients in the messaging spec.

## Related plans

- [firestore-data-model.md](./firestore-data-model.md) — base schema this layers onto.
- [11-mvp-scope.md](./11-mvp-scope.md) — MVP boundary; departments folded in.
- [13-tech-architecture.md](./13-tech-architecture.md) — custom claims, security model.
- [14-legal-compliance.md](./14-legal-compliance.md) — solicitor-client privilege rationale.
- [19-open-questions.md](./19-open-questions.md) — Q11 (document permissioning).
- [decisions-log.md](./decisions-log.md) — D-025 records this decision.
