---
description: "Use when writing or modifying tests (*.test.ts, *.test.tsx, *.spec.ts, *.spec.tsx). Covers React Testing Library patterns, query priority, async assertions, and mocking strategy."
applyTo: "**/*.{test,spec}.{ts,tsx}"
---

# Testing Guidelines

## Framework

- **Vitest** (preferred) or **Jest**, with **React Testing Library** for components and **MSW** for network mocking.
- Test files live next to the code: `Button.tsx` ↔ `Button.test.tsx`.

## What To Test

- Behavior the user can observe: rendered output, accessible roles/labels, interactions, and resulting state.
- Public hook return values and side effects via `renderHook`.
- Edge cases: empty, loading, error, boundary values.

Do **not** test:
- Implementation details (component internal state, private helpers).
- Third-party libraries.
- Styling unless it's semantic (e.g. `aria-disabled`).

## Query Priority (React Testing Library)

In order:

1. `getByRole` (with `name`) — accessible to users + assistive tech.
2. `getByLabelText` for form controls.
3. `getByPlaceholderText` / `getByText` / `getByDisplayValue`.
4. `getByAltText` / `getByTitle`.
5. `getByTestId` — last resort.

Never query by class name or DOM structure.

## Async

- Use `findBy*` (auto-retries) for elements that appear asynchronously.
- Use `await waitFor(...)` for assertions about state that resolves over time. Keep the callback small and side-effect-free.
- `userEvent` (v14+) is `async` — always `await` it.

## Mocking

- Mock at the **boundary**: network (MSW), time (`vi.useFakeTimers()`), browser APIs.
- Don't mock the module under test. Don't mock React.
- Prefer dependency injection over module mocks where practical.

## Structure

```ts
describe('Button', () => {
  it('calls onClick when activated', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Save</Button>);

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

- One behavior per `it`. The test name reads as a sentence ("calls onClick when activated").
- AAA: Arrange, Act, Assert — with blank lines between.
- No conditional logic (`if`, `switch`) inside tests. If you need branches, write separate tests.

## Coverage

- Aim for meaningful coverage of behavior, not a percentage. A 100%-covered component with no interaction tests is worse than 70% with the right ones.
