---
description: "Take a feature or fix end-to-end: plan → build → test → validate → GitHub PR, using the Feature Lead pipeline. The human reviews the resulting PR."
agent: "Feature Lead"
argument-hint: "Describe the feature or fix to ship"
---
Take the following request through the full delivery pipeline (Planner → Builder → Tester → Validator → Shipper) and finish by giving me the PR URL for review.

Create a GitHub Issue for this work first (or use the referenced issue if I gave a #number) and keep its status labels and stage comments updated throughout, per the Feature Lead ticket lifecycle.

Pause for my approval after planning if the work is non-trivial (new screens, data-model/security-rules changes, or new dependencies).

Request: ${input}
