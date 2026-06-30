---
description: "Use when creating or modifying React components or custom hooks (.tsx / use*.ts files). Covers props design, hook rules, performance, and component composition."
applyTo: "**/*.tsx, **/hooks/**/*.ts, **/use*.ts"
---

# React Component & Hook Guidelines

## Components

- **Function components only.** No class components.
- Props are an `interface` named `<Component>Props`, exported alongside the component.
- Default values via destructuring: `function Button({ variant = 'primary' }: ButtonProps)`.
- Children: type as `React.ReactNode`. Use `PropsWithChildren<T>` only when also adding generics.
- Spread DOM props through carefully — extend the right native type:

  ```tsx
  interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary';
  }
  ```

- **Composition over configuration.** Prefer `<Card><Card.Header/></Card>` or render-children over a dozen boolean props.
- Keep components focused: if a component exceeds ~150 lines or handles multiple concerns, split it.

## Hooks

- Custom hooks start with `use` and call other hooks unconditionally at the top level.
- A hook returns either a single value, a tuple `[value, setter]`, or a stable object — pick one and stick with it.
- Memoize returned objects/functions with `useMemo`/`useCallback` only when they're passed to memoized children or used as effect deps.
- `useEffect` is for **synchronizing with external systems** (DOM, network, subscriptions). Don't use it to derive state from props — compute during render.
- Always specify the dep array. Never leave it off to "run every render." If a value is intentionally excluded, add a one-line comment explaining why.
- Cleanup: any subscription, timer, or listener set in an effect must be torn down in its cleanup.

## Rendering & Performance

- Don't reach for `React.memo`, `useMemo`, or `useCallback` preemptively. Add them when a profiler shows a real cost or when stable references are required by a downstream hook/component.
- Stable keys in lists: use a domain id, never the array index unless the list is static and never reordered.
- Avoid inline object/array literals as props to memoized children.

## Data Flow

- Lift state to the lowest common ancestor — no higher.
- Don't write to refs during render. Use refs for imperative DOM access or mutable values that don't trigger re-renders.
- Forms: prefer controlled inputs for small forms; use a form library (React Hook Form) once validation or field count grows.

## Error & Loading States

- Every async-driven component handles three states: loading, error, empty/success. Don't skip "empty."
- Wrap independently-failing subtrees in an `ErrorBoundary`.

## Anti-patterns

- Mutating props or state directly.
- `useEffect` that calls `setState` based only on props — derive instead.
- `dangerouslySetInnerHTML` on user-controlled content. Sanitize first, or render as text.
- Conditional hook calls (`if (x) useEffect(...)`).
