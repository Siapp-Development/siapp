# WhatsApp Content Templates — v1 (EN)

Draft template pack for Twilio Content Template Builder, covering every `TNotificationTrigger` in [packages/shared/src/enums.ts](../packages/shared/src/enums.ts). Variable sets mirror `TTemplateVars` in [packages/shared/src/notificationTypes.ts](../packages/shared/src/notificationTypes.ts) so the dispatcher (#19) can map 1:1.

**Conventions**

- Naming: `siapp_<trigger>_v1_en`. Bump `v2` on any copy change after approval — never mutate an approved template's meaning.
- Category: **Utility** for all (transactional project updates; no marketing language).
- Language: `en`. BM (`ms`) variants are a copy of this file translated, submitted alongside the v1.5 BM release (D-026).
- Variables are named (Content API supports named variables); sample values are required at submission.
- Sender identity: firm name is always in the body (`{{firm_name}}`) because at MVP all firms share the Siapp sender (D-001 / brand doc "[FirmName] via Siapp").
- Links: portal/task links are apex-domain short URLs (`https://siapp.app/p/…`, `/t/…`) — keep them the final line so WhatsApp renders the preview.
- Tone (brand doc §voice): warm, factual, action-oriented, short. No exclamation marks, no emojis in v1 (approval-safe).

---

## 1. `siapp_project_welcome_v1_en`

Trigger: `project_welcome` · Recipient: client · Vars: `IProjectWelcomeVars`

> Hello {{client_first_name}}, {{firm_name}} here.
>
> Your project *{{project_title}}* is now being tracked on Siapp. Target completion: {{project_due_date}}.
>
> You can view progress anytime — no app or sign-up needed:
> {{portal_link}}

| Variable | Maps to | Sample |
|---|---|---|
| `client_first_name` | `clientFirstName` | Aisha |
| `firm_name` | `firmName` | DD Development |
| `project_title` | `projectTitle` | Bungalow Renovation, Jalan Damai |
| `project_due_date` | `projectDueDate` | 15 Dec 2026 |
| `portal_link` | `portalLink` | https://siapp.app/p/abc123 |

---

## 2. `siapp_task_assigned_v1_en`

Trigger: `task_assigned` · Recipient: collaborator · Vars: `ITaskAssignedVars`

> Hello {{collaborator_name}}, {{firm_name}} has assigned you a task on Siapp.
>
> Task: *{{task_title}}*
> Project: {{project_title}}
> Due: {{due_date}}
>
> Open the task to view details, upload files, or leave a note:
> {{task_link}}

| Variable | Maps to | Sample |
|---|---|---|
| `collaborator_name` | `collaboratorName` | Wong |
| `firm_name` | `firmName` | DD Development |
| `task_title` | `taskTitle` | Wiring certification |
| `project_title` | `projectTitle` | Bungalow Renovation, Jalan Damai |
| `due_date` | `dueDate` (optional → send "—" when absent) | 12 Aug 2026 |
| `task_link` | `taskLink` | https://siapp.app/t/xyz789 |

Note: `dueDate` is optional in the type. Twilio requires every declared variable to be filled — dispatcher sends `"—"` (em-dash) when unset rather than maintaining a second no-due-date template. Revisit if clients find it odd.

---

## 3. `siapp_task_status_change_v1_en`

Trigger: `task_status_change` · Recipient: client · Vars: `ITaskStatusChangeVars`

> Update from {{firm_name}} on *{{project_title}}*:
>
> *{{task_title}}* is now *{{new_status}}*.
>
> View full progress on your tracker:
> {{portal_link}}

| Variable | Maps to | Sample |
|---|---|---|
| `firm_name` | `firmName` | DD Development |
| `project_title` | `projectTitle` | Bungalow Renovation, Jalan Damai |
| `task_title` | `taskTitle` | Roof installation |
| `new_status` | `newStatus` (human label, not enum: "completed", "in progress") | completed |
| `portal_link` | ⚠️ not in `ITaskStatusChangeVars` yet — **add `portalLink` to the type** | https://siapp.app/p/abc123 |

⚠️ Type gap: `ITaskStatusChangeVars` has no link field. Every client-facing message should end with the portal link (activation metric = client taps through). Add `portalLink: string` to the interface when wiring #19.

---

## 4. `siapp_task_due_soon_v1_en`

Trigger: `task_due_soon` · Recipient: client or internal · Vars: `ITaskDueSoonVars`

> Reminder from {{firm_name}}:
>
> *{{task_title}}* on {{project_title}} is due {{due_date}}.
>
> View the task:
> {{task_link}}

| Variable | Maps to | Sample |
|---|---|---|
| `firm_name` | `firmName` | DD Development |
| `task_title` | `taskTitle` | Submit BP drawings |
| `project_title` | `projectTitle` | Bungalow Renovation, Jalan Damai |
| `due_date` | `dueDate` | tomorrow, 6 Aug 2026 |
| `task_link` | `taskLink` | https://siapp.app/t/xyz789 |

---

## 5. `siapp_task_blocked_v1_en`

Trigger: `task_blocked` · Recipient: client · Vars: `ITaskBlockedVars`

> Update from {{firm_name}} on *{{project_title}}*:
>
> *{{task_title}}* is currently on hold. The team is working on next steps and your tracker will update as soon as it resumes.
>
> {{portal_link}}

| Variable | Maps to | Sample |
|---|---|---|
| `firm_name` | `firmName` | DD Development |
| `project_title` | `projectTitle` | Bungalow Renovation, Jalan Damai |
| `task_title` | `taskTitle` | Piling works |
| `portal_link` | ⚠️ not in `ITaskBlockedVars` — add `portalLink` (same gap as #3) | https://siapp.app/p/abc123 |

Copy decision: client-facing blocked message says "on hold", **not** "blocked", and deliberately omits the internal block reason (may name a collaborator or internal issue — access-control doc warns notification bodies can leak restricted content).

---

## 6. `siapp_need_help_v1_en`

Trigger: `need_help` · Recipient: internal (firm member) · Vars: `INeedHelpVars`

> Siapp alert for {{firm_name}}:
>
> {{collaborator_name}} flagged *{{task_title}}* on {{project_title}} as blocked.
>
> Reason: {{reason}}
>
> Review it on your dashboard:
> {{task_link}}

| Variable | Maps to | Sample |
|---|---|---|
| `firm_name` | `firmName` | DD Development |
| `collaborator_name` | `collaboratorName` | Wong |
| `task_title` | `taskTitle` | Wiring certification |
| `project_title` | `projectTitle` | Bungalow Renovation, Jalan Damai |
| `reason` | `reason` (free text from collaborator — **truncate to ~200 chars** at enqueue; WhatsApp caps template body at 1024 chars incl. substitutions) | Missing TNB meter installation confirmation |
| `task_link` | ⚠️ not in `INeedHelpVars` — add a dashboard deep link field | https://dashboard.siapp.app/dd/projects/… |

Internal message, so naming the collaborator and the raw reason is correct here (unlike #5).

---

## 7. `siapp_inbound_auto_reply_v1_en`

Trigger: `inbound_auto_reply` · Recipient: whoever messaged the sender number · Vars: `IInboundAutoReplyVars` · (D-035: the single static auto-reply)

> This number sends project updates on behalf of {{firm_name}} and is not monitored for replies.
>
> To view your project or respond, use your tracker link:
> {{portal_link}}
>
> For anything else, contact {{firm_name}} directly at {{firm_wa_phone}}.

| Variable | Maps to | Sample |
|---|---|---|
| `firm_name` | `firmName` | DD Development |
| `portal_link` | `portalLink` | https://siapp.app/p/abc123 |
| `firm_wa_phone` | `firmWaPhone` | +60 12-345 6789 |

Note: inbound replies land inside the 24-hour service window, so technically free-form is allowed — but D-035 keeps this as a pre-approved template so the copy is fixed and reviewable. Edge case for #20: if the inbound sender can't be matched to a client/collaborator (no portal link to give), send nothing (silent drop + log) rather than a template with a broken link — needs a linkless `siapp_inbound_auto_reply_unknown_v1_en` variant if we'd rather always reply:

> This number sends project updates on behalf of businesses using Siapp and is not monitored for replies. If you received a project link earlier, use that link to view your project.

(Zero variables — submit alongside the main one.)

---

## 8. `siapp_wa_quota_90_v1_en`

Trigger: `wa_quota_90` · Recipient: workspace owner (internal, once per period) · Vars: none typed yet (#24)

> Siapp usage alert for {{firm_name}}:
>
> Your workspace has used {{used_count}} of {{included_count}} included WhatsApp conversations this period ({{percent}}%). Messages beyond the allowance are billed as overage.
>
> Review usage in Settings:
> {{settings_link}}

| Variable | Sample |
|---|---|
| `firm_name` | DD Development |
| `used_count` | 225 |
| `included_count` | 250 |
| `percent` | 90 |
| `settings_link` | https://dashboard.siapp.app/dd/settings/usage |

⚠️ Type gap: no `IWaQuota90Vars` interface exists yet — add one to `notificationTypes.ts` when #24's send path is wired.

---

## 9. `siapp_collab_access_link_v1_en`

Trigger: `collab_access_link` · Recipient: collaborator · Vars: `ICollabAccessLinkVars` · (#127 — one durable link → all my tasks)

> Hello {{collaborator_name}}, {{firm_name}} here.
>
> You can view every task assigned to you and post updates from one link — no app or sign-up needed:
> {{access_link}}

| Variable | Maps to | Sample |
|---|---|---|
| `collaborator_name` | `collaboratorName` | KF Electrical |
| `firm_name` | `firmName` | DD Development |
| `access_link` | `accessLink` | https://siapp.app/t/abc123 |

> **Enqueue-only (D-001 / #127 Q-WA):** `sendCollaboratorLink` writes the `messages` queue record with `templateName: 'collab_access_link_v1'`; actual delivery depends on the #19 dispatcher + Twilio + Meta approval, which are not yet in-repo. Copy access link + Reset link are fully functional without WhatsApp.

---

## Submission checklist

- [ ] Create all 9 templates (8 triggers + auto-reply-unknown variant) in Content Template Builder, category **Utility**, language **en**, with the sample values above.
- [ ] Record each returned `ContentSid` (`HX…`) in a per-env registry (see below) — do not scatter SIDs through code.
- [ ] After Meta approval, live-send each template once to a test number and verify rendering (bold `*…*`, link preview, variable substitution).
- [ ] Test one deliberate failure (missing variable) to confirm the dispatcher surfaces Twilio error 63016/63021 cleanly.
- [ ] Rotate the Twilio auth token used during sandbox testing.

## SID registry shape (for #19)

```ts
// backend/functions — env-scoped, locale-scoped registry
const CONTENT_SIDS: Record<TNotificationTrigger, Record<'en', string>> = {
  project_welcome:    { en: 'HX…' },
  task_assigned:      { en: 'HX…' },
  task_status_change: { en: 'HX…' },
  task_due_soon:      { en: 'HX…' },
  task_blocked:       { en: 'HX…' },
  need_help:          { en: 'HX…' },
  inbound_auto_reply: { en: 'HX…' },
  wa_quota_90:        { en: 'HX…' },
};
```

Values come from env config (`.env.siapp-prod` params, same pattern as `PORTAL_ORIGIN`), not hardcoded.

## Type gaps to fix when wiring #19

1. `ITaskStatusChangeVars` — add `portalLink: string`.
2. `ITaskBlockedVars` — add `portalLink: string`.
3. `INeedHelpVars` — add `taskLink: string` (dashboard deep link).
4. Add `IWaQuota90Vars` for `wa_quota_90`.
5. Dispatcher must fill optional `dueDate` with `"—"` (Twilio rejects empty variables).
