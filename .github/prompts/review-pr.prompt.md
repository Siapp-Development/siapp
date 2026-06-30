---
description: "Review the current diff or selected files for a React + TypeScript change against project guidelines."
agent: "agent"
---

Perform a code review of the current change (use `git diff` against the default branch, or the files the user provides).

Check against these guidelines and call out any violations with file + line references:

- [copilot-instructions.md](../copilot-instructions.md) — overall project standards
- [typescript.instructions.md](../instructions/typescript.instructions.md) — typing, modules
- [react-components.instructions.md](../instructions/react-components.instructions.md) — component & hook rules
- [testing.instructions.md](../instructions/testing.instructions.md) — test coverage and style
- [accessibility.instructions.md](../instructions/accessibility.instructions.md) — a11y
- [styling.instructions.md](../instructions/styling.instructions.md) — styles

Categorize findings:

- **Must fix** — bugs, type holes, a11y blockers, security issues, broken tests.
- **Should fix** — convention violations, missing tests, unclear naming.
- **Consider** — refactor suggestions, perf hints, doc improvements.

End with a one-line verdict: `APPROVE`, `APPROVE_WITH_COMMENTS`, or `REQUEST_CHANGES`.

Do not modify files. This is a review only.
