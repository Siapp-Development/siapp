---
description: "Use when writing, editing, or reviewing TypeScript code. Covers strict typing, type-vs-interface choice, generics, narrowing, and module patterns for a React + TS codebase."
applyTo: "**/*.{ts,tsx}"
---

# TypeScript Guidelines

## Typing Rules

- `strict: true` is assumed. Do not weaken `tsconfig.json` to silence errors.
- Forbidden: `any`, non-null assertions (`!`) on values that could legitimately be nullish, `as` casts that bypass real type errors.
- Prefer `unknown` over `any` at boundaries; narrow with type guards before use.
- Use `as const` for literal tuples and readonly config objects.
- Use `satisfies` to validate an object's shape without widening its inferred type.

## `type` vs `interface`

- `interface` for **public object shapes** that may be extended (component props, plugin contracts).
- `type` for **unions, intersections, mapped types, tuples, function signatures**, and anything non-object.
- Don't mix both for the same concept in the same file.

## Naming

- Prefix type aliases with `T` (e.g. `TUser`, `TButtonProps`, `TResult`).
- Prefix interfaces with `I` (e.g. `IUser`, `IButtonProps`).
- Applies to all declarations including component props, generics constraints, and discriminated unions.

## Functions

- Always annotate **exported** function signatures (params + return). Let inference handle internal helpers.
- Discriminated unions over boolean flags:

  ```ts
  // Bad
  type Result = { ok: boolean; data?: T; error?: Error };

  // Good
  type Result<T> = { ok: true; data: T } | { ok: false; error: Error };
  ```

## Modules

- One responsibility per file. If a file exports more than ~5 unrelated symbols, split it.
- Re-export through a folder `index.ts` only when the folder is a public surface for consumers.
- Use `import type { … }` for type-only imports to keep runtime imports clean.

## Async

- All async functions return `Promise<T>` — annotate `T` explicitly when exported.
- Never swallow errors with empty `catch {}`. Either handle, rethrow, or convert to a typed result.

## Enums

- Avoid TypeScript `enum`. Use a `const` object + `as const` and derive the union:

  ```ts
  const Status = { Idle: 'idle', Loading: 'loading', Done: 'done' } as const;
  type Status = (typeof Status)[keyof typeof Status];
  ```
