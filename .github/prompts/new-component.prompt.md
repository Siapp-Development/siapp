---
description: "Scaffold a new React + TypeScript component with colocated test and barrel file, following project conventions."
argument-hint: "Component name and a one-line description of what it does"
agent: "agent"
---

Create a new React component named **${input:name:ComponentName}** that ${input:purpose:does X}.

Follow the guidelines in:
- [copilot-instructions.md](../copilot-instructions.md)
- [typescript.instructions.md](../instructions/typescript.instructions.md)
- [react-components.instructions.md](../instructions/react-components.instructions.md)
- [testing.instructions.md](../instructions/testing.instructions.md)
- [accessibility.instructions.md](../instructions/accessibility.instructions.md)

Generate, in a new folder `src/components/${input:name}/`:

1. **`${input:name}.tsx`**
   - Function component with named export.
   - `interface ${input:name}Props` extending the appropriate native HTML element attributes when relevant.
   - Sensible default props via destructuring.
   - Accessible markup: semantic element, label/role, keyboard support if interactive.

2. **`${input:name}.test.tsx`**
   - At least one test per prop / variant / state.
   - Use React Testing Library, query by role/label, `userEvent` for interactions.
   - Include an `axe` accessibility assertion if `vitest-axe`/`jest-axe` is installed.

3. **`index.ts`** — re-export the component and its props type.

If a styling approach is already established in the repo (CSS Modules, Tailwind, etc.), follow it. Otherwise add a `${input:name}.module.css` with placeholder structural styles only.

After creating files, briefly summarize:
- Files created (as markdown links).
- Any assumptions made.
- What the user should add or wire up next.
