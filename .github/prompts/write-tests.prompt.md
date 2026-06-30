---
description: "Generate React Testing Library tests for the selected component, hook, or module following project test conventions."
agent: "agent"
---

Write tests for the currently selected file (or the file the user names).

Follow [testing.instructions.md](../instructions/testing.instructions.md) strictly:

- Vitest or Jest, matching whatever the repo already uses (check `package.json`).
- React Testing Library with role/label queries; `userEvent` (awaited) for interactions.
- Cover: happy path, each prop/variant, loading/error/empty states where applicable, edge cases, and at least one accessibility check if `axe` is available.
- One behavior per `it`, AAA structure, no conditionals inside tests.
- Mock only at boundaries (network via MSW, timers via fake timers). Do not mock the module under test.

Before writing tests:

1. Read the target file and any colocated types.
2. Read 1–2 existing test files in the repo (if present) to match style.
3. Check `package.json` for the test runner and available testing libraries.

Output:

- The complete test file, placed next to the source as `<name>.test.ts(x)`.
- A short summary of what's covered and any cases you deliberately skipped (with reason).
